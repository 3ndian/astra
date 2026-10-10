export type LyricsBulkStatus = 'idle' | 'running' | 'waiting' | 'paused' | 'done' | 'cancelled' | 'stopped'

export type LyricsBulkPace = 'gentle' | 'normal' | 'fast'

export const LYRICS_BULK_PACE_MS: Record<LyricsBulkPace, number> = {
  gentle: 3000,
  normal: 1500,
  fast: 700
}

export interface LyricsBulkState {
  status: LyricsBulkStatus
  total: number
  done: number
  found: number
  notFound: number
  alreadyHad: number
  failed: number
  /** Epoch ms when a rate-limit wait ends (status 'waiting'), else null. */
  waitingUntil: number | null
  /** Human text shown in the progress card (rate limit notice, stop reason). */
  message: string | null
  current: string | null
}

export interface LyricsBulkStartOptions {
  /** Explicit track paths; omit for the whole current library. */
  paths?: string[]
  pace?: LyricsBulkPace
  saveSidecars?: boolean
}

export interface LyricsBulkStartResult {
  started: boolean
  total: number
  error?: string
}

export interface LyricsTransferResult {
  status: 'ok' | 'cancelled' | 'error'
  count?: number
  skipped?: number
  unmatched?: number
  path?: string
  message?: string
}
