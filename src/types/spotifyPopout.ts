// The small always-available Spotify window. Two looks:
//   square: just the album cover, controls appear on hover; keeps a 1:1 shape when resized.
//   wide:   cover on the left (as tall as the window), title and controls on the right; the
//           width and height can be changed independently.

export type SpotifyPopoutLayout = 'square' | 'wide'

export interface SpotifyPopoutRect {
  x?: number
  y?: number
  width: number
  height: number
}

export interface SpotifyPopoutPrefs {
  layout: SpotifyPopoutLayout
  alwaysOnTop: boolean
  /** Tint the window with the album cover's colours. */
  albumColors: boolean
  square: SpotifyPopoutRect
  wide: SpotifyPopoutRect
}

export interface SpotifyPopoutState {
  layout: SpotifyPopoutLayout
  alwaysOnTop: boolean
  albumColors: boolean
}

export const SPOTIFY_POPOUT_LIMITS = {
  square: { min: 160, max: 640, default: 260 },
  wide: { minWidth: 340, maxWidth: 1000, minHeight: 90, maxHeight: 900, defaultWidth: 420, defaultHeight: 120 }
} as const

export interface SpotifyPopoutWorkArea {
  x: number
  y: number
  width: number
  height: number
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clampPopoutSize(layout: SpotifyPopoutLayout, width: number, height: number): { width: number; height: number } {
  if (layout === 'square') {
    const { min, max } = SPOTIFY_POPOUT_LIMITS.square
    const size = clamp(Math.round(Math.max(width, height)), min, max)
    return { width: size, height: size }
  }
  const limits = SPOTIFY_POPOUT_LIMITS.wide
  return {
    width: clamp(Math.round(width), limits.minWidth, limits.maxWidth),
    height: clamp(Math.round(height), limits.minHeight, limits.maxHeight)
  }
}

function normalizeRect(layout: SpotifyPopoutLayout, raw: unknown, displays: SpotifyPopoutWorkArea[]): SpotifyPopoutRect {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const defaults = layout === 'square'
    ? { width: SPOTIFY_POPOUT_LIMITS.square.default, height: SPOTIFY_POPOUT_LIMITS.square.default }
    : { width: SPOTIFY_POPOUT_LIMITS.wide.defaultWidth, height: SPOTIFY_POPOUT_LIMITS.wide.defaultHeight }
  const size = clampPopoutSize(layout, finite(record.width) ?? defaults.width, finite(record.height) ?? defaults.height)
  const x = finite(record.x)
  const y = finite(record.y)
  if (x === undefined || y === undefined) return size
  const bounds = { x: Math.round(x), y: Math.round(y), ...size }
  const visible = displays.length === 0 || displays.some((d) =>
    bounds.x < d.x + d.width && bounds.x + bounds.width > d.x && bounds.y < d.y + d.height && bounds.y + bounds.height > d.y)
  return visible ? bounds : size
}

export function normalizeSpotifyPopoutPrefs(raw: unknown, displays: SpotifyPopoutWorkArea[] = []): SpotifyPopoutPrefs {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    layout: record.layout === 'wide' ? 'wide' : 'square',
    alwaysOnTop: record.alwaysOnTop !== false,
    albumColors: record.albumColors !== false,
    square: normalizeRect('square', record.square, displays),
    wide: normalizeRect('wide', record.wide, displays)
  }
}

export interface PopoutBounds {
  x: number
  y: number
  width: number
  height: number
}

export type PopoutResizeEdge =
  | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export function isCornerEdge(edge: string): edge is 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' {
  return edge === 'top-left' || edge === 'top-right' || edge === 'bottom-left' || edge === 'bottom-right'
}

/**
 * Wide layout: dragging a corner keeps the shape the window had when the drag began, while the
 * sides, top and bottom resize freely. Returns null when the drag should be left alone.
 * `start` is the window as it was before the drag; `proposed` is what the OS wants to set.
 */
export function proportionalCornerResize(start: PopoutBounds, proposed: PopoutBounds, edge: string): PopoutBounds | null {
  if (!isCornerEdge(edge) || start.width <= 0 || start.height <= 0) return null
  const limits = SPOTIFY_POPOUT_LIMITS.wide
  const scaleX = proposed.width / start.width
  const scaleY = proposed.height / start.height
  // Follow whichever direction the pointer moved further.
  let scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY
  const minScale = Math.max(limits.minWidth / start.width, limits.minHeight / start.height)
  const maxScale = Math.min(limits.maxWidth / start.width, limits.maxHeight / start.height)
  if (minScale > maxScale) return null
  scale = Math.min(maxScale, Math.max(minScale, scale))
  const width = Math.round(start.width * scale)
  const height = Math.round(start.height * scale)
  const anchorsRight = edge === 'top-left' || edge === 'bottom-left'
  const anchorsBottom = edge === 'top-left' || edge === 'top-right'
  return {
    x: anchorsRight ? start.x + start.width - width : start.x,
    y: anchorsBottom ? start.y + start.height - height : start.y,
    width,
    height
  }
}

export interface WideShape {
  /** true: cover across the top with the details underneath; false: cover on the left. */
  stacked: boolean
  /** Scale for everything inside the window (1 = the default 420 x 120 strip). */
  unit: number
  /** Side of the square cover in px. */
  cover: number
}

const clampUnit = (value: number): number => Math.min(2.6, Math.max(0.7, value))

/** How the wide layout arranges itself for a given window size. */
export function wideShape(width: number, height: number): WideShape {
  const landscapeUnit = clampUnit(Math.min(height / 120, width / 400))
  // The details need roughly 190 units of width next to the cover.
  if (width - height >= 190 * landscapeUnit) {
    return { stacked: false, unit: landscapeUnit, cover: height }
  }
  const unit = clampUnit(width / 340)
  const detailsHeight = 112 * unit
  const cover = Math.max(48, Math.min(width, height - detailsHeight))
  return { stacked: true, unit, cover: Math.floor(cover) }
}
