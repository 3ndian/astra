import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLibraryStore } from '../../stores/libraryStore'
import { usePlayerStore } from '../../stores/playerStore'
import AlbumArtwork from '../library/AlbumArtwork'
import TrackQuickMenu, { type QuickMenuState } from './TrackQuickMenu'

interface HistoryTrack {
  path: string
  title?: string
  artist?: string
  album?: string
  artwork_hash?: string | null
  source_type?: string | null
}

/** Songs played recently (kept between launches), newest first. Click one to play it again. */
export default function QueueHistoryList() {
  const recentlyPlayedPaths = useLibraryStore((state) => state.recentlyPlayedPaths)
  const resolveTrackPaths = useLibraryStore((state) => state.resolveTrackPaths)
  const trackCacheVersion = useLibraryStore((state) => state.trackCacheVersion)
  const loadRecentlyPlayed = useLibraryStore((state) => state.loadRecentlyPlayed)
  const startPlaybackContextByPaths = usePlayerStore((state) => state.startPlaybackContextByPaths)
  const currentPath = usePlayerStore((state) => state.currentTrack?.path ?? null)

  const [menu, setMenu] = useState<QuickMenuState | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

  useEffect(() => {
    void loadRecentlyPlayed()
  }, [loadRecentlyPlayed])

  const tracks = useMemo(() => {
    const seen = new Set<string>()
    const list: HistoryTrack[] = []
    for (const track of resolveTrackPaths(recentlyPlayedPaths) as HistoryTrack[]) {
      if (!track?.path || seen.has(track.path)) continue
      seen.add(track.path)
      list.push(track)
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentlyPlayedPaths, resolveTrackPaths, trackCacheVersion])

  if (tracks.length === 0) {
    return (
      <div className="queue-history-empty">
        <p>Nothing played yet</p>
        <p className="queue-empty-hint">Songs you play will show up here.</p>
      </div>
    )
  }

  return (
    <div className="queue-history-list" role="list">
      {menu && <TrackQuickMenu menu={menu} onClose={closeMenu} />}
      {tracks.map((track, index) => (
        <button
          key={track.path}
          type="button"
          role="listitem"
          className={`queue-history-row${track.path === currentPath ? ' is-current' : ''}`}
          onClick={() => {
            void startPlaybackContextByPaths(tracks.map((entry) => entry.path), index, {
              recordSelectedTrack: true,
              contextLabel: 'Recently Played'
            })
          }}
          title="Play again"
          onContextMenu={(event) => {
            event.preventDefault()
            setMenu({
              x: event.clientX,
              y: event.clientY,
              track: {
                path: track.path,
                title: track.title ?? '',
                artist: track.artist ?? '',
                album: track.album ?? '',
                local: !track.source_type || track.source_type === 'local'
              },
              playNow: () => {
                void startPlaybackContextByPaths(tracks.map((entry) => entry.path), index, {
                  recordSelectedTrack: true,
                  contextLabel: 'Recently Played'
                })
              }
            })
          }}
        >
          <AlbumArtwork hash={track.artwork_hash ?? null} alt="" className="queue-history-cover" variant="thumbnail" />
          <span className="queue-history-text">
            <span className="queue-history-title">{track.title || 'Unknown title'}</span>
            <span className="queue-history-artist">{track.artist || 'Unknown artist'}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
