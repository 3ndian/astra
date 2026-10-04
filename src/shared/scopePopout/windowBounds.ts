// Remembered size/position for detached visualizer windows, made safe for the displays that exist now.

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface ScopeWindowLimits {
  minWidth: number
  minHeight: number
  /** Used when a saved size is missing or unusable. */
  defaultWidth: number
  defaultHeight: number
}

export interface ScopeWindowBounds {
  width: number
  height: number
  /** Absent when the saved position is not on any connected display. */
  x?: number
  y?: number
}

/** At least this much of the window must be on a display for the position to count as reachable. */
export const MIN_VISIBLE_WIDTH_PX = 120
export const MIN_VISIBLE_HEIGHT_PX = 60
const MAX_SIZE_PX = 8000

function toFinite(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(n) ? n : undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function isReachable(rect: Rect, workAreas: readonly Rect[]): boolean {
  return workAreas.some((area) => {
    const overlapWidth = Math.min(rect.x + rect.width, area.x + area.width) - Math.max(rect.x, area.x)
    const overlapHeight = Math.min(rect.y + rect.height, area.y + area.height) - Math.max(rect.y, area.y)
    return overlapWidth >= MIN_VISIBLE_WIDTH_PX && overlapHeight >= MIN_VISIBLE_HEIGHT_PX
  })
}

/**
 * Turns whatever was saved into bounds that are safe to open with. The size is always kept (within
 * limits); the position is dropped when it would put the window somewhere you cannot reach, e.g. on
 * a monitor that is no longer connected, so the caller can fall back to a default position.
 */
export function resolveScopeWindowBounds(
  saved: unknown,
  workAreas: readonly Rect[],
  limits: ScopeWindowLimits
): ScopeWindowBounds {
  const raw = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {}
  const width = clamp(Math.round(toFinite(raw.width) ?? limits.defaultWidth), limits.minWidth, MAX_SIZE_PX)
  const height = clamp(Math.round(toFinite(raw.height) ?? limits.defaultHeight), limits.minHeight, MAX_SIZE_PX)

  const x = toFinite(raw.x)
  const y = toFinite(raw.y)
  if (x === undefined || y === undefined) return { width, height }

  const rect: Rect = { x: Math.round(x), y: Math.round(y), width, height }
  if (workAreas.length > 0 && !isReachable(rect, workAreas)) return { width, height }
  return { x: rect.x, y: rect.y, width, height }
}

export type ScopeWindowPrefs = Record<string, Rect>

export function parseScopeWindowPrefs(raw: string | null): ScopeWindowPrefs {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: ScopeWindowPrefs = {}
    for (const [scope, value] of Object.entries(parsed as Record<string, unknown>)) {
      const v = value as Record<string, unknown> | null
      const x = toFinite(v?.x)
      const y = toFinite(v?.y)
      const width = toFinite(v?.width)
      const height = toFinite(v?.height)
      if (x === undefined || y === undefined || width === undefined || height === undefined) continue
      out[scope] = { x, y, width, height }
    }
    return out
  } catch {
    return {}
  }
}
