import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { audioEngine } from '../../audio/AudioEngine'
import { Scratcher } from '../../audio/scratchScrubber'
import { createSongSpectrogramJob, mixToMono, type SongSpectrogram } from '../../audio/songSpectrogram'
import { buildHeatLUT, LEGACY_DEFAULT_HEAT_COLORS } from '../../audio/visualizers/Spectrogram'
import { usePlayerStore } from '../../stores/playerStore'
import { followCenter, resolveSongView, songViewCursor, useSongViewStore, useSpectrogramFlowStore } from '../../stores/songViewStore'
import { useLoopSelectionStore, type LoopSelection } from '../../stores/loopSelectionStore'
import { isNear, simplifyPath } from '../../../shared/audio/selectionGeometry'
import {
  frequencyAtNormalizedPosition,
  frequencyBoundsForRange,
  normalizedPositionAtFrequency,
  type FrequencyRangeMode,
  type FrequencyScaleMode
} from '../../../types/frequencyScale'
import type { SpectrogramOrientation } from '../../../types/spectrogram'
import { isSpectrogramBandDragClick } from './useSpectrogramBandSelect'

const ROWS = 640

// The spectrogram's own colours (dark purple through magenta and orange to cream), so the playhead and the bar
// under it look like part of the picture. 0 is the quietest colour and 1 the loudest.
let heatLut: Uint8ClampedArray | null = null
function heatCss(t: number, alpha = 1): string {
  if (!heatLut) heatLut = buildHeatLUT(LEGACY_DEFAULT_HEAT_COLORS)
  const i = Math.round(Math.max(0, Math.min(1, t)) * 255) * 4
  return `rgba(${heatLut[i]}, ${heatLut[i + 1]}, ${heatLut[i + 2]}, ${alpha})`
}
const MAX_COLUMNS = 30000
const DEFAULT_WINDOW_SECONDS = 24
const MIN_WINDOW_SECONDS = 4
const MAX_WINDOW_SECONDS = 240

interface ViewMapper {
  toPx: (t: number, hz: number) => { x: number; y: number }
  fromPx: (x: number, y: number) => { t: number; hz: number }
}

/** Turns (time, frequency) into a spot on the picture and back, for whichever way the picture is laid out. */
function makeMapper(o: {
  W: number
  H: number
  t0: number
  windowSeconds: number
  vertical: boolean
  laterAtTop: boolean
  minHz: number
  maxHz: number
  scaleMode: FrequencyScaleMode
}): ViewMapper {
  const { W, H, t0, windowSeconds, vertical, laterAtTop, minHz, maxHz, scaleMode } = o
  return {
    toPx: (t, hz) => {
      const pos = normalizedPositionAtFrequency(hz, minHz, maxHz, scaleMode)
      const f = (t - t0) / windowSeconds
      return vertical
        ? { x: pos * W, y: (laterAtTop ? 1 - f : f) * H }
        : { x: f * W, y: (1 - pos) * H }
    },
    fromPx: (x, y) => {
      const clamp = (v: number): number => Math.max(0, Math.min(1, v))
      const pos = clamp(vertical ? x / Math.max(1, W) : 1 - y / Math.max(1, H))
      const f = vertical ? (laterAtTop ? 1 - y / Math.max(1, H) : y / Math.max(1, H)) : x / Math.max(1, W)
      return { t: t0 + f * windowSeconds, hz: frequencyAtNormalizedPosition(pos, minHz, maxHz, scaleMode) }
    }
  }
}

const HANDLE_HIT_PX = 9
const MAX_LASSO_CORNERS = 24

/** The draggable corners of a selection, as spots on the picture. A box has eight (corners and edge middles). */
function selectionHandles(sel: LoopSelection, mapper: ViewMapper): { id: string; x: number; y: number }[] {
  if (sel.kind === 'lasso') {
    return sel.points.map((p, i) => ({ id: String(i), ...mapper.toPx(p.t, p.hz) }))
  }
  const out: { id: string; x: number; y: number }[] = []
  for (const tEdge of ['lo', 'mid', 'hi'] as const) {
    for (const fEdge of ['lo', 'mid', 'hi'] as const) {
      if (tEdge === 'mid' && fEdge === 'mid') continue
      const t = tEdge === 'lo' ? sel.t0 : tEdge === 'hi' ? sel.t1 : (sel.t0 + sel.t1) / 2
      const hz = fEdge === 'lo' ? sel.lowHz : fEdge === 'hi' ? sel.highHz : Math.sqrt(sel.lowHz * sel.highHz)
      out.push({ id: `${tEdge}:${fEdge}`, ...mapper.toPx(t, hz) })
    }
  }
  return out
}

