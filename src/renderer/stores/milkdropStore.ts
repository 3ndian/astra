import { create } from 'zustand'

const STORAGE_KEY = 'astra.milkdrop.v1'

interface Persisted {
  enabled: boolean
  presetName: string | null
  autoCycleSeconds: number
  blendSeconds: number
}

const DEFAULTS: Persisted = { enabled: false, presetName: null, autoCycleSeconds: 30, blendSeconds: 3 }

function load(): Persisted {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Persisted>
    return {
      enabled: parsed.enabled === true,
      presetName: typeof parsed.presetName === 'string' ? parsed.presetName : null,
      autoCycleSeconds: typeof parsed.autoCycleSeconds === 'number' ? parsed.autoCycleSeconds : DEFAULTS.autoCycleSeconds,
      blendSeconds: typeof parsed.blendSeconds === 'number' ? parsed.blendSeconds : DEFAULTS.blendSeconds
    }
  } catch {
    return DEFAULTS
  }
}

function save(state: Persisted): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage unavailable; settings just won't persist
  }
}

interface MilkdropStore extends Persisted {
  setEnabled: (enabled: boolean) => void
  setPresetName: (name: string | null) => void
  setAutoCycleSeconds: (seconds: number) => void
  setBlendSeconds: (seconds: number) => void
}

function persistedOf(s: MilkdropStore): Persisted {
  return { enabled: s.enabled, presetName: s.presetName, autoCycleSeconds: s.autoCycleSeconds, blendSeconds: s.blendSeconds }
}

export const useMilkdropStore = create<MilkdropStore>((set, get) => ({
  ...load(),
  setEnabled: (enabled) => { set({ enabled }); save(persistedOf(get())) },
  setPresetName: (presetName) => { set({ presetName }); save(persistedOf(get())) },
  setAutoCycleSeconds: (autoCycleSeconds) => { set({ autoCycleSeconds }); save(persistedOf(get())) },
  setBlendSeconds: (blendSeconds) => { set({ blendSeconds }); save(persistedOf(get())) }
}))
