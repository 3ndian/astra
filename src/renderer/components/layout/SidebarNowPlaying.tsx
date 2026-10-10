import { useRef } from 'react'
import { usePlayerStore } from '../../stores/playerStore'
import { useLibraryStore } from '../../stores/libraryStore'
import { useAudioSettingsStore } from '../../stores/audioSettingsStore'
import { useParallaxStore } from '../../stores/parallaxStore'
import { usePlaybackClock } from '../../hooks/usePlaybackClock'
import { useOpenArtistInLibrary } from '../../hooks/useOpenArtistInLibrary'
import { useJumpToNowPlaying } from '../../hooks/useJumpToNowPlaying'
import ArtistNameLinks from '../library/ArtistNameLinks'
import { searchOnYouTube } from '../../utils/youtubeSearch'
import SidebarCover from './SidebarCover'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Left-pane "now playing" block (expanded pane, local playback): cover, title / artist, a seek line
 * and the transport buttons. The bottom bar keeps the waveform, volume and the right-hand tools.
 */
export default function SidebarNowPlaying() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playbackState = usePlayerStore((s) => s.playbackState)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const playNext = usePlayerStore((s) => s.playNext)
  const playPrevious = usePlayerStore((s) => s.playPrevious)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat)
  const seek = usePlayerStore((s) => s.seek)
  const duration = usePlayerStore((s) => s.duration)
  const queueLength = usePlayerStore((s) => s.getResolvedQueueLength())
  const effectiveDelayMs = useAudioSettingsStore((s) => s.effectiveDelayMs)
  const locked = useParallaxStore((s) => Boolean(s.status?.sink.connected))
  const favorites = useLibraryStore((s) => s.favorites)
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite)
  const openArtistInLibrary = useOpenArtistInLibrary()
  const jumpToNowPlaying = useJumpToNowPlaying()
  const currentTime = usePlaybackClock(1 / 10)
  const trackRef = useRef<HTMLDivElement | null>(null)

  const isPlaying = playbackState === 'playing'
  const isLoading = playbackState === 'loading'
  const delaySec = Math.max(0, effectiveDelayMs / 1000)
  const shown = duration > 0 ? Math.max(0, Math.min(duration, currentTime - delaySec)) : 0
  const progress = duration > 0 ? (shown / duration) * 100 : 0
  const isAssociation = currentTrack?.origin === 'associated-external'
  const isFavorite = currentTrack && !isAssociation ? favorites.has(currentTrack.path) : false

  const seekFromPointer = (clientX: number) => {
    const el = trackRef.current
    if (!el || duration <= 0) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    void seek(Math.max(0, Math.min(duration, ratio * duration + delaySec)))
  }

  return (
    <div className="sidebar-nowplaying">
      <SidebarCover />
      <div className="sidebar-np-meta">
        <div className="sidebar-np-titles">
          <button
            type="button"
            className="sidebar-np-title"
            onClick={() => void jumpToNowPlaying()}
            disabled={!currentTrack}
            title="Jump to playing (J)"
          >
            {currentTrack?.title ?? 'No track playing'}
          </button>
          <div className="sidebar-np-artist">
            {currentTrack?.artist?.trim() ? (
              <ArtistNameLinks
                artistText={currentTrack.artist}
                artistNames={currentTrack.artistNames}
                browseArtistText={currentTrack.albumArtist}
                browseArtistNames={currentTrack.albumArtistNames}
                onArtistClick={openArtistInLibrary}
                className="now-playing-artist-links"
                linkClassName="artist-name-link-inline"
              />
            ) : '—'}
          </div>
        </div>
        <button
          type="button"
          className="sidebar-np-icon-btn"
          onClick={() => searchOnYouTube(currentTrack)}
          disabled={!currentTrack}
          title="Search this song on YouTube"
          aria-label="Search this song on YouTube"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>
        <button
          type="button"
          className={`sidebar-np-icon-btn ${isFavorite ? 'active' : ''}`}
          onClick={() => currentTrack && toggleFavorite(currentTrack.path)}
          disabled={!currentTrack || isAssociation}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>
      <div className="sidebar-np-seek">
        <div
          ref={trackRef}
          className="sidebar-np-seek-track"
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(shown)}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            seekFromPointer(event.clientX)
          }}
          onPointerMove={(event) => {
            if (event.buttons & 1) seekFromPointer(event.clientX)
          }}
        >
          <div className="sidebar-np-seek-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="sidebar-np-times">
          <span>{formatTime(shown)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <div className="sidebar-np-controls">
        <button
          className={`control-btn control-btn-shuffle ${shuffle ? 'active' : ''}`}
          aria-label="Shuffle"
          onClick={toggleShuffle}
          disabled={locked}
          title={shuffle ? 'Shuffle on' : 'Shuffle off'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15 21 21" /><path d="M4 4 9 9" />
          </svg>
        </button>
        <button className="control-btn control-btn-skip" aria-label="Previous" onClick={playPrevious} disabled={locked || queueLength === 0}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <line x1="6" y1="5" x2="6" y2="19" /><polygon points="18,5 8,12 18,19" />
          </svg>
        </button>
        <button
          className={`control-btn control-btn-play ${isLoading ? 'is-loading' : ''}`.trim()}
          onClick={togglePlay}
          disabled={locked || !currentTrack || isLoading}
          aria-label={isLoading ? 'Loading' : isPlaying ? 'Pause' : 'Play'}
          aria-busy={isLoading}
        >
          {isPlaying || isLoading ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <button className="control-btn control-btn-skip" aria-label="Next" onClick={playNext} disabled={locked || queueLength === 0}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="5" x2="18" y2="19" /><polygon points="6,5 16,12 6,19" />
          </svg>
        </button>
        <button
          className={`control-btn control-btn-repeat ${repeat !== 'none' ? 'active' : ''}`}
          aria-label="Repeat"
          onClick={toggleRepeat}
          disabled={locked}
          title={repeat === 'none' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7h13a4 4 0 0 1 4 4v1" /><polyline points="17 4 20 7 17 10" /><path d="M21 17H8a4 4 0 0 1-4-4v-1" /><polyline points="7 20 4 17 7 14" />
            {repeat === 'one' && <path d="M12 8v8" />}
          </svg>
        </button>
      </div>
    </div>
  )
}
