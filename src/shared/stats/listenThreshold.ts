// What counts as a listen. Used by both the player (to decide when to report) and the library (to decide
// whether a reported session qualifies), so the two always agree.

/** Tracks shorter than this only count when played through to the end. */
export const SHORT_TRACK_SECONDS = 30
/** Longest anyone has to listen before a long track counts. */
export const LISTEN_MAX_SECONDS = 120

/** Seconds of actual listening needed before a play counts: half the track, at least 30 s, at most 2 min. */
export function listenThresholdSeconds(durationSeconds: number | null | undefined): number {
  if (!Number.isFinite(durationSeconds) || (durationSeconds ?? 0) <= 0) return SHORT_TRACK_SECONDS
  const duration = durationSeconds as number
  if (duration < SHORT_TRACK_SECONDS) return duration
  return Math.min(LISTEN_MAX_SECONDS, Math.max(SHORT_TRACK_SECONDS, duration / 2))
}
