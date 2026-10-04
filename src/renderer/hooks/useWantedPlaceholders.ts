import { useEffect, useState } from 'react'
import type { WantedTrackRow } from '../../types/spotify'
import { useWantedStore } from '../stores/wantedStore'

const NONE: WantedTrackRow[] = []

/** Loads the "Not downloaded" entries (and their thumbnails) for the greyed rows in the track list. */
export function useWantedPlaceholders(enabled: boolean, search: string): {
  rows: readonly WantedTrackRow[]
  thumbs: Readonly<Record<number, string>>
} {
  const [rows, setRows] = useState<WantedTrackRow[]>(NONE)
  const [thumbs, setThumbs] = useState<Record<number, string>>({})
  // Changes whenever a song is added or removed, so the list refreshes.
  const ids = useWantedStore((state) => state.ids)

  useEffect(() => {
    if (!enabled) {
      setRows(NONE)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const next = await window.electronAPI.wanted.list({ sort: 'added', dir: 'desc', search })
        if (cancelled) return
        setRows(next.length === 0 ? NONE : next)
        const missing = next.filter((row) => row.hasCover && !thumbs[row.id]).map((row) => row.id)
        if (missing.length > 0) {
          const fetched = await window.electronAPI.wanted.thumbs(missing)
          if (!cancelled) setThumbs((current) => ({ ...current, ...fetched }))
        }
      } catch {
        // keep what we have
      }
    }
    void load()
    const unsubscribe = window.electronAPI.wanted.onFulfilled(() => void load())
    return () => {
      cancelled = true
      unsubscribe()
    }
    // thumbs is read only to skip already-loaded covers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, search, ids])

  return { rows, thumbs }
}
