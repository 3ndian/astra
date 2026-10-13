import { create } from 'zustand'
import { usePlayerStore } from './playerStore'

const KEY = 'astra.pitchUsage.v1'
const TICK_MS = 5000

/** One speed + pitch + mode combination, and how much it has been listened to. */
export interface PitchCombo {
  speed: number
  pitch: number
  /** True = pitch kept steady when speed changes; false = tape-style. Meaningless (stored true) at normal speed. */
  pitchLock: boolean
  /** Seconds of playback spent on this combination. */
  seconds: number
  /** How many separate times it was switched to. */
  uses: number
  lastUsed: number
  favorite: boolean
}

type Combos = Record<string, PitchCombo>

export function comboKey(speed: number, pitch: number, pitchLock: boolean): string {
  const s = Number(speed.toFixed(3))
  const p = Number(pitch.toFixed(3))
  return `${s}|${p}|${s === 1 || pitchLock ? 1 : 0}`
}

function read(): Combos {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed as Combos : {}
  } catch { return {} }
}

function write(value: Combos): void {
  try { localStorage.setItem(KEY, JSON.stringify(value)) } catch { /* remembered for this session only */ }
}

interface PitchUsageState {
  combos: Combos
  /** Makes sure a combination is in the list (used when a song's setting is saved), without counting a listen. */
  ensure: (speed: number, pitch: number, pitchLock: boolean) => void
  toggleFavorite: (key: string) => void
  forget: (key: string) => void
}

export const usePitchUsageStore = create<PitchUsageState>((set, get) => ({
  combos: read(),
  ensure: (speed, pitch, pitchLock) => {
    const key = comboKey(speed, pitch, pitchLock)
    if (get().combos[key]) return
    const next = { ...get().combos, [key]: { speed: Number(speed.toFixed(3)), pitch: Number(pitch.toFixed(3)), pitchLock: speed === 1 ? true : pitchLock, seconds: 0, uses: 0, lastUsed: 0, favorite: false } }
    set({ combos: next }); write(next)
  },
  toggleFavorite: (key) => {
    const current = get().combos[key]
    if (!current) return
    const next = { ...get().combos, [key]: { ...current, favorite: !current.favorite } }
    set({ combos: next }); write(next)
  },
  forget: (key) => {
    const next = { ...get().combos }
    delete next[key]
    set({ combos: next }); write(next)
  }
}))

let lastKey: string | null = null
let started = false

/** Counts listening time on whichever non-default speed/pitch combination is active. Runs for the life of the app. */
export function startPitchUsageTracking(): void {
  if (started) return
  started = true
  setInterval(() => {
    const player = usePlayerStore.getState()
    if (player.playbackState !== 'playing') return
    if (player.playbackRate === 1 && player.pitchShift === 1) { lastKey = null; return }
    const key = comboKey(player.playbackRate, player.pitchShift, player.pitchLock)
    const store = usePitchUsageStore.getState()
    const existing = store.combos[key] ?? {
      speed: Number(player.playbackRate.toFixed(3)),
      pitch: Number(player.pitchShift.toFixed(3)),
      pitchLock: player.playbackRate === 1 ? true : player.pitchLock,
      seconds: 0, uses: 0, lastUsed: 0, favorite: false
    }
    const switchedTo = key !== lastKey
    lastKey = key
    const next = {
      ...store.combos,
      [key]: { ...existing, seconds: existing.seconds + TICK_MS / 1000, uses: existing.uses + (switchedTo ? 1 : 0), lastUsed: Date.now() }
    }
    usePitchUsageStore.setState({ combos: next })
    write(next)
  }, TICK_MS)
}
