import { create } from 'zustand'

export type InfoSidebarTab = 'info' | 'lyrics'

const TAB_STORAGE_KEY = 'astra-info-sidebar-tab-v1'

function readSavedTab(): InfoSidebarTab {
  try {
    return window.localStorage.getItem(TAB_STORAGE_KEY) === 'lyrics' ? 'lyrics' : 'info'
  } catch {
    return 'info'
  }
}

/** Which tab of the track-info side panel is showing. A store so the right-hand icon strip can open it on Lyrics. */
const COVER_HIDDEN_KEY = 'astra-lyrics-cover-hidden-v1'

function readCoverHidden(): boolean {
  try { return window.localStorage.getItem(COVER_HIDDEN_KEY) === '1' } catch { return false }
}

interface InfoSidebarTabState {
  tab: InfoSidebarTab
  setTab: (tab: InfoSidebarTab) => void
  /** Lyrics tab only: the album cover is hidden so the lyrics get the whole panel. */
  coverHidden: boolean
  setCoverHidden: (hidden: boolean) => void
}

export const useInfoSidebarTabStore = create<InfoSidebarTabState>((set) => ({
  tab: readSavedTab(),
  setTab: (tab) => {
    try { window.localStorage.setItem(TAB_STORAGE_KEY, tab) } catch { /* session only */ }
    set({ tab })
  },
  coverHidden: readCoverHidden(),
  setCoverHidden: (coverHidden) => {
    try { window.localStorage.setItem(COVER_HIDDEN_KEY, coverHidden ? '1' : '0') } catch { /* session only */ }
    set({ coverHidden })
  }
}))
