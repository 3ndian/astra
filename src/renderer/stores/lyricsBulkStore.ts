import { create } from 'zustand'
import type { LyricsBulkPace, LyricsBulkState } from '../../types/lyricsBulk'

const PACE_KEY = 'astra.lyricsBulk.pace'
const SIDECAR_KEY = 'astra.lyricsBulk.saveSidecars'

function readPace(): LyricsBulkPace {
  try {
    const value = localStorage.getItem(PACE_KEY)
    if (value === 'gentle' || value === 'fast') return value
  } catch {
    // storage unavailable: use the default
  }
  return 'normal'
}

function readSidecars(): boolean {
  try {
    return localStorage.getItem(SIDECAR_KEY) === '1'
  } catch {
    return false
  }
}

interface LyricsBulkStore {
  state: LyricsBulkState | null
  /** The finished-run summary stays visible until dismissed. */
  dismissed: boolean
  pace: LyricsBulkPace
  saveSidecars: boolean
  message: string | null
  init: () => () => void
  start: (paths?: string[]) => Promise<void>
  setPace: (pace: LyricsBulkPace) => void
  setSaveSidecars: (value: boolean) => void
  dismiss: () => void
}

export const useLyricsBulkStore = create<LyricsBulkStore>((set, get) => ({
  state: null,
  dismissed: true,
  pace: readPace(),
  saveSidecars: readSidecars(),
  message: null,
  init: () => {
    void window.electronAPI.lyricsBulk.getState().then((state) => {
      if (state.status !== 'idle') set({ state, dismissed: false })
    })
    return window.electronAPI.lyricsBulk.onState((state) => set({ state, dismissed: false }))
  },
  start: async (paths) => {
    const { pace, saveSidecars } = get()
    const result = await window.electronAPI.lyricsBulk.start({ paths, pace, saveSidecars })
    set({ message: result.started ? null : (result.error ?? 'Could not start.') })
    if (!result.started && result.error) window.alert(result.error)
  },
  setPace: (pace) => {
    try { localStorage.setItem(PACE_KEY, pace) } catch { /* ignore */ }
    set({ pace })
  },
  setSaveSidecars: (value) => {
    try { localStorage.setItem(SIDECAR_KEY, value ? '1' : '0') } catch { /* ignore */ }
    set({ saveSidecars: value })
  },
  dismiss: () => set({ dismissed: true })
}))
