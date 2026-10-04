// Builds the text of a `.lrc` sidecar file from lyrics Astra already has. Pure (no fs / Electron)
// so it can be unit tested. Sidecars are the portable, player-agnostic way to keep lyrics with a
// collection: they sit next to the audio file and never modify it.

export interface SidecarExportLine {
  timestampMs: number
  text: string
}

export interface SidecarExportInput {
  plainLyrics: string | null
  syncedLyrics: string | null
  syncedLines: readonly SidecarExportLine[]
}

export type SidecarExportKind = 'synced' | 'plain'

export interface SidecarExportContent {
  content: string
  kind: SidecarExportKind
}

/** `[mm:ss.xx]` with centisecond precision. Minutes are not capped at 99. */
export function formatLrcTimestamp(timestampMs: number): string {
  const safeMs = Number.isFinite(timestampMs) ? Math.max(0, timestampMs) : 0
  const totalCentiseconds = Math.round(safeMs / 10)
  const minutes = Math.floor(totalCentiseconds / 6000)
  const seconds = Math.floor((totalCentiseconds % 6000) / 100)
  const centiseconds = totalCentiseconds % 100
  const pad = (value: number, width: number) => String(value).padStart(width, '0')
  return `[${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(centiseconds, 2)}]`
}

function toSingleLine(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/\s+$/g, '')
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/**
 * Picks the best representation to save:
 *  1. timed lines (these already include any per-track sync offset the user set),
 *  2. otherwise the raw synced LRC text,
 *  3. otherwise plain lyrics.
 * Returns null when there is nothing worth writing.
 */
export function buildSidecarLrcContent(input: SidecarExportInput): SidecarExportContent | null {
  const lines = input.syncedLines
    .filter((line) => Number.isFinite(line.timestampMs))
    .map((line) => `${formatLrcTimestamp(line.timestampMs)}${toSingleLine(line.text)}`)
  const hasLyricText = input.syncedLines.some((line) => line.text.trim().length > 0)
  if (lines.length > 0 && hasLyricText) {
    return { content: `${lines.join('\n')}\n`, kind: 'synced' }
  }

  const syncedRaw = input.syncedLyrics ? normalizeNewlines(input.syncedLyrics).trim() : ''
  if (syncedRaw.length > 0) {
    return { content: `${syncedRaw}\n`, kind: 'synced' }
  }

  const plain = input.plainLyrics ? normalizeNewlines(input.plainLyrics).trim() : ''
  if (plain.length > 0) {
    return { content: `${plain}\n`, kind: 'plain' }
  }

  return null
}
