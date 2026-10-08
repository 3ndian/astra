import { useEffect, useRef, useState } from 'react'
import { useLibraryStore } from '../../stores/libraryStore'
import { usePlayerStore } from '../../stores/playerStore'
import { useThemeStore } from '../../stores/themeStore'
import { useMilkdropBackgroundStore } from '../../stores/milkdropBackgroundStore'

interface Layer {
  key: number
  url: string
}

/**
 * Smoky glass: a heavily blurred, enlarged copy of the playing cover behind the whole app.
 * Two layers crossfade on track change. Does nothing unless the active custom theme enables it.
 * Sets `album-backdrop-on` on the .app element (via the parent) through the `onActiveChange` callback.
 */
export default function AlbumBackdrop({ onActiveChange }: { onActiveChange: (active: boolean) => void }) {
  const milkdropBackground = useMilkdropBackgroundStore((state) => state.enabled)
  const milkdropPanelOpacity = useMilkdropBackgroundStore((state) => state.panelOpacity)
  // The Milkdrop background takes over the slot while it is on.
  const smoky = useThemeStore((state) => state.customTheme?.smokyGlass ?? false) && !milkdropBackground
  const blur = useThemeStore((state) => state.customTheme?.glassBlur ?? 60)
  const panelOpacity = useThemeStore((state) => state.customTheme?.glassPanelOpacity ?? 62)
  const hash = usePlayerStore((state) => state.currentTrack?.artworkHash ?? null)
  const getArtwork = useLibraryStore((state) => state.getArtwork)
  const [layers, setLayers] = useState<Layer[]>([])
  const counter = useRef(0)

  useEffect(() => {
    if (!smoky || !hash) {
      setLayers([])
      return
    }
    let cancelled = false
    void getArtwork(hash, { variant: 'card' })
      .then((url) => {
        if (cancelled || !url) return
        counter.current += 1
        const next = { key: counter.current, url }
        setLayers((current) => [...current.slice(-1), next])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [smoky, hash, getArtwork])

  // Drop the older layer once the newest one has faded in.
  useEffect(() => {
    if (layers.length < 2) return
    const timer = window.setTimeout(() => setLayers((current) => current.slice(-1)), 900)
    return () => window.clearTimeout(timer)
  }, [layers])

  const active = smoky && layers.length > 0
  useEffect(() => {
    onActiveChange(active)
    return () => onActiveChange(false)
  }, [active, onActiveChange])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--backdrop-panel-alpha', `${milkdropBackground ? milkdropPanelOpacity : panelOpacity}%`)
    root.style.setProperty('--backdrop-blur', `${blur}px`)
  }, [panelOpacity, blur, milkdropBackground, milkdropPanelOpacity])

  if (!smoky) return null
  return (
    <div className="album-backdrop" aria-hidden="true">
      {layers.map((layer) => (
        <div key={layer.key} className="album-backdrop-layer" style={{ backgroundImage: `url("${layer.url}")` }} />
      ))}
    </div>
  )
}
