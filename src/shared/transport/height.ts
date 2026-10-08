// Height of the bottom player bar, adjustable by dragging its top edge.

export const TRANSPORT_HEIGHT_MIN = 84
export const TRANSPORT_HEIGHT_MAX = 140
export const TRANSPORT_HEIGHT_DEFAULT = 112
export const TRANSPORT_HEIGHT_KEY_STEP = 4

export function clampTransportHeight(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return TRANSPORT_HEIGHT_DEFAULT
  return Math.min(TRANSPORT_HEIGHT_MAX, Math.max(TRANSPORT_HEIGHT_MIN, Math.round(n)))
}

/** Dragging the top edge up makes the bar taller. `scale` is the UI scale (clientY is screen px). */
export function heightFromDrag(startHeight: number, startY: number, currentY: number, scale: number): number {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
  return clampTransportHeight(startHeight + (startY - currentY) / safeScale)
}
