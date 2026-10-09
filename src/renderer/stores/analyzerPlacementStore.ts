import { create } from 'zustand'

const STORAGE_KEY = 'astra-analyzer-placement-v1'

export type AnalyzerPlacement = 'top' | 'bottom'

function read(): AnalyzerPlacement {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'bottom' ? 'bottom' : 'top'
  } catch {
    return 'top'
  }
}

interface State {
  /** `bottom` puts the visualizer rack below the player bar instead of under the title bar. */
  placement: AnalyzerPlacement
  setPlacement: (placement: AnalyzerPlacement) => void
}

export const useAnalyzerPlacementStore = create<State>((set) => ({
  placement: read(),
  setPlacement: (placement) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, placement)
    } catch {
      // session only
    }
    set({ placement })
  }
}))
