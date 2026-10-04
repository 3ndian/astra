import { useCallback, useEffect, useRef, useState } from 'react'
import type { WantedSort, WantedTrackRow } from '../../../types/spotify'
import { useWantedStore } from '../../stores/wantedStore'

const COLUMNS: Array<{ sort: WantedSort; label: string }> = [
  { sort: 'title', label: 'Title' },
  { sort: 'artist', label: 'Artist' },
  { sort: 'album', label: 'Album' },
  { sort: 'added', label: 'Added' }
]

function formatAdded(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function WantedView() {
  const [rows, setRows] = useState<WantedTrackRow[]>([])
  const [sort, setSort] = useState<WantedSort>('added')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [thumbs, setThumbs] = useState<Record<number, string>>({})
  const [copied, setCopied] = useState(false)
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null)
  const requestedRef = useRef(new Set<number>())
  const refreshIds = useWantedStore((state) => state.refresh)

  const load = useCallback(async () => {
    try {
      const next = await window.electronAPI.wanted.list({ sort, dir, search })
      setRows(next)
      const missing = next.filter((row) => row.hasCover && !requestedRef.current.has(row.id)).map((row) => row.id)
      if (missing.length > 0) {
        missing.forEach((id) => requestedRef.current.add(id))
        const fetched = await window.electronAPI.wanted.thumbs(missing)
        setThumbs((current) => ({ ...current, ...fetched }))
      }
    } catch {
      // keep what is on screen
    }
  }, [sort, dir, search])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 10_000)
    const unsubscribe = window.electronAPI.wanted.onFulfilled(() => {
      void load()
      void refreshIds()
    })
    return () => {
      window.clearInterval(id)
      unsubscribe()
    }
  }, [load, refreshIds])

  const toggleSort = (next: WantedSort) => {
    if (next === sort) setDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(next)
      setDir(next === 'added' ? 'desc' : 'asc')
    }
  }

  const remove = async (id: number) => {
    await window.electronAPI.wanted.remove(id)
    setConfirmRemoveId(null)
    await load()
    await refreshIds()
  }

  const copyList = async () => {
    const text = rows.map((row) => `${row.artist} - ${row.title}${row.album ? ` (${row.album})` : ''}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="spotify-view wanted-view">
      <div className="spotify-view-header">
        <h1>Not downloaded</h1>
        <span className="spotify-view-sub">
          {rows.length} {rows.length === 1 ? 'song' : 'songs'} on your shopping list
        </span>
        <button type="button" className="spotify-history-more wanted-copy" onClick={() => void copyList()} disabled={rows.length === 0}>
          {copied ? 'Copied' : 'Copy list'}
        </button>
      </div>
      <p className="wanted-note">
        Songs you added from Spotify. They can't be played or queued, and each one disappears from this list
        by itself once you import the file into Music.
      </p>

      <input
        className="spotify-history-search wanted-search"
        type="search"
        placeholder="Search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search the Not downloaded list"
      />

      <div className="wanted-row wanted-head" role="row">
        <span />
        {COLUMNS.map((column) => (
          <button key={column.sort} type="button" className="spotify-history-sort" onClick={() => toggleSort(column.sort)}>
            {column.label}{sort === column.sort ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
          </button>
        ))}
        <span />
      </div>

      {rows.length === 0 && (
        <div className="spotify-view-empty" role="status">
          {search
            ? 'Nothing matches your search.'
            : 'Nothing here yet. Use the + button on a song in the Spotify page to add it.'}
        </div>
      )}

      {rows.map((row) => (
        <div key={row.id} className="wanted-row wanted-item" role="row">
          <div className="spotify-history-thumb">
            {thumbs[row.id] ? <img src={thumbs[row.id]} alt="" loading="lazy" /> : <span>&#9835;</span>}
          </div>
          <span className="spotify-history-title" title={row.title}>{row.title}</span>
          <span className="spotify-history-muted" title={row.artist}>{row.artist}</span>
          <span className="spotify-history-muted" title={row.album}>{row.album}</span>
          <span className="spotify-history-muted">{formatAdded(row.addedAtMs)}</span>
          {confirmRemoveId === row.id ? (
            <span className="wanted-confirm">
              <button type="button" onClick={() => void remove(row.id)}>Remove</button>
              <button type="button" onClick={() => setConfirmRemoveId(null)}>Keep</button>
            </span>
          ) : (
            <button type="button" className="wanted-remove" aria-label={`Remove ${row.title} from the list`} onClick={() => setConfirmRemoveId(row.id)}>
              &times;
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
