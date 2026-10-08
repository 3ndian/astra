// Chapters read from an audiobook file (M4B/MP4 chapter tracks, MP3 CHAP frames) and helpers
// for "which chapter am I in". Pure.

export interface Chapter {
  title: string
  /** Seconds from the start of the file. */
  start: number
}

interface RawChapter {
  title?: unknown
  start?: unknown
  timeScale?: unknown
  sampleOffset?: unknown
}

/**
 * Converts music-metadata chapters to seconds. Per its docs, start/timeScale is seconds;
 * without a timeScale the sample offset over the sample rate is used, then milliseconds.
 */
export function normalizeChapters(raw: unknown, sampleRate?: number | null): Chapter[] {
  if (!Array.isArray(raw)) return []
  const out: Chapter[] = []
  for (const [index, item] of (raw as RawChapter[]).entries()) {
    if (!item || typeof item !== 'object') continue
    const start = Number(item.start)
    const timeScale = Number(item.timeScale)
    const sampleOffset = Number(item.sampleOffset)
    let seconds: number
    if (Number.isFinite(timeScale) && timeScale > 0 && Number.isFinite(start)) seconds = start / timeScale
    else if (Number.isFinite(sampleOffset) && sampleRate && sampleRate > 0) seconds = sampleOffset / sampleRate
    else if (Number.isFinite(start)) seconds = start / 1000
    else continue
    if (!Number.isFinite(seconds) || seconds < 0) continue
    const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : `Chapter ${index + 1}`
    out.push({ title: title.slice(0, 200), start: seconds })
  }
  out.sort((a, b) => a.start - b.start)
  // Drop duplicates at the same start (some files repeat a marker).
  return out.filter((c, i) => i === 0 || c.start - out[i - 1].start > 0.5)
}

/** Index of the chapter containing `position`, or -1 before the first chapter / when empty. */
export function chapterIndexAt(chapters: readonly Chapter[], position: number): number {
  let found = -1
  for (let i = 0; i < chapters.length; i += 1) {
    if (chapters[i].start <= position + 0.25) found = i
    else break
  }
  return found
}

/** Seconds to jump to for next (+1) or previous (-1) chapter; previous restarts the current one after 3s. */
export function chapterJumpTarget(chapters: readonly Chapter[], position: number, direction: 1 | -1): number | null {
  if (chapters.length === 0) return null
  const index = chapterIndexAt(chapters, position)
  if (direction === 1) return index + 1 < chapters.length ? chapters[index + 1].start : null
  if (index < 0) return 0
  if (position - chapters[index].start > 3) return chapters[index].start
  return index > 0 ? chapters[index - 1].start : 0
}

export interface ProgressInfo {
  /** 0 to 100, whole number. */
  percent: number
  remainingSeconds: number
}

export function progressInfo(position: number, duration: number): ProgressInfo | null {
  if (!(duration > 0) || !Number.isFinite(position)) return null
  const clamped = Math.min(duration, Math.max(0, position))
  return { percent: Math.floor((clamped / duration) * 100), remainingSeconds: Math.max(0, Math.round(duration - clamped)) }
}

export function formatLeft(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return `${h}h ${m}m left`
  if (m > 0) return `${m}m left`
  return `${total}s left`
}
