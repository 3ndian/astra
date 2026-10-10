import { create } from 'zustand'
import { sanitizeQuality, type Quality } from '../../shared/milkdrop/quality'
import type { VisualizerTintMode } from './visualizerTintStore'

const STORAGE_KEY = 'astra.milkdrop.background.v1'

export type BackgroundFps = 15 | 24 | 30

interface Persisted {
  enabled: boolean
  /** How solid the panels are over the visual, 30 (see-through) to 95. */
  panelOpacity: number
  quality: Quality
  fps: BackgroundFps
  /** How strong the visual itself is, 20 (faint) to 100. */
  visualOpacity: number
  /** Blur on the visual in px, 0 (off) to 24. Costs GPU, so it is off by default. */
  blur: number
  /** Album colours laid over the visual. */
  tintMode: VisualizerTintMode
  /** 10 to 100. */
  tintStrength: number
}

const DEFAULTS: Persisted = { enabled: false, panelOpacity: 74, quality: 'low', fps: 30, visualOpacity: 100, blur: 0, tintMode: 'off', tintStrength: 60 }

function clampNumber(raw: unknown, min: number, max: number, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(max, Math.max(min, Math.round(raw))) : fallback
}

function sanitizeFps(raw: unknown): BackgroundFps {
  return raw === 15 || raw === 24 ? raw : 30
}

function load(): Persisted {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Persisted>
    const opacity = typeof parsed.panelOpacity === 'number' && Number.isFinite(parsed.panelOpacity) ? parsed.panelOpacity : DEFAULTS.panelOpacity
    return {
      enabled: parsed.enabled === true,
      panelOpacity: Math.min(95, Math.max(30, Math.round(opacity))),
      quality: parsed.quality ? sanitizeQuality(parsed.quality) : DEFAULTS.quality,
      fps: sanitizeFps(parsed.fps),
      visualOpacity: clampNumber(parsed.visualOpacity, 20, 100, DEFAULTS.visualOpacity),
      blur: clampNumber(parsed.blur, 0, 24, DEFAULTS.blur),
      tintMode: parsed.tintMode === 'tint' || parsed.tintMode === 'gradient' || parsed.tintMode === 'map' ? parsed.tintMode : 'off',
      tintStrength: clampNumber(parsed.tintStrength, 10, 100, DEFAULTS.tintStrength)
    }
  } catch {
    return DEFAULTS
  }
}

interface Store extends Persisted {
  setEnabled: (enabled: boolean) => void
  setPanelOpacity: (value: number) => void
  setQuality: (quality: Quality) => void
  setFps: (fps: BackgroundFps) => void
  setVisualOpacity: (value: number) => void
  setBlur: (value: number) => void
  setTintMode: (mode: VisualizerTintMode) => void
  setTintStrength: (value: number) => void
}

export const useMilkdropBackgroundStore = create<Store>((set, get) => {
  const update = (patch: Partial<Persisted>) => {
    set(patch)
    const { enabled, panelOpacity, quality, fps, visualOpacity, blur, tintMode, tintStrength } = get()
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, panelOpacity, quality, fps, visualOpacity, blur, tintMode, tintStrength }))
    } catch {
      // session only
    }
  }
  return {
    ...load(),
    setEnabled: (enabled) => update({ enabled }),
    setPanelOpacity: (value) => update({ panelOpacity: Math.min(95, Math.max(30, Math.round(value))) }),
    setQuality: (quality) => update({ quality }),
    setFps: (fps) => update({ fps }),
    setVisualOpacity: (value) => update({ visualOpacity: clampNumber(value, 20, 100, 100) }),
    setBlur: (value) => update({ blur: clampNumber(value, 0, 24, 0) }),
    setTintMode: (tintMode) => update({ tintMode }),
    setTintStrength: (value) => update({ tintStrength: clampNumber(value, 10, 100, 60) })
  }
})
