import { create } from 'zustand'
import { usePlayerStore } from './playerStore'
import { startPitchUsageTracking, usePitchUsageStore } from './pitchUsageStore'

const KEY = 'astra.savedPitch.v1'

export interface SavedPitch {
  id: string
  speed: number
  pitch: number
  /** True = pitch kept steady when speed changes; false = tape-style. */
  pitchLock: boolean
}

type Saved = Record<string, SavedPitch[]>

function read(): Saved {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed as Saved : {}
  } catch { return {} }
}

function write(value: Saved): void {
  try { localStorage.setItem(KEY, JSON.stringify(value)) } catch { /* remembered for this session only */ }
}

export function describeSavedPitch(p: SavedPitch): string {
  const speed = `${Number(p.speed.toFixed(3))}×`
  const pitch = `${Number(p.pitch.toFixed(3))}×`
  return p.pitchLock || p.speed === 1 ? `${speed} · pitch ${pitch}` : `${speed} tape · pitch ${pitch}`
}

interface SavedPitchState {
  byTrack: Saved
  /** Save the current speed/pitch for a song (ignored if the same combination is already saved). */
  saveCurrent: (trackPath: string) => void
  remove: (trackPath: string, id: string) => void
  apply: (preset: SavedPitch) => void
  /** The custom speed/pitch set aside while "Original" is on; null when not bypassed. */
  bypassed: { speed: number; pitch: number; pitchLock: boolean } | null
  /** Play at normal speed and pitch; press again to bring back whatever was set before. */
  toggleOriginal: () => void
}

export const useSavedPitchStore = create<SavedPitchState>((set, get) => ({
  byTrack: read(),
  bypassed: null,
  toggleOriginal: () => {
    const player = usePlayerStore.getState()
    const held = get().bypassed
    if (held && player.playbackRate === 1 && player.pitchShift === 1) {
      set({ bypassed: null })
      get().apply({ id: 'restore', ...held })
      return
    }
    if (player.playbackRate === 1 && player.pitchShift === 1) return
    set({ bypassed: { speed: player.playbackRate, pitch: player.pitchShift, pitchLock: player.pitchLock } })
    player.setPlaybackRateTo(1)
    player.setPitchShiftTo(1)
  },
  saveCurrent: (trackPath) => {
    const player = usePlayerStore.getState()
    const entry: SavedPitch = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      speed: player.playbackRate,
      pitch: player.pitchShift,
      pitchLock: player.pitchLock
    }
    const list = get().byTrack[trackPath] ?? []
    if (list.some((p) => p.speed === entry.speed && p.pitch === entry.pitch && p.pitchLock === entry.pitchLock)) return
    usePitchUsageStore.getState().ensure(entry.speed, entry.pitch, entry.pitchLock)
    const next = { ...get().byTrack, [trackPath]: [...list, entry] }
    set({ byTrack: next })
    write(next)
  },
  remove: (trackPath, id) => {
    const list = (get().byTrack[trackPath] ?? []).filter((p) => p.id !== id)
    const next = { ...get().byTrack }
    if (list.length) next[trackPath] = list; else delete next[trackPath]
    set({ byTrack: next })
    write(next)
  },
  apply: (preset) => {
    const player = usePlayerStore.getState()
    if (player.pitchLock !== preset.pitchLock) player.togglePitchLock()
    player.setPlaybackRateTo(preset.speed)
    player.setPitchShiftTo(preset.pitch)
  }
}))


startPitchUsageTracking()
