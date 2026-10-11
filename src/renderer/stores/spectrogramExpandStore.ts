import { create } from 'zustand'

const STORAGE_KEY = 'astra.spectrogram.panelOpen.v1'

interface SpectrogramExpandState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

function load(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function save(open: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0')
  } catch {
    // remembered for this session only
  }
}

/**
 * Whether the spectrogram is open in the tall panel on the right. Remembered between launches, along with
 * the panel's width (kept by the drag handle under "astra.spectrogramWidth").
 */
export const useSpectrogramExpandStore = create<SpectrogramExpandState>((set, get) => ({
  open: load(),
  setOpen: (open) => {
    save(open)
    set({ open })
  },
  toggle: () => {
    const open = !get().open
    save(open)
    set({ open })
  }
}))
