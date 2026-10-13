import { create } from 'zustand'

const STORAGE_KEY = 'astra.spectrogram.songView.v1'

function read(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

/** Whether the spectrogram shows the whole song (pan and zoom) instead of the live scrolling picture. */
interface SongViewState {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
  /** True while the view follows the music; false once you have dragged somewhere else. */
  following: boolean
  setFollowing: (following: boolean) => void
}

export const useSongViewStore = create<SongViewState>((set) => ({
  enabled: read(),
  setEnabled: (enabled) => {
    set({ enabled })
    try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0') } catch { /* ignore */ }
  },
  following: true,
  setFollowing: (following) => {
    songViewCursor.dirty = true
    set({ following })
  }
}))

/** Where the song view is looking. Read every frame by the picture and by the strip under it, so it is not React state. */
export const songViewCursor = {
  /** The time (seconds) at the middle of the window while not following. */
  center: 0,
  windowSeconds: 24,
  dirty: true,
  /**
   * While following: the start time the picture is held at after a tap behind the middle. The playhead then
   * runs forward from where it was tapped and the picture stays put until the playhead reaches the middle,
   * after which it follows as normal. Null = following as normal.
   */
  anchorStart: null as number | null,
  /** While scratching along the picture: where the playhead is, before the song itself has been moved there. */
  scrubTime: null as number | null
}

/** The time at the middle of the picture while following, honouring a held position after a tap. */
export function followCenter(currentTime: number, windowSeconds: number, durationSeconds: number): number {
  if (songViewCursor.scrubTime !== null) return songViewCursor.scrubTime
  const anchor = songViewCursor.anchorStart
  if (anchor === null) return currentTime
  const half = (durationSeconds > 0 ? Math.min(windowSeconds, durationSeconds) : windowSeconds) / 2
  if (currentTime >= anchor + half) {
    songViewCursor.anchorStart = null
    return currentTime
  }
  return anchor + half
}

/** Keeps the window inside the song: it can never show time before the start or after the end. */
export function resolveSongView(
  center: number,
  windowSeconds: number,
  durationSeconds: number
): { center: number; window: number; start: number } {
  if (!(durationSeconds > 0)) return { center, window: windowSeconds, start: center - windowSeconds / 2 }
  const window = Math.min(windowSeconds, durationSeconds)
  const half = window / 2
  const clamped = Math.min(durationSeconds - half, Math.max(half, center))
  return { center: clamped, window, start: clamped - half }
}

const FLOW_KEY = 'astra.spectrogram.newestAtTop.v1'

/** Tall spectrogram direction: false = newest sound at the bottom (the picture scrolls up), true = newest at the top. */
interface SpectrogramFlowState {
  newestAtTop: boolean
  toggle: () => void
}

export const useSpectrogramFlowStore = create<SpectrogramFlowState>((set, get) => ({
  newestAtTop: (() => { try { return localStorage.getItem(FLOW_KEY) === '1' } catch { return false } })(),
  toggle: () => {
    const next = !get().newestAtTop
    set({ newestAtTop: next })
    songViewCursor.dirty = true
    try { localStorage.setItem(FLOW_KEY, next ? '1' : '0') } catch { /* ignore */ }
  }
}))
