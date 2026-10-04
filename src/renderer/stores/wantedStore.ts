import { create } from 'zustand'
import type { WantedAddRequest } from '../../types/spotify'

interface WantedStoreState {
  /** Spotify track ids currently on the "Not downloaded" list. */
  ids: Set<string>
  adding: Set<string>
  errorMessage: string
  refresh: () => Promise<void>
  add: (request: WantedAddRequest) => Promise<void>
}

export const useWantedStore = create<WantedStoreState>((set, get) => ({
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
