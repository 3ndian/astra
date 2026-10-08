import { create } from 'zustand'
import { sanitizeQuality, type Quality } from '../../shared/milkdrop/quality'

const STORAGE_KEY = 'astra.milkdrop.background.v1'

export type BackgroundFps = 15 | 24 | 30

interface Persisted {
  enabled: boolean
  /** How solid the panels are over the visual, 30 (see-through) to 95. */
  panelOpacity: number
  quality: Quality
  fps: BackgroundFps
}

const DEFAULTS: Persisted = { enabled: false, panelOpacity: 74, quality: 'low', fps: 30 }

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
      fps: sanitizeFps(parsed.fps)
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
}

export const useMilkdropBackgroundStore = create<Store>((set, get) => {
  const update = (patch: Partial<Persisted>) => {
    set(patch)
    const { enabled, panelOpacity, quality, fps } = get()
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, panelOpacity, quality, fps }))
    } catch {
      // session only
    }
  }
  return {
    ...load(),
    setEnabled: (enabled) => update({ enabled }),
    setPanelOpacity: (value) => update({ panelOpacity: Math.min(95, Math.max(30, Math.round(value))) }),
    setQuality: (quality) => update({ quality }),
    setFps: (fps) => update({ fps })
  }
})
