// Picks a small palette from RGBA pixels (the album cover) and maps it onto pitch.
// Pure (no DOM) so it can be tested.

export type PaletteRgb = { r: number; g: number; b: number }

function toHsl({ r, g, b }: PaletteRgb): { h: number; s: number; l: number } {
  const nr = r / 255
  const ng = g / 255
  const nb = b / 255
  const max = Math.max(nr, ng, nb)
  const min = Math.min(nr, ng, nb)
  const d = max - min
  const l = (max + min) / 2
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === nr) h = ((ng - nb) / d) % 6
  else if (max === ng) h = (nb - nr) / d + 2
  else h = (nr - ng) / d + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s, l }
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function toHex({ r, g, b }: PaletteRgb): string {
  const part = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

export function hexToPaletteRgb(hex: string): PaletteRgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return { r: 128, g: 128, b: 128 }
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

interface Bucket {
  count: number
  r: number
  g: number
  b: number
}

/**
 * Returns up to `count` colours, darkest first (so low pitch maps to the deepest colour and
 * treble to the lightest). Colours are distinct in hue/lightness. A grey cover yields greys.
 * Near-transparent pixels are ignored. Returns [] when there is nothing usable.
 */
export function extractAlbumPalette(pixels: ArrayLike<number>, count = 4): string[] {
  const buckets = new Map<number, Bucket>()
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 32) continue
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.r += r
      bucket.g += g
      bucket.b += b
    } else {
      buckets.set(key, { count: 1, r, g, b })
    }
  }
  if (buckets.size === 0) return []

  const candidates = [...buckets.values()].map((bucket) => {
    const rgb = { r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count }
    const hsl = toHsl(rgb)
    // Prefer common colours, favour vivid ones, and avoid pure black or white.
    const extreme = hsl.l < 0.06 || hsl.l > 0.96 ? 0.3 : 1
    return { rgb, hsl, score: bucket.count * (0.5 + hsl.s) * extreme }
  })
  candidates.sort((a, b) => b.score - a.score)

  const picked: typeof candidates = []
  for (const candidate of candidates) {
    const distinct = picked.every((chosen) => {
      const bothGrey = candidate.hsl.s < 0.12 && chosen.hsl.s < 0.12
      if (bothGrey) return Math.abs(candidate.hsl.l - chosen.hsl.l) > 0.18
      return hueDistance(candidate.hsl.h, chosen.hsl.h) > 28 || Math.abs(candidate.hsl.l - chosen.hsl.l) > 0.25
    })
    if (distinct) picked.push(candidate)
    if (picked.length >= count) break
  }
  picked.sort((a, b) => a.hsl.l - b.hsl.l)
  return picked.map((item) => toHex(item.rgb))
}

/** Colour at position t (0 low pitch, 1 high pitch) along the palette. */
export function sampleGradient(colors: readonly string[], t: number): string {
  if (colors.length === 0) return '#ffffff'
  if (colors.length === 1) return colors[0]
  const clamped = Math.max(0, Math.min(1, t))
  const scaled = clamped * (colors.length - 1)
  const index = Math.min(colors.length - 2, Math.floor(scaled))
  const mix = scaled - index
  const a = hexToPaletteRgb(colors[index])
  const b = hexToPaletteRgb(colors[index + 1])
  return toHex({ r: a.r + (b.r - a.r) * mix, g: a.g + (b.g - a.g) * mix, b: a.b + (b.b - a.b) * mix })
}

/**
 * Keeps the palette bright enough to see on a dark analyzer: lifts very dark colours
 * without changing hue. Does nothing to light colours.
 */
export function liftForDisplay(colors: readonly string[], minLightness = 0.42): string[] {
  return colors.map((hex) => {
    const rgb = hexToPaletteRgb(hex)
    const { l } = toHsl(rgb)
    if (l >= minLightness) return hex
    const amount = (minLightness - l) / (1 - l)
    return toHex({
      r: rgb.r + (255 - rgb.r) * amount,
      g: rgb.g + (255 - rgb.g) * amount,
      b: rgb.b + (255 - rgb.b) * amount
    })
  })
}
