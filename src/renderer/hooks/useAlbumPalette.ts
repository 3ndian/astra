import { useEffect, useRef } from 'react'
import { extractAlbumPalette, liftForDisplay } from '../../shared/color/albumPalette'
import { useAlbumPaletteStore } from '../stores/albumPaletteStore'
import { useAlbumTintStore } from '../stores/albumTintStore'
import { useMilkdropBackgroundStore } from '../stores/milkdropBackgroundStore'
import { useVisualizerTintStore } from '../stores/visualizerTintStore'
import { useLibraryStore } from '../stores/libraryStore'
import { usePlayerStore } from '../stores/playerStore'

const SAMPLE = 48
const MAX_CACHE = 128
interface CoverColors {
  palette: string[]
  ranked: string[]
}

const cache = new Map<string, CoverColors>()

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('artwork decode failed'))
    image.src = url
  })
}

async function paletteFromUrl(url: string): Promise<CoverColors> {
  const image = await loadImage(url)
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE
  canvas.height = SAMPLE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { palette: [], ranked: [] }
  ctx.drawImage(image, 0, 0, SAMPLE, SAMPLE)
  const pixels = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data
  return {
    palette: liftForDisplay(extractAlbumPalette(pixels, 4)),
    ranked: extractAlbumPalette(pixels, 3, 'prominence')
  }
}

/** Keeps the album palette store in sync with the playing track. Only works while a feature needs it. */
export function useAlbumPalette(): void {
  const pitchEnabled = useAlbumPaletteStore((state) => state.pitchColorsEnabled)
  const tintEnabled = useAlbumTintStore((state) => state.enabled)
  const vizTintEnabled = useVisualizerTintStore((state) => state.mode !== 'off')
  const milkdropTintEnabled = useMilkdropBackgroundStore((state) => state.enabled && state.tintMode !== 'off')
  const enabled = pitchEnabled || tintEnabled || vizTintEnabled || milkdropTintEnabled
  const setPalette = useAlbumPaletteStore((state) => state.setPalette)
  const track = usePlayerStore((state) => state.currentTrack)
  const getArtwork = useLibraryStore((state) => state.getArtwork)
  const token = useRef(0)

  useEffect(() => {
    token.current += 1
    const mine = token.current
    if (!enabled || !track) {
      setPalette([])
      return
    }
    const identity = track.artworkHash ? `hash:${track.artworkHash}` : `path:${track.path}`
    const cached = cache.get(identity)
    if (cached) {
      setPalette(cached.palette, cached.ranked)
      return
    }
    void (async () => {
      try {
        const url = track.artworkData ?? (track.artworkHash ? await getArtwork(track.artworkHash, { variant: 'card' }) : null)
        if (!url) {
          if (token.current === mine) setPalette([])
          return
        }
        const colors = await paletteFromUrl(url)
        if (token.current !== mine) return
        cache.set(identity, colors)
        while (cache.size > MAX_CACHE) {
          const oldest = cache.keys().next().value
          if (oldest === undefined) break
          cache.delete(oldest)
        }
        setPalette(colors.palette, colors.ranked)
      } catch {
        if (token.current === mine) setPalette([])
      }
    })()
  }, [enabled, track, getArtwork, setPalette])
}
