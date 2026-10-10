import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import type { SpotifyStatus } from '../../../types/spotify'
import { extractAlbumPalette, liftForDisplay } from '../../../shared/color/albumPalette'
import { DEFAULT_POPOUT_SCHEME, popoutScheme, type PopoutScheme } from '../../../shared/color/popoutScheme'
import { wideShape, type SpotifyPopoutState, type WideShape } from '../../../types/spotifyPopout'
import { useWantedStore } from '../../stores/wantedStore'
import '../../styles/spotify-popout.css'

// The Spotify popout window. It reads Spotify's state itself (through the main process) and
// sends play/pause/next/previous straight back, so it works whatever the main window is doing.

const INITIAL_SPOTIFY_STATUS: SpotifyStatus = {
  state: 'notrunning',
  track: null,
  positionSeconds: 0,
  volume: null,
  artworkDataUrl: null,
  message: null
}

const PATHS = {
  previous: 'M6 5h2v14H6zM20 5v14L9 12z',
  next: 'M16 5h2v14h-2zM4 5l11 7L4 19z',
  play: 'M8 5v14l11-7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  check: 'M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z',
  restore: 'M5 5h7v2H7v10h10v-5h2v7H5zM14 4h6v6h-2V7.4l-6.3 6.3-1.4-1.4L16.6 6H14z'
}

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

/** Progress line you can click or drag to move the playhead in Spotify. */
function SeekBar({ position, duration, enabled, onSeek }: {
  position: number
  duration: number
  enabled: boolean
  onSeek: (seconds: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragFraction, setDragFraction] = useState<number | null>(null)

  const fractionAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }
  const canSeek = enabled && duration > 0
  const shownFraction = dragFraction ?? (duration > 0 ? Math.min(1, position / duration) : 0)

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canSeek) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragFraction(fractionAt(event.clientX))
  }
  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragFraction !== null) setDragFraction(fractionAt(event.clientX))
  }
  const onUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragFraction === null) return
    const fraction = fractionAt(event.clientX)
    setDragFraction(null)
    onSeek(fraction * duration)
  }

  return (
    <div className="sp-seek no-drag" data-active={canSeek ? 'true' : 'false'} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(shownFraction * duration)}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDragFraction(null)}>
      <div className="sp-seek-track" ref={trackRef}>
        <div className="sp-seek-fill" style={{ width: `${shownFraction * 100}%` }} />
        <div className="sp-seek-knob" style={{ left: `${shownFraction * 100}%` }} />
      </div>
    </div>
  )
}

const COVER_SAMPLE = 48

/** Reads the cover's colours (main/secondary by prominence, plus the lifted vivid palette). */
function coverScheme(dataUrl: string): Promise<PopoutScheme> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = COVER_SAMPLE
        canvas.height = COVER_SAMPLE
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) { resolve(DEFAULT_POPOUT_SCHEME); return }
        ctx.drawImage(image, 0, 0, COVER_SAMPLE, COVER_SAMPLE)
        const pixels = ctx.getImageData(0, 0, COVER_SAMPLE, COVER_SAMPLE).data
        resolve(popoutScheme(extractAlbumPalette(pixels, 3, 'prominence'), liftForDisplay(extractAlbumPalette(pixels, 4))))
      } catch {
        resolve(DEFAULT_POPOUT_SCHEME)
      }
    }
    image.onerror = () => resolve(DEFAULT_POPOUT_SCHEME)
    image.src = dataUrl
  })
}

/** Drag the window from anywhere that is not a button or the progress line. */
function useWindowDrag() {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      if ((event.target as HTMLElement).closest('button, .sp-seek')) return
      event.currentTarget.setPointerCapture(event.pointerId)
      start.current = { x: event.screenX, y: event.screenY }
      window.electronAPI.spotifyPopout.dragStart()
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!start.current) return
      window.electronAPI.spotifyPopout.dragMove(event.screenX - start.current.x, event.screenY - start.current.y)
    },
    onPointerUp: () => {
      if (!start.current) return
      start.current = null
      window.electronAPI.spotifyPopout.dragEnd()
    }
  }
}

function pollDelay(status: SpotifyStatus): number {
  if (status.state === 'playing') return 1000
  if (status.state === 'paused') return 2000
  return 4000
}

