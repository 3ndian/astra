import { create } from 'zustand'

const STORAGE_KEY = 'astra.spectrogram.songView.v1'

function read(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

/** Whether the spectrogram shows the whole song (pan and zoom) instead of the live scrolling picture. */
interface SongViewState {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

export const useSongViewStore = create<SongViewState>((set) => ({
  enabled: read(),
  setEnabled: (enabled) => {
    set({ enabled })
    try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0') } catch { /* ignore */ }
  }
}))
