import { useMemo } from 'react'
import { sampleGradient, hexToPaletteRgb } from '../../../shared/color/albumPalette'
import { useAlbumPaletteStore } from '../../stores/albumPaletteStore'
import { useVisualizerTintStore, type VisualizerTintMode } from '../../stores/visualizerTintStore'

export const VISUALIZER_MAP_FILTER_ID = 'astra-visualizer-gradient-map'
export const MILKDROP_MAP_FILTER_ID = 'astra-milkdrop-gradient-map'

/** True when the colouring needs the picture filtered rather than covered. */
export function useAlbumMapActive(mode: VisualizerTintMode): boolean {
  const palette = useAlbumPaletteStore((s) => s.palette)
  return mode === 'map' && palette.length > 1
}

export function useVisualizerMapActive(): boolean {
  return useAlbumMapActive(useVisualizerTintStore((s) => s.mode))
}

/**
 * Colours whatever it sits on top of with the playing album's colours.
 *  tint     one wash of the main colour
 *  gradient the album's colours laid across the area
 *  map      a gradient map: dark parts take the darkest album colour, bright parts the lightest.
 *           This one filters the picture, so the parent must apply `filter: url(#filterId)`.
 */
export function AlbumColourLayer({
  mode,
  strength,
  filterId,
  angle = 90
}: {
  mode: VisualizerTintMode
  strength: number
  filterId: string
  angle?: number
}) {
  const palette = useAlbumPaletteStore((s) => s.palette)
  const ranked = useAlbumPaletteStore((s) => s.ranked)
  const amount = strength / 100

  const mapTables = useMemo(() => {
    if (palette.length < 2) return null
    const steps = 9
    const r: string[] = []
    const g: string[] = []
    const b: string[] = []
    for (let i = 0; i < steps; i += 1) {
      const rgb = hexToPaletteRgb(sampleGradient(palette, i / (steps - 1)))
      r.push((rgb.r / 255).toFixed(3))
      g.push((rgb.g / 255).toFixed(3))
      b.push((rgb.b / 255).toFixed(3))
    }
    return { r: r.join(' '), g: g.join(' '), b: b.join(' ') }
  }, [palette])

  if (mode === 'off' || palette.length === 0) return null

  if (mode === 'map') {
    if (!mapTables) return null
    return (
      <svg className="viz-tint-defs" width="0" height="0" aria-hidden="true" focusable="false">
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0" result="lum" />
          <feComponentTransfer in="lum" result="mapped">
            <feFuncR type="table" tableValues={mapTables.r} />
            <feFuncG type="table" tableValues={mapTables.g} />
            <feFuncB type="table" tableValues={mapTables.b} />
          </feComponentTransfer>
          <feComposite in="mapped" in2="SourceGraphic" operator="arithmetic" k1="0" k2={amount} k3={1 - amount} k4="0" />
        </filter>
      </svg>
    )
  }

  const background = mode === 'tint'
    ? (ranked[0] ?? palette[palette.length - 1])
    : `linear-gradient(${angle}deg, ${palette.join(', ')})`
  return <div className="viz-tint-layer" style={{ background, opacity: amount }} aria-hidden="true" />
}

/** The visualizer row's colouring, from its own settings. */
export default function VisualizerTintLayer() {
  const mode = useVisualizerTintStore((s) => s.mode)
  const strength = useVisualizerTintStore((s) => s.strength)
  return <AlbumColourLayer mode={mode} strength={strength} filterId={VISUALIZER_MAP_FILTER_ID} />
}
