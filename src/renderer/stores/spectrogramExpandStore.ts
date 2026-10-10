import { create } from 'zustand'

interface SpectrogramExpandState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

/** Whether the spectrogram is expanded into the tall panel on the right. Not remembered between launches. */
export const useSpectrogramExpandStore = create<SpectrogramExpandState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open }))
}))
