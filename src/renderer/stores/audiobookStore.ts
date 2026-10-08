import { create } from 'zustand'
import {
  addBookmark,
  removeBookmark,
  updateBookmarkNote,
  type Bookmark
} from '../../shared/audiobook/bookmarks'
import type { Chapter } from '../../shared/audiobook/chapters'

interface AudiobookState {
  /** File the loaded bookmarks and chapters belong to. */
  trackPath: string | null
  title: string
  bookmarks: Bookmark[]
  chapters: Chapter[]
  error: string | null
  load: (trackPath: string | null, title: string) => Promise<void>
  add: (position: number, note?: string) => Promise<string | null>
  setNote: (id: string, note: string) => Promise<void>
  remove: (id: string) => Promise<void>
  clearError: () => void
}

let loadToken = 0

export const useAudiobookStore = create<AudiobookState>((set, get) => {
  const persist = async (next: Bookmark[]) => {
    const { trackPath, title } = get()
    if (!trackPath) return
    set({ bookmarks: next })
    try {
      const result = await window.electronAPI.audiobook.saveBookmarks(trackPath, title, next)
      set({ error: result.ok ? null : result.error })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not save the bookmarks file.' })
    }
  }
  return {
    trackPath: null,
    title: '',
    bookmarks: [],
    chapters: [],
    error: null,
    load: async (trackPath, title) => {
      loadToken += 1
      const mine = loadToken
      if (!trackPath) {
        set({ trackPath: null, title: '', bookmarks: [], chapters: [], error: null })
        return
      }
      if (get().trackPath === trackPath) {
        set({ title })
        return
      }
      set({ trackPath, title, bookmarks: [], chapters: [], error: null })
      try {
        const [bookmarks, chapters] = await Promise.all([
          window.electronAPI.audiobook.getBookmarks(trackPath),
          window.electronAPI.audiobook.getChapters(trackPath)
        ])
        if (loadToken !== mine) return
        set({ bookmarks, chapters })
      } catch {
        // no sidecar / unreadable: start empty
      }
    },
    add: async (position, note = '') => {
      if (!get().trackPath) return null
      const before = get().bookmarks
      const next = addBookmark(before, position, note, Date.now())
      const created = next.find((item) => !before.some((old) => old.id === item.id))
      await persist(next)
      return created?.id ?? null
    },
    setNote: async (id, note) => persist(updateBookmarkNote(get().bookmarks, id, note)),
    remove: async (id) => persist(removeBookmark(get().bookmarks, id)),
    clearError: () => set({ error: null })
  }
})
