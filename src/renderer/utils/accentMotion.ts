const KEY = 'astra.accent.instant.v1'

/** True = a new accent colour (for example when the album changes) is applied at once instead of fading over ~0.3 s. */
export function isInstantAccent(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

export function setInstantAccent(instant: boolean): void {
  try { window.localStorage.setItem(KEY, instant ? '1' : '0') } catch { /* session only */ }
}
