import { access, link, mkdir, rename, unlink, writeFile } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'
import { buildSidecarLrcContent } from '../../shared/lyrics/sidecarExport'
import type { LyricsPayload, LyricsSidecarSaveResult } from '../../types/lyrics'
import { resolveSidecarLrcPath, resolveSidecarXlrcPath } from './lyricsSidecar'
import { mirroredLyricsPath } from './lyricsSidecarLocation'

const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//

function errorCode(error: unknown): string | undefined {
  return typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : undefined
}

function describeWriteError(error: unknown): string {
  switch (errorCode(error)) {
    case 'EACCES':
    case 'EPERM':
      return 'Astra does not have permission to write in this music folder.'
    case 'EROFS':
      return 'This music folder is read-only.'
    case 'ENOSPC':
      return 'The disk is full.'
    default:
      return error instanceof Error && error.message ? error.message : 'Could not save the lyrics file.'
  }
}

/**
 * Saves lyrics as `<audio name>.lrc` next to the audio file.
 *
 * Safety rules: the audio file is only checked for existence, never opened for writing; an
 * existing `.lrc` or `.xlrc` sidecar is never overwritten; content is written to a temporary file
 * first and then moved into place without clobbering, so a crash cannot leave a half-written file.
 */
export interface SaveSidecarOptions {
  /**
   * When set, the .lrc goes into this Lyrics folder, mirroring the music folder structure
   * (`<lyricsFolder>/<library folder name>/Artist/Album/Song.lrc`) instead of beside the audio.
   */
  lyricsFolder?: { root: string; libraryRoots: readonly string[] } | null
}

export async function saveSidecarLrc(
  trackPath: string,
  payload: LyricsPayload,
  options: SaveSidecarOptions = {}
): Promise<LyricsSidecarSaveResult> {
  const normalizedPath = trackPath.trim()
  if (!normalizedPath || URL_SCHEME_PATTERN.test(normalizedPath)) {
    return { status: 'skipped', reason: 'not-local' }
  }

  // Lyrics that already came from a sidecar file are already saved.
  if (payload.source === 'lrc' || payload.source === 'xlrc') {
    return { status: 'skipped', reason: 'already-sidecar' }
  }

  const built = buildSidecarLrcContent(payload)
  if (!built) return { status: 'skipped', reason: 'no-lyrics' }

  try {
    await access(normalizedPath)
  } catch {
    return { status: 'skipped', reason: 'audio-missing' }
  }

  // Lyrics already sitting beside the audio count as existing, whichever folder mode is on.
  const existingBeside = (await resolveSidecarXlrcPath(normalizedPath)) ?? (await resolveSidecarLrcPath(normalizedPath))
  if (existingBeside) return { status: 'exists', path: existingBeside }

  const stem = basename(normalizedPath, extname(normalizedPath))
  let target: string
  if (options.lyricsFolder) {
    const mirrored = mirroredLyricsPath(normalizedPath, options.lyricsFolder.libraryRoots, options.lyricsFolder.root)
    if (!mirrored) return { status: 'skipped', reason: 'outside-library' }
    for (const extension of ['.xlrc', '.lrc'] as const) {
      const candidate = mirroredLyricsPath(
        normalizedPath,
        options.lyricsFolder.libraryRoots,
        options.lyricsFolder.root,
        extension
      )
      if (candidate && (await access(candidate).then(() => true, () => false))) {
        return { status: 'exists', path: candidate }
      }
    }
    target = mirrored
    try {
      await mkdir(dirname(target), { recursive: true })
    } catch (error) {
      return { status: 'error', message: describeWriteError(error) }
    }
  } else {
    target = join(dirname(normalizedPath), `${stem}.lrc`)
  }
  const directory = dirname(target)
  const temp = join(directory, `.${stem}.lrc.${process.pid}.${Date.now()}.tmp`)

  try {
    await writeFile(temp, built.content, { encoding: 'utf-8', flag: 'wx' })
  } catch (error) {
    return { status: 'error', message: describeWriteError(error) }
  }

  try {
    // link() fails with EEXIST instead of replacing, which gives a no-clobber move.
    try {
      await link(temp, target)
      await unlink(temp)
    } catch (error) {
      const code = errorCode(error)
      if (code === 'EEXIST') {
        await unlink(temp).catch(() => {})
        return { status: 'exists', path: target }
      }
      // Some filesystems (exFAT, network shares) have no hard links: re-check, then rename.
      if (code === 'EPERM' || code === 'ENOSYS' || code === 'EOPNOTSUPP' || code === 'EXDEV' || code === 'ENOTSUP') {
        const raced = await access(target).then(() => true, () => false)
        if (raced) {
          await unlink(temp).catch(() => {})
          return { status: 'exists', path: target }
        }
        await rename(temp, target)
      } else {
        throw error
      }
    }
  } catch (error) {
    await unlink(temp).catch(() => {})
    return { status: 'error', message: describeWriteError(error) }
  }

  return { status: 'saved', path: target, kind: built.kind }
}
