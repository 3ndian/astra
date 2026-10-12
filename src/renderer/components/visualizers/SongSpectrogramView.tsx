import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { audioEngine } from '../../audio/AudioEngine'
import { createSongSpectrogramJob, mixToMono, type SongSpectrogram } from '../../audio/songSpectrogram'
import { buildHeatLUT, LEGACY_DEFAULT_HEAT_COLORS } from '../../audio/visualizers/Spectrogram'
import { usePlayerStore } from '../../stores/playerStore'
import { frequencyBoundsForRange, type FrequencyRangeMode, type FrequencyScaleMode } from '../../../types/frequencyScale'
import type { SpectrogramOrientation } from '../../../types/spectrogram'
import { isSpectrogramBandDragClick } from './useSpectrogramBandSelect'

const ROWS = 320
const MAX_COLUMNS = 16000
const DEFAULT_WINDOW_SECONDS = 24
const MIN_WINDOW_SECONDS = 4
const MAX_WINDOW_SECONDS = 240

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

/**
 * The whole song as a picture you can look around in. The picture is made once from the decoded audio and kept
 * off screen; the window shows a slice of it that follows the music, or sits wherever you drag the thin strip.
 * Plain dragging on the picture is left alone so it can still pick a frequency band.
 */
export function SongSpectrogramView({
  orientation,
  scaleMode,
  rangeMode,
  fftSize,
  tiltDbPerOctave,
  contrast,
  backgroundColor,
  labelColor
}: {
  orientation: SpectrogramOrientation
  scaleMode: FrequencyScaleMode
  rangeMode: FrequencyRangeMode
  fftSize: number
  tiltDbPerOctave: number
  contrast: number
  backgroundColor: string
  labelColor: string
}) {
  const vertical = orientation === 'vertical'
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stripRef = useRef<HTMLCanvasElement>(null)
  const trackPath = usePlayerStore((s) => s.currentTrack?.path ?? null)
  const trackDuration = usePlayerStore((s) => s.duration)
  const waveformData = usePlayerStore((s) => s.waveformData)
  const [spec, setSpec] = useState<SongSpectrogram | null>(null)
  const [status, setStatus] = useState<'waiting' | 'computing' | 'ready' | 'unavailable'>('waiting')
  const [following, setFollowing] = useState(true)
  const imageRef = useRef<HTMLCanvasElement | null>(null)
  const followRef = useRef(true)
  const centerRef = useRef(0)
  const windowRef = useRef(DEFAULT_WINDOW_SECONDS)
  const dirtyRef = useRef(true)
  const lastDrawKeyRef = useRef('')

  const setFollow = useCallback((value: boolean) => {
    followRef.current = value
    setFollowing(value)
    dirtyRef.current = true
  }, [])

  // Build the picture for the current song.
  useEffect(() => {
    setSpec(null)
    imageRef.current = null
    if (!trackPath) { setStatus('waiting'); return }
    setStatus('waiting')
    setFollow(true)
    windowRef.current = DEFAULT_WINDOW_SECONDS
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let attempts = 0

    const begin = (): void => {
      if (cancelled) return
      const decoded = audioEngine.getDecodedAudioForAnalysis()
      const ready = decoded
        && decoded.trackPath === trackPath
        && decoded.buffer.duration > 1
        && (!trackDuration || decoded.buffer.duration >= trackDuration - 1.5)
      if (!ready || !decoded) {
        attempts += 1
        // Streams and bit-perfect output never keep the decoded song around.
        if (attempts > 25) { setStatus('unavailable'); return }
        timer = setTimeout(begin, 800)
        return
      }
      setStatus('computing')
      const { buffer } = decoded
      const mono = mixToMono(buffer)
      const bounds = frequencyBoundsForRange(rangeMode, buffer.sampleRate)
      const columnsPerSecond = Math.max(4, Math.min(20, MAX_COLUMNS / Math.max(1, buffer.duration)))
      const size = [2048, 4096, 8192].includes(fftSize) ? fftSize : 4096
      const job = createSongSpectrogramJob(mono, buffer.sampleRate, {
        fftSize: size,
        columnsPerSecond,
        rows: ROWS,
        minHz: bounds.minFrequency,
        maxHz: bounds.maxFrequency,
        scaleMode,
        tiltDbPerOctave
      })
      const tick = (): void => {
        if (cancelled) return
        if (job.step(10)) {
          setSpec(job.result())
          setStatus('ready')
          return
        }
        timer = setTimeout(tick, 0)
      }
      tick()
    }
    begin()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [trackPath, trackDuration, fftSize, scaleMode, rangeMode, tiltDbPerOctave, vertical, setFollow])

  // Colour the picture (cheap to redo when contrast changes).
  useEffect(() => {
    if (!spec) { imageRef.current = null; return }
    const lut = buildHeatLUT(LEGACY_DEFAULT_HEAT_COLORS)
    const width = vertical ? spec.rows : spec.columns
    const height = vertical ? spec.columns : spec.rows
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const image = ctx.createImageData(width, height)
    const out = image.data
    const gamma = 1 / Math.max(0.2, contrast)
    const curve = new Uint8Array(256)
    for (let i = 0; i < 256; i++) curve[i] = Math.round(Math.pow(i / 255, gamma) * 255)
    for (let c = 0; c < spec.columns; c++) {
      for (let r = 0; r < spec.rows; r++) {
        const li = curve[spec.data[c * spec.rows + r]] * 4
        // Horizontal: later is to the right, high pitch at the top. Vertical: later at the top, high pitch to the right.
        const x = vertical ? r : c
        const y = vertical ? spec.columns - 1 - c : spec.rows - 1 - r
        const o = (y * width + x) * 4
        out[o] = lut[li]; out[o + 1] = lut[li + 1]; out[o + 2] = lut[li + 2]; out[o + 3] = lut[li + 3]
      }
    }
    ctx.putImageData(image, 0, 0)
    imageRef.current = canvas
    dirtyRef.current = true
  }, [spec, contrast, vertical])

  // Draw loop: follows the music, or shows wherever the strip was dragged.
  useEffect(() => {
    const canvas = canvasRef.current
    const strip = stripRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    let raf = 0
    let stopped = false

    const sizeCanvas = (target: HTMLCanvasElement, w: number, h: number): boolean => {
      const dpr = window.devicePixelRatio || 1
      const pw = Math.max(1, Math.round(w * dpr))
      const ph = Math.max(1, Math.round(h * dpr))
      if (target.width === pw && target.height === ph) return false
      target.width = pw
      target.height = ph
      return true
    }

    const frame = (): void => {
      if (stopped) return
      raf = requestAnimationFrame(frame)
      const rect = wrap.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const resized = sizeCanvas(canvas, rect.width, rect.height)
      const duration = spec?.durationSeconds ?? 0
      const now = followRef.current ? audioEngine.currentTime : centerRef.current
      const windowSeconds = windowRef.current
      const key = `${now.toFixed(3)}|${audioEngine.currentTime.toFixed(3)}|${windowSeconds}|${rect.width}|${rect.height}`
      if (!resized && !dirtyRef.current && key === lastDrawKeyRef.current) return
      lastDrawKeyRef.current = key
      dirtyRef.current = false

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const W = rect.width
      const H = rect.height
      ctx.clearRect(0, 0, W, H)
      if (backgroundColor && backgroundColor !== 'transparent') {
        ctx.fillStyle = backgroundColor
        ctx.fillRect(0, 0, W, H)
      }
      const image = imageRef.current
      const t0 = now - windowSeconds / 2
      if (image && spec) {
        const a = Math.max(0, t0)
        const b = Math.min(duration, t0 + windowSeconds)
        if (b > a) {
          ctx.imageSmoothingEnabled = true
          const cps = spec.columnsPerSecond
          if (!vertical) {
            const dx0 = ((a - t0) / windowSeconds) * W
            const dx1 = ((b - t0) / windowSeconds) * W
            ctx.drawImage(image, a * cps, 0, (b - a) * cps, image.height, dx0, 0, dx1 - dx0, H)
          } else {
            const dy0 = (1 - (b - t0) / windowSeconds) * H
            const dy1 = (1 - (a - t0) / windowSeconds) * H
            ctx.drawImage(image, 0, spec.columns - b * cps, image.width, (b - a) * cps, 0, dy0, W, dy1 - dy0)
          }
        }
      }
      // Playhead.
      const current = audioEngine.currentTime
      const phFraction = (current - t0) / windowSeconds
      if (phFraction >= 0 && phFraction <= 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        if (!vertical) { const x = phFraction * W; ctx.moveTo(x, 0); ctx.lineTo(x, H) }
        else { const y = (1 - phFraction) * H; ctx.moveTo(0, y); ctx.lineTo(W, y) }
        ctx.stroke()
      }
      // Time marks at both ends of the window.
      ctx.fillStyle = labelColor
      ctx.font = '10px system-ui, sans-serif'
      if (!vertical) {
        ctx.textBaseline = 'top'
        ctx.textAlign = 'left'; ctx.fillText(formatClock(Math.max(0, t0)), 4, 14)
        ctx.textAlign = 'right'; ctx.fillText(formatClock(Math.min(duration, t0 + windowSeconds)), W - 4, 14)
      } else {
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'; ctx.fillText(formatClock(Math.min(duration, t0 + windowSeconds)), 4, 14)
        ctx.textBaseline = 'bottom'; ctx.fillText(formatClock(Math.max(0, t0)), 4, H - 2)
      }

      // The strip: the whole song's loudness, the window you are looking at, and where the music is.
      if (strip) {
        const sr = strip.getBoundingClientRect()
        if (sr.width > 1 && sr.height > 1) {
          sizeCanvas(strip, sr.width, sr.height)
          const sctx = strip.getContext('2d')
          if (sctx) {
            sctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            const sw = sr.width
            const sh = sr.height
            sctx.clearRect(0, 0, sw, sh)
            sctx.fillStyle = 'rgba(255,255,255,0.08)'
            sctx.fillRect(0, 0, sw, sh)
            const length = vertical ? sh : sw
            if (waveformData && waveformData.length > 0) {
              sctx.fillStyle = 'rgba(255,255,255,0.35)'
              const bars = Math.min(Math.floor(length), waveformData.length)
              for (let i = 0; i < bars; i++) {
                const v = waveformData[Math.floor((i / bars) * waveformData.length)] ?? 0
                if (!vertical) {
                  const hh = Math.max(1, v * (sh - 2))
                  sctx.fillRect(i * (sw / bars), (sh - hh) / 2, Math.max(1, sw / bars - 0.3), hh)
                } else {
                  const ww = Math.max(1, v * (sw - 2))
                  // Later at the top.
                  sctx.fillRect((sw - ww) / 2, sh - (i + 1) * (sh / bars), ww, Math.max(1, sh / bars - 0.3))
                }
              }
            }
            if (duration > 0) {
              const f0 = Math.max(0, t0 / duration)
              const f1 = Math.min(1, (t0 + windowSeconds) / duration)
              sctx.fillStyle = 'rgba(255,255,255,0.18)'
              sctx.strokeStyle = 'rgba(255,255,255,0.8)'
              sctx.lineWidth = 1
              if (!vertical) {
                sctx.fillRect(f0 * sw, 0, (f1 - f0) * sw, sh)
                sctx.strokeRect(f0 * sw + 0.5, 0.5, Math.max(1, (f1 - f0) * sw - 1), sh - 1)
                sctx.fillStyle = '#fff'
                sctx.fillRect(Math.min(sw - 2, (current / duration) * sw), 0, 2, sh)
              } else {
                sctx.fillRect(0, (1 - f1) * sh, sw, (f1 - f0) * sh)
                sctx.strokeRect(0.5, (1 - f1) * sh + 0.5, sw - 1, Math.max(1, (f1 - f0) * sh - 1))
                sctx.fillStyle = '#fff'
                sctx.fillRect(0, Math.max(0, (1 - current / duration) * sh - 1), sw, 2)
              }
            }
          }
        }
      }
    }
    raf = requestAnimationFrame(frame)
    return () => { stopped = true; cancelAnimationFrame(raf) }
  }, [spec, vertical, backgroundColor, labelColor, waveformData])

  // Trackpad / wheel: scroll along time to look around, pinch (or Alt+scroll) to zoom.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const onWheel = (event: WheelEvent): void => {
      if (!spec) return
      event.preventDefault()
      event.stopPropagation()
      if (event.ctrlKey || event.altKey) {
        const factor = Math.exp(event.deltaY * 0.01)
        windowRef.current = Math.min(MAX_WINDOW_SECONDS, Math.max(MIN_WINDOW_SECONDS, windowRef.current * factor))
        dirtyRef.current = true
        return
      }
      const rect = wrap.getBoundingClientRect()
      const span = vertical ? rect.height : rect.width
      const secondsPerPixel = windowRef.current / Math.max(1, span)
      const delta = vertical ? -event.deltaY : (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY)
      if (followRef.current) centerRef.current = audioEngine.currentTime
      centerRef.current = Math.min(spec.durationSeconds, Math.max(0, centerRef.current + delta * secondsPerPixel))
      setFollow(false)
    }
    wrap.addEventListener('wheel', onWheel, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheel)
  }, [spec, vertical, setFollow])

  const onStripPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!spec || event.button !== 0) return
    event.stopPropagation()
    const strip = event.currentTarget
    strip.setPointerCapture(event.pointerId)
    const move = (clientX: number, clientY: number): void => {
      const rect = strip.getBoundingClientRect()
      const fraction = vertical
        ? 1 - (clientY - rect.top) / Math.max(1, rect.height)
        : (clientX - rect.left) / Math.max(1, rect.width)
      centerRef.current = Math.min(spec.durationSeconds, Math.max(0, fraction * spec.durationSeconds))
      setFollow(false)
    }
    move(event.clientX, event.clientY)
    const onMove = (e: PointerEvent): void => move(e.clientX, e.clientY)
    const onUp = (): void => {
      strip.removeEventListener('pointermove', onMove)
      strip.removeEventListener('pointerup', onUp)
      strip.removeEventListener('pointercancel', onUp)
    }
    strip.addEventListener('pointermove', onMove)
    strip.addEventListener('pointerup', onUp)
    strip.addEventListener('pointercancel', onUp)
  }, [spec, vertical, setFollow])

  // A tap on the picture jumps the music to that spot.
  const onBodyClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('.song-view-strip, .song-view-btn, .band-chip')) return
    event.stopPropagation()
    if (isSpectrogramBandDragClick() || !spec) return
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const now = followRef.current ? audioEngine.currentTime : centerRef.current
    const t0 = now - windowRef.current / 2
    const fraction = vertical
      ? 1 - (event.clientY - rect.top) / Math.max(1, rect.height)
      : (event.clientX - rect.left) / Math.max(1, rect.width)
    const time = Math.min(spec.durationSeconds, Math.max(0, t0 + fraction * windowRef.current))
    void usePlayerStore.getState().seek(time)
  }, [spec, vertical])

  return (
    <div ref={wrapRef} className="song-view" onClick={onBodyClick}>
      <canvas ref={canvasRef} className="song-view-canvas" />
      {status !== 'ready' && (
        <div className="song-view-note">
          {status === 'unavailable'
            ? 'Song view needs the normal output (the whole song is read from memory).'
            : status === 'computing' ? 'Drawing the whole song…' : 'Waiting for the song to finish loading…'}
        </div>
      )}
      <canvas
        ref={stripRef}
        className={`song-view-strip ${vertical ? 'is-vertical' : 'is-horizontal'}`}
        onPointerDown={onStripPointerDown}
        onClick={(event) => event.stopPropagation()}
        title="Drag to look around the song. Scroll on the picture to move, pinch to zoom. Click the picture to jump there."
      />
      {!following && (
        <button
          type="button"
          className="song-view-btn song-view-follow"
          onClick={(event) => { event.stopPropagation(); setFollow(true) }}
        >
          Follow
        </button>
      )}
    </div>
  )
}
