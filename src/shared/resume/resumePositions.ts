// Remembers where you stopped in long files (audiobooks). Pure helpers; storage lives in the renderer.

export interface ResumeEntry {
  /** Seconds into the file. */
  position: number
  /** File length when saved (seconds); 0 when unknown. */
  duration: number
  /** Date.now() when saved. */
  updatedAt: number
}

export type ResumeMap = Record<string, ResumeEntry>

/** Positions earlier than this are not worth remembering. */
export const RESUME_MIN_POSITION_S = 15
/** Closer than this to the end counts as finished. */
export const RESUME_END_MARGIN_S = 30
/** Jump back a little on resume so you hear the sentence you were in. */
export const RESUME_REWIND_S = 3
export const RESUME_MAX_ENTRIES = 300

export function isFinished(position: number, duration: number): boolean {
  return duration > 0 && position >= duration - RESUME_END_MARGIN_S
}

/** Returns the updated map (never mutates). Positions too early or at the end clear the entry. */
export function recordPosition(
  map: ResumeMap,
  path: string,
  position: number,
  duration: number,
  now: number
): ResumeMap {
  if (!path || !Number.isFinite(position)) return map
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  if (isFinished(position, safeDuration)) return removePosition(map, path)
  if (position < RESUME_MIN_POSITION_S) return map

  const next: ResumeMap = { ...map, [path]: { position, duration: safeDuration, updatedAt: now } }
  const keys = Object.keys(next)
  if (keys.length > RESUME_MAX_ENTRIES) {
    keys
      .sort((a, b) => next[a].updatedAt - next[b].updatedAt)
      .slice(0, keys.length - RESUME_MAX_ENTRIES)
      .forEach((key) => delete next[key])
  }
  return next
}

export function removePosition(map: ResumeMap, path: string): ResumeMap {
  if (!(path in map)) return map
  const next = { ...map }
  delete next[path]
  return next
}

/** Where playback should start for this file: 0 when nothing (or a finished file) is remembered. */
export function resolveResumeStart(map: ResumeMap, path: string, duration: number): number {
  const entry = map[path]
  if (!entry) return 0
  const knownDuration = duration > 0 ? duration : entry.duration
  if (entry.position < RESUME_MIN_POSITION_S || isFinished(entry.position, knownDuration)) return 0
  return Math.max(0, entry.position - RESUME_REWIND_S)
}

export function parseResumeMap(raw: string | null): ResumeMap {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: ResumeMap = {}
    for (const [path, value] of Object.entries(parsed as Record<string, unknown>)) {
      const entry = value as Partial<ResumeEntry> | null
      if (!entry || typeof entry.position !== 'number' || !Number.isFinite(entry.position) || entry.position < 0) continue
      out[path] = {
        position: entry.position,
        duration: typeof entry.duration === 'number' && Number.isFinite(entry.duration) ? entry.duration : 0,
        updatedAt: typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0
      }
    }
    return out
  } catch {
    return {}
  }
}
