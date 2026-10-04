import { readFile } from 'fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'path'
import type { LyricsLookupResult } from '../../types/lyrics'
import { parseLyricsText } from './lyricsParsing'
import { lookupSidecarLyrics } from './lyricsSidecar'

// Optional "Lyrics folder": instead of putting .lrc files beside the audio, Astra mirrors the
// music folder structure inside one folder the user picks, e.g.
//   /Music/Artist/Album/Song.flac  ->  /Lyrics/Music/Artist/Album/Song.lrc
// The first path segment is the name of the library folder the track lives in, so several
// library folders never collide.

const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//
const CASE_INSENSITIVE_PLATFORM = process.platform !== 'linux'

type SidecarHit = Extract<LyricsLookupResult, { status: 'hit' }>

function foldCase(value: string): string {
  return CASE_INSENSITIVE_PLATFORM ? value.toLocaleLowerCase() : value
}

/** Returns the track path relative to `root`, or null when the track is not inside it. */
function relativeInside(root: string, trackPath: string): string | null {
  const relativePath = relative(foldCase(resolve(root)), foldCase(resolve(trackPath)))
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) return null
  // Re-derive with the original casing so mirrored folders keep the real names.
  const originalRoot = resolve(root)
  const originalTrack = resolve(trackPath)
  return originalTrack.slice(originalRoot.length).replace(/^[\\/]+/, '')
}

/**
 * Where the lyrics file for `trackPath` lives in the mirrored Lyrics folder, or null when the
 * track is not inside any library folder (or is not a local file).
 */
export function mirroredLyricsPath(
  trackPath: string,
  libraryRoots: readonly string[],
  lyricsRoot: string,
  extension: '.lrc' | '.xlrc' = '.lrc'
): string | null {
  const normalizedTrackPath = trackPath.trim()
  if (!normalizedTrackPath || URL_SCHEME_PATTERN.test(normalizedTrackPath) || !lyricsRoot.trim()) return null

  // Longest root first so a nested library folder wins over its parent.
  const roots = [...libraryRoots].filter((root) => root.trim()).sort((a, b) => b.length - a.length)
  for (const root of roots) {
    const relativePath = relativeInside(root, normalizedTrackPath)
    if (!relativePath) continue
    const stem = basename(relativePath, extname(relativePath))
    const rootName = basename(resolve(root)) || 'Library'
    return join(resolve(lyricsRoot), rootName, dirname(relativePath), `${stem}${extension}`)
  }
  return null
}

export interface SidecarLookupOptions {
  getLyricsRoot: () => string | null
  getLibraryRoots: () => string[]
}

/**
 * Sidecar lookup that checks beside the audio file first (existing behaviour), then the mirrored
 * Lyrics folder. `.xlrc` is preferred over `.lrc` in both places, like before.
 */
export function createSidecarLookup(options: SidecarLookupOptions): (trackPath: string) => Promise<SidecarHit | null> {
  return async (trackPath: string) => {
    const beside = await lookupSidecarLyrics(trackPath)
    if (beside) return beside

    const lyricsRoot = options.getLyricsRoot()
    if (!lyricsRoot) return null
    const roots = options.getLibraryRoots()

    for (const [extension, source, format] of [
      ['.xlrc', 'xlrc', 'xlrc'],
      ['.lrc', 'lrc', 'lrc']
    ] as const) {
      const candidate = mirroredLyricsPath(trackPath, roots, lyricsRoot, extension)
      if (!candidate) continue
      try {
        const content = await readFile(candidate, 'utf-8')
        const lyrics = parseLyricsText(content, source, format)
        if (lyrics) return { status: 'hit', lyrics, cached: false }
      } catch {
        // Not there (or unreadable): try the next candidate.
      }
    }
    return null
  }
}
