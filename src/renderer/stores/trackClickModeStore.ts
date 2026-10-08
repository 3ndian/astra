import { create } from 'zustand'

const STORAGE_KEY = 'astra-track-click-mode-v1'

/**
 * `precise`: click a title (or the hover play button on the thumbnail) to play; double-click empty
 * space on a row to play; album and artist names open that album or artist.
 * `row`: the older behaviour where a click anywhere on the row plays.
 */
export type TrackClickMode = 'precise' | 'row'

function read(): TrackClickMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'row' ? 'row' : 'precise'
  } catch {
    return 'precise'
  }
}

interface State {
  mode: TrackClickMode
  setMode: (mode: TrackClickMode) => void
}

export const useTrackClickModeStore = create<State>((set) => ({
  mode: read(),
  setMode: (mode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // session only
    }
    set({ mode })
  }
}))
