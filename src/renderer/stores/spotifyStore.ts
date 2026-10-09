import { create } from 'zustand'
import type { SpotifyCommand, SpotifyStatus } from '../../types/spotify'
import { usePlayerStore } from './playerStore'

export type SpotifyHandoffPreference = 'ask' | 'always' | 'never'
export type ActiveSource = 'astra' | 'spotify'

const ENABLED_KEY = 'astra-spotify-enabled-v1'
const HANDOFF_KEY = 'astra-spotify-handoff-v1'
/** Ignore "Spotify is playing" reports for this long after Astra paused it (stale polls). */
const SUPPRESS_AFTER_PAUSE_MS = 3000

export const INITIAL_SPOTIFY_STATUS: SpotifyStatus = {
  state: 'notrunning',
  track: null,
  positionSeconds: 0,
  volume: null,
  artworkDataUrl: null,
  message: null
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // storage unavailable; the setting just won't persist
  }
}

function readHandoff(): SpotifyHandoffPreference {
  const raw = readStorage(HANDOFF_KEY)
  return raw === 'always' || raw === 'never' ? raw : 'ask'
}

interface SpotifyStoreState {
  /** Nothing talks to Spotify (and macOS never shows the Automation prompt) until this is true. */
  enabled: boolean
  status: SpotifyStatus
  /** performance.now() when `status` was received; lets the bar smooth the progress. */
  statusReceivedAt: number
  loaded: boolean
  activeSource: ActiveSource
  handoffPreference: SpotifyHandoffPreference
  /** True while the "Pause Spotify?" question is on screen. */
  pendingPrompt: boolean

  enable: () => void
  setHandoffPreference: (preference: SpotifyHandoffPreference) => void
  sendCommand: (command: SpotifyCommand) => Promise<void>
  answerPrompt: (answer: 'once' | 'always' | 'keep') => void
}

let pollTimer: number | null = null
let pollGeneration = 0
let suppressPlayingUntil = 0
let playerUnsubscribe: (() => void) | null = null

export const useSpotifyStore = create<SpotifyStoreState>((set, get) => ({
  enabled: readStorage(ENABLED_KEY) === '1',
  status: INITIAL_SPOTIFY_STATUS,
  statusReceivedAt: 0,
  loaded: false,
  activeSource: 'astra',
  handoffPreference: readHandoff(),
  pendingPrompt: false,

  enable: () => {
    if (get().enabled) return
    writeStorage(ENABLED_KEY, '1')
    set({ enabled: true })
  },

  setHandoffPreference: (preference) => {
    writeStorage(HANDOFF_KEY, preference)
    set({ handoffPreference: preference })
  },

  sendCommand: async (command) => {
    try {
      const next = await window.electronAPI.spotify.command(command)
      applyStatus(next)
    } catch {
      // the next poll reports the real state
    }
  },

  answerPrompt: (answer) => {
    if (answer === 'always') get().setHandoffPreference('always')
    set({ pendingPrompt: false })
    if (answer === 'keep') return
    pauseSpotifyForAstra()
  }
}))

function pauseSpotifyForAstra(): void {
  suppressPlayingUntil = performance.now() + SUPPRESS_AFTER_PAUSE_MS
  void useSpotifyStore.getState().sendCommand({ kind: 'pause' })
}

function astraIsPlaying(): boolean {
  return usePlayerStore.getState().playbackState === 'playing'
}

function applyStatus(next: SpotifyStatus): void {
  const store = useSpotifyStore.getState()
  const prev = store.status
  const spotifyPlaying = next.state === 'playing' && next.track !== null
  const startedPlaying = spotifyPlaying && prev.state !== 'playing'
  const suppressed = performance.now() < suppressPlayingUntil

  let activeSource = store.activeSource
  let pendingPrompt = store.pendingPrompt

  if (spotifyPlaying && !suppressed) {
    if (astraIsPlaying()) {
      // Spotify started while Astra was playing: Spotify wins, Astra pauses.
      if (startedPlaying) {
        usePlayerStore.getState().pause()
        activeSource = 'spotify'
      }
    } else {
      activeSource = 'spotify'
    }
  }

  if (!spotifyPlaying) pendingPrompt = false

  const spotifyGone =
    next.track === null ||
    next.state === 'notrunning' ||
    next.state === 'stopped' ||
    next.state === 'unsupported' ||
    next.state === 'error'
  if (spotifyGone && activeSource === 'spotify') activeSource = 'astra'

  useSpotifyStore.setState({
    status: next,
    statusReceivedAt: performance.now(),
    loaded: true,
    activeSource,
    pendingPrompt
  })
}

function nextPollDelay(status: SpotifyStatus): number {
  if (status.state === 'playing') return 1000
  if (status.state === 'paused') return 2000
  return 4000
}

function startPolling(): void {
  stopPolling()
  const generation = ++pollGeneration

  const tick = async () => {
    let delay = 4000
    try {
      const next = await window.electronAPI.spotify.getStatus()
      if (generation !== pollGeneration) return
      applyStatus(next)
      delay = nextPollDelay(next)
    } catch {
      // keep the last status
    }
    if (generation === pollGeneration) pollTimer = window.setTimeout(tick, delay)
  }
  void tick()

  playerUnsubscribe = usePlayerStore.subscribe((state, prev) => {
    if (state.playbackState === prev.playbackState) return
    if (state.playbackState !== 'playing') return
    // Astra audio really started: it becomes the active source.
    const store = useSpotifyStore.getState()
    if (store.activeSource !== 'astra') useSpotifyStore.setState({ activeSource: 'astra' })
    if (store.status.state !== 'playing') return
    if (store.handoffPreference === 'always') pauseSpotifyForAstra()
    else if (store.handoffPreference === 'ask') useSpotifyStore.setState({ pendingPrompt: true })
  })
}

function stopPolling(): void {
  pollGeneration += 1
  if (pollTimer !== null) window.clearTimeout(pollTimer)
  pollTimer = null
  playerUnsubscribe?.()
  playerUnsubscribe = null
}

/** Starts the Spotify watcher once Spotify support has been enabled. Call from App. */
export function startSpotifyWatcher(): () => void {
  let started = false
  const begin = () => {
    if (started) return
    started = true
    startPolling()
  }
  if (useSpotifyStore.getState().enabled) begin()
  const unsubscribe = useSpotifyStore.subscribe((state) => {
    if (state.enabled) begin()
  })
  return () => {
    unsubscribe()
    stopPolling()
  }
}

/** Plays one saved Spotify song in the Spotify app. Astra pauses itself; Spotify's bar takes over. */
export function playSpotifyTrack(spotifyTrackId: string): void {
  if (!spotifyTrackId.startsWith('spotify:track:')) return
  if (astraIsPlaying()) usePlayerStore.getState().pause()
  void useSpotifyStore.getState().sendCommand({ kind: 'playuri', uri: spotifyTrackId })
}
