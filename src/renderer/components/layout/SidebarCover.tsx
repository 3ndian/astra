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
    </div>
  )
}
