import { create } from 'zustand'

const STORAGE_KEY = 'astra.rightRail.collapsed.v1'

function load(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

interface RightRailState {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
}

/** Whether the icon rail on the right edge is folded down to a thin strip. */
export const useRightRailStore = create<RightRailState>((set) => ({
  collapsed: load(),
  setCollapsed: (collapsed) => {
    set({ collapsed })
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
    } catch {
      // remembered for this session only
    }
  }
}))
