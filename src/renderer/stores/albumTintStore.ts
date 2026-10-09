import { create } from 'zustand'

const STORAGE_KEY = 'astra-album-tint-v1'

interface Saved {
  enabled: boolean
  strength: number
}

function read(): Saved {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>
      return {
        enabled: parsed.enabled === true,
        strength: typeof parsed.strength === 'number' ? Math.min(100, Math.max(5, Math.round(parsed.strength))) : 35
      }
    }
  } catch {
    // fall through
  }
  return { enabled: false, strength: 35 }
}

function write(value: Saved): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // session only
  }
}

interface AlbumTintState extends Saved {
  setEnabled: (enabled: boolean) => void
  setStrength: (strength: number) => void
}

export const useAlbumTintStore = create<AlbumTintState>((set, get) => ({
  ...read(),
  setEnabled: (enabled) => {
    write({ enabled, strength: get().strength })
    set({ enabled })
  },
  setStrength: (strength) => {
    const next = Math.min(100, Math.max(5, Math.round(strength)))
    write({ enabled: get().enabled, strength: next })
    set({ strength: next })
  }
}))
