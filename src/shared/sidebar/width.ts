// Width of the expanded left pane, draggable by the user. Pure helpers, no DOM.

export const MIN_SIDEBAR_WIDTH = 220
export const MAX_SIDEBAR_WIDTH = 520
export const SIDEBAR_KEY_STEP = 16

/** Never let the pane take more than this share of the window. */
const MAX_VIEWPORT_SHARE = 0.5

/** The width the app used before it was draggable: clamp(272px, 23vw, 352px). */
export function defaultSidebarWidth(viewportWidth: number): number {
  return Math.min(352, Math.max(272, Math.round(viewportWidth * 0.23)))
}

export function clampSidebarWidth(width: number, viewportWidth: number): number {
  if (!Number.isFinite(width)) return defaultSidebarWidth(viewportWidth)
  const viewportCap = Math.max(MIN_SIDEBAR_WIDTH, Math.floor(viewportWidth * MAX_VIEWPORT_SHARE))
  const max = Math.min(MAX_SIDEBAR_WIDTH, viewportCap)
  return Math.round(Math.min(max, Math.max(MIN_SIDEBAR_WIDTH, width)))
}

/** Reads a stored value; null means "use the default". */
export function parseStoredSidebarWidth(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < MIN_SIDEBAR_WIDTH || value > MAX_SIDEBAR_WIDTH) return null
  return Math.round(value)
}
