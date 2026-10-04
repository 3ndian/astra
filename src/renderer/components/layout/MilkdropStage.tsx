import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ButterchurnVisualizer } from 'butterchurn'
import { audioEngine } from '../../audio/AudioEngine'
import { usePlayerStore } from '../../stores/playerStore'
import { useMilkdropStore } from '../../stores/milkdropStore'
import { AUTO_CYCLE_CHOICES, BLEND_CHOICES, sortPresetNames, stepIndex, type CycleMode } from '../../../shared/milkdrop/presets'

interface PresetEntry {
  name: string
  preset: unknown
  user: boolean
  fileName?: string
}

type Status = 'loading' | 'ready' | 'unsupported' | 'error'

function webgl2Available(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

/** Milkdrop-style visualizer (Butterchurn) drawn behind the fullscreen player. */
export default function MilkdropStage({ controlsVisible }: { controlsVisible: boolean }): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const vizRef = useRef<ButterchurnVisualizer | null>(null)
  const connectedNodeRef = useRef<AudioNode | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [presets, setPresets] = useState<PresetEntry[]>([])
  const [noAudio, setNoAudio] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const presetName = useMilkdropStore((s) => s.presetName)
  const autoCycleSeconds = useMilkdropStore((s) => s.autoCycleSeconds)
  const blendSeconds = useMilkdropStore((s) => s.blendSeconds)
  const setPresetName = useMilkdropStore((s) => s.setPresetName)
  const setAutoCycleSeconds = useMilkdropStore((s) => s.setAutoCycleSeconds)
  const setBlendSeconds = useMilkdropStore((s) => s.setBlendSeconds)

  const entries = useMemo(() => {
    const byName = new Map<string, PresetEntry>()
    for (const entry of presets) byName.set(entry.name, entry)
    return sortPresetNames([...byName.keys()]).map((name) => byName.get(name) as PresetEntry)
  }, [presets])

  const currentIndex = Math.max(0, entries.findIndex((e) => e.name === presetName))
  const currentEntry = entries[currentIndex]

  const loadUserPresets = useCallback(async (): Promise<PresetEntry[]> => {
    try {
      const stored = await window.api.milkdrop.list()
      return stored.map((p) => ({ name: p.name, preset: p.preset, user: true, fileName: p.fileName }))
    } catch {
      return []
    }
  }, [])

  // Load the engine + presets, then create the visualizer.
  useEffect(() => {
    let cancelled = false
    let rafId = 0
    let observer: ResizeObserver | null = null
    let reconnectTimer = 0

    const start = async () => {
      if (!webgl2Available()) {
        setStatus('unsupported')
        return
      }
      try {
        const [{ default: butterchurn }, { default: bundled }] = await Promise.all([
          import('butterchurn'),
          import('butterchurn-presets')
        ])
        if (cancelled) return

        const builtIn = Object.entries(bundled.getPresets()).map(([name, preset]) => ({ name, preset, user: false }))
        const user = await loadUserPresets()
        if (cancelled) return
        setPresets([...builtIn, ...user])

        // Wait for the Web Audio context (it only exists once something has played).
        let context = audioEngine.getAudioContext()
        while (!context && !cancelled) {
          await new Promise((resolve) => window.setTimeout(resolve, 500))
          context = audioEngine.getAudioContext()
        }
        const canvas = canvasRef.current
        if (cancelled || !context || !canvas) return

        const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
        const width = Math.max(2, Math.floor(canvas.clientWidth * ratio))
        const height = Math.max(2, Math.floor(canvas.clientHeight * ratio))
        canvas.width = width
        canvas.height = height
        const viz = butterchurn.createVisualizer(context, canvas, { width, height, pixelRatio: ratio })
        vizRef.current = viz

        observer = new ResizeObserver(() => {
          const w = Math.max(2, Math.floor(canvas.clientWidth * ratio))
          const h = Math.max(2, Math.floor(canvas.clientHeight * ratio))
          canvas.width = w
          canvas.height = h
          viz.setRendererSize(w, h)
        })
        observer.observe(canvas)

        // The analyser can be rebuilt (new output path, device change), so keep it connected.
        const syncAudio = () => {
          const node = audioEngine.getEQAnalyserNode()
          setNoAudio(!node)
          if (node === connectedNodeRef.current) return
          if (connectedNodeRef.current) {
            try { viz.disconnectAudio?.(connectedNodeRef.current) } catch { /* already gone */ }
          }
          connectedNodeRef.current = node
          if (node) viz.connectAudio(node)
        }
        syncAudio()
        reconnectTimer = window.setInterval(syncAudio, 500)

        let lastPausedFrame = 0
        const frame = (now: number) => {
          rafId = window.requestAnimationFrame(frame)
          const playing = usePlayerStore.getState().playbackState === 'playing'
          if (!playing && now - lastPausedFrame < 200) return
          lastPausedFrame = now
          try {
            viz.render()
          } catch {
            // a bad preset can throw mid-frame; the next preset change recovers
          }
        }
        rafId = window.requestAnimationFrame(frame)
        setStatus('ready')
      } catch (error) {
        console.error('Milkdrop failed to start', error)
        if (!cancelled) setStatus('error')
      }
    }

    void start()

    return () => {
      cancelled = true
      window.cancelAnimationFrame(rafId)
      window.clearInterval(reconnectTimer)
      observer?.disconnect()
      const viz = vizRef.current
      if (viz && connectedNodeRef.current) {
        try { viz.disconnectAudio?.(connectedNodeRef.current) } catch { /* ignore */ }
      }
      connectedNodeRef.current = null
      vizRef.current = null
    }
  }, [loadUserPresets])

  // Apply the chosen preset (and pick one the first time).
  useEffect(() => {
    if (status !== 'ready' || entries.length === 0) return
    const viz = vizRef.current
    if (!viz) return
    let entry = entries.find((e) => e.name === presetName)
    if (!entry) {
      entry = entries[stepIndex(entries.length, -1, 'random')]
      setPresetName(entry.name)
      return
    }
    try {
      void viz.loadPreset(entry.preset, blendSeconds)
    } catch (error) {
      console.error('Milkdrop preset failed to load', entry.name, error)
      setMessage(`"${entry.name}" could not be loaded`)
    }
    // blendSeconds is read at change time only; changing it should not reload the preset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, entries, presetName])

  const go = useCallback((mode: CycleMode) => {
    if (entries.length === 0) return
    const index = stepIndex(entries.length, currentIndex, mode)
    if (index >= 0) setPresetName(entries[index].name)
  }, [entries, currentIndex, setPresetName])

  // Auto-cycle.
  useEffect(() => {
    if (status !== 'ready' || autoCycleSeconds <= 0 || entries.length < 2) return
    const id = window.setInterval(() => go('random'), autoCycleSeconds * 1000)
    return () => window.clearInterval(id)
  }, [status, autoCycleSeconds, entries.length, go])

  const importPresets = useCallback(async () => {
    const result = await window.api.milkdrop.importPresets()
    if (result.imported === 0 && result.rejected.length === 0) return
    const parts: string[] = []
    if (result.imported > 0) parts.push(`Imported ${result.imported} preset${result.imported === 1 ? '' : 's'}`)
    if (result.rejected.length > 0) parts.push(result.rejected.map((r) => `${r.file}: ${r.reason}`).join(' · '))
    setMessage(parts.join(' — '))
    const user = await loadUserPresets()
    setPresets((prev) => [...prev.filter((p) => !p.user), ...user])
  }, [loadUserPresets])

  const removeCurrent = useCallback(async () => {
    if (!currentEntry?.user || !currentEntry.fileName) return
    await window.api.milkdrop.remove(currentEntry.fileName)
    const user = await loadUserPresets()
    setPresets((prev) => [...prev.filter((p) => !p.user), ...user])
    setPresetName(null)
  }, [currentEntry, loadUserPresets, setPresetName])

  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(() => setMessage(null), 6000)
    return () => window.clearTimeout(id)
  }, [message])

  const builtIn = entries.filter((e) => !e.user)
  const mine = entries.filter((e) => e.user)

  return (
    <div className="milkdrop-stage" aria-hidden={status !== 'ready'}>
      <canvas ref={canvasRef} className="milkdrop-canvas" onDoubleClick={() => go('random')} />

      {status === 'unsupported' && <div className="milkdrop-notice">Milkdrop needs WebGL2, which this machine doesn&apos;t report.</div>}
      {status === 'error' && <div className="milkdrop-notice">Milkdrop couldn&apos;t start. Check that butterchurn and butterchurn-presets are installed.</div>}
      {status === 'loading' && <div className="milkdrop-notice">Loading Milkdrop…</div>}
      {status === 'ready' && noAudio && (
        <div className="milkdrop-notice">Milkdrop can&apos;t hear the audio in bit-perfect mode. Switch to the standard output to see it react.</div>
      )}
      {message && <div className="milkdrop-toast">{message}</div>}

      {status === 'ready' && (
        <div className={`milkdrop-controls${controlsVisible ? ' is-visible' : ''}`}>
          <button type="button" onClick={() => go('previous')} title="Previous preset" aria-label="Previous preset">‹</button>
          <select
            value={currentEntry?.name ?? ''}
            onChange={(e) => setPresetName(e.target.value)}
            aria-label="Milkdrop preset"
            className="milkdrop-select"
          >
            {mine.length > 0 && (
              <optgroup label="My presets">
                {mine.map((e) => <option key={`u-${e.name}`} value={e.name}>{e.name}</option>)}
              </optgroup>
            )}
            <optgroup label="Built-in">
              {builtIn.map((e) => <option key={`b-${e.name}`} value={e.name}>{e.name}</option>)}
            </optgroup>
          </select>
          <button type="button" onClick={() => go('next')} title="Next preset" aria-label="Next preset">›</button>
          <button type="button" onClick={() => go('random')} title="Random preset (or double-click the visual)" aria-label="Random preset">Shuffle</button>
          <label className="milkdrop-field">
            Auto
            <select value={autoCycleSeconds} onChange={(e) => setAutoCycleSeconds(Number(e.target.value))}>
              {AUTO_CYCLE_CHOICES.map((s) => <option key={s} value={s}>{s === 0 ? 'Off' : `${s}s`}</option>)}
            </select>
          </label>
          <label className="milkdrop-field">
            Blend
            <select value={blendSeconds} onChange={(e) => setBlendSeconds(Number(e.target.value))}>
              {BLEND_CHOICES.map((s) => <option key={s} value={s}>{s === 0 ? 'Cut' : `${s}s`}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void importPresets()} title="Import Butterchurn .json presets">Import…</button>
          {currentEntry?.user && (
            <button type="button" onClick={() => void removeCurrent()} title="Remove this imported preset">Remove</button>
          )}
        </div>
      )}
    </div>
  )
}
