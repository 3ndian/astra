// Audiobook bookmarks with notes, saved as a Markdown sidecar next to the audio file
// (`<audio name>.bookmarks.md`). Pure: parsing, serialising and list edits only.

export interface Bookmark {
  id: string
  /** Seconds into the file. */
  position: number
  note: string
  /** Date.now() when created; 0 when unknown (hand-edited file). */
  createdAt: number
}

export const BOOKMARK_MAX_COUNT = 500
export const BOOKMARK_NOTE_MAX_LENGTH = 2000

export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** "1:02:03", "02:03" or "3" to seconds; null when it is not a time. */
export function parseTimestamp(text: string): number | null {
  const parts = text.trim().split(':')
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null
  const nums = parts.map(Number)
  if (nums.length > 1 && nums.slice(1).some((n) => n > 59)) return null
  return nums.reduce((total, n) => total * 60 + n, 0)
}

function cleanNote(note: string): string {
  return note.replace(/\r\n?/g, '\n').trim().slice(0, BOOKMARK_NOTE_MAX_LENGTH)
}

export function sortBookmarks(list: readonly Bookmark[]): Bookmark[] {
  return [...list].sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
}

let counter = 0
export function newBookmarkId(now: number): string {
  counter += 1
  return `b${now.toString(36)}${counter.toString(36)}`
}

export function addBookmark(list: readonly Bookmark[], position: number, note: string, now: number): Bookmark[] {
  if (!Number.isFinite(position) || position < 0) return [...list]
  const next = [...list, { id: newBookmarkId(now), position: Math.floor(position), note: cleanNote(note), createdAt: now }]
  return sortBookmarks(next).slice(0, BOOKMARK_MAX_COUNT)
}

export function updateBookmarkNote(list: readonly Bookmark[], id: string, note: string): Bookmark[] {
  return list.map((item) => (item.id === id ? { ...item, note: cleanNote(note) } : item))
}

export function removeBookmark(list: readonly Bookmark[], id: string): Bookmark[] {
  return list.filter((item) => item.id !== id)
}

const LINE = /^- \[((?:\d+:)?\d+:\d{2})\](?: (.*))?$/
const META = /\s*<!--\s*created:(\d+)\s*-->\s*$/

/**
 * Format:
 *   # Bookmarks: Book title
 *
 *   - [1:02:03] First line of the note <!-- created:1760000000000 -->
 *     more note lines are indented by two spaces
 */
export function serializeBookmarks(title: string, list: readonly Bookmark[]): string {
  const lines: string[] = [`# Bookmarks: ${title.replace(/\s+/g, ' ').trim() || 'Untitled'}`, '']
  for (const item of sortBookmarks(list)) {
    const [first = '', ...rest] = cleanNote(item.note).split('\n')
    const meta = item.createdAt > 0 ? ` <!-- created:${item.createdAt} -->` : ''
    lines.push(`- [${formatTimestamp(item.position)}] ${first}${meta}`.trimEnd().replace(/\s+<!--/, ' <!--'))
    for (const extra of rest) lines.push(`  ${extra}`)
  }
  return `${lines.join('\n')}\n`
}

export function parseBookmarks(text: string): Bookmark[] {
  const out: Bookmark[] = []
  let current: Bookmark | null = null
  let seq = 0
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const match = LINE.exec(raw)
    if (match) {
      const position = parseTimestamp(match[1])
      if (position === null) {
        current = null
        continue
      }
      let note = match[2] ?? ''
      let createdAt = 0
      const meta = META.exec(note)
      if (meta) {
        createdAt = Number(meta[1])
        note = note.slice(0, meta.index)
      }
      seq += 1
      current = { id: `p${seq}`, position, note: note.trim(), createdAt }
      out.push(current)
      continue
    }
    if (current && raw.startsWith('  ')) {
      current.note = cleanNote(`${current.note}\n${raw.slice(2)}`)
      continue
    }
    if (raw.trim() !== '') current = null
  }
  return sortBookmarks(out).slice(0, BOOKMARK_MAX_COUNT)
}
