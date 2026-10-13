import { useEffect, useMemo, useState } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { useSavedPitchStore, type SavedPitch } from '../../stores/savedPitchStore'
import { comboKey, usePitchUsageStore } from '../../stores/pitchUsageStore'

type SortKey = 'title' | 'artist' | 'album' | 'speed' | 'pitch'
type Filter = 'all' | 'pitch-up' | 'pitch-down' | 'slower' | 'faster'

interface TrackInfo { title: string; artist: string; album: string }
interface Row extends TrackInfo { trackPath: string; preset: SavedPitch }

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pitch-up', label: 'Pitched up' },
  { id: 'pitch-down', label: 'Pitched down' },
  { id: 'slower', label: 'Slowed' },
  { id: 'faster', label: 'Sped up' }
]

function semitones(ratio: number): string {
  const rounded = Math.round(12 * Math.log2(ratio) * 10) / 10
  return rounded === 0 ? '0 st' : `${rounded > 0 ? '+' : ''}${rounded} st`
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? path
}

function passes(filter: Filter, preset: SavedPitch): boolean {
  switch (filter) {
    case 'pitch-up': return preset.pitch > 1
    case 'pitch-down': return preset.pitch < 1
    case 'slower': return preset.speed < 1
    case 'faster': return preset.speed > 1
    default: return true
  }
}


type ComboSort = 'used' | 'uses' | 'recent' | 'speed' | 'pitch'

