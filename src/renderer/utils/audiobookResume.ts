import { getActiveSection } from '../../shared/sections/sections'
import {
  parseResumeMap,
  recordPosition,
  removePosition,
  resolveResumeStart,
  type ResumeMap
} from '../../shared/resume/resumePositions'
import { useSectionsStore } from '../stores/sectionsStore'
import { usePlayerStore } from '../stores/playerStore'

// "Pick up where you left off" for Audiobook sections. Positions are kept in localStorage per file path.
const STORAGE_KEY = 'astra-resume-positions-v1'
const SAVE_INTERVAL_MS = 5000

let cache: ResumeMap | null = null

function load(): ResumeMap {
  if (cache) return cache
  try {
    cache = parseResumeMap(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    cache = {}
  }
  return cache
}

function store(next: ResumeMap): void {
  if (next === cache) return
  cache = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // storage unavailable; the position just won't persist
  }
}

export function isAudiobookSectionActive(): boolean {
  const registry = useSectionsStore.getState().registry
  return registry ? getActiveSection(registry).kind === 'audiobook' : false
}

function isLocal(track: { sourceType?: string | null }): boolean {
  return !track.sourceType || track.sourceType === 'local'
}

/** Seconds to start a file at (0 = from the beginning). Only applies while an Audiobook section is active. */
export function getResumeStart(track: { path: string; duration: number; sourceType?: string | null }): number {
  if (!isAudiobookSectionActive() || !isLocal(track)) return 0
  return resolveResumeStart(load(), track.path, track.duration)
}

export function clearResumePosition(path: string): void {
  store(removePosition(load(), path))
}

function save(path: string, position: number, duration: number): void {
  store(recordPosition(load(), path, position, duration, Date.now()))
}

/** Saves the playback position every few seconds while an Audiobook section is active. Call from App. */
export function startResumeTracker(): () => void {
  let lastSavedAt = 0

  const unsubscribe = usePlayerStore.subscribe((state, prev) => {
    const prevActive = prev.playbackState === 'playing' || prev.playbackState === 'paused'
    // Switched to another file: store where the old one stopped.
    if (prev.currentTrack && prev.currentTrack.path !== state.currentTrack?.path && prevActive) {
      if (isAudiobookSectionActive() && isLocal(prev.currentTrack)) {
        save(prev.currentTrack.path, prev.currentTime, prev.duration || prev.currentTrack.duration)
      }
      return
    }

    const track = state.currentTrack
    if (!track || !isLocal(track)) return
    const active = state.playbackState === 'playing' || state.playbackState === 'paused'
    if (!active || state.currentTime <= 0 || !isAudiobookSectionActive()) return

    const now = performance.now()
    const justPaused = state.playbackState === 'paused' && prev.playbackState === 'playing'
    if (!justPaused && now - lastSavedAt < SAVE_INTERVAL_MS) return
    lastSavedAt = now
    save(track.path, state.currentTime, state.duration || track.duration)
  })

  const flush = () => {
    const state = usePlayerStore.getState()
    const track = state.currentTrack
    if (!track || !isLocal(track) || !isAudiobookSectionActive()) return
    if (state.playbackState === 'playing' || state.playbackState === 'paused') {
      save(track.path, state.currentTime, state.duration || track.duration)
    }
  }
  window.addEventListener('beforeunload', flush)

  return () => {
    unsubscribe()
    window.removeEventListener('beforeunload', flush)
  }
}
