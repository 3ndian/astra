import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react'
import type { WantedAddRequest } from '../../../types/spotify'
import { getNormalPlaylists, usePlaylistStore } from '../../stores/playlistStore'
import { useWantedStore } from '../../stores/wantedStore'

const ALSO_WANTED_KEY = 'astra-spotify-playlist-also-wanted-v1'
const MENU_WIDTH = 260
const MENU_MAX_HEIGHT = 340

function readAlsoWanted(): boolean {
  try {
    return window.localStorage.getItem(ALSO_WANTED_KEY) !== '0'
  } catch {
    return true
  }
}

interface MenuProps {
  x: number
  y: number
  request: WantedAddRequest
  onClose: () => void
}

/** Right-click menu on a Spotify song: put it in a playlist as a greyed "not downloaded" entry. */
function SpotifyPlaylistMenu({ x, y, request, onClose }: MenuProps) {
  const playlists = usePlaylistStore((state) => state.playlists)
  const loadPlaylists = usePlaylistStore((state) => state.loadPlaylists)
  const addToWanted = useWantedStore((state) => state.add)
  const isWanted = useWantedStore((state) => state.ids.has(request.spotifyTrackId))
  const [alsoWanted, setAlsoWanted] = useState(readAlsoWanted)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const normalPlaylists = getNormalPlaylists(playlists)

  useEffect(() => {
    void loadPlaylists()
  }, [loadPlaylists])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const left = Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8))
  const top = Math.max(8, Math.min(y, window.innerHeight - MENU_MAX_HEIGHT - 8))

  const toggleAlsoWanted = (value: boolean) => {
    setAlsoWanted(value)
    try {
      window.localStorage.setItem(ALSO_WANTED_KEY, value ? '1' : '0')
    } catch {
      // storage unavailable; the choice just won't persist
    }
  }

  const addTo = async (playlistId: number, playlistName: string) => {
    if (busy) return
    setBusy(true)
    setFeedback(null)
    try {
      const result = await window.electronAPI.library.addSpotifyTrackToPlaylist({
        playlistId,
        spotifyTrackId: request.spotifyTrackId,
        title: request.title,
        artist: request.artist,
        album: request.album
      })
      if (result.status === 'error') {
        setFeedback({ kind: 'error', text: result.message })
        return
      }
      if (alsoWanted && !isWanted) void addToWanted(request)
      await loadPlaylists()
      setFeedback({
        kind: 'ok',
        text: result.status === 'exists' ? `Already in ${playlistName}` : `Added to ${playlistName}`
      })
      window.setTimeout(onClose, 900)
    } catch {
      setFeedback({ kind: 'error', text: 'Could not add that song.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      ref={rootRef}
      className="spotify-playlist-menu"
      style={{ left, top, width: MENU_WIDTH, maxHeight: MENU_MAX_HEIGHT }}
      role="menu"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="spotify-playlist-menu-head" title={`${request.title} - ${request.artist}`}>
        <strong>{request.title}</strong>
        <span>{request.artist}</span>
      </div>
      <div className="spotify-playlist-menu-label">Add to playlist</div>
      <div className="spotify-playlist-menu-list">
        {normalPlaylists.length === 0 && <div className="spotify-playlist-menu-empty">No playlists yet. Create one from the left pane.</div>}
        {normalPlaylists.map((playlist) => (
          <button
            key={playlist.id}
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => void addTo(playlist.id, playlist.name)}
          >
            <span className="spotify-playlist-menu-name">{playlist.name}</span>
            <span className="spotify-playlist-menu-count">{playlist.track_count}</span>
          </button>
        ))}
      </div>
      <label className="spotify-playlist-menu-also">
        <input type="checkbox" checked={alsoWanted} onChange={(event) => toggleAlsoWanted(event.target.checked)} />
        <span>Also add to Not downloaded{isWanted ? ' (already there)' : ''}</span>
      </label>
      <div className="spotify-playlist-menu-note">Stays greyed out until you add the file.</div>
      {feedback && (
        <div className={`spotify-playlist-menu-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
          {feedback.text}
        </div>
      )}
    </div>
  )
}

/** Hook: `openMenu` goes on a row's onContextMenu; render `menu` once next to the rows. */
export function useSpotifyPlaylistMenu(): {
  openMenu: (event: ReactMouseEvent, request: WantedAddRequest) => void
  menu: ReactElement | null
} {
  const [state, setState] = useState<{ x: number; y: number; request: WantedAddRequest } | null>(null)
  const close = useCallback(() => setState(null), [])
  const openMenu = useCallback((event: ReactMouseEvent, request: WantedAddRequest) => {
    event.preventDefault()
    setState({ x: event.clientX, y: event.clientY, request })
  }, [])
  const menu = state ? <SpotifyPlaylistMenu x={state.x} y={state.y} request={state.request} onClose={close} /> : null
  return { openMenu, menu }
}
