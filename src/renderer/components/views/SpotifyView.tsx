import { useEffect, useState } from 'react'
import SpotifyHistoryList from './SpotifyHistoryList'
import WantedAddButton from './WantedAddButton'
import { useSpotifyPlaylistMenu } from './SpotifyPlaylistMenu'
import { useSpotifyStore, type SpotifyHandoffPreference } from '../../stores/spotifyStore'

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function SpotifyView() {
  const { openMenu, menu } = useSpotifyPlaylistMenu()
  const status = useSpotifyStore((state) => state.status)
  const statusReceivedAt = useSpotifyStore((state) => state.statusReceivedAt)
  const loaded = useSpotifyStore((state) => state.loaded)
  const handoffPreference = useSpotifyStore((state) => state.handoffPreference)
  const enable = useSpotifyStore((state) => state.enable)
  const setHandoffPreference = useSpotifyStore((state) => state.setHandoffPreference)
  const sendCommand = useSpotifyStore((state) => state.sendCommand)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [displayPosition, setDisplayPosition] = useState(status.positionSeconds)

  // Opening this view is what switches Spotify support on (and triggers the macOS Automation prompt).
  useEffect(() => { enable() }, [enable])

  useEffect(() => {
    setDisplayPosition(status.positionSeconds)
  }, [status])

  // Smooth the progress bar between polls while playing.
  useEffect(() => {
    if (status.state !== 'playing' || !status.track) return
    const durationSeconds = status.track.durationMs / 1000
    const id = window.setInterval(() => {
      const elapsed = (performance.now() - statusReceivedAt) / 1000
      setDisplayPosition(Math.min(durationSeconds, status.positionSeconds + elapsed))
    }, 250)
    return () => window.clearInterval(id)
  }, [status, statusReceivedAt])

  const send = sendCommand

  const track = status.track
  const durationSeconds = track ? track.durationMs / 1000 : 0
  const progress = durationSeconds > 0 ? Math.min(100, (displayPosition / durationSeconds) * 100) : 0
  const isPlaying = status.state === 'playing'
  const controlsEnabled = status.state === 'playing' || status.state === 'paused' || status.state === 'stopped'

  let emptyMessage: string | null = null
  if (loaded && !track) {
    if (status.state === 'unsupported') emptyMessage = status.message ?? 'Spotify control is available on macOS for now.'
    else if (status.state === 'notrunning') emptyMessage = 'Open the Spotify app and start playing something.'
    else if (status.state === 'stopped') emptyMessage = 'Spotify is open but nothing is playing.'
    else if (status.state === 'error') emptyMessage = status.message ?? 'Could not reach Spotify.'
  }

  return (
    <div className="spotify-view">
      <div className="spotify-view-header">
        <h1>Spotify</h1>
        <span className="spotify-view-sub">Controls the Spotify desktop app</span>
        <div className="spotify-options">
          <button
            type="button"
            className="spotify-options-button"
            onClick={() => setOptionsOpen((open) => !open)}
            aria-label="Spotify options"
            aria-expanded={optionsOpen}
          >
            &#8943;
          </button>
          {optionsOpen && (
            <div className="spotify-options-menu" role="dialog" aria-label="Spotify options">
              <label className="spotify-handoff-setting">
                <span>When a local song starts while Spotify is playing</span>
                <select value={handoffPreference} onChange={(event) => setHandoffPreference(event.target.value as SpotifyHandoffPreference)}>
                  <option value="ask">Ask me</option>
                  <option value="always">Always pause Spotify</option>
                  <option value="never">Leave Spotify playing</option>
                </select>
              </label>
            </div>
          )}
        </div>
      </div>

      {emptyMessage && <div className="spotify-view-empty" role="status">{emptyMessage}</div>}

      {track && (
        <div
          className="spotify-now-playing"
          title="Right-click to add this song to a playlist"
          onContextMenu={(event) => openMenu(event, {
            spotifyTrackId: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album,
            durationMs: track.durationMs,
            artworkUrl: track.artworkUrl
          })}
        >
          <div className="spotify-cover">
            {status.artworkDataUrl ? (
              <img src={status.artworkDataUrl} alt="Album art" />
            ) : (
              <div className="artwork-placeholder">&#9835;</div>
            )}
          </div>
          <div className="spotify-info">
            <div className="spotify-label">{isPlaying ? 'NOW PLAYING ON SPOTIFY' : 'PAUSED ON SPOTIFY'}</div>
            <div className="spotify-title">{track.title}</div>
            <div className="spotify-artist">{track.artist}</div>
            <div className="spotify-album">{track.album}</div>
            <WantedAddButton
              request={{
                spotifyTrackId: track.id,
                title: track.title,
                artist: track.artist,
                album: track.album,
                durationMs: track.durationMs,
                artworkUrl: track.artworkUrl
              }}
            />

            <div className="spotify-progress">
              <span>{formatClock(displayPosition)}</span>
              <input
                className="spotify-seek"
                type="range"
                min={0}
                max={Math.max(1, Math.round(durationSeconds))}
                step={1}
                value={Math.min(Math.round(displayPosition), Math.max(1, Math.round(durationSeconds)))}
                style={{ ['--spotify-progress' as string]: `${progress}%` }}
                onChange={(event) => setDisplayPosition(Number(event.target.value))}
                onMouseUp={(event) => void send({ kind: 'seek', seconds: Number((event.target as HTMLInputElement).value) })}
                onKeyUp={(event) => void send({ kind: 'seek', seconds: Number((event.target as HTMLInputElement).value) })}
                aria-label="Seek"
              />
              <span>{formatClock(durationSeconds)}</span>
            </div>

            <div className="spotify-controls">
              <button type="button" onClick={() => void send({ kind: 'previous' })} disabled={!controlsEnabled} aria-label="Previous track">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>
              </button>
              <button type="button" className="spotify-play" onClick={() => void send({ kind: 'playpause' })} disabled={!controlsEnabled} aria-label={isPlaying ? 'Pause' : 'Play'}>
                {isPlaying ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4h4v16H7zM13 4h4v16h-4z" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
              <button type="button" onClick={() => void send({ kind: 'next' })} disabled={!controlsEnabled} aria-label="Next track">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5l11 7L4 19z" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <SpotifyHistoryList />
      {menu}
    </div>
  )
}
