import { useEffect, useRef, useState } from 'react'
import TransportResizeHandle from './TransportResizeHandle'
import { useSpotifyStore } from '../../stores/spotifyStore'
import { useUIStore } from '../../stores/uiStore'

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

const VOLUME_SEND_INTERVAL_MS = 150

export default function SpotifyTransportBar() {
  const status = useSpotifyStore((state) => state.status)
  const statusReceivedAt = useSpotifyStore((state) => state.statusReceivedAt)
  const sendCommand = useSpotifyStore((state) => state.sendCommand)
  const isSidebarExpanded = useUIStore((state) => state.isSidebarExpanded)

  const [position, setPosition] = useState(status.positionSeconds)
  const [scrubbing, setScrubbing] = useState(false)
  const [volume, setVolume] = useState<number>(status.volume ?? 100)
  const draggingVolumeRef = useRef(false)
  const lastVolumeSentRef = useRef(0)

  const track = status.track
  const durationSeconds = track ? track.durationMs / 1000 : 0
  const isPlaying = status.state === 'playing'

  useEffect(() => {
    if (!scrubbing) setPosition(status.positionSeconds)
  }, [status, scrubbing])

  useEffect(() => {
    if (!draggingVolumeRef.current && status.volume !== null) setVolume(status.volume)
  }, [status.volume])

  useEffect(() => {
    if (!isPlaying || scrubbing) return
    const id = window.setInterval(() => {
      const elapsed = (performance.now() - statusReceivedAt) / 1000
      setPosition(Math.min(durationSeconds, status.positionSeconds + elapsed))
    }, 250)
    return () => window.clearInterval(id)
  }, [isPlaying, scrubbing, statusReceivedAt, status.positionSeconds, durationSeconds])

  if (!track) return null

  const progress = durationSeconds > 0 ? Math.min(100, (position / durationSeconds) * 100) : 0
  const maxSeek = Math.max(1, Math.round(durationSeconds))

  const commitSeek = (seconds: number) => {
    setScrubbing(false)
    void sendCommand({ kind: 'seek', seconds })
  }

  const sendVolume = (percent: number, force: boolean) => {
    const now = performance.now()
    if (!force && now - lastVolumeSentRef.current < VOLUME_SEND_INTERVAL_MS) return
    lastVolumeSentRef.current = now
    void sendCommand({ kind: 'volume', percent })
  }

  return (
    <div className={`transport-bar spotify-transport-bar ${isSidebarExpanded ? 'spotify-bar-aligned' : ''}`.trim()}>
      <TransportResizeHandle />
      <div className="spotify-bar-track">
        <div className="spotify-bar-cover">
          {status.artworkDataUrl ? <img src={status.artworkDataUrl} alt="Album art" /> : <div className="artwork-placeholder">&#9835;</div>}
        </div>
        <div className="spotify-bar-text">
          <div className="spotify-bar-title" title={track.title}>{track.title}</div>
          <div className="spotify-bar-artist" title={`${track.artist} · ${track.album}`}>{track.artist} · {track.album}</div>
        </div>
      </div>

      <div className="spotify-bar-center">
        <div className="spotify-bar-buttons">
          <button type="button" onClick={() => void sendCommand({ kind: 'previous' })} aria-label="Previous track">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z" /></svg>
          </button>
          <button type="button" className="spotify-bar-play" onClick={() => void sendCommand({ kind: 'playpause' })} aria-label={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4h4v16H7zM13 4h4v16h-4z" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <button type="button" onClick={() => void sendCommand({ kind: 'next' })} aria-label="Next track">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5l11 7L4 19z" /></svg>
          </button>
        </div>
        <div className="spotify-bar-progress">
          <span>{formatClock(position)}</span>
          <input
            className="spotify-seek"
            type="range"
            min={0}
            max={maxSeek}
            step={1}
            value={Math.min(Math.round(position), maxSeek)}
            style={{ ['--spotify-progress' as string]: `${progress}%` }}
            onChange={(event) => { setScrubbing(true); setPosition(Number(event.target.value)) }}
            onMouseUp={(event) => commitSeek(Number((event.target as HTMLInputElement).value))}
            onKeyUp={(event) => commitSeek(Number((event.target as HTMLInputElement).value))}
            aria-label="Seek"
          />
          <span>{formatClock(durationSeconds)}</span>
        </div>
      </div>

      <div className="spotify-bar-side">
        <span className="spotify-bar-source">Spotify</span>
        <input
          className="spotify-seek spotify-bar-volume"
          type="range"
          min={0}
          max={100}
          step={1}
          value={volume}
          style={{ ['--spotify-progress' as string]: `${volume}%` }}
          onPointerDown={() => { draggingVolumeRef.current = true }}
          onChange={(event) => { const v = Number(event.target.value); setVolume(v); sendVolume(v, false) }}
          onPointerUp={(event) => { draggingVolumeRef.current = false; sendVolume(Number((event.target as HTMLInputElement).value), true) }}
          aria-label="Spotify volume"
        />
      </div>
    </div>
  )
}
