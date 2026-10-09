import { playSpotifyTrack } from '../../stores/spotifyStore'
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
  const showInTrackList = useWantedStore((state) => state.showInTrackList)
  const setShowInTrackList = useWantedStore((state) => state.setShowInTrackList)
  const [rows, setRows] = useState<WantedTrackRow[]>([])
  const [sort, setSort] = useState<WantedSort>('added')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [thumbs, setThumbs] = useState<Record<number, string>>({})
  const [copied, setCopied] = useState(false)
  const [showBin, setShowBin] = useState(false)
  const [binCount, setBinCount] = useState(0)
  const [undo, setUndo] = useState<{ id: number; title: string } | null>(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const requestedRef = useRef(new Set<number>())
  const refreshIds = useWantedStore((state) => state.refresh)

  const load = useCallback(async () => {
    try {
      const next = await window.electronAPI.wanted.list({ sort, dir, search, bin: showBin })
      setRows(next)
      const bin = showBin ? next : await window.electronAPI.wanted.list({ sort: 'added', dir: 'desc', search: '', bin: true })
      setBinCount(bin.length)
      const missing = next.filter((row) => row.hasCover && !requestedRef.current.has(row.id)).map((row) => row.id)
      if (missing.length > 0) {
        missing.forEach((id) => requestedRef.current.add(id))
        const fetched = await window.electronAPI.wanted.thumbs(missing)
        setThumbs((current) => ({ ...current, ...fetched }))
      }
    } catch {
      // keep what is on screen
    }
  }, [sort, dir, search, showBin])

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

  const remove = async (row: WantedTrackRow) => {
    await window.electronAPI.wanted.remove(row.id)
    setUndo({ id: row.id, title: row.title })
    await load()
    await refreshIds()
  }

  const restore = async (id: number) => {
    await window.electronAPI.wanted.restore(id)
    setUndo(null)
    await load()
    await refreshIds()
  }

  const purge = async (id: number) => {
    await window.electronAPI.wanted.purge(id)
    await load()
  }

  const emptyBin = async () => {
    await window.electronAPI.wanted.emptyBin()
    setConfirmEmpty(false)
    await load()
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
        <h1>{showBin ? 'Recycle bin' : 'Not downloaded'}</h1>
        <span className="spotify-view-sub">
          {showBin
            ? `${rows.length} removed ${rows.length === 1 ? 'song' : 'songs'}`
            : `${rows.length} ${rows.length === 1 ? 'song' : 'songs'} on your shopping list`}
        </span>
        <button
          type="button"
          className="spotify-history-more wanted-copy"
          onClick={() => { setShowBin((current) => !current); setUndo(null); setConfirmEmpty(false) }}
        >
          {showBin ? 'Back to list' : `Recycle bin${binCount > 0 ? ` (${binCount})` : ''}`}
        </button>
        {!showBin && (
          <button type="button" className="spotify-history-more" onClick={() => void copyList()} disabled={rows.length === 0}>
            {copied ? 'Copied' : 'Copy list'}
          </button>
        )}
        {showBin && (confirmEmpty ? (
          <span className="wanted-confirm">
            <button type="button" onClick={() => void emptyBin()}>Delete all for good</button>
            <button type="button" onClick={() => setConfirmEmpty(false)}>Cancel</button>
          </span>
        ) : (
          <button type="button" className="spotify-history-more" onClick={() => setConfirmEmpty(true)} disabled={rows.length === 0}>
            Empty bin
          </button>
        ))}
      </div>
      {undo && !showBin && (
        <div className="wanted-undo" role="status">
          <span>Moved &ldquo;{undo.title}&rdquo; to the recycle bin.</span>
          <button type="button" onClick={() => void restore(undo.id)}>Undo</button>
        </div>
      )}
      {showBin && (
        <p className="wanted-note">
          Removed songs stay here until you restore them or delete them for good.
        </p>
      )}
      <label className="wanted-show-toggle" hidden={showBin}>
        <input
          type="checkbox"
          checked={showInTrackList}
          onChange={(event) => setShowInTrackList(event.target.checked)}
        />
        <span>Also show these greyed out at the end of the Music track list</span>
      </label>
      <p className="wanted-note" hidden={showBin}>
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
            {column.label === 'Added' && showBin ? 'Removed' : column.label}{sort === column.sort ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
          </button>
        ))}
        <span />
      </div>

      {rows.length === 0 && (
        <div className="spotify-view-empty" role="status">
          {search
            ? 'Nothing matches your search.'
            : showBin
              ? 'The recycle bin is empty.'
              : 'Nothing here yet. Use the + button on a song in the Spotify page to add it.'}
        </div>
      )}

      {rows.map((row) => (
        <div
          key={row.id}
          className={`wanted-row wanted-item${showBin ? '' : ' spotify-history-row-playable'}`}
          role="row"
          title={showBin ? undefined : 'Click to play in Spotify'}
          onClick={(event) => {
            if (showBin || (event.target as HTMLElement).closest('button')) return
            playSpotifyTrack(row.spotifyTrackId)
          }}
        >
          <div className="spotify-history-thumb">
            {thumbs[row.id] ? <img src={thumbs[row.id]} alt="" loading="lazy" /> : <span>&#9835;</span>}
          </div>
          <span className="spotify-history-title" title={row.title}>{row.title}</span>
          <span className="spotify-history-muted" title={row.artist}>{row.artist}</span>
          <span className="spotify-history-muted" title={row.album}>{row.album}</span>
          <span className="spotify-history-muted">{formatAdded(showBin ? (row.removedAtMs ?? row.addedAtMs) : row.addedAtMs)}</span>
          {showBin ? (
            <span className="wanted-confirm">
              <button type="button" onClick={() => void restore(row.id)}>Restore</button>
              <button type="button" onClick={() => void purge(row.id)}>Delete</button>
            </span>
          ) : (
            <button type="button" className="wanted-remove" aria-label={`Move ${row.title} to the recycle bin`} onClick={() => void remove(row)}>
              &times;
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