function formatListened(seconds: number): string {
  if (seconds < 60) return seconds > 0 ? `${Math.round(seconds)}s` : '—'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/** Every speed + pitch combination you have used or saved: how long you have listened to it, and which are favourites. */
function ComboList() {
  const combos = usePitchUsageStore((s) => s.combos)
  const toggleFavorite = usePitchUsageStore((s) => s.toggleFavorite)
  const forget = usePitchUsageStore((s) => s.forget)
  const byTrack = useSavedPitchStore((s) => s.byTrack)
  const [sortKey, setSortKey] = useState<ComboSort>('used')
  const [onlyFavorites, setOnlyFavorites] = useState(false)

  const songsByCombo = useMemo(() => {
    const counts = new Map<string, number>()
    for (const presets of Object.values(byTrack)) {
      const seen = new Set<string>()
      for (const preset of presets) seen.add(comboKey(preset.speed, preset.pitch, preset.pitchLock))
      for (const key of seen) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [byTrack])

  const list = useMemo(() => {
    const entries = Object.entries(combos).filter(([, combo]) => !onlyFavorites || combo.favorite)
    entries.sort(([, a], [, b]) => {
      if (a.favorite !== b.favorite && !onlyFavorites) return a.favorite ? -1 : 1
      switch (sortKey) {
        case 'uses': return b.uses - a.uses
        case 'recent': return b.lastUsed - a.lastUsed
        case 'speed': return b.speed - a.speed
        case 'pitch': return b.pitch - a.pitch
        default: return b.seconds - a.seconds
      }
    })
    return entries
  }, [combos, sortKey, onlyFavorites])

  const sorts: Array<{ id: ComboSort; label: string }> = [
    { id: 'used', label: 'Most listened' }, { id: 'uses', label: 'Most switched to' },
    { id: 'recent', label: 'Recent' }, { id: 'speed', label: 'Speed' }, { id: 'pitch', label: 'Pitch' }
  ]

  if (Object.keys(combos).length === 0) {
    return <div className="spotify-view-empty">No combinations yet. Play a song at a different speed or pitch for a few seconds, or save one with + Save, and it shows up here.</div>
  }

  return (
    <>
      <div className="saved-pitches-toolbar">
        <div className="saved-pitches-filters">
          {sorts.map((item) => (
            <button key={item.id} type="button" className={`saved-pitches-filter${sortKey === item.id ? ' is-on' : ''}`} onClick={() => setSortKey(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" className={`saved-pitches-filter${onlyFavorites ? ' is-on' : ''}`} onClick={() => setOnlyFavorites((v) => !v)}>
          ★ Favorites only
        </button>
      </div>
      <div className="saved-pitches-row is-head saved-pitches-combo-row">
        <span /><span className="saved-pitches-head">Speed</span><span className="saved-pitches-head">Pitch</span>
        <span className="saved-pitches-head">Mode</span><span className="saved-pitches-head">Listened</span>
        <span className="saved-pitches-head">Times</span><span className="saved-pitches-head">Saved on</span><span /><span />
      </div>
      {list.length === 0 ? (
        <div className="spotify-view-empty">No favorites yet. Tap the star next to a combination to keep it up here.</div>
      ) : (
        <div className="saved-pitches-list">
          {list.map(([key, combo]) => (
            <div key={key} className="saved-pitches-row saved-pitches-combo-row" style={{ cursor: 'default' }}>
              <button
                type="button"
                className={`saved-pitches-star${combo.favorite ? ' is-on' : ''}`}
                onClick={() => toggleFavorite(key)}
                aria-pressed={combo.favorite}
                aria-label={combo.favorite ? 'Remove from favorites' : 'Add to favorites'}
              >{combo.favorite ? '★' : '☆'}</button>
              <span className="saved-pitches-cell saved-pitches-mono">{combo.speed}×</span>
              <span className="saved-pitches-cell saved-pitches-mono">{semitones(combo.pitch)}</span>
              <span className="saved-pitches-cell saved-pitches-dim">{combo.speed === 1 ? '—' : combo.pitchLock ? 'Pitch kept' : 'Tape'}</span>
              <span className="saved-pitches-cell saved-pitches-mono">{formatListened(combo.seconds)}</span>
              <span className="saved-pitches-cell saved-pitches-mono">{combo.uses || '—'}</span>
              <span className="saved-pitches-cell saved-pitches-dim">{songsByCombo.get(key) ? `${songsByCombo.get(key)} ${songsByCombo.get(key) === 1 ? 'song' : 'songs'}` : '—'}</span>
              <button
                type="button"
                className="saved-pitches-filter"
                onClick={() => useSavedPitchStore.getState().apply({ id: 'combo', speed: combo.speed, pitch: combo.pitch, pitchLock: combo.pitchLock })}
                title="Use this speed and pitch on the song that is playing"
              >Use now</button>
              <button type="button" className="saved-pitches-remove" onClick={() => forget(key)} aria-label="Remove from this list" title="Remove from this list (saved songs keep their settings)">×</button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/** Every song that has saved speed/pitch settings, with search, filters and sorting. Click a row to play it that way. */
export default function SavedPitchesView() {
  const byTrack = useSavedPitchStore((s) => s.byTrack)
  const remove = useSavedPitchStore((s) => s.remove)
  const currentTrackPath = usePlayerStore((s) => s.currentTrack?.path ?? null)
  const [info, setInfo] = useState<Record<string, TrackInfo>>({})
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'title', dir: 1 })
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'songs' | 'combos'>('songs')

  const paths = useMemo(() => Object.keys(byTrack), [byTrack])
  const settingCount = useMemo(() => Object.values(byTrack).reduce((total, list) => total + list.length, 0), [byTrack])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const found = await window.electronAPI.library.getTracksByPaths(paths)
        if (cancelled) return
        const next: Record<string, TrackInfo> = {}
        for (const track of found) next[track.path] = { title: track.title, artist: track.artist, album: track.album }
        setInfo(next)
      } catch { /* names fall back to file names */ }
    })()
    return () => { cancelled = true }
  }, [paths])

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const list: Row[] = []
    for (const [trackPath, presets] of Object.entries(byTrack)) {
      const known = info[trackPath]
      const title = known?.title || fileName(trackPath)
      const artist = known?.artist ?? ''
      const album = known?.album ?? ''
      for (const preset of presets) {
        if (!passes(filter, preset)) continue
        if (needle && !`${title} ${artist} ${album}`.toLowerCase().includes(needle)) continue
        list.push({ trackPath, title, artist, album, preset })
      }
    }
    list.sort((a, b) => {
      let result = 0
      if (sort.key === 'speed') result = a.preset.speed - b.preset.speed
      else if (sort.key === 'pitch') result = a.preset.pitch - b.preset.pitch
      else result = a[sort.key].localeCompare(b[sort.key], undefined, { numeric: true, sensitivity: 'base' })
      return result * sort.dir || a.title.localeCompare(b.title)
    })
    return list
  }, [byTrack, info, sort, filter, search])

  const clickSort = (key: SortKey): void => {
    setSort((current) => current.key === key
      ? { key, dir: current.dir === 1 ? -1 : 1 }
      : { key, dir: key === 'speed' || key === 'pitch' ? -1 : 1 })
  }
  const head = (key: SortKey, label: string): JSX.Element => (
    <button type="button" className={`saved-pitches-head${sort.key === key ? ' is-sorted' : ''}`} onClick={() => clickSort(key)}>
      {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </button>
  )

  const play = async (row: Row): Promise<void> => {
    await usePlayerStore.getState().startPlaybackContextByPaths([row.trackPath], 0)
    useSavedPitchStore.getState().apply(row.preset)
  }

  return (
    <div className="spotify-view saved-pitches-view">
      <div className="spotify-view-header">
        <h1>Saved pitches</h1>
        <span className="spotify-view-sub">
          {settingCount} {settingCount === 1 ? 'setting' : 'settings'} on {paths.length} {paths.length === 1 ? 'song' : 'songs'}
        </span>
      </div>

      <div className="saved-pitches-filters">
        <button type="button" className={`saved-pitches-filter${tab === 'songs' ? ' is-on' : ''}`} onClick={() => setTab('songs')}>By song</button>
        <button type="button" className={`saved-pitches-filter${tab === 'combos' ? ' is-on' : ''}`} onClick={() => setTab('combos')}>Combinations</button>
      </div>

      {tab === 'combos' ? (
        <ComboList />
      ) : settingCount === 0 ? (
        <div className="spotify-view-empty">
          Nothing saved yet. While a song plays, change its speed or pitch and press + Save in the speed controls.
        </div>
      ) : (
        <>
          <div className="saved-pitches-toolbar">
            <input
              className="settings-select saved-pitches-search"
              type="search"
              placeholder="Search song, artist or album"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              spellCheck={false}
            />
            <div className="saved-pitches-filters">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`saved-pitches-filter${filter === item.id ? ' is-on' : ''}`}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="saved-pitches-row is-head">
            {head('title', 'Song')}{head('artist', 'Artist')}{head('album', 'Album')}
            {head('speed', 'Speed')}{head('pitch', 'Pitch')}
            <span className="saved-pitches-head">Mode</span>
            <span />
          </div>
          {rows.length === 0 ? (
            <div className="spotify-view-empty">No saved settings match.</div>
          ) : (
            <div className="saved-pitches-list">
              {rows.map((row) => (
                <div
                  key={`${row.trackPath}|${row.preset.id}`}
                  className={`saved-pitches-row${row.trackPath === currentTrackPath ? ' is-playing' : ''}`}
                  onClick={() => void play(row)}
                  title="Play with these settings"
                >
                  <span className="saved-pitches-cell">{row.title}</span>
                  <span className="saved-pitches-cell saved-pitches-dim">{row.artist}</span>
                  <span className="saved-pitches-cell saved-pitches-dim">{row.album}</span>
                  <span className="saved-pitches-cell saved-pitches-mono">{Number(row.preset.speed.toFixed(3))}×</span>
                  <span className="saved-pitches-cell saved-pitches-mono">{semitones(row.preset.pitch)}</span>
                  <span className="saved-pitches-cell saved-pitches-dim">
                    {row.preset.speed === 1 ? '—' : row.preset.pitchLock ? 'Pitch kept' : 'Tape'}
                  </span>
                  <button
                    type="button"
                    className="saved-pitches-remove"
                    onClick={(event) => { event.stopPropagation(); remove(row.trackPath, row.preset.id) }}
                    aria-label="Delete this saved setting"
                    title="Delete this saved setting"
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
