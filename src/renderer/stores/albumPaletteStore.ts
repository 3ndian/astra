import { create } from 'zustand'

const STORAGE_KEY = 'astra-album-pitch-colors-v1'

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

interface AlbumPaletteState {
  /** Spectrum colours follow pitch using the playing album's palette. */
  pitchColorsEnabled: boolean
  /** Palette of the current cover, darkest first. Empty when unknown. */
  palette: string[]
  setPitchColorsEnabled: (enabled: boolean) => void
  setPalette: (palette: string[]) => void
}

export const useAlbumPaletteStore = create<AlbumPaletteState>((set) => ({
  pitchColorsEnabled: readEnabled(),
  palette: [],
  setPitchColorsEnabled: (enabled) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
    } catch {
      // session only
    }
    set({ pitchColorsEnabled: enabled })
  },
  setPalette: (palette) => set({ palette })
}))
