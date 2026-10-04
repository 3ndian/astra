// Sleep timer logic (audiobooks): pause after N minutes or at the end of the current file. Pure.

export type SleepTimerState =
  | null
  | { kind: 'minutes'; endsAt: number; totalMs: number }
  | { kind: 'end-of-track'; path: string }

export const SLEEP_PRESET_MINUTES: readonly number[] = [15, 30, 45, 60, 90]

/** Closer than this to the end of the file counts as "the end". */
const END_OF_TRACK_SLACK_S = 0.4

export function startMinutes(now: number, minutes: number): SleepTimerState {
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  const totalMs = Math.round(minutes * 60_000)
  return { kind: 'minutes', endsAt: now + totalMs, totalMs }
}

export function startEndOfTrack(path: string | null): SleepTimerState {
  return path ? { kind: 'end-of-track', path } : null
}

/** Adds time to a running minutes timer (the "+15 min" button). Other states are returned unchanged. */
export function extendMinutes(state: SleepTimerState, minutes: number): SleepTimerState {
  if (!state || state.kind !== 'minutes') return state
  const addMs = Math.round(minutes * 60_000)
  return { kind: 'minutes', endsAt: state.endsAt + addMs, totalMs: state.totalMs + addMs }
}

export function remainingMs(state: SleepTimerState, now: number): number | null {
  if (!state || state.kind !== 'minutes') return null
  return Math.max(0, state.endsAt - now)
}

export interface SleepTimerPlayer {
  path: string | null
  currentTime: number
  duration: number
}

export function shouldFire(state: SleepTimerState, now: number, player: SleepTimerPlayer): boolean {
  if (!state) return false
  if (state.kind === 'minutes') return now >= state.endsAt
  if (player.path !== state.path) return true
  return player.duration > 0 && player.duration - player.currentTime <= END_OF_TRACK_SLACK_S
}

export function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}
