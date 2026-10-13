import { create } from 'zustand'
import { audioEngine } from '../audio/AudioEngine'
import { useFrequencyFilterStore } from './frequencyFilterStore'
import { polygonBandAtTime, polygonTimeExtent, type SelectionPoint } from '../../shared/audio/selectionGeometry'

export type LoopTool = 'none' | 'marquee' | 'lasso' | 'band'

export type LoopSelection =
  | { kind: 'marquee'; t0: number; t1: number; lowHz: number; highHz: number }
  | { kind: 'lasso'; points: SelectionPoint[] }

interface LoopSelectionState {
  tool: LoopTool
  selection: LoopSelection | null
  /** Corners placed so far while a lasso shape is still open. Nothing loops until it is closed. */
  draft: SelectionPoint[]
  /** A short message when a selection could not start looping. */
  notice: string | null
  setTool: (tool: LoopTool) => void
  setDraft: (points: SelectionPoint[]) => void
  commitMarquee: (t0: number, t1: number, lowHz: number, highHz: number) => Promise<void>
  commitLasso: (points: SelectionPoint[]) => Promise<void>
  /** Stop looping and let the song carry on from where it is. */
  clearSelection: () => void
  /** While a corner is being dragged: redraw the shape and move the band with it, without restarting the loop. */
  reshapeLive: (selection: LoopSelection) => void
}

let driver: ReturnType<typeof setInterval> | null = null
// The shape the band follows. Dragging a corner swaps this while the loop keeps playing.
let driverPoints: SelectionPoint[] = []

function stopDriver(): void {
  if (driver) clearInterval(driver)
  driver = null
}

/** While a lasso loops, keep the solo band on the shape's frequencies at the moment being played. */
function startLassoDriver(points: SelectionPoint[]): void {
  stopDriver()
  driverPoints = points
  let lastLow = 0
  let lastHigh = 0
  const tick = (): void => {
    const band = polygonBandAtTime(driverPoints, audioEngine.currentTime)
    if (!band) return
    const changed = Math.abs(band.lowHz / Math.max(1, lastLow) - 1) > 0.01 || Math.abs(band.highHz / Math.max(1, lastHigh) - 1) > 0.01
    if (!changed) return
    lastLow = band.lowHz
    lastHigh = band.highHz
    useFrequencyFilterStore.getState().setRange(band.lowHz, Math.max(band.highHz, band.lowHz * 1.02))
  }
  driver = setInterval(tick, 30)
  tick()
}

let noticeTimer: ReturnType<typeof setTimeout> | null = null
function reportFailure(set: (partial: { notice: string | null; draft?: SelectionPoint[] }) => void, error?: unknown): void {
  const reason = error
    ? `Could not start the loop: ${error instanceof Error ? error.message : String(error)}`
    : audioEngine.getShuttleBlockReason() ?? 'The selection was too short to loop.'
  console.warn('[loop selection] could not start looping:', reason)
  set({ notice: reason, draft: [] })
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => useLoopSelectionStore.setState({ notice: null }), 6000)
}

export const useLoopSelectionStore = create<LoopSelectionState>((set, get) => ({
  tool: 'none',
  selection: null,
  draft: [],
  notice: null,
  setTool: (tool) => {
    // Leaving a tool drops a half-drawn shape; a finished selection keeps looping until it is cleared.
    set({ tool: get().tool === tool ? 'none' : tool, draft: [] })
  },
  setDraft: (draft) => set({ draft }),
  commitMarquee: async (t0, t1, lowHz, highHz) => {
    try {
      get().clearSelection()
      console.info('[loop selection] box', { t0, t1, lowHz, highHz })
      const ok = await audioEngine.setLoopRegion(Math.min(t0, t1), Math.max(t0, t1))
      if (!ok) { reportFailure(set); return }
      const filter = useFrequencyFilterStore.getState()
      filter.clear()
      filter.setRange(Math.min(lowHz, highHz), Math.max(lowHz, highHz))
    } catch (error) {
      console.error('[loop selection] box failed', error)
      audioEngine.clearLoopRegion()
      reportFailure(set, error)
      return
    }
    console.info('[loop selection] looping', audioEngine.getLoopRegion())
    set({ selection: { kind: 'marquee', t0: Math.min(t0, t1), t1: Math.max(t0, t1), lowHz: Math.min(lowHz, highHz), highHz: Math.max(lowHz, highHz) }, draft: [] })
  },
  commitLasso: async (points) => {
    const extent = polygonTimeExtent(points)
    if (!extent || points.length < 3) return
    try {
      get().clearSelection()
      console.info('[loop selection] lasso', { points: points.length, extent })
      const ok = await audioEngine.setLoopRegion(extent.start, extent.end)
      if (!ok) { reportFailure(set); return }
      useFrequencyFilterStore.getState().clear()
    } catch (error) {
      console.error('[loop selection] lasso failed', error)
      audioEngine.clearLoopRegion()
      reportFailure(set, error)
      return
    }
    console.info('[loop selection] looping', audioEngine.getLoopRegion())
    set({ selection: { kind: 'lasso', points: points.map((p) => ({ ...p })) }, draft: [] })
    startLassoDriver(points)
  },
  reshapeLive: (selection) => {
    set({ selection })
    if (selection.kind === 'lasso') {
      driverPoints = selection.points
    } else {
      useFrequencyFilterStore.getState().setRange(selection.lowHz, selection.highHz)
    }
  },
  clearSelection: () => {
    const had = get().selection !== null
    stopDriver()
    if (had) {
      set({ selection: null })
      useFrequencyFilterStore.getState().clear()
    }
    audioEngine.clearLoopRegion()
  }
}))

// The engine ends the loop by itself when the song changes or you jump outside it: drop the shape and the band too.
audioEngine.on('loopRegionChange', (region) => {
  if (region === null && useLoopSelectionStore.getState().selection) {
    stopDriver()
    useLoopSelectionStore.setState({ selection: null })
    useFrequencyFilterStore.getState().clear()
  }
})
