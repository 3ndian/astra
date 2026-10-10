import type { LyricsFormat } from '../../types/lyrics'

export const LYRICS_EXPORT_KIND = 'astra-lyrics-export'

export interface LyricsExportEntry {
  title: string
  artist: string
  album: string
  durationSeconds: number | null
  format: LyricsFormat
  plainLyrics: string | null
  syncedLyrics: string | null
}

export interface LyricsExportFile {
  kind: typeof LYRICS_EXPORT_KIND
  version: 1
  exportedAt: string
  entries: LyricsExportEntry[]
}

export interface ImportTarget {
  path: string
  title: string
  artist: string
  durationSeconds: number | null
}

const DURATION_TOLERANCE_SECONDS = 5

export function normalizeKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\(\[][^\)\]]*[\)\]]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function buildExportFile(entries: LyricsExportEntry[], now: Date = new Date()): LyricsExportFile {
  return { kind: LYRICS_EXPORT_KIND, version: 1, exportedAt: now.toISOString(), entries }
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export function parseExportFile(raw: string): LyricsExportEntry[] | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const file = data as Record<string, unknown>
  if (file.kind !== LYRICS_EXPORT_KIND || !Array.isArray(file.entries)) return null
  const out: LyricsExportEntry[] = []
  for (const item of file.entries) {
    if (!item || typeof item !== 'object') continue
    const e = item as Record<string, unknown>
    const title = asText(e.title)
    const artist = asText(e.artist)
    const plain = asText(e.plainLyrics)
    const synced = asText(e.syncedLyrics)
    if (!title || !artist || (!plain && !synced)) continue
    const format: LyricsFormat = e.format === 'xlrc' || e.format === 'lrc' || e.format === 'plain' ? e.format : synced ? 'lrc' : 'plain'
    out.push({
      title,
      artist,
      album: typeof e.album === 'string' ? e.album : '',
      durationSeconds: typeof e.durationSeconds === 'number' && Number.isFinite(e.durationSeconds) ? e.durationSeconds : null,
      format,
      plainLyrics: plain,
      syncedLyrics: synced
    })
  }
  return out
}

export interface ImportMatch {
  entry: LyricsExportEntry
  path: string
}

/**
 * Pairs exported lyrics with songs already in this library (normalized title + artist, and the
 * duration within a few seconds when both are known). Each song receives at most one entry.
 */
export function matchImport(
  entries: LyricsExportEntry[],
  targets: ImportTarget[],
  hasLyrics: (path: string) => boolean
): { matches: ImportMatch[]; skipped: number; unmatched: number } {
  const byKey = new Map<string, ImportTarget[]>()
  for (const target of targets) {
    const key = `${normalizeKey(target.title)}|${normalizeKey(target.artist)}`
    const list = byKey.get(key)
    if (list) list.push(target)
    else byKey.set(key, [target])
  }

  const matches: ImportMatch[] = []
  const used = new Set<string>()
  let skipped = 0
  let unmatched = 0
  for (const entry of entries) {
    const candidates = byKey.get(`${normalizeKey(entry.title)}|${normalizeKey(entry.artist)}`)
    const fitting = candidates?.filter((t) =>
      entry.durationSeconds === null
      || t.durationSeconds === null
      || Math.abs(t.durationSeconds - entry.durationSeconds) <= DURATION_TOLERANCE_SECONDS
    )
    if (!fitting || fitting.length === 0) {
      unmatched += 1
      continue
    }
    let matchedAny = false
    for (const target of fitting) {
      if (used.has(target.path)) continue
      if (hasLyrics(target.path)) {
        skipped += 1
        used.add(target.path)
        matchedAny = true
        continue
      }
      used.add(target.path)
      matches.push({ entry, path: target.path })
      matchedAny = true
    }
    if (!matchedAny) skipped += 1
  }
  return { matches, skipped, unmatched }
}
