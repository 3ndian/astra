import { create } from 'zustand'
import type { WantedAddRequest } from '../../types/spotify'

const SHOW_KEY = 'astra-wanted-in-tracklist-v1'

function readShow(): boolean {
  try {
    return window.localStorage.getItem(SHOW_KEY) === '1'
  } catch {
    return false
  }
}

interface WantedStoreState {
  /** Show the greyed "Not downloaded" group at the end of the Music track list (default off). */
  showInTrackList: boolean
  setShowInTrackList: (show: boolean) => void
  /** Spotify track ids currently on the "Not downloaded" list. */
  ids: Set<string>
  adding: Set<string>
  errorMessage: string
  refresh: () => Promise<void>
  add: (request: WantedAddRequest) => Promise<void>
}

export const useWantedStore = create<WantedStoreState>((set, get) => ({
  showInTrackList: readShow(),
  setShowInTrackList: (show) => {
    try {
      window.localStorage.setItem(SHOW_KEY, show ? '1' : '0')
    } catch {
      // storage unavailable; the choice just won't persist
    }
    set({ showInTrackList: show })
  },
  ids: new Set(),
  adding: new Set(),
  errorMessage: '',

  refresh: async () => {
    try {
      set({ ids: new Set(await window.electronAPI.wanted.ids()) })
    } catch {
      // keep what we have
    }
  },

  add: async (request) => {
    if (get().adding.has(request.spotifyTrackId)) return
    set({ adding: new Set(get().adding).add(request.spotifyTrackId), errorMessage: '' })
    try {
      const result = await window.electronAPI.wanted.add(request)
      if (result.status === 'error') set({ errorMessage: result.message })
      await get().refresh()
    } catch {
      set({ errorMessage: 'Could not add that song.' })
    } finally {
      const adding = new Set(get().adding)
      adding.delete(request.spotifyTrackId)
      set({ adding })
    }
  }
}))
