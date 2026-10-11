import { create } from 'zustand'

export type QueueTab = 'queue' | 'history'

const STORAGE_KEY = 'astra.queue.tab'

function load(): QueueTab {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'history' ? 'history' : 'queue'
  } catch {
    return 'queue'
  }
}

interface QueueTabState {
  tab: QueueTab
  setTab: (tab: QueueTab) => void
}

/** Which tab the queue panel shows. Shared so the right-hand icon rail can open the panel on History. */
export const useQueueTabStore = create<QueueTabState>((set) => ({
  tab: load(),
  setTab: (tab) => {
    set({ tab })
    try {
      window.localStorage.setItem(STORAGE_KEY, tab)
    } catch {
      // remembered for this session only
    }
  }
}))
