/**
 * Tells listeners when the window's pixel density changes: dragging the window to another monitor,
 * unplugging a display, or changing the display scale. Canvas elements keep their old backing size
 * when this happens (their CSS size often stays the same), so they must resize themselves.
 */
type Listener = (dpr: number) => void

const listeners = new Set<Listener>()
let currentDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
let mediaQuery: MediaQueryList | null = null
let started = false

function check(): void {
  const next = window.devicePixelRatio || 1
  if (next === currentDpr) return
  currentDpr = next
  listeners.forEach((listener) => listener(next))
  watchCurrentRatio()
}

function watchCurrentRatio(): void {
  if (mediaQuery) mediaQuery.removeEventListener('change', check)
  // This query stops matching the moment the ratio changes, which fires `change`.
  mediaQuery = window.matchMedia(`(resolution: ${currentDpr}dppx)`)
  mediaQuery.addEventListener('change', check)
}

function start(): void {
  if (started || typeof window === 'undefined') return
  started = true
  currentDpr = window.devicePixelRatio || 1
  watchCurrentRatio()
  // Some display changes only show up as a resize or when the window regains focus.
  window.addEventListener('resize', check)
  window.addEventListener('focus', check)
}

function stop(): void {
  if (!started) return
  started = false
  mediaQuery?.removeEventListener('change', check)
  mediaQuery = null
  window.removeEventListener('resize', check)
  window.removeEventListener('focus', check)
}

export function subscribeDevicePixelRatio(listener: Listener): () => void {
  listeners.add(listener)
  start()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) stop()
  }
}
