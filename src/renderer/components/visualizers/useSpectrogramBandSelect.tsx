import { useCallback, useEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { audioEngine } from '../../audio/AudioEngine'
import { useFrequencyFilterStore } from '../../stores/frequencyFilterStore'
import {
  frequencyAtNormalizedPosition,
  frequencyBoundsForRange,
  normalizedPositionAtFrequency,
  type FrequencyRangeMode,
  type FrequencyScaleMode
} from '../../../types/frequencyScale'
import { formatHz } from '../../../shared/frequencyFilter/plan'
import type { SpectrogramOrientation } from '../../../types/spectrogram'

// A drag can end outside the spectrogram, and the browser then sends the click to a parent. So the "that was a drag"
// mark lives here, where the parent's click handler can also check it.
let suppressClicksUntil = 0
export function isSpectrogramBandDragClick(): boolean {
  return performance.now() < suppressClicksUntil
}

const DRAG_START_PX = 4
const EDGE_GRAB_PX = 8
const MIN_FRACTION = 0.015

type DragKind = 'new' | 'low' | 'high' | 'move'

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/**
 * Drag along the frequency axis of a spectrogram to hear only that band (Solo) or everything except it (Cut).
 * A plain click is left alone, so clicking the docked spectrogram still opens the big panel.
 * Drag the shaded band's edges to resize it, drag inside it to slide it.
 */
export function useSpectrogramBandSelect({
  containerRef,
  orientation,
  scaleMode,
  rangeMode
}: {
  containerRef: RefObject<HTMLElement | null>
  orientation: SpectrogramOrientation
  scaleMode: FrequencyScaleMode
  rangeMode: FrequencyRangeMode
}): {
  surfaceProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void
  }
  layer: ReactNode
} {
  const range = useFrequencyFilterStore((s) => s.range)
  const supported = useFrequencyFilterStore((s) => s.supported)
  const followVectorscope = useFrequencyFilterStore((s) => s.followVectorscope)
  const setFollowVectorscope = useFrequencyFilterStore((s) => s.setFollowVectorscope)
  const setRange = useFrequencyFilterStore((s) => s.setRange)
  const setMode = useFrequencyFilterStore((s) => s.setMode)
  const clear = useFrequencyFilterStore((s) => s.clear)
  const refreshSupported = useFrequencyFilterStore((s) => s.refreshSupported)
  const vertical = orientation === 'vertical'
  const suppressClickRef = useRef(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    refreshSupported()
    const off = audioEngine.on('stateChange', refreshSupported)
    return () => off?.()
  }, [refreshSupported])

  // Esc drops the band, unless something else is using Esc right now.
  useEffect(() => {
    if (!range) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (document.querySelector('.modal-overlay, [role="dialog"], .settings-overlay, .fullscreen-overlay')) return
      clear()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [range, clear])

  useEffect(() => () => cleanupRef.current?.(), [])

  const bounds = useCallback(() => frequencyBoundsForRange(rangeMode, audioEngine.getSampleRate() || 48000), [rangeMode])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('.band-chip')) return
    const surface = containerRef.current
    if (!surface) return
    const rect = surface.getBoundingClientRect()
    const span = vertical ? rect.width : rect.height
    if (span <= 0 || rect.width <= 0 || rect.height <= 0) return

    const fractionAt = (clientX: number, clientY: number): number =>
      clamp01(vertical ? (clientX - rect.left) / rect.width : 1 - (clientY - rect.top) / rect.height)
    const { minFrequency, maxFrequency } = bounds()
    const hzAt = (fraction: number): number => frequencyAtNormalizedPosition(fraction, minFrequency, maxFrequency, scaleMode)
    const fractionOf = (hz: number): number => normalizedPositionAtFrequency(hz, minFrequency, maxFrequency, scaleMode)

    const startX = event.clientX
    const startY = event.clientY
    const startFraction = fractionAt(startX, startY)
    const current = useFrequencyFilterStore.getState().range
    let kind: DragKind = 'new'
    let lowAtStart = 0
    let highAtStart = 0
    if (current) {
      lowAtStart = fractionOf(current.lowHz)
      highAtStart = fractionOf(current.highHz)
      const grab = EDGE_GRAB_PX / span
      if (Math.abs(startFraction - lowAtStart) <= grab) kind = 'low'
      else if (Math.abs(startFraction - highAtStart) <= grab) kind = 'high'
      else if (startFraction > lowAtStart && startFraction < highAtStart) kind = 'move'
    }

    let dragging = false
    const apply = (clientX: number, clientY: number) => {
      const fraction = fractionAt(clientX, clientY)
      let low = lowAtStart
      let high = highAtStart
      if (kind === 'new') {
        low = Math.min(startFraction, fraction)
        high = Math.max(startFraction, fraction)
      } else if (kind === 'low') {
        low = Math.min(fraction, highAtStart - MIN_FRACTION)
      } else if (kind === 'high') {
        high = Math.max(fraction, lowAtStart + MIN_FRACTION)
      } else {
        const width = highAtStart - lowAtStart
        const shifted = Math.max(0, Math.min(1 - width, lowAtStart + (fraction - startFraction)))
        low = shifted
        high = shifted + width
      }
      if (high - low < MIN_FRACTION) high = Math.min(1, low + MIN_FRACTION)
      setRange(hzAt(low), hzAt(high))
    }

    const onMove = (move: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) < DRAG_START_PX) return
        dragging = true
        suppressClickRef.current = true
        document.documentElement.classList.add('band-selecting')
      }
      apply(move.clientX, move.clientY)
    }
    const stop = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      document.documentElement.classList.remove('band-selecting')
      cleanupRef.current = null
      // The click that follows a drag must not also open or close anything underneath.
      if (suppressClickRef.current) {
        suppressClicksUntil = performance.now() + 300
        window.setTimeout(() => { suppressClickRef.current = false }, 60)
      }
    }
    cleanupRef.current?.()
    cleanupRef.current = stop
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }, [bounds, containerRef, scaleMode, setRange, vertical])

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current) return
    suppressClickRef.current = false
    event.stopPropagation()
    event.preventDefault()
  }, [])

  let layer: ReactNode = null
  if (range) {
    const { minFrequency, maxFrequency } = bounds()
    const low = clamp01(normalizedPositionAtFrequency(range.lowHz, minFrequency, maxFrequency, scaleMode))
    const high = clamp01(normalizedPositionAtFrequency(range.highHz, minFrequency, maxFrequency, scaleMode))
    const bandStyle = vertical
      ? { left: `${low * 100}%`, width: `${Math.max(0, high - low) * 100}%`, top: 0, bottom: 0 }
      : { bottom: `${low * 100}%`, height: `${Math.max(0, high - low) * 100}%`, left: 0, right: 0 }
    layer = (
      <div className={`band-layer ${vertical ? 'is-vertical' : 'is-horizontal'}${supported ? '' : ' is-unsupported'}`}>
        <div className={`band-overlay band-${range.mode}`} style={bandStyle}>
          <div className="band-edge band-edge-low" />
          <div className="band-edge band-edge-high" />
        </div>
        <div className="band-chip" role="group" aria-label="Frequency band">
          {supported ? (
            <>
              <span className="band-chip-range">{formatHz(range.lowHz)} – {formatHz(range.highHz)}</span>
              <button
                type="button"
                className={range.mode === 'solo' ? 'is-active' : ''}
                onClick={() => setMode('solo')}
                title="Hear only this band"
              >Solo</button>
              <button
                type="button"
                className={range.mode === 'cut' ? 'is-active' : ''}
                onClick={() => setMode('cut')}
                title="Hear everything except this band"
              >Cut</button>
              <button
                type="button"
                className={followVectorscope ? 'is-active' : ''}
                aria-pressed={followVectorscope}
                onClick={() => setFollowVectorscope(!followVectorscope)}
                title={followVectorscope ? 'The vectorscope shows only what you hear. Click to show the full sound.' : 'Make the vectorscope show only what you hear'}
              >Vectorscope</button>
            </>
          ) : (
            <span className="band-chip-range">Not available in bit-perfect output</span>
          )}
          <button type="button" className="band-chip-close" onClick={clear} aria-label="Clear frequency band" title="Clear (Esc)">×</button>
        </div>
      </div>
    )
  }

  return { surfaceProps: { onPointerDown, onClickCapture }, layer }
}
