import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpotifyHistoryRow, SpotifyHistorySort } from '../../../types/spotify'
import WantedAddButton from './WantedAddButton'
import { useSpotifyPlaylistMenu } from './SpotifyPlaylistMenu'
import { playSpotifyTrack } from '../../stores/spotifyStore'

const PAGE_SIZE = 100
const REFRESH_MS = 10_000

function formatWhen(playedAtMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - playedAtMs)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(playedAtMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDuration(durationMs: number): string {
  const total = Math.max(0, Math.round(durationMs / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function formatTrackNumber(row: SpotifyHistoryRow): string {
  if (!row.trackNumber) return ''
  return row.discNumber && row.discNumber > 1 ? `${row.discNumber}-${row.trackNumber}` : String(row.trackNumber)
}

// Columns after the cover: a plain label (not sortable) or a sortable one.
const COLUMNS: Array<{ sort: SpotifyHistorySort | null; label: string }> = [
  { sort: null, label: '#' },
  { sort: 'title', label: 'Title' },
  { sort: 'artist', label: 'Artist' },
  { sort: 'album', label: 'Album' },
  { sort: null, label: 'Year' },
  { sort: null, label: 'Time' },
  { sort: 'played', label: 'Played' }
]

export default function SpotifyHistoryList() {
  const { openMenu, menu } = useSpotifyPlaylistMenu()
  const [rows, setRows] = useState<SpotifyHistoryRow[]>([])
  const [total, setTotal] = useState(0)
  const [sort, setSort] = useState<SpotifyHistorySort>('played')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [covers, setCovers] = useState<Record<string, string>>({})
  const [now, setNow] = useState(() => Date.now())
  const requestedCoversRef = useRef(new Set<string>())

  const load = useCallback(async () => {
    try {
      const page = await window.electronAPI.spotify.getHistory({ sort, dir, search, limit, offset: 0 })
      setRows(page.rows)
      setTotal(page.total)
      setNow(Date.now())
      const missing = [...new Set(page.rows.map((row) => row.coverKey).filter((key): key is string => !!key))]
        .filter((key) => !requestedCoversRef.current.has(key))
      if (missing.length > 0) {
        missing.forEach((key) => requestedCoversRef.current.add(key))
        const fetched = await window.electronAPI.spotify.getHistoryCovers(missing)
        setCovers((current) => ({ ...current, ...fetched }))
      }
    } catch {
      // keep what is on screen
    }
  }, [sort, dir, search, limit])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [load])

  const toggleSort = (next: SpotifyHistorySort) => {
    setLimit(PAGE_SIZE)
    if (next === sort) {
      setDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSort(next)
      setDir(next === 'played' ? 'desc' : 'asc')
    }
  }

  return (
    <section className="spotify-history">
      <div className="spotify-history-header">
        <h2>Listen History</h2>
        <span className="spotify-view-sub">Kept separate from your library{total > 0 ? ` · ${total} plays` : ''}</span>
        <input
          className="spotify-history-search"
          type="search"
          placeholder="Search"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setLimit(PAGE_SIZE) }}
          aria-label="Search history"
        />
      </div>

      <div className="spotify-history-row spotify-history-head" role="row">
        <span />
        {COLUMNS.map((column) => {
          const columnSort = column.sort
          if (!columnSort) return <span key={column.label} className="spotify-history-sort spotify-history-sort-static">{column.label}</span>
          return (
            <button key={column.label} type="button" className="spotify-history-sort" onClick={() => toggleSort(columnSort)}>
              {column.label}{sort === columnSort ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
            </button>
          )
        })}
      </div>

      {rows.length === 0 && (
        <div className="spotify-view-empty" role="status">
          {search ? 'No plays match your search.' : 'Songs you listen to on Spotify for 30 seconds or more will show up here.'}
        </div>
      )}

      {rows.map((row) => {
        const cover = row.coverKey ? covers[row.coverKey] : null
        return (
          <div
            key={row.id}
            className="spotify-history-row spotify-history-row-playable"
            role="row"
            title="Click to play in Spotify"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('button')) return
              playSpotifyTrack(row.trackId)
            }}
            onContextMenu={(event) => openMenu(event, {
              spotifyTrackId: row.trackId,
              title: row.title,
              artist: row.artist,
              album: row.album,
              durationMs: row.durationMs,
              artworkUrl: row.coverKey
            })}
          >
            <div className="spotify-history-thumb">{cover ? <img src={cover} alt="" loading="lazy" /> : <span>&#9835;</span>}</div>
            <span className="spotify-history-muted spotify-history-num">{formatTrackNumber(row)}</span>
            <span className="spotify-history-title" title={row.title}>{row.title}</span>
            <span className="spotify-history-muted" title={row.artist}>{row.artist}</span>
            <span className="spotify-history-muted" title={row.album}>{row.album}</span>
            <span className="spotify-history-muted spotify-history-num">{row.year ?? ''}</span>
            <span className="spotify-history-muted spotify-history-num">{formatDuration(row.durationMs)}</span>
            <span className="spotify-history-muted">{formatWhen(row.playedAtMs, now)}</span>
            <WantedAddButton
              compact
              request={{
                spotifyTrackId: row.trackId,
                title: row.title,
                artist: row.artist,
                album: row.album,
                durationMs: row.durationMs,
                artworkUrl: row.coverKey
              }}
            />
          </div>
        )
      })}

      {rows.length < total && (
        <button type="button" className="spotify-history-more" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
          Show more ({total - rows.length} left)
        </button>
      )}
      {menu}
    </section>
  )
}
