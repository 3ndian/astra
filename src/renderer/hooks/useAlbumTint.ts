import { useEffect } from 'react'
import { useAlbumPaletteStore } from '../stores/albumPaletteStore'
import { useAlbumTintStore } from '../stores/albumTintStore'

/** Publishes the cover's main, secondary and tertiary colours as CSS variables for the UI tint. */
export function useAlbumTint(): void {
  const enabled = useAlbumTintStore((state) => state.enabled)
  const strength = useAlbumTintStore((state) => state.strength)
  const ranked = useAlbumPaletteStore((state) => state.ranked)

  useEffect(() => {
    const root = document.documentElement
    if (!enabled || ranked.length === 0) {
      root.classList.remove('album-tint-on')
      return
    }
    const first = ranked[0]
    root.style.setProperty('--album-tint-1', first)
    root.style.setProperty('--album-tint-2', ranked[1] ?? first)
    root.style.setProperty('--album-tint-3', ranked[2] ?? ranked[1] ?? first)
    // Up to about a third opacity at full strength, so text stays readable.
    root.style.setProperty('--album-tint-alpha', String((strength / 100) * 0.34))
    root.classList.add('album-tint-on')
    return () => {
      root.classList.remove('album-tint-on')
    }
  }, [enabled, ranked, strength])
}
