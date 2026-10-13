import { useCallback, useEffect, useState } from 'react'
import { useOutsideDismiss } from '../../hooks/useOutsideDismiss'
import { clampFixedOverlayPosition, viewportPointToAppLayout, viewportSizeToAppLayout } from '../../utils/overlayPositioning'
import { usePlayerStore } from '../../stores/playerStore'
import { useSpotifyStore } from '../../stores/spotifyStore'
import { useUIStore } from '../../stores/uiStore'
import AlbumArtwork from '../library/AlbumArtwork'

/** The big cover shown above the now-playing block when the left pane is expanded. */
export default function SidebarCover() {
  const currentTrack = usePlayerStore((state) => state.currentTrack)
  const spotifyActive = useSpotifyStore((state) => state.activeSource === 'spotify' && state.status.track !== null)
  const spotifyArtwork = useSpotifyStore((state) => state.status.artworkDataUrl)
  const setFullscreen = useUIStore((state) => state.setFullscreen)
  const uiScalePercent = useUIStore((state) => state.uiScalePercent)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  useOutsideDismiss(menu !== null, closeMenu, '.sidebar-cover-menu')
  // The two small players: the mini player window, and the one that lives at the camera notch.
  const [miniOpen, setMiniOpen] = useState(false)
  const [notchEnabled, setNotchEnabled] = useState(false)
  const [notchAvailability, setNotchAvailability] = useState<string>('unsupported')
  useEffect(() => {
    if (!menu) return
    void window.electronAPI.miniPlayer.getWindowState().then((state) => setMiniOpen(state.isOpen)).catch(() => {})
    void window.electronAPI.notch.getState().then((state) => {
      setNotchEnabled(state.prefs.enabled)
      setNotchAvailability(state.availability)
    }).catch(() => {})
  }, [menu])
  const toggleMini = (): void => {
    setMenu(null)
    void (miniOpen ? window.electronAPI.miniPlayer.close() : window.electronAPI.miniPlayer.open())
  }
  const toggleNotch = (): void => {
    setMenu(null)
    void window.electronAPI.notch.setPrefs({ enabled: !notchEnabled })
  }
  const menuStyle = menu
    ? clampFixedOverlayPosition({
        anchor: viewportPointToAppLayout({ x: menu.x, y: menu.y }, uiScalePercent / 100),
        overlay: { width: 220, height: 90 },
        viewport: viewportSizeToAppLayout({ width: window.innerWidth, height: window.innerHeight }, uiScalePercent / 100),
        edgePadding: 8
      })
    : undefined

  if (spotifyActive) {
    return (
      <div className="sidebar-cover" aria-label="Spotify album art">
        {spotifyArtwork ? <img src={spotifyArtwork} alt="Album art" /> : <div className="artwork-placeholder">&#9835;</div>}
      </div>
    )
  }

  return (
    <div
      className="sidebar-cover sidebar-cover-clickable"
      onClick={() => setFullscreen(true)}
      onContextMenu={(event) => {
        event.preventDefault()
        setMenu({ x: event.clientX, y: event.clientY })
      }}
      role="button"
      tabIndex={-1}
      aria-label="Open fullscreen player"
    >
      {currentTrack?.artworkHash ? (
        <AlbumArtwork hash={currentTrack.artworkHash} alt="Album art" variant="full" />
      ) : currentTrack?.artworkData ? (
        <img src={currentTrack.artworkData} alt="Album art" />
      ) : (
        <div className="artwork-placeholder">&#9835;</div>
      )}
      {menu && (
        <div
          className="track-context-menu sidebar-cover-menu"
          style={menuStyle}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" className="track-context-menu-item" onClick={toggleMini}>
            {miniOpen ? 'Close Mini Player' : 'Open Mini Player'}
          </button>
          <button
            type="button"
            className="track-context-menu-item"
            onClick={toggleNotch}
            disabled={!notchEnabled && notchAvailability !== 'available'}
            title={!notchEnabled && notchAvailability !== 'available' ? 'The notch player needs a Mac with a camera notch.' : undefined}
          >
            {notchEnabled ? 'Turn Off Notch Player' : 'Turn On Notch Player'}
          </button>
        </div>
      )}
    </div>
  )
}
