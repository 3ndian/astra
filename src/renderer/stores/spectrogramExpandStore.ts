import { create } from 'zustand'

const STORAGE_KEY = 'astra.spectrogram.panelOpen.v1'

export type ExpandableScope = 'spectrogram' | 'vectorscope'

interface SpectrogramExpandState {
  open: boolean
  /** Which scope the tall panel shows. */
  scope: ExpandableScope
  /** Open the panel with this scope, or close it if it is already showing that scope. */
  toggleScope: (scope: ExpandableScope) => void
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

const SCOPE_KEY = 'astra.spectrogram.panelScope.v1'
function loadScope(): ExpandableScope {
  try {
    return window.localStorage.getItem(SCOPE_KEY) === 'vectorscope' ? 'vectorscope' : 'spectrogram'
  } catch {
    return 'spectrogram'
  }
}
function saveScope(scope: ExpandableScope): void {
  try { window.localStorage.setItem(SCOPE_KEY, scope) } catch { /* ignore */ }
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
  scope: loadScope(),
  toggleScope: (scope) => {
    const state = get()
    if (state.open && state.scope === scope) {
      save(false)
      set({ open: false })
      return
    }
    save(true)
    saveScope(scope)
    set({ open: true, scope })
  },
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
