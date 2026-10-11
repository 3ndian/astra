import { create } from 'zustand'
import { audioEngine } from '../audio/AudioEngine'
import type { FrequencyFilterMode, FrequencyFilterRange } from '../../shared/frequencyFilter/plan'
import { registerUndoScope } from '../utils/undoRouter'

const FOLLOW_KEY = 'astra.frequencyFilter.followVectorscope.v1'

function loadFollowVectorscope(): boolean {
  try {
    // On unless the user turned it off.
    return window.localStorage.getItem(FOLLOW_KEY) !== '0'
  } catch {
    return true
  }
}

interface FrequencyFilterState {
  range: FrequencyFilterRange | null
  /** The vectorscope draws only what the band lets through. */
  followVectorscope: boolean
  setFollowVectorscope: (follow: boolean) => void
  /** False when the current output (bit-perfect) cannot be filtered. */
  supported: boolean
  setRange: (lowHz: number, highHz: number) => void
  setMode: (mode: FrequencyFilterMode) => void
  clear: () => void
  /** Call once when a drag begins, so the whole drag can be undone in one step. */
  beginChange: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  refreshSupported: () => void
}

/**
 * The band picked on the spectrogram. It is not remembered between launches, so the app never starts
 * with part of the music missing.
 */
export const useFrequencyFilterStore = create<FrequencyFilterState>((set, get) => {
  const push = (range: FrequencyFilterRange | null) => {
    const applied = audioEngine.setFrequencyFilter(range)
    set({ range, supported: applied || range === null ? audioEngine.canFilterFrequencies() : false })
  }
  // Undo / redo of band changes. Only the band itself is tracked, not the Vectorscope toggle.
  const HISTORY_LIMIT = 100
  const past: (FrequencyFilterRange | null)[] = []
  const future: (FrequencyFilterRange | null)[] = []
  const remember = () => {
    past.push(get().range ? { ...get().range! } : null)
    if (past.length > HISTORY_LIMIT) past.shift()
    future.length = 0
  }
  const initialFollow = loadFollowVectorscope()
  audioEngine.setVisualsFollowFrequencyFilter({ vectorscope: initialFollow })
  return {
    range: null,
    followVectorscope: initialFollow,
    setFollowVectorscope: (follow) => {
      audioEngine.setVisualsFollowFrequencyFilter({ vectorscope: follow })
      set({ followVectorscope: follow })
      try {
        window.localStorage.setItem(FOLLOW_KEY, follow ? '1' : '0')
      } catch {
        // remembered for this session only
      }
    },
    supported: true,
    setRange: (lowHz, highHz) => push({ lowHz, highHz, mode: get().range?.mode ?? 'solo' }),
    setMode: (mode) => {
      const current = get().range
      if (!current || current.mode === mode) return
      remember()
      push({ ...current, mode })
    },
    clear: () => {
      if (!get().range) return
      remember()
      push(null)
    },
    beginChange: () => remember(),
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    undo: () => {
      if (past.length === 0) return
      const current = get().range
      future.push(current ? { ...current } : null)
      push(past.pop() ?? null)
    },
    redo: () => {
      if (future.length === 0) return
      const current = get().range
      past.push(current ? { ...current } : null)
      push(future.pop() ?? null)
    },
    refreshSupported: () => {
      const supported = audioEngine.canFilterFrequencies()
      if (supported !== get().supported) set({ supported })
    }
  }
})

// Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z step through band changes (see utils/undoRouter for how keys are shared).
registerUndoScope({
  id: 'spectrogram-band',
  priority: 10,
  canUndo: () => useFrequencyFilterStore.getState().canUndo(),
  canRedo: () => useFrequencyFilterStore.getState().canRedo(),
  undo: () => useFrequencyFilterStore.getState().undo(),
  redo: () => useFrequencyFilterStore.getState().redo()
})
