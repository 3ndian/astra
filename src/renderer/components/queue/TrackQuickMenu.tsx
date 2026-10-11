import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOpenAlbumInLibrary } from '../../hooks/useOpenAlbumInLibrary'
import { useOpenArtistInLibrary } from '../../hooks/useOpenArtistInLibrary'
import { useMetadataEditorStore } from '../../stores/metadataEditorStore'
import { usePlayerStore } from '../../stores/playerStore'
import { usePlaylistStore } from '../../stores/playlistStore'
import { isSystemFavoritesPlaylistId } from '../../utils/playlistSystem'

export interface QuickMenuTrack {
  path: string
  title: string
  artist: string
  album: string
  /** Files on this computer can have their tags edited; streamed tracks cannot. */
  local: boolean
}

export interface QuickMenuState {
  /** Mouse position in the window. */
  x: number
  y: number
  track: QuickMenuTrack
  /** Set for a track waiting in the queue, so it can be removed. */
  queueId?: string | null
  /** Plays the track right now (what clicking the row does). */
  playNow?: () => void
}

/**
 * A small right-click menu for the queue and history lists. It is drawn inside the app shell (not at the
 * page root) so it follows the UI scale, and it closes on any outside click, Esc, scroll or resize.
 */
export default function TrackQuickMenu({ menu, onClose }: { menu: QuickMenuState; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 })
  const [showPlaylists, setShowPlaylists] = useState(false)
  const enqueueTrackPaths = usePlayerStore((state) => state.enqueueTrackPaths)
  const removeUpcomingItem = usePlayerStore((state) => state.removeUpcomingItem)
  const playlists = usePlaylistStore((state) => state.playlists)
  const addToPlaylist = usePlaylistStore((state) => state.addToPlaylist)
  const openMetadataEditor = useMetadataEditorStore((state) => state.openPanel)
  const openAlbum = useOpenAlbumInLibrary()
  const openArtist = useOpenArtistInLibrary()
  const host = (document.querySelector('.app') as HTMLElement | null) ?? document.body

  // Place the menu at the pointer, keeping it fully on screen. The app shell can be scaled, so work in its units.
  useLayoutEffect(() => {
    const element = menuRef.current
    if (!element) return
    const hostRect = host.getBoundingClientRect()
    const scale = host.offsetWidth > 0 ? hostRect.width / host.offsetWidth : 1
    const width = element.offsetWidth
    const height = element.offsetHeight
    const maxLeft = hostRect.width / scale - width - 8
    const maxTop = hostRect.height / scale - height - 8
    setPosition({
      left: Math.max(8, Math.min((menu.x - hostRect.left) / scale, maxLeft)),
      top: Math.max(8, Math.min((menu.y - hostRect.top) / scale, maxTop))
    })
  }, [host, menu.x, menu.y, showPlaylists])

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    window.addEventListener('wheel', onClose, { passive: true, capture: true })
    return () => {
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('wheel', onClose, true)
    }
  }, [onClose])

  const { track } = menu
  const run = (action: () => void) => () => {
    action()
    onClose()
  }
  const targetPlaylists = playlists.filter((playlist) => playlist.kind !== 'dynamic' && !isSystemFavoritesPlaylistId(playlist.id))

  return createPortal(
    <div
      ref={menuRef}
      className="track-context-menu track-quick-menu"
      role="menu"
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {menu.playNow && (
        <button type="button" role="menuitem" className="track-context-menu-item" onClick={run(menu.playNow)}>Play now</button>
      )}
      <button type="button" role="menuitem" className="track-context-menu-item" onClick={run(() => void enqueueTrackPaths([track.path], 'next'))}>Play next</button>
      <button type="button" role="menuitem" className="track-context-menu-item" onClick={run(() => void enqueueTrackPaths([track.path], 'end'))}>Add to queue</button>
      {menu.queueId && (
        <button type="button" role="menuitem" className="track-context-menu-item" onClick={run(() => removeUpcomingItem(menu.queueId!))}>Remove from queue</button>
      )}
      <div className="track-quick-menu-divider" />
      <button
        type="button"
        role="menuitem"
        aria-expanded={showPlaylists}
        className="track-context-menu-item"
        onClick={() => setShowPlaylists((open) => !open)}
        disabled={!track.local}
        title={track.local ? undefined : 'Only songs on this computer can go in a playlist'}
      >
        Add to playlist…
        <span className="track-quick-menu-chevron" aria-hidden="true">{showPlaylists ? '▾' : '▸'}</span>
      </button>
      {showPlaylists && (
        <div className="track-quick-menu-playlists">
          {targetPlaylists.length === 0 ? (
            <div className="track-quick-menu-empty">No playlists yet</div>
          ) : targetPlaylists.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              role="menuitem"
              className="track-context-menu-item"
              onClick={run(() => void addToPlaylist(playlist.id, [track.path]))}
            >
              {playlist.name}
            </button>
          ))}
        </div>
      )}
      <div className="track-quick-menu-divider" />
      <button type="button" role="menuitem" className="track-context-menu-item" disabled={!track.album} onClick={run(() => void openAlbum(track.album, track.artist))}>Go to album</button>
      <button type="button" role="menuitem" className="track-context-menu-item" disabled={!track.artist} onClick={run(() => void openArtist(track.artist))}>Go to artist</button>
      <button
        type="button"
        role="menuitem"
        className="track-context-menu-item"
        disabled={!track.local}
        onClick={run(() => openMetadataEditor({ trackPaths: [track.path], skippedRemoteCount: 0 }))}
      >
        Edit metadata…
      </button>
    </div>,
    host
  )
}
