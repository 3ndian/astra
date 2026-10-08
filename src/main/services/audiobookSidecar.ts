import { ipcMain } from 'electron'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'
import * as mm from 'music-metadata'
import { getMusicMetadataParseOptions } from '../utils/musicMetadata'
import { parseBookmarks, serializeBookmarks, type Bookmark } from '../../shared/audiobook/bookmarks'
import { normalizeChapters, type Chapter } from '../../shared/audiobook/chapters'

const URL_SCHEME = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//

/** `<audio name>.bookmarks.md` beside the audio file; null for streams or empty paths. */
export function bookmarkSidecarPath(trackPath: string): string | null {
  const path = trackPath.trim()
  if (!path || URL_SCHEME.test(path)) return null
  const ext = extname(path)
  return join(dirname(path), `${basename(path, ext)}.bookmarks.md`)
}

export async function loadBookmarks(trackPath: string): Promise<Bookmark[]> {
  const file = bookmarkSidecarPath(trackPath)
  if (!file) return []
  try {
    return parseBookmarks(await readFile(file, 'utf-8'))
  } catch {
    return []
  }
}

export type SaveBookmarksResult = { ok: true } | { ok: false; error: string }

function describe(error: unknown): string {
  const code = (error as { code?: string })?.code
  if (code === 'EACCES' || code === 'EPERM') return 'Astra does not have permission to write in this folder.'
  if (code === 'EROFS') return 'This folder is read-only.'
  if (code === 'ENOSPC') return 'The disk is full.'
  return error instanceof Error && error.message ? error.message : 'Could not save the bookmarks file.'
}

/**
 * Writes the bookmarks file (the audio file is never touched). An empty list removes the file.
 * Content goes to a temporary file first and is moved into place, so a crash cannot leave half a file.
 */
export async function saveBookmarks(trackPath: string, title: string, list: readonly Bookmark[]): Promise<SaveBookmarksResult> {
  const file = bookmarkSidecarPath(trackPath)
  if (!file) return { ok: false, error: 'Bookmarks can only be saved next to local files.' }
  try {
    await stat(dirname(file))
    if (list.length === 0) {
      await unlink(file).catch(() => undefined)
      return { ok: true }
    }
    await mkdir(dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    await writeFile(temp, serializeBookmarks(title, list), 'utf-8')
    await rename(temp, file)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: describe(error) }
  }
}

const chapterCache = new Map<string, { mtimeMs: number; chapters: Chapter[] }>()
const CHAPTER_CACHE_MAX = 40

export async function loadChapters(trackPath: string): Promise<Chapter[]> {
  const path = trackPath.trim()
  if (!path || URL_SCHEME.test(path)) return []
  try {
    const { mtimeMs } = await stat(path)
    const cached = chapterCache.get(path)
    if (cached && cached.mtimeMs === mtimeMs) return cached.chapters
    const metadata = await mm.parseFile(path, getMusicMetadataParseOptions(path, { skipCovers: true }))
    const chapters = normalizeChapters(metadata.format.chapters, metadata.format.sampleRate)
    chapterCache.set(path, { mtimeMs, chapters })
    while (chapterCache.size > CHAPTER_CACHE_MAX) {
      const oldest = chapterCache.keys().next().value
      if (oldest === undefined) break
      chapterCache.delete(oldest)
    }
    return chapters
  } catch {
    return []
  }
}

export function registerAudiobookIpc(): void {
  ipcMain.handle('audiobook:getBookmarks', async (_event, trackPath: unknown) =>
    typeof trackPath === 'string' ? loadBookmarks(trackPath) : []
  )
  ipcMain.handle('audiobook:saveBookmarks', async (_event, trackPath: unknown, title: unknown, list: unknown) => {
    if (typeof trackPath !== 'string' || !Array.isArray(list)) return { ok: false, error: 'Invalid request.' }
    const safe: Bookmark[] = []
    for (const item of list as Partial<Bookmark>[]) {
      if (!item || typeof item.position !== 'number' || !Number.isFinite(item.position)) continue
      safe.push({
        id: typeof item.id === 'string' ? item.id : `b${safe.length}`,
        position: Math.max(0, Math.floor(item.position)),
        note: typeof item.note === 'string' ? item.note : '',
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : 0
      })
    }
    return saveBookmarks(trackPath, typeof title === 'string' ? title : '', safe)
  })
  ipcMain.handle('audiobook:getChapters', async (_event, trackPath: unknown) =>
    typeof trackPath === 'string' ? loadChapters(trackPath) : []
  )
}
