import { useEffect, useMemo, useRef, useState } from 'react'
import type { ButterchurnVisualizer } from 'butterchurn'
import { audioEngine } from '../../audio/AudioEngine'
import { usePlayerStore } from '../../stores/playerStore'
import { useMilkdropStore } from '../../stores/milkdropStore'
import { useMilkdropBackgroundStore } from '../../stores/milkdropBackgroundStore'
import { applyFilter } from '../../../shared/milkdrop/collections'
import { qualityScale } from '../../../shared/milkdrop/quality'
import { sortPresetNames, stepIndex } from '../../../shared/milkdrop/presets'

interface PresetEntry {
  name: string
  preset: unknown
}

/**
 * Milkdrop drawn behind the whole app (no controls). Uses the same preset, favourites filter
 * and auto-cycle settings as the fullscreen visual. Pauses with playback; unmounted in fullscreen.
 */
export default function MilkdropBackdrop({
  suspended,
  onActiveChange
}: {
  /** True while something else (fullscreen) owns the visual. */
  suspended: boolean
  onActiveChange: (active: boolean) => void
}): React.ReactElement | null {
  const enabled = useMilkdropBackgroundStore((s) => s.enabled)
  const run = enabled && !suspended
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const vizRef = useRef<ButterchurnVisualizer | null>(null)
  const connectedRef = useRef<AudioNode | null>(null)
  const loadedPresetRef = useRef<string | null>(null)
  const forceRef = useRef(0)
  const resizeRef = useRef<(() => void) | null>(null)
  const quality = useMilkdropBackgroundStore((s) => s.quality)
  const fps = useMilkdropBackgroundStore((s) => s.fps)
  const qualityRef = useRef(quality)
  const fpsRef = useRef(fps)
  qualityRef.current = quality
  fpsRef.current = fps
  const [ready, setReady] = useState(false)
  const [presets, setPresets] = useState<PresetEntry[]>([])

  const presetName = useMilkdropStore((s) => s.presetName)
  const setPresetName = useMilkdropStore((s) => s.setPresetName)
  const autoCycleSeconds = useMilkdropStore((s) => s.autoCycleSeconds)
  const blendSeconds = useMilkdropStore((s) => s.blendSeconds)
  const collections = useMilkdropStore((s) => s.collections)
  const filter = useMilkdropStore((s) => s.filter)

  const entries = useMemo(() => {
    const byName = new Map<string, PresetEntry>(presets.map((entry): [string, PresetEntry] => [entry.name, entry]))
    return sortPresetNames([...byName.keys()]).map((name) => byName.get(name) as PresetEntry)
  }, [presets])
  const pool = useMemo(() => applyFilter(entries, filter, collections), [entries, filter, collections])

  useEffect(() => {
    if (!run) return
    let cancelled = false
    let rafId = 0
    let timer = 0
    let observer: ResizeObserver | null = null

    const start = async () => {
      try {
        if (!document.createElement('canvas').getContext('webgl2')) return
        const [{ default: butterchurn }, { default: bundled }] = await Promise.all([import('butterchurn'), import('butterchurn-presets')])
        if (cancelled) return
        const builtIn = Object.entries(bundled.getPresets()).map(([name, preset]) => ({ name, preset }))
        let user: PresetEntry[] = []
        try {
          user = (await window.electronAPI.milkdrop.list()).map((p) => ({ name: p.name, preset: p.preset }))
        } catch {
          // built-ins only
        }
        if (cancelled) return
        setPresets([...builtIn, ...user])

        let context = audioEngine.getAudioContext()
        while (!context && !cancelled) {
          await new Promise((resolve) => window.setTimeout(resolve, 500))
          context = audioEngine.getAudioContext()
        }
        const canvas = canvasRef.current
        if (cancelled || !context || !canvas) return

        const sizeFor = () => {
          const ratio = qualityScale(qualityRef.current, window.devicePixelRatio || 1)
          return { w: Math.max(2, Math.floor(canvas.clientWidth * ratio)), h: Math.max(2, Math.floor(canvas.clientHeight * ratio)) }
        }
        const first = sizeFor()
        canvas.width = first.w
        canvas.height = first.h
        const viz = butterchurn.createVisualizer(context, canvas, { width: first.w, height: first.h, pixelRatio: 1 })
        vizRef.current = viz
        const applySize = () => {
          const { w, h } = sizeFor()
          if (canvas.width === w && canvas.height === h) return
          canvas.width = w
          canvas.height = h
          viz.setRendererSize(w, h)
          forceRef.current = 3
        }
        resizeRef.current = applySize
        observer = new ResizeObserver(applySize)
        observer.observe(canvas)

        const syncAudio = () => {
          const node = audioEngine.getEQAnalyserNode()
          if (!node || node === connectedRef.current) return
          if (connectedRef.current) {
            try { viz.disconnectAudio?.(connectedRef.current) } catch { /* gone */ }
          }
          connectedRef.current = node
          viz.connectAudio(node)
        }
        syncAudio()
        timer = window.setInterval(syncAudio, 500)

        let last = 0
        const frame = (now: number) => {
          rafId = window.requestAnimationFrame(frame)
          const playing = usePlayerStore.getState().playbackState === 'playing'
          if (!playing && forceRef.current <= 0) return
          if (now - last < 1000 / fpsRef.current - 2) return
          last = now
          if (forceRef.current > 0) forceRef.current -= 1
          try {
            viz.render()
          } catch {
            // bad preset; the next change recovers
          }
        }
        rafId = window.requestAnimationFrame(frame)
        setReady(true)
      } catch (error) {
        console.error('Milkdrop background failed to start', error)
      }
    }
    void start()

    return () => {
      cancelled = true
      window.cancelAnimationFrame(rafId)
      window.clearInterval(timer)
      observer?.disconnect()
      const viz = vizRef.current
      if (viz && connectedRef.current) {
        try { viz.disconnectAudio?.(connectedRef.current) } catch { /* ignore */ }
      }
      connectedRef.current = null
      vizRef.current = null
      resizeRef.current = null
      loadedPresetRef.current = null
      setReady(false)
    }
  }, [run])

  useEffect(() => {
    if (!ready || entries.length === 0) return
    const viz = vizRef.current
    if (!viz) return
    const entry = entries.find((e) => e.name === presetName) ?? entries[stepIndex(entries.length, -1, 'random')]
    if (loadedPresetRef.current === entry.name) return
    loadedPresetRef.current = entry.name
    forceRef.current = 12
    try {
      void viz.loadPreset(entry.preset, blendSeconds)
    } catch (error) {
      console.error('Milkdrop preset failed to load', entry.name, error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, entries, presetName])

  useEffect(() => {
    resizeRef.current?.()
  }, [quality])

  useEffect(() => {
    if (!ready || autoCycleSeconds <= 0 || pool.length < 2) return
    const id = window.setInterval(() => {
      const index = stepIndex(pool.length, pool.findIndex((e) => e.name === presetName), 'random')
      if (index >= 0) setPresetName(pool[index].name)
    }, autoCycleSeconds * 1000)
    return () => window.clearInterval(id)
  }, [ready, autoCycleSeconds, pool, presetName, setPresetName])

  const active = run && ready
  useEffect(() => {
    onActiveChange(active)
    return () => onActiveChange(false)
  }, [active, onActiveChange])

  if (!run) return null
  return (
    <div className="album-backdrop milkdrop-backdrop" aria-hidden="true">
      <canvas ref={canvasRef} className="milkdrop-backdrop-canvas" />
    </div>
  )
}