/** The selection after one handle is dragged to a new (time, Hz). */
function moveHandle(sel: LoopSelection, id: string, to: { t: number; hz: number }): LoopSelection {
  if (sel.kind === 'lasso') {
    const index = Number(id)
    return { kind: 'lasso', points: sel.points.map((p, i) => (i === index ? { t: to.t, hz: to.hz } : p)) }
  }
  const [tEdge, fEdge] = id.split(':')
  let { t0, t1, lowHz, highHz } = sel
  if (tEdge === 'lo') t0 = to.t
  else if (tEdge === 'hi') t1 = to.t
  if (fEdge === 'lo') lowHz = to.hz
  else if (fEdge === 'hi') highHz = to.hz
  return { kind: 'marquee', t0: Math.min(t0, t1), t1: Math.max(t0, t1), lowHz: Math.min(lowHz, highHz), highHz: Math.max(lowHz, highHz) }
}

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
  const trackPath = usePlayerStore((s) => s.currentTrack?.path ?? null)
  const trackDuration = usePlayerStore((s) => s.duration)
  const [spec, setSpec] = useState<SongSpectrogram | null>(null)
  const [drawProgress, setDrawProgress] = useState<number | null>(null)
  const [waitAttempts, setWaitAttempts] = useState<number>(0)
  // How far the song itself has loaded, when the player knows (a whole number of percent).
  const loadPercent = usePlayerStore((state) => {
    const progress = state.remoteLoadProgress
    if (state.playbackState !== 'loading' || !progress || !state.currentTrack || progress.path !== state.currentTrack.path) return null
    return typeof progress.percent === 'number' ? Math.round(Math.max(0, Math.min(1, progress.percent)) * 100) : null
  })
  const [status, setStatus] = useState<'waiting' | 'computing' | 'ready' | 'unavailable'>('waiting')
  const following = useSongViewStore((s) => s.following)
  // Tall view only: which way time runs. Later at the top when the newest sound is shown at the top.
  const laterAtTop = useSpectrogramFlowStore((s) => s.newestAtTop)
  const setFollowing = useSongViewStore((s) => s.setFollowing)
  const imageRef = useRef<HTMLCanvasElement | null>(null)
  const lastDrawKeyRef = useRef('')
  const tool = useLoopSelectionStore((s) => s.tool)
  const selection = useLoopSelectionStore((s) => s.selection)
  const draft = useLoopSelectionStore((s) => s.draft)
  const loopNotice = useLoopSelectionStore((s) => s.notice)
  // A box being dragged, and the pointer's last spot while a lasso is open (both in song time / Hz).
  const dragRef = useRef<{ a: { t: number; hz: number }; b: { t: number; hz: number } } | null>(null)
  const hoverRef = useRef<{ x: number; y: number } | null>(null)
  // A shape traced by dragging with the Lasso tool (song time / Hz).
  const freehandRef = useRef<{ t: number; hz: number }[] | null>(null)

  const currentMapper = useCallback((): { mapper: ViewMapper; rect: DOMRect } | null => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || !spec || rect.width < 2 || rect.height < 2) return null
    const view = resolveSongView(
      useSongViewStore.getState().following ? followCenter(audioEngine.currentTime, songViewCursor.windowSeconds, spec.durationSeconds) : songViewCursor.center,
      songViewCursor.windowSeconds,
      spec.durationSeconds
    )
    const bounds = frequencyBoundsForRange(rangeMode, audioEngine.getSampleRate() || 48000)
    return {
      rect,
      mapper: makeMapper({
        W: rect.width, H: rect.height, t0: view.start, windowSeconds: view.window, vertical, laterAtTop,
        minHz: bounds.minFrequency, maxHz: bounds.maxFrequency, scaleMode
      })
    }
  }, [spec, rangeMode, scaleMode, vertical, laterAtTop])

  // Redraw when the selection changes; forget a half-drawn shape when the song changes.
  useEffect(() => { songViewCursor.dirty = true }, [selection, draft, tool])
  useEffect(() => { useLoopSelectionStore.getState().setDraft([]) }, [trackPath])

  const setFollow = useCallback((value: boolean) => {
    setFollowing(value)
    songViewCursor.anchorStart = null
    songViewCursor.dirty = true
  }, [setFollowing])

  // Build the picture for the current song.
  useEffect(() => {
    setSpec(null)
    setDrawProgress(null)
    imageRef.current = null
    if (!trackPath) { setStatus('waiting'); return }
    setStatus('waiting')
    setFollow(true)
    songViewCursor.windowSeconds = DEFAULT_WINDOW_SECONDS
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
        const why = !decoded
          ? 'no decoded song in memory'
          : decoded.trackPath !== trackPath
            ? `decoded song is a different track (${decoded.trackPath})`
            : decoded.buffer.duration <= 1
              ? 'decoded buffer is under 1 second'
              : `decoded ${decoded.buffer.duration.toFixed(1)}s but the track is ${trackDuration.toFixed(1)}s`
        const info = { attempt: attempts, of: 25, why, track: trackPath, trackDuration, engine: audioEngine.getLoadDiagnostics() }
        console.info('[song view] waiting for the song ' + JSON.stringify(info))
        setWaitAttempts(attempts)
        // Streams and bit-perfect output never keep the decoded song around.
        if (attempts > 25) { console.warn('[song view] gave up waiting for the song'); setStatus('unavailable'); return }
        timer = setTimeout(begin, 800)
        return
      }
      console.info('[song view] song ready, drawing', { seconds: decoded.buffer.duration, sampleRate: decoded.buffer.sampleRate })
      setWaitAttempts(0)
      setStatus('computing')
      const { buffer } = decoded
      const mono = mixToMono(buffer)
      const bounds = frequencyBoundsForRange(rangeMode, buffer.sampleRate)
      const columnsPerSecond = Math.max(4, Math.min(40, MAX_COLUMNS / Math.max(1, buffer.duration)))
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
      // Show what is done so far (the start of the song first) and keep filling in the rest.
      let lastShown = 0
      const tick = (): void => {
        if (cancelled) return
        if (job.step(10)) {
          setSpec({ ...job.result() })
          setDrawProgress(null)
          setStatus('ready')
          return
        }
        const nowMs = performance.now()
        if (nowMs - lastShown > 500) {
          lastShown = nowMs
          setSpec({ ...job.result() })
          setDrawProgress(job.progress())
          setStatus('ready')
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
        const y = vertical ? (laterAtTop ? spec.columns - 1 - c : c) : spec.rows - 1 - r
        const o = (y * width + x) * 4
        out[o] = lut[li]; out[o + 1] = lut[li + 1]; out[o + 2] = lut[li + 2]; out[o + 3] = lut[li + 3]
      }
    }
    ctx.putImageData(image, 0, 0)
    imageRef.current = canvas
    songViewCursor.dirty = true
  }, [spec, contrast, vertical, laterAtTop])

  // Draw loop: follows the music, or shows wherever the strip was dragged.
  useEffect(() => {
    const canvas = canvasRef.current
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

    // The picture only needs about 30 redraws a second to look smooth while following the music (it moves a pixel or
    // two per frame); redrawing the whole thing 60-120 times a second kept the GPU and fans busy for nothing.
    let lastFrameAt = 0
    const frame = (): void => {
      if (stopped) return
      raf = requestAnimationFrame(frame)
      const frameAt = performance.now()
      if (!songViewCursor.dirty && frameAt - lastFrameAt < 32) return
      lastFrameAt = frameAt
      const rect = wrap.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const resized = sizeCanvas(canvas, rect.width, rect.height)
      const duration = spec?.durationSeconds ?? 0
      const view = resolveSongView(
        useSongViewStore.getState().following ? followCenter(audioEngine.currentTime, songViewCursor.windowSeconds, duration) : songViewCursor.center,
        songViewCursor.windowSeconds,
        duration
      )
      const now = view.center
      const windowSeconds = view.window
      const shownTime = songViewCursor.scrubTime ?? audioEngine.currentTime
      const key = `${now.toFixed(3)}|${shownTime.toFixed(3)}|${windowSeconds}|${rect.width}|${rect.height}`
      if (!resized && !songViewCursor.dirty && key === lastDrawKeyRef.current) return
      lastDrawKeyRef.current = key
      songViewCursor.dirty = false

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
            if (laterAtTop) {
              const dy0 = (1 - (b - t0) / windowSeconds) * H
              const dy1 = (1 - (a - t0) / windowSeconds) * H
              ctx.drawImage(image, 0, spec.columns - b * cps, image.width, (b - a) * cps, 0, dy0, W, dy1 - dy0)
            } else {
              const dy0 = ((a - t0) / windowSeconds) * H
              const dy1 = ((b - t0) / windowSeconds) * H
              ctx.drawImage(image, 0, a * cps, image.width, (b - a) * cps, 0, dy0, W, dy1 - dy0)
            }
          }
        }
      }
      // Playhead.
      const current = songViewCursor.scrubTime ?? audioEngine.currentTime
      const phFraction = (current - t0) / windowSeconds
      if (phFraction >= 0 && phFraction <= 1) {
        ctx.save()
        ctx.strokeStyle = heatCss(0.78, 1)
        ctx.shadowColor = heatCss(0.55, 1)
        ctx.shadowBlur = 8
        ctx.lineWidth = 2
        ctx.beginPath()
        if (!vertical) { const x = phFraction * W; ctx.moveTo(x, 0); ctx.lineTo(x, H) }
        else { const y = (laterAtTop ? 1 - phFraction : phFraction) * H; ctx.moveTo(0, y); ctx.lineTo(W, y) }
        ctx.stroke()
        ctx.restore()
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
        const startLabel = formatClock(Math.max(0, t0))
        const endLabel = formatClock(Math.min(duration, t0 + windowSeconds))
        ctx.textBaseline = 'top'; ctx.fillText(laterAtTop ? endLabel : startLabel, 4, 14)
        ctx.textBaseline = 'bottom'; ctx.fillText(laterAtTop ? startLabel : endLabel, 4, H - 2)
      }

      // Selections: the looping box or shape, a shape being drawn, and a box being dragged.
      const bounds = frequencyBoundsForRange(rangeMode, audioEngine.getSampleRate() || 48000)
      const mapper = makeMapper({
        W, H, t0, windowSeconds, vertical, laterAtTop,
        minHz: bounds.minFrequency, maxHz: bounds.maxFrequency, scaleMode
      })
      const loopState = useLoopSelectionStore.getState()
      const outline = heatCss(0.85, 1)
      const fill = heatCss(0.6, 0.16)
      const traceShape = (pts: { t: number; hz: number }[]): void => {
        ctx.beginPath()
        pts.forEach((pt, i) => {
          const q = mapper.toPx(pt.t, pt.hz)
          if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y)
        })
      }
      const sel = loopState.selection
      if (sel) {
        ctx.save()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = outline
        ctx.fillStyle = fill
        ctx.setLineDash([6, 4])
        if (sel.kind === 'marquee') {
          const p0 = mapper.toPx(sel.t0, sel.lowHz)
          const p1 = mapper.toPx(sel.t1, sel.highHz)
          const x = Math.min(p0.x, p1.x), y = Math.min(p0.y, p1.y)
          ctx.fillRect(x, y, Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y))
          ctx.strokeRect(x, y, Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y))
        } else {
          traceShape(sel.points)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        }
        ctx.restore()
      }
      if (sel && loopState.tool !== 'none') {
        ctx.save()
        ctx.fillStyle = '#ffffff'
        ctx.strokeStyle = outline
        ctx.lineWidth = 1.5
        for (const handle of selectionHandles(sel, mapper)) {
          ctx.beginPath()
          ctx.rect(handle.x - 4, handle.y - 4, 8, 8)
          ctx.fill()
          ctx.stroke()
        }
        ctx.restore()
      }
      const drag = dragRef.current
      if (drag) {
        const p0 = mapper.toPx(drag.a.t, drag.a.hz)
        const p1 = mapper.toPx(drag.b.t, drag.b.hz)
        ctx.save()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = outline
        ctx.fillStyle = fill
        ctx.fillRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y))
        ctx.strokeRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y))
        ctx.restore()
      }
      const free = freehandRef.current
      if (free && free.length > 1) {
        ctx.save()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = outline
        ctx.fillStyle = fill
        traceShape(free)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
      if (loopState.draft.length > 0) {
        ctx.save()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = outline
        traceShape(loopState.draft)
        const hover = hoverRef.current
        if (hover) ctx.lineTo(hover.x, hover.y)
        ctx.stroke()
        loopState.draft.forEach((pt, i) => {
          const q = mapper.toPx(pt.t, pt.hz)
          ctx.fillStyle = i === 0 ? '#ffffff' : outline
          ctx.beginPath()
          ctx.arc(q.x, q.y, i === 0 ? 5 : 3, 0, Math.PI * 2)
          ctx.fill()
        })
        ctx.restore()
      }
    }
    raf = requestAnimationFrame(frame)
    return () => { stopped = true; cancelAnimationFrame(raf) }
  }, [spec, vertical, laterAtTop, backgroundColor, labelColor, rangeMode, scaleMode])

  // Keys like Audition: + (or =) zooms in on the time axis, - zooms out, while the pointer is over the picture. Same as pinching.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || !spec) return
    // Remember where the pointer last was and check it against the picture when a key is pressed, so it works the moment
    // the pointer is over the picture, without clicking it first (and even if the picture appeared under a still pointer).
    let pointer: { x: number; y: number } | null = null
    const onMove = (event: PointerEvent): void => { pointer = { x: event.clientX, y: event.clientY } }
    const isOver = (): boolean => {
      if (!pointer) return false
      const rect = wrap.getBoundingClientRect()
      return pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || !isOver()) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return
      const zoomIn = event.key === '+' || event.key === '=' || event.code === 'NumpadAdd'
      const zoomOut = event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract'
      if (!zoomIn && !zoomOut) return
      event.preventDefault()
      event.stopPropagation()
      songViewCursor.anchorStart = null
      const factor = zoomIn ? 1 / 1.3 : 1.3
      songViewCursor.windowSeconds = Math.min(MAX_WINDOW_SECONDS, spec.durationSeconds, Math.max(MIN_WINDOW_SECONDS, songViewCursor.windowSeconds * factor))
      songViewCursor.dirty = true
    }
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerdown', onMove, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerdown', onMove, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [spec])

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
        songViewCursor.anchorStart = null
        songViewCursor.windowSeconds = Math.min(MAX_WINDOW_SECONDS, spec.durationSeconds, Math.max(MIN_WINDOW_SECONDS, songViewCursor.windowSeconds * factor))
        songViewCursor.dirty = true
        return
      }
      const rect = wrap.getBoundingClientRect()
      const span = vertical ? rect.height : rect.width
      const secondsPerPixel = songViewCursor.windowSeconds / Math.max(1, span)
      const delta = vertical ? -event.deltaY : (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY)
      if (useSongViewStore.getState().following) {
        songViewCursor.center = resolveSongView(followCenter(audioEngine.currentTime, songViewCursor.windowSeconds, spec.durationSeconds), songViewCursor.windowSeconds, spec.durationSeconds).center
      }
      songViewCursor.center = resolveSongView(songViewCursor.center + delta * secondsPerPixel, songViewCursor.windowSeconds, spec.durationSeconds).center
      setFollow(false)
    }
    wrap.addEventListener('wheel', onWheel, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheel)
  }, [spec, vertical, setFollow])

  // Marquee: drag a box. Lasso: click corners, then click the first corner (or double-click, or Enter) to close it.
  // Either way the selection then loops until it is cleared. A plain click on a finished selection clears it.
  const onToolPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !spec) return
    event.stopPropagation()
    const start = currentMapper()
    if (!start) return
    const layer = event.currentTarget
    const loop = useLoopSelectionStore.getState()
    const x0 = event.clientX - start.rect.left
    const y0 = event.clientY - start.rect.top
    const anchor = start.mapper.fromPx(x0, y0)
    layer.setPointerCapture(event.pointerId)

    // Grabbing a corner of the current selection reshapes it, whichever way you pull.
    const existing = loop.selection
    if (existing) {
      const grabbed = selectionHandles(existing, start.mapper).find((h) => isNear(x0, y0, h.x, h.y, HANDLE_HIT_PX))
      if (grabbed) {
        let latest: LoopSelection = existing
        const onReshape = (e: PointerEvent): void => {
          const now = currentMapper()
          if (!now) return
          latest = moveHandle(latest, grabbed.id, now.mapper.fromPx(e.clientX - now.rect.left, e.clientY - now.rect.top))
          useLoopSelectionStore.getState().reshapeLive(latest)
          songViewCursor.dirty = true
        }
        const endReshape = (e: PointerEvent, commit: boolean): void => {
          layer.removeEventListener('pointermove', onReshape)
          layer.removeEventListener('pointerup', onReshapeUp)
          layer.removeEventListener('pointercancel', onReshapeCancel)
          if (!commit) { useLoopSelectionStore.getState().reshapeLive(existing); return }
          void e
          const state = useLoopSelectionStore.getState()
          if (latest.kind === 'lasso') void state.commitLasso(latest.points)
          else void state.commitMarquee(latest.t0, latest.t1, latest.lowHz, latest.highHz)
        }
        const onReshapeUp = (e: PointerEvent): void => endReshape(e, true)
        const onReshapeCancel = (e: PointerEvent): void => endReshape(e, false)
        layer.addEventListener('pointermove', onReshape)
        layer.addEventListener('pointerup', onReshapeUp)
        layer.addEventListener('pointercancel', onReshapeCancel)
        return
      }
    }
    let moved = false
    let lastTrace = { x: x0, y: y0 }
    const onMove = (e: PointerEvent): void => {
      const now = currentMapper()
      if (!now) return
      const x = e.clientX - now.rect.left
      const y = e.clientY - now.rect.top
      hoverRef.current = { x, y }
      if (loop.tool === 'lasso' && useLoopSelectionStore.getState().draft.length === 0) {
        // Dragging with the Lasso traces a freehand shape; letting go closes it.
        if (!moved && !isNear(x, y, x0, y0, 5)) {
          moved = true
          freehandRef.current = [anchor]
          lastTrace = { x: x0, y: y0 }
        }
        if (moved && freehandRef.current && freehandRef.current.length < 600 && !isNear(x, y, lastTrace.x, lastTrace.y, 4)) {
          freehandRef.current.push(now.mapper.fromPx(x, y))
          lastTrace = { x, y }
        }
      }
      if (loop.tool === 'marquee') {
        if (!moved && !isNear(x, y, now.mapper.toPx(anchor.t, anchor.hz).x, now.mapper.toPx(anchor.t, anchor.hz).y, 5)) moved = true
        if (moved) dragRef.current = { a: anchor, b: now.mapper.fromPx(x, y) }
      }
      songViewCursor.dirty = true
    }
    const finish = (e: PointerEvent, commit: boolean): void => {
      layer.removeEventListener('pointermove', onMove)
      layer.removeEventListener('pointerup', onUp)
      layer.removeEventListener('pointercancel', onCancel)
      const drag = dragRef.current
      dragRef.current = null
      const traced = freehandRef.current
      freehandRef.current = null
      songViewCursor.dirty = true
      if (!commit) return
      const state = useLoopSelectionStore.getState()
      if (state.tool === 'lasso' && moved && traced) {
        if (traced.length >= 3) {
          // Boil the traced line down to a handful of corners, so each one can be grabbed and dragged.
          const here = currentMapper()
          let corners = traced
          if (here) {
            const px = traced.map((p) => here.mapper.toPx(p.t, p.hz))
            let tolerance = 5
            let kept = simplifyPath(px, tolerance)
            while (kept.length > MAX_LASSO_CORNERS && tolerance < 200) { tolerance *= 1.4; kept = simplifyPath(px, tolerance) }
            if (kept.length >= 3) corners = kept.map((i) => traced[i])
          }
          setFollow(true)
          void state.commitLasso(corners)
        }
        return
      }
      if (state.tool === 'marquee') {
        if (moved && drag) {
          setFollow(true)
          void state.commitMarquee(drag.a.t, drag.b.t, drag.a.hz, drag.b.hz)
        } else if (spec) {
          // A plain tap with the Box tool moves the playhead there, like tapping without a tool. (Tapping outside
          // a looping box also ends the loop.)
          const here = currentMapper()
          if (here) {
            const t = here.mapper.fromPx(e.clientX - here.rect.left, e.clientY - here.rect.top).t
            if (useSongViewStore.getState().following) {
              const v = resolveSongView(followCenter(audioEngine.currentTime, songViewCursor.windowSeconds, spec.durationSeconds), songViewCursor.windowSeconds, spec.durationSeconds)
              songViewCursor.anchorStart = t < v.start + v.window / 2 ? v.start : null
              songViewCursor.dirty = true
            }
            void usePlayerStore.getState().seek(Math.min(spec.durationSeconds, Math.max(0, t)))
          }
        }
        return
      }
      // Lasso: a click either clears a finished shape, closes the open one, or adds a corner.
      if (state.draft.length === 0 && state.selection) { state.clearSelection(); return }
      const now = currentMapper()
      if (!now) return
      const x = e.clientX - now.rect.left
      const y = e.clientY - now.rect.top
      if (state.draft.length >= 3) {
        const first = now.mapper.toPx(state.draft[0].t, state.draft[0].hz)
        if (isNear(x, y, first.x, first.y, 10)) {
          setFollow(true)
          void state.commitLasso(state.draft)
          return
        }
      }
      state.setDraft([...state.draft, now.mapper.fromPx(x, y)])
    }
    const onUp = (e: PointerEvent): void => finish(e, true)
    const onCancel = (e: PointerEvent): void => finish(e, false)
    layer.addEventListener('pointermove', onMove)
    layer.addEventListener('pointerup', onUp)
    layer.addEventListener('pointercancel', onCancel)
  }, [spec, currentMapper, setFollow])

  const onToolHover = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (useLoopSelectionStore.getState().draft.length === 0) return
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    hoverRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    songViewCursor.dirty = true
  }, [])

  const onToolDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const state = useLoopSelectionStore.getState()
    if (state.tool !== 'lasso') return
    // The first click of the double-click already added a corner at this spot; drop it and close.
    const points = state.draft.length > 3 ? state.draft.slice(0, -1) : state.draft
    if (points.length >= 3) { setFollow(true); void state.commitLasso(points) }
  }, [setFollow])

  useEffect(() => {
    if (tool === 'none' && !selection) return
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const state = useLoopSelectionStore.getState()
      if (event.key === 'Escape') {
        if (state.draft.length > 0) { state.setDraft([]); event.preventDefault() }
        else if (state.selection) { state.clearSelection(); event.preventDefault() }
        else if (state.tool !== 'none') { state.setTool(state.tool); event.preventDefault() }
      } else if (event.key === 'Enter' && state.tool === 'lasso' && state.draft.length >= 3) {
        setFollow(true)
        void state.commitLasso(state.draft)
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tool, selection, setFollow])

  // Dragging along the picture scratches through the song: you grab the music and pull it, and hear it as you go.
  const scrubbedRef = useRef(false)
  const onBodyPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !spec || tool !== 'none') return
    const target = event.target as HTMLElement
    if (target.closest('.song-view-btn, .band-chip, .song-view-tool-layer, .song-tools')) return
    const wrap = wrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const span = Math.max(1, vertical ? rect.height : rect.width)
    const startX = event.clientX
    const startY = event.clientY
    const view = resolveSongView(
      useSongViewStore.getState().following ? followCenter(audioEngine.currentTime, songViewCursor.windowSeconds, spec.durationSeconds) : songViewCursor.center,
      songViewCursor.windowSeconds,
      spec.durationSeconds
    )
    const secondsPerPixel = view.window / span
    const startTime = Math.min(spec.durationSeconds, Math.max(0, audioEngine.currentTime))
    const startCenter = view.center
    const wasPlaying = usePlayerStore.getState().playbackState === 'playing'
    const scrubTarget = audioEngine.getScrubTarget()
    const scratcher = scrubTarget ? new Scratcher(scrubTarget) : null
    let dragging = false
    const onMove = (e: PointerEvent): void => {
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (!dragging) {
        if (Math.hypot(dx, dy) < 5) return
        dragging = true
        scrubbedRef.current = true
        if (wasPlaying) usePlayerStore.getState().pause()
        setFollow(false)
      }
      const pixels = vertical ? (laterAtTop ? dy : -dy) : -dx
      const time = Math.min(spec.durationSeconds, Math.max(0, startTime + pixels * secondsPerPixel))
      songViewCursor.scrubTime = time
      songViewCursor.center = resolveSongView(startCenter + pixels * secondsPerPixel, view.window, spec.durationSeconds).center
      songViewCursor.anchorStart = null
      songViewCursor.dirty = true
      scratcher?.move(time)
    }
    const finish = (commit: boolean): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      const time = songViewCursor.scrubTime
      songViewCursor.scrubTime = null
      songViewCursor.dirty = true
      if (!dragging) return
      // The click that follows the drag must not also jump somewhere.
      window.setTimeout(() => { scrubbedRef.current = false }, 0)
      if (commit && time !== null) {
        void usePlayerStore.getState().seek(time).then(() => {
          if (wasPlaying) void usePlayerStore.getState().play()
        })
        setFollow(true)
      } else if (wasPlaying) {
        void usePlayerStore.getState().play()
      }
    }
    const onUp = (): void => finish(true)
    const onCancel = (): void => finish(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }, [spec, tool, vertical, laterAtTop, setFollow])

  // A tap on the picture jumps the music to that spot.
  const onBodyClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('.song-view-btn, .band-chip, .song-view-tool-layer')) return
    event.stopPropagation()
    if (scrubbedRef.current || isSpectrogramBandDragClick() || !spec) return
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const view = resolveSongView(
      useSongViewStore.getState().following ? followCenter(audioEngine.currentTime, songViewCursor.windowSeconds, spec.durationSeconds) : songViewCursor.center,
      songViewCursor.windowSeconds,
      spec.durationSeconds
    )
    const t0 = view.start
    const fraction = vertical
      ? (laterAtTop ? 1 - (event.clientY - rect.top) / Math.max(1, rect.height) : (event.clientY - rect.top) / Math.max(1, rect.height))
      : (event.clientX - rect.left) / Math.max(1, rect.width)
    const time = Math.min(spec.durationSeconds, Math.max(0, t0 + fraction * view.window))
    // Following: a tap behind the middle moves the playhead there and holds the picture; it follows again once the
    // playhead gets back to the middle. A tap ahead of the middle just re-centres as before.
    if (useSongViewStore.getState().following) {
      songViewCursor.anchorStart = time < view.start + view.window / 2 ? view.start : null
      songViewCursor.dirty = true
    }
    void usePlayerStore.getState().seek(time)
  }, [spec, vertical, laterAtTop])

  return (
    <div ref={wrapRef} className="song-view" onClick={onBodyClick} onPointerDown={onBodyPointerDown}>
      <canvas ref={canvasRef} className="song-view-canvas" />
      {status === 'unavailable' && (
        <div className="song-view-note song-view-note-quiet">Song view needs the normal output.</div>
      )}
      {(status === 'waiting' || status === 'computing') && (
        <div className="song-view-chip" aria-hidden="true">
          {loadPercent !== null ? `${loadPercent}%` : '…'}
          {waitAttempts > 1 && <span className="song-view-chip-retry"> · retry {waitAttempts}</span>}
        </div>
      )}
      {status === 'ready' && drawProgress !== null && <div className="song-view-chip" aria-hidden="true">{Math.round(drawProgress * 100)}%</div>}
      {loopNotice && <div className="song-view-note song-loop-notice">{loopNotice}</div>}
      {(tool === 'marquee' || tool === 'lasso') && status === 'ready' && (
        <div
          className="song-view-tool-layer"
          onPointerDown={onToolPointerDown}
          onPointerMove={onToolHover}
          onDoubleClick={onToolDoubleClick}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      {status === 'ready' && (
        <div className={vertical ? 'song-tools is-vertical' : 'song-tools'} onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            className={tool === 'marquee' ? 'song-view-btn song-tool-btn is-on' : 'song-view-btn song-tool-btn'}
            onClick={(event) => { event.stopPropagation(); useLoopSelectionStore.getState().setTool('marquee') }}
            title="Box: drag a box on the picture and that part of the song, and only its frequencies, plays over and over until you click to clear it."
          >
            ▭ Box
          </button>
          <button
            type="button"
            className={tool === 'lasso' ? 'song-view-btn song-tool-btn is-on' : 'song-view-btn song-tool-btn'}
            onClick={(event) => { event.stopPropagation(); useLoopSelectionStore.getState().setTool('lasso') }}
            title="Lasso: drag to draw any shape freehand (let go to close it), or click corners and click the first corner again (or press Enter) to close it. It loops only what is inside, until you click to clear it."
          >
            ⬠ Lasso
          </button>
          <button
            type="button"
            className={tool === 'band' ? 'song-view-btn song-tool-btn is-on' : 'song-view-btn song-tool-btn'}
            onClick={(event) => { event.stopPropagation(); useLoopSelectionStore.getState().setTool('band') }}
            title="Band: drag up or down on the picture to pick a range of frequencies and hear only that. Click the picture to clear it."
          >
            ≡ Band
          </button>
          {(selection || draft.length > 0) && (
            <button
              type="button"
              className="song-view-btn song-tool-btn"
              onClick={(event) => {
                event.stopPropagation()
                const state = useLoopSelectionStore.getState()
                if (state.selection) state.clearSelection(); else state.setDraft([])
              }}
              title="Stop looping and carry on playing (Esc)"
            >
              ✕ Deselect
            </button>
          )}
        </div>
      )}
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

/**
 * The bar under the picture: the whole song's loudness with the playhead on it. Click or drag along it and the song
 * plays from that spot.
 */
export function SongSpectrogramStrip({ onActivate }: { onActivate?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const waveformData = usePlayerStore((s) => s.waveformData)
  const duration = usePlayerStore((s) => s.duration)
  const setFollowing = useSongViewStore((s) => s.setFollowing)
  // While a song loads, the bar fills in left to right as it buffers (a sweeping glow when the amount is unknown).
  const loadingRef = useRef<{ loading: boolean; fraction: number | null; label: string | null }>({ loading: false, fraction: null, label: null })
  useEffect(() => {
    const sync = (): void => {
      const s = usePlayerStore.getState()
      const progress = s.remoteLoadProgress && s.currentTrack && s.remoteLoadProgress.path === s.currentTrack.path ? s.remoteLoadProgress : null
      const loading = s.playbackState === 'loading'
      loadingRef.current = {
        loading,
        fraction: loading && typeof progress?.percent === 'number' ? Math.max(0, Math.min(1, progress.percent)) : null,
        label: loading
          ? (s.loadingStatus
            ?? (progress?.stage === 'streaming' ? `Streaming • ${Math.floor(progress.bufferedSeconds / 60)}:${String(Math.floor(progress.bufferedSeconds % 60)).padStart(2, '0')} ready` : 'Loading…'))
          : null
      }
    }
    sync()
    return usePlayerStore.subscribe(sync)
  }, [])
  // While dragging, the playhead follows the pointer; the song jumps there when you let go.
  const scrubRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let raf = 0
    let stopped = false
    let lastKey = ''
    let lastFrameAt = 0
    const frame = (): void => {
      if (stopped) return
      raf = requestAnimationFrame(frame)
      const frameAt = performance.now()
      if (frameAt - lastFrameAt < 48) return
      lastFrameAt = frameAt
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const dpr = window.devicePixelRatio || 1
      const pw = Math.max(1, Math.round(rect.width * dpr))
      const ph = Math.max(1, Math.round(rect.height * dpr))
      const resized = canvas.width !== pw || canvas.height !== ph
      if (resized) { canvas.width = pw; canvas.height = ph }
      const position = scrubRef.current ?? audioEngine.currentTime
      const loadState = loadingRef.current
      const sweep = loadState.loading && loadState.fraction === null ? Math.floor(performance.now() / 50) : 0
      const key = `${position.toFixed(2)}|${rect.width}|${rect.height}|${loadState.loading}|${loadState.fraction}|${sweep}`
      if (!resized && key === lastKey) return
      lastKey = key
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const w = rect.width
      const h = rect.height
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = heatCss(0.22, 0.85)
      ctx.fillRect(0, 0, w, h)
      if (waveformData && waveformData.length > 0) {
        const bars = Math.min(Math.floor(w), waveformData.length)
        const playedX = duration > 0 ? (position / duration) * w : 0
        for (let i = 0; i < bars; i++) {
          const v = waveformData[Math.floor((i / bars) * waveformData.length)] ?? 0
          const bh = Math.max(1, v * (h - 4))
          const x = i * (w / bars)
          // The part already played is brighter.
          ctx.fillStyle = x <= playedX ? heatCss(0.72, 0.95) : heatCss(0.5, 0.8)
          ctx.fillRect(x, (h - bh) / 2, Math.max(1, w / bars - 0.3), bh)
        }
      }
      if (loadState.loading) {
        ctx.save()
        if (loadState.fraction !== null) {
          const grad = ctx.createLinearGradient(0, 0, w, 0)
          grad.addColorStop(0, heatCss(0.45, 0.9))
          grad.addColorStop(1, heatCss(0.8, 0.9))
          ctx.fillStyle = grad
          ctx.fillRect(0, 0, w * loadState.fraction, h)
        } else {
          const bandW = Math.max(40, w * 0.25)
          const x0 = ((performance.now() / 12) % (w + bandW)) - bandW
          const grad = ctx.createLinearGradient(x0, 0, x0 + bandW, 0)
          grad.addColorStop(0, heatCss(0.5, 0))
          grad.addColorStop(0.5, heatCss(0.8, 0.8))
          grad.addColorStop(1, heatCss(0.5, 0))
          ctx.fillStyle = grad
          ctx.fillRect(0, 0, w, h)
        }
        if (loadState.label) {
          ctx.fillStyle = '#fff'
          ctx.font = '10px system-ui, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(loadState.label, w / 2, h / 2)
        }
        ctx.restore()
      }
      if (duration > 0 && !loadState.loading) {
        const x = Math.min(w - 3, Math.max(0, (position / duration) * w - 1.5))
        ctx.save()
        ctx.shadowColor = heatCss(0.55, 1)
        ctx.shadowBlur = 6
        ctx.fillStyle = heatCss(0.78)
        ctx.beginPath()
        ctx.roundRect(x, 1, 3, h - 2, 1.5)
        ctx.fill()
        ctx.restore()
      }
    }
    raf = requestAnimationFrame(frame)
    return () => { stopped = true; cancelAnimationFrame(raf) }
  }, [waveformData, duration])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || duration <= 0) return
    event.stopPropagation()
    onActivate?.()
    const strip = event.currentTarget
    strip.setPointerCapture(event.pointerId)
    const timeAt = (clientX: number): number => {
      const rect = strip.getBoundingClientRect()
      return Math.min(duration, Math.max(0, ((clientX - rect.left) / Math.max(1, rect.width)) * duration))
    }
    scrubRef.current = timeAt(event.clientX)
    const onMove = (e: PointerEvent): void => { scrubRef.current = timeAt(e.clientX) }
    const finish = (commit: boolean, e?: PointerEvent): void => {
      strip.removeEventListener('pointermove', onMove)
      strip.removeEventListener('pointerup', onUp)
      strip.removeEventListener('pointercancel', onCancel)
      const target = scrubRef.current
      scrubRef.current = null
      if (commit && target !== null) {
        const time = e ? timeAt(e.clientX) : target
        void usePlayerStore.getState().seek(time)
        // Look at the new spot.
        setFollowing(true)
      }
    }
    const onUp = (e: PointerEvent): void => finish(true, e)
    const onCancel = (): void => finish(false)
    strip.addEventListener('pointermove', onMove)
    strip.addEventListener('pointerup', onUp)
    strip.addEventListener('pointercancel', onCancel)
  }, [duration, onActivate, setFollowing])

  return (
    <canvas
      ref={canvasRef}
      className="song-view-strip"
      onPointerDown={onPointerDown}
      onClick={(event) => event.stopPropagation()}
      title="Click or drag along the song and it plays from there. Scroll on the picture to look around, pinch to zoom."
    />
  )
}
