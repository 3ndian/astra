// Width of the right-hand panels (queue, track info), draggable by the user. Pure helpers, no DOM.

export const RIGHT_PANEL_MIN_WIDTH = 240
export const RIGHT_PANEL_MAX_WIDTH = 640
export const RIGHT_PANEL_KEY_STEP = 16

/** Never let one panel take more than this share of the window. */
const MAX_VIEWPORT_SHARE = 0.5

export function clampRightPanelWidth(width: number, viewportWidth: number, fallback: number): number {
  if (!Number.isFinite(width)) return fallback
  const viewportCap = Math.max(RIGHT_PANEL_MIN_WIDTH, Math.floor(viewportWidth * MAX_VIEWPORT_SHARE))
  const max = Math.min(RIGHT_PANEL_MAX_WIDTH, viewportCap)
  return Math.round(Math.min(max, Math.max(RIGHT_PANEL_MIN_WIDTH, width)))
}

/** Reads a stored value; null means "use the default". */
export function parseStoredPanelWidth(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < RIGHT_PANEL_MIN_WIDTH || value > RIGHT_PANEL_MAX_WIDTH) return null
  return Math.round(value)
}
