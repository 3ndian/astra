import { create } from 'zustand'
import { audioEngine } from '../audio/AudioEngine'

const DEVICE_KEY = 'astra.liveInput.deviceId.v1'

export interface LiveInputDevice {
  id: string
  label: string
}

function readDeviceId(): string {
  try { return localStorage.getItem(DEVICE_KEY) ?? '' } catch { return '' }
}

/** Show a microphone, or BlackHole carrying the computer's sound, in the visualizers (analysis only, never played). */
interface LiveInputState {
  active: boolean
  busy: boolean
  deviceId: string
  label: string | null
  error: string | null
  devices: LiveInputDevice[]
  refreshDevices: () => Promise<void>
  setDeviceId: (deviceId: string) => void
  start: () => Promise<void>
  stop: () => void
  toggle: () => Promise<void>
}

function pickDefaultDevice(devices: LiveInputDevice[]): string {
  const hole = devices.find((d) => /blackhole/i.test(d.label))
  return hole?.id ?? ''
}

export const useLiveInputStore = create<LiveInputState>((set, get) => ({
  active: false,
  busy: false,
  deviceId: readDeviceId(),
  label: null,
  error: null,
  devices: [],

  refreshDevices: async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const devices = all
        .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
        .map((d, i) => ({ id: d.deviceId, label: d.label || `Input ${i + 1}` }))
      set((state) => {
        let deviceId = state.deviceId
        if (!deviceId || !devices.some((d) => d.id === deviceId)) deviceId = pickDefaultDevice(devices)
        return { devices, deviceId }
      })
    } catch {
      set({ devices: [] })
    }
  },

  setDeviceId: (deviceId) => {
    set({ deviceId })
    try { localStorage.setItem(DEVICE_KEY, deviceId) } catch { /* ignore */ }
    // Switching while it is on moves straight to the new input.
    if (get().active) void get().start()
  },

  start: async () => {
    if (get().busy) return
    set({ busy: true, error: null })
    const result = await audioEngine.startLiveInput(get().deviceId || null)
    if (result.ok) {
      set({ active: true, busy: false, label: result.label })
    } else {
      set({ active: false, busy: false, label: null, error: result.message })
    }
    // Device names only appear once the browser has been allowed to use an input.
    void get().refreshDevices()
  },

  stop: () => {
    audioEngine.stopLiveInput()
    set({ active: false, label: null })
  },

  toggle: async () => {
    if (get().active) get().stop()
    else await get().start()
  }
}))

// Playing a song takes over the visualizers, so the live input steps aside.
audioEngine.on('stateChange', () => {
  const state = useLiveInputStore.getState()
  const engineActive = audioEngine.isLiveInputActive()
  if (state.active && !engineActive) useLiveInputStore.setState({ active: false, label: null })
  if (engineActive && audioEngine.playbackState === 'playing') state.stop()
})
