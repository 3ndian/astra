// "Keep spectrogram and waveform history across songs". A plain module (no React or store
// library) so the visualizer classes can read it and unit tests can load them.

const STORAGE_KEY = 'astra-visualizer-keep-history-v1'

let cached: boolean | null = null

export function getKeepHistoryAcrossTracks(): boolean {
  if (cached !== null) return cached
  try {
    cached = window.localStorage.getItem(STORAGE_KEY) !== '0'
  } catch {
    cached = true
  }
  return cached
}

export function setKeepHistoryAcrossTracks(keep: boolean): void {
  cached = keep
  try {
    window.localStorage.setItem(STORAGE_KEY, keep ? '1' : '0')
  } catch {
    // session only
  }
}
