import { create } from 'zustand'
import { audioEngine } from '../audio/AudioEngine'
import type { FrequencyFilterMode, FrequencyFilterRange } from '../../shared/frequencyFilter/plan'

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
      if (current) push({ ...current, mode })
    },
    clear: () => push(null),
    refreshSupported: () => {
      const supported = audioEngine.canFilterFrequencies()
      if (supported !== get().supported) set({ supported })
    }
  }
})
