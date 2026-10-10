import { create } from 'zustand'

const STORAGE_KEY = 'astra.visualizer.tint.v1'

export type VisualizerTintMode = 'off' | 'tint' | 'gradient' | 'map'
const MODES: readonly VisualizerTintMode[] = ['off', 'tint', 'gradient', 'map']

interface Persisted {
  mode: VisualizerTintMode
  /** 10 (hint) to 100 (full). */
  strength: number
}

const DEFAULTS: Persisted = { mode: 'off', strength: 60 }

function load(): Persisted {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Persisted>
    const mode = MODES.includes(parsed.mode as VisualizerTintMode) ? (parsed.mode as VisualizerTintMode) : DEFAULTS.mode
    const strength = typeof parsed.strength === 'number' && Number.isFinite(parsed.strength)
      ? Math.min(100, Math.max(10, Math.round(parsed.strength)))
      : DEFAULTS.strength
    return { mode, strength }
  } catch {
    return DEFAULTS
  }
}

interface State extends Persisted {
  setMode: (mode: VisualizerTintMode) => void
  setStrength: (strength: number) => void
}

export const useVisualizerTintStore = create<State>((set, get) => {
  const save = () => {
    const { mode, strength } = get()
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, strength }))
    } catch {
      // session only
    }
  }
  return {
    ...load(),
    setMode: (mode) => { set({ mode }); save() },
    setStrength: (strength) => { set({ strength: Math.min(100, Math.max(10, Math.round(strength))) }); save() }
  }
})
