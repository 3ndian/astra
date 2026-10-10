import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ButterchurnVisualizer } from 'butterchurn'
import { audioEngine } from '../../audio/AudioEngine'
import { subscribeDevicePixelRatio } from '../../utils/devicePixelRatioWatch'
import { usePlayerStore } from '../../stores/playerStore'
import { useMilkdropStore } from '../../stores/milkdropStore'
import { applyFilter, filterToValue, inFolder, isFavorite, valueToFilter } from '../../../shared/milkdrop/collections'
import { FPS_CAP_CHOICES, QUALITY_CHOICES, qualityScale } from '../../../shared/milkdrop/quality'
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
export default function MilkdropStage({
  controlsVisible,
  onRunningChange
}: {
  controlsVisible: boolean
  /** True once the visual is actually drawing; the parent only fades its UI while this is true. */
  onRunningChange?: (running: boolean) => void
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const vizRef = useRef<ButterchurnVisualizer | null>(null)
  const connectedNodeRef = useRef<AudioNode | null>(null)
  const resizeRef = useRef<(() => void) | null>(null)
  const forceFramesRef = useRef(0)
  const lastLoadedPresetRef = useRef<string | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [presets, setPresets] = useState<PresetEntry[]>([])
  const [noAudio, setNoAudio] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [waitingForAudio, setWaitingForAudio] = useState(false)

  const presetName = useMilkdropStore((s) => s.presetName)
  const autoCycleSeconds = useMilkdropStore((s) => s.autoCycleSeconds)
  const blendSeconds = useMilkdropStore((s) => s.blendSeconds)
  const setPresetName = useMilkdropStore((s) => s.setPresetName)
  const setAutoCycleSeconds = useMilkdropStore((s) => s.setAutoCycleSeconds)
  const setBlendSeconds = useMilkdropStore((s) => s.setBlendSeconds)
  const quality = useMilkdropStore((s) => s.quality)
  const fpsCap = useMilkdropStore((s) => s.fpsCap)
  const qualityRef = useRef(quality)
  const fpsCapRef = useRef(fpsCap)
  qualityRef.current = quality
  fpsCapRef.current = fpsCap
  const setQuality = useMilkdropStore((s) => s.setQuality)
  const setFpsCap = useMilkdropStore((s) => s.setFpsCap)
  const collections = useMilkdropStore((s) => s.collections)
  const filter = useMilkdropStore((s) => s.filter)
  const setFilter = useMilkdropStore((s) => s.setFilter)
  const toggleFavorite = useMilkdropStore((s) => s.toggleFavorite)
  const createFolder = useMilkdropStore((s) => s.createFolder)
  const renameFolder = useMilkdropStore((s) => s.renameFolder)
  const deleteFolder = useMilkdropStore((s) => s.deleteFolder)
  const toggleInFolder = useMilkdropStore((s) => s.toggleInFolder)
  const [organizeOpen, setOrganizeOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const entries = useMemo(() => {
    const byName = new Map<string, PresetEntry>()
    for (const entry of presets) byName.set(entry.name, entry)
    return sortPresetNames([...byName.keys()]).map((name) => byName.get(name) as PresetEntry)
  }, [presets])

  const pool = useMemo(() => applyFilter(entries, filter, collections), [entries, filter, collections])
  const currentEntry = entries.find((e) => e.name === presetName) ?? entries[0]
  const poolIndex = pool.findIndex((e) => e.name === currentEntry?.name)
  const currentIsFavorite = currentEntry ? isFavorite(collections, currentEntry.name) : false

  const loadUserPresets = useCallback(async (): Promise<PresetEntry[]> => {
    try {
      const stored = await window.electronAPI.milkdrop.list()
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
    let unsubscribeDpr: (() => void) | null = null
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
        if (!context) setWaitingForAudio(true)
        while (!context && !cancelled) {
          await new Promise((resolve) => window.setTimeout(resolve, 500))
          context = audioEngine.getAudioContext()
        }
        setWaitingForAudio(false)
        const canvas = canvasRef.current
        if (cancelled || !context || !canvas) return

        const sizeFor = (): { w: number; h: number } => {
          const ratio = qualityScale(qualityRef.current, window.devicePixelRatio || 1)
          return {
            w: Math.max(2, Math.floor(canvas.clientWidth * ratio)),
            h: Math.max(2, Math.floor(canvas.clientHeight * ratio))
          }
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
          forceFramesRef.current = 3
        }
        resizeRef.current = applySize
        observer = new ResizeObserver(applySize)
        observer.observe(canvas)
        // Moving to another monitor changes the pixel density without changing the CSS size.
        unsubscribeDpr = subscribeDevicePixelRatio(applySize)

        // The analyser can be rebuilt (new output path, device change), so keep it connected.
        const syncAudio = () => {
          const node = audioEngine.getEQAnalyserNode()
          setNoAudio(!node)
          // Keep the last connection while the node is briefly missing (track change, graph
          // rebuild). Disconnecting made the visual go silent and flash.
          if (!node || node === connectedNodeRef.current) return
          if (connectedNodeRef.current) {
            try { viz.disconnectAudio?.(connectedNodeRef.current) } catch { /* already gone */ }
          }
          connectedNodeRef.current = node
          viz.connectAudio(node)
        }
        syncAudio()
        reconnectTimer = window.setInterval(syncAudio, 500)

        let lastFrameAt = 0
        const frame = (now: number) => {
          rafId = window.requestAnimationFrame(frame)
          // Paused: freeze the last picture (drawing at a few fps looked like flicker). A few
          // frames still render after a preset or size change so the new look appears.
          const playing = usePlayerStore.getState().playbackState === 'playing'
          if (!playing && forceFramesRef.current <= 0) return
          const minGap = 1000 / fpsCapRef.current - 2
          if (now - lastFrameAt < minGap) return
          lastFrameAt = now
          if (forceFramesRef.current > 0) forceFramesRef.current -= 1
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
      unsubscribeDpr?.()
      const viz = vizRef.current
      if (viz && connectedNodeRef.current) {
        try { viz.disconnectAudio?.(connectedNodeRef.current) } catch { /* ignore */ }
      }
      connectedNodeRef.current = null
      vizRef.current = null
      resizeRef.current = null
      lastLoadedPresetRef.current = null
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
    if (lastLoadedPresetRef.current === entry.name) return
    lastLoadedPresetRef.current = entry.name
    forceFramesRef.current = 12
    try {
      void viz.loadPreset(entry.preset, blendSeconds)
    } catch (error) {
      console.error('Milkdrop preset failed to load', entry.name, error)
      setMessage(`"${entry.name}" could not be loaded`)
    }
    // blendSeconds is read at change time only; changing it should not reload the preset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, entries, presetName])

  useEffect(() => {
    resizeRef.current?.()
  }, [quality])

  // Next / previous / shuffle / auto-cycle all stay inside the active filter.
  useEffect(() => {
    onRunningChange?.(status === 'ready')
    return () => onRunningChange?.(false)
  }, [status, onRunningChange])

  const go = useCallback((mode: CycleMode) => {
    if (pool.length === 0) return
    const from = poolIndex < 0 && mode === 'previous' ? 0 : poolIndex
    const index = stepIndex(pool.length, from, mode)
    if (index >= 0) setPresetName(pool[index].name)
  }, [pool, poolIndex, setPresetName])

  // Auto-cycle.
  useEffect(() => {
    if (status !== 'ready' || autoCycleSeconds <= 0 || pool.length < 2) return
    const id = window.setInterval(() => go('random'), autoCycleSeconds * 1000)
    return () => window.clearInterval(id)
  }, [status, autoCycleSeconds, pool.length, go])

  const importPresets = useCallback(async () => {
    const result = await window.electronAPI.milkdrop.importPresets()
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
    await window.electronAPI.milkdrop.remove(currentEntry.fileName)
    const user = await loadUserPresets()
    setPresets((prev) => [...prev.filter((p) => !p.user), ...user])
    setPresetName(null)
  }, [currentEntry, loadUserPresets, setPresetName])

  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(() => setMessage(null), 6000)
    return () => window.clearTimeout(id)
  }, [message])

  const poolBuiltIn = pool.filter((e) => !e.user)
  const poolMine = pool.filter((e) => e.user)
  const folderCount = (id: string) => applyFilter(entries, { kind: 'folder', id }, collections).length

  useEffect(() => {
    if (!controlsVisible) {
      setMoreOpen(false)
      setOrganizeOpen(false)
    }
  }, [controlsVisible])

  return (
    <div className="milkdrop-stage" aria-hidden={status !== 'ready'}>
      <canvas ref={canvasRef} className="milkdrop-canvas" onDoubleClick={() => go('random')} />

      {status === 'unsupported' && <div className="milkdrop-notice">Milkdrop needs WebGL2, which this machine doesn&apos;t report.</div>}
      {status === 'error' && <div className="milkdrop-notice">Milkdrop couldn&apos;t start. Check that butterchurn and butterchurn-presets are installed.</div>}
      {status === 'loading' && (
        <div className="milkdrop-notice">
          {waitingForAudio ? 'Play a song to start Milkdrop.' : 'Loading Milkdrop…'}
        </div>
      )}
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
            {currentEntry && poolIndex < 0 && <option value={currentEntry.name}>{currentEntry.name} (outside this list)</option>}
            {poolMine.length > 0 && (
              <optgroup label="My presets">
                {poolMine.map((e) => <option key={`u-${e.name}`} value={e.name}>{e.name}</option>)}
              </optgroup>
            )}
            <optgroup label={filter.kind === 'all' ? 'Built-in' : 'Presets'}>
              {poolBuiltIn.map((e) => <option key={`b-${e.name}`} value={e.name}>{e.name}</option>)}
            </optgroup>
          </select>
          <button type="button" onClick={() => go('next')} title="Next preset" aria-label="Next preset">›</button>
          <button
            type="button"
            className={currentIsFavorite ? 'is-on' : ''}
            onClick={() => currentEntry && toggleFavorite(currentEntry.name)}
            title={currentIsFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-label={currentIsFavorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={currentIsFavorite}
          >
            {currentIsFavorite ? '★' : '☆'}
          </button>
          <button type="button" onClick={() => go('random')} title="Random preset (or double-click the visual)" aria-label="Random preset">Shuffle</button>
          <button
            type="button"
            className={moreOpen ? 'is-on' : ''}
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            title="More options"
          >
            Options
          </button>
          {moreOpen && (
          <div className="milkdrop-tray">
          <label className="milkdrop-field">
            Show
            <select value={filterToValue(filter)} onChange={(e) => setFilter(valueToFilter(e.target.value))}>
              <option value="all">All ({entries.length})</option>
              <option value="favorites">★ Favorites ({applyFilter(entries, { kind: 'favorites' }, collections).length})</option>
              {entries.some((e) => e.user) && <option value="mine">My imports ({entries.filter((e) => e.user).length})</option>}
              {collections.folders.map((f) => (
                <option key={f.id} value={`folder:${f.id}`}>{f.name} ({folderCount(f.id)})</option>
              ))}
            </select>
          </label>
          <div className="milkdrop-organize">
            <button type="button" className={organizeOpen ? 'is-on' : ''} onClick={() => setOrganizeOpen((o) => !o)} aria-expanded={organizeOpen}>
              Folders
            </button>
            {organizeOpen && currentEntry && (
              <div className="milkdrop-popover" onKeyDown={(e) => e.stopPropagation()}>
                <div className="milkdrop-popover-title">Put “{currentEntry.name}” in…</div>
                {collections.folders.length === 0 && <div className="milkdrop-popover-empty">No folders yet. Make one below.</div>}
                {collections.folders.map((f) => (
                  <div className="milkdrop-folder-row" key={f.id}>
                    <input
                      type="checkbox"
                      checked={inFolder(collections, f.id, currentEntry.name)}
                      onChange={() => toggleInFolder(f.id, currentEntry.name)}
                      aria-label={`In folder ${f.name}`}
                    />
                    {renamingId === f.id ? (
                      <input
                        className="milkdrop-text-input"
                        value={renameValue}
                        autoFocus
                        maxLength={40}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { renameFolder(f.id, renameValue); setRenamingId(null) }
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        onBlur={() => setRenamingId(null)}
                      />
                    ) : (
                      <span className="milkdrop-folder-name">{f.name}</span>
                    )}
                    <button type="button" title="Rename folder" aria-label={`Rename ${f.name}`} onClick={() => { setRenamingId(f.id); setRenameValue(f.name) }}>✎</button>
                    {confirmDeleteId === f.id ? (
                      <button type="button" className="is-danger" onClick={() => { deleteFolder(f.id); setConfirmDeleteId(null) }} onBlur={() => setConfirmDeleteId(null)}>
                        Delete?
                      </button>
                    ) : (
                      <button type="button" title="Delete folder (presets are kept)" aria-label={`Delete ${f.name}`} onClick={() => setConfirmDeleteId(f.id)}>✕</button>
                    )}
                  </div>
                ))}
                <form
                  className="milkdrop-folder-row"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const before = collections.folders.length
                    createFolder(newFolderName)
                    if (useMilkdropStore.getState().collections.folders.length > before) setNewFolderName('')
                  }}
                >
                  <input
                    className="milkdrop-text-input"
                    placeholder="New folder name"
                    value={newFolderName}
                    maxLength={40}
                    onChange={(e) => setNewFolderName(e.target.value)}
                  />
                  <button type="submit" disabled={!newFolderName.trim()}>Add</button>
                </form>
              </div>
            )}
          </div>
          <label className="milkdrop-field">
            Quality
            <select value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
              {QUALITY_CHOICES.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
            </select>
          </label>
          <label className="milkdrop-field">
            FPS
            <select value={fpsCap} onChange={(e) => setFpsCap(Number(e.target.value) as typeof fpsCap)}>
              {FPS_CAP_CHOICES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
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
      )}
    </div>
  )
}