export default function SpotifyPopoutApp() {
  const [status, setStatus] = useState<SpotifyStatus>(INITIAL_SPOTIFY_STATUS)
  const [receivedAt, setReceivedAt] = useState(0)
  const [popout, setPopout] = useState<SpotifyPopoutState>({ layout: 'square', alwaysOnTop: true, albumColors: true })
  const [hover, setHover] = useState(false)
  const [position, setPosition] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const dragHandlers = useWindowDrag()
  const [scheme, setScheme] = useState<PopoutScheme>(DEFAULT_POPOUT_SCHEME)
  const [unit, setUnit] = useState(1)
  const [shape, setShape] = useState<WideShape>({ stacked: false, unit: 1, cover: 120 })

  const isWanted = useWantedStore((state) => (status.track ? state.ids.has(status.track.id) : false))
  const isAdding = useWantedStore((state) => (status.track ? state.adding.has(status.track.id) : false))
  const addWanted = useWantedStore((state) => state.add)
  const refreshWanted = useWantedStore((state) => state.refresh)

  useEffect(() => {
    document.title = 'Astra Spotify'
    void window.electronAPI.spotifyPopout.getState().then(setPopout).catch(() => undefined)
    const offState = window.electronAPI.spotifyPopout.onState(setPopout)
    const offHover = window.electronAPI.spotifyPopout.onHover(setHover)
    return () => { offState(); offHover() }
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: number | null = null
    const tick = async () => {
      let delay = 4000
      try {
        const next = await window.electronAPI.spotify.getStatus()
        if (cancelled) return
        setStatus(next)
        setReceivedAt(performance.now())
        delay = pollDelay(next)
      } catch {
        // keep the last status
      }
      if (!cancelled) timer = window.setTimeout(tick, delay)
    }
    void tick()
    return () => { cancelled = true; if (timer !== null) window.clearTimeout(timer) }
  }, [])

  const trackId = status.track?.id
  useEffect(() => { void refreshWanted() }, [trackId, refreshWanted])
  useEffect(() => {
    const onFocus = () => void refreshWanted()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshWanted])

  // Colours follow the cover; they fade because the CSS variables are registered colours.
  const artwork = status.artworkDataUrl
  useEffect(() => {
    if (!popout.albumColors || !artwork) {
      setScheme(DEFAULT_POPOUT_SCHEME)
      return
    }
    let cancelled = false
    void coverScheme(artwork).then((next) => { if (!cancelled) setScheme(next) })
    return () => { cancelled = true }
  }, [artwork, popout.albumColors])

  // Everything is sized from one unit so the layout scales smoothly as the window is resized.
  useEffect(() => {
    const element = rootRef.current
    if (!element) return
    const measure = () => {
      const { width, height } = element.getBoundingClientRect()
      if (popout.layout === 'square') {
        setUnit(Math.min(2.6, Math.max(0.7, width / 260)))
        return
      }
      // Wide: a strip while it is wider than tall, the cover on top once it is dragged tall.
      const next = wideShape(width, height)
      setShape((current) => (current.stacked === next.stacked && current.unit === next.unit && current.cover === next.cover ? current : next))
      setUnit(next.unit)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [popout.layout])

  const playing = status.state === 'playing'
  const track = status.track
  const duration = track ? track.durationMs / 1000 : 0
  useEffect(() => {
    const update = () => {
      const elapsed = playing ? (performance.now() - receivedAt) / 1000 : 0
      setPosition(Math.min(duration, status.positionSeconds + elapsed))
    }
    update()
    if (!playing) return
    const id = window.setInterval(update, 500)
    return () => window.clearInterval(id)
  }, [playing, receivedAt, status.positionSeconds, duration])

  const send = useCallback((kind: 'previous' | 'next' | 'playpause') => {
    void window.electronAPI.spotify.command({ kind }).then((next) => { setStatus(next); setReceivedAt(performance.now()) }).catch(() => undefined)
  }, [])

  const seekTo = useCallback((seconds: number) => {
    const target = Math.max(0, seconds)
    // Show the new position right away; the next status read confirms it.
    setStatus((current) => ({ ...current, positionSeconds: target }))
    setReceivedAt(performance.now())
    void window.electronAPI.spotify.command({ kind: 'seek', seconds: target })
      .then((next) => { setStatus(next); setReceivedAt(performance.now()) })
      .catch(() => undefined)
  }, [])

  const addCurrent = () => {
    if (!track || isWanted || isAdding) return
    void addWanted({
      spotifyTrackId: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      durationMs: track.durationMs,
      artworkUrl: track.artworkUrl
    })
  }

  const showControls = !!track && (status.state === 'playing' || status.state === 'paused')
  const style = {
    ['--u' as string]: unit,
    ['--sp-bg1' as string]: scheme.bg1,
    ['--sp-bg2' as string]: scheme.bg2,
    ['--sp-accent' as string]: scheme.accent,
    ['--sp-accent-fg' as string]: scheme.accentText
  } as CSSProperties
  const cover = status.artworkDataUrl

  const returnButton = (
    <button type="button" className={`sp-btn sp-return no-drag${popout.layout === 'wide' && shape.stacked ? ' sp-return-glass' : ''}`} aria-label="Return to Astra" title="Return to Astra" onClick={() => void window.electronAPI.spotifyPopout.returnToMain()}>
      <Icon d={PATHS.restore} />
    </button>
  )
  const addButton = (
    <button
      type="button"
      className={`sp-btn sp-add no-drag${isWanted ? ' on' : ''}`}
      disabled={!showControls || isAdding}
      aria-label={isWanted ? 'On your Not downloaded list' : 'Add to Not downloaded'}
      title={isWanted ? 'On your Not downloaded list' : 'Add to Not downloaded'}
      onClick={addCurrent}
    >
      <Icon d={isWanted ? PATHS.check : PATHS.plus} />
    </button>
  )
  const transport = (
    <div className="sp-transport no-drag">
 <button type="button" className="sp-btn sp-first" aria-label="Previous track" disabled={!showControls} onClick={() => send('previous')}><Icon d={PATHS.previous} /></button>
      <button type="button" className="sp-btn sp-play" aria-label={playing ? 'Pause' : 'Play'} disabled={!showControls} onClick={() => send('playpause')}><Icon d={playing ? PATHS.pause : PATHS.play} /></button>
      <button type="button" className="sp-btn" aria-label="Next track" disabled={!showControls} onClick={() => send('next')}><Icon d={PATHS.next} /></button>
    </div>
  )
  const emptyText = status.state === 'notrunning' ? 'Spotify is not open' : status.state === 'error' || status.state === 'unsupported' ? (status.message ?? 'Spotify is not available') : 'Nothing playing'

  const coverBox = (
    <div className="sp-cover">
      {cover ? <img src={cover} alt="" draggable={false} /> : <span className="sp-cover-empty">&#9835;</span>}
    </div>
  )

  if (popout.layout === 'wide') {
    return (
      <div ref={rootRef} className={`sp-root sp-wide${shape.stacked ? ' sp-stacked' : ''}`} style={style} {...dragHandlers} onPointerCancel={dragHandlers.onPointerUp} onContextMenu={(e) => { e.preventDefault(); window.electronAPI.spotifyPopout.showContextMenu() }}>
        <div className="sp-cover-wrap drag" style={shape.stacked ? { width: shape.cover, height: shape.cover } : undefined}>
          {coverBox}
          {shape.stacked && returnButton}
        </div>
        <div className="sp-panel drag">
          {!shape.stacked && returnButton}
          <div className="sp-text">
            <div className="sp-title">{track ? track.title : emptyText}</div>
            {track && <div className="sp-sub">{track.artist} &middot; {track.album}</div>}
          </div>
          <div className="sp-timeline">
            <span className="sp-time">{formatClock(position)}</span>
            <SeekBar position={position} duration={duration} enabled={showControls} onSeek={seekTo} />
            <span className="sp-time">{formatClock(duration)}</span>
          </div>
          <div className="sp-row">
            {transport}
            <span className="sp-grow" />
            {addButton}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="sp-root sp-square" style={style} {...dragHandlers} onPointerCancel={dragHandlers.onPointerUp} onContextMenu={(e) => { e.preventDefault(); window.electronAPI.spotifyPopout.showContextMenu() }}>
      {coverBox}
      <div className={`sp-veil drag${hover || !showControls ? ' show' : ''}`}>
        <div className="sp-top">
          {addButton}
          {returnButton}
        </div>
        <div className="sp-mid">{transport}</div>
        <div className="sp-bottom">
          <div className="sp-title">{track ? track.title : emptyText}</div>
          {track && <div className="sp-sub">{track.artist}</div>}
          <SeekBar position={position} duration={duration} enabled={showControls} onSeek={seekTo} />
        </div>
      </div>
    </div>
  )
}
