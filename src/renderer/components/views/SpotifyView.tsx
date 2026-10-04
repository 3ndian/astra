import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpotifyCommand, SpotifyStatus } from '../../../types/spotify'

const POLL_INTERVAL_MS = 1000

const INITIAL_STATUS: SpotifyStatus = {
  state: 'notrunning',
  track: null,
  positionSeconds: 0,
  artworkDataUrl: null,
  message: null
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export default function SpotifyView() {
  const [status, setStatus] = useState<SpotifyStatus>(INITIAL_STATUS)
  const [loaded, setLoaded] = useState(false)
  const [displayPosition, setDisplayPosition] = useState(0)
  const lastPollAtRef = useRef(0)
  const statusRef = useRef(status)
  statusRef.current = status

  const applyStatus = useCallback((next: SpotifyStatus) => {
    lastPollAtRef.current = performance.now()
    setStatus(next)
    setDisplayPosition(next.positionSeconds)
    setLoaded(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: number | null = null

    const poll = async () => {
      try {
        const next = await window.electronAPI.spotify.getStatus()
        if (!cancelled) applyStatus(next)
      } catch {
        // keep the last status; try again next tick
      }
      if (!cancelled) timer = window.setTimeout(poll, POLL_INTERVAL_MS)
    }
    void poll()
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [applyStatus])

  // Smooth the progress bar between polls while playing.
  useEffect(() => {
    const id = window.setInterval(() => {
      const current = statusRef.current
      if (current.state !== 'playing' || !current.track) return
      const elapsed = (performance.now() - lastPollAtRef.current) / 1000
      const durationSeconds = current.track.durationMs / 1000
      setDisplayPosition(Math.min(durationSeconds, current.positionSeconds + elapsed))
    }, 250)
    return () => window.clearInterval(id)
  }, [])

  const send = useCallback(async (command: SpotifyCommand) => {
    try {
      applyStatus(await window.electronAPI.spotify.command(command))
    } catch {
      // the next poll reports the real state
    }
  }, [applyStatus])

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
      </div>

      {emptyMessage && <div className="spotify-view-empty" role="status">{emptyMessage}</div>}

      {track && (
        <div className="spotify-now-playing">
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
    </div>
  )
}
