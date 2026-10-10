import { hexToPaletteRgb } from './albumPalette'

// Turns the cover's colours into a calm, readable scheme for the Spotify popout: two deep
// background colours that still carry the cover's hue, and one bright accent for the play
// button, progress and highlights. Pure, so it can be tested.

export interface PopoutScheme {
  bg1: string
  bg2: string
  accent: string
  accentText: string
}

export const DEFAULT_POPOUT_SCHEME: PopoutScheme = {
  bg1: '#14161c',
  bg2: '#0b0c10',
  accent: '#3ecf79',
  accentText: '#07130c'
}

function rgbToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToPaletteRgb(hex)
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

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c } else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c } else if (h < 300) { r = x; b = c } else { r = c; b = x }
  const part = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

function luminance(hex: string): number {
  const { r, g, b } = hexToPaletteRgb(hex)
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/**
 * `ranked`: cover colours by prominence (main first). `bright`: the display-lifted palette
 * (the more vivid colours first). Either may be empty.
 */
export function popoutScheme(ranked: readonly string[], bright: readonly string[]): PopoutScheme {
  const main = ranked[0] ?? bright[0]
  if (!main) return DEFAULT_POPOUT_SCHEME
  const second = ranked[1] ?? main

  const a = rgbToHsl(main)
  const b = rgbToHsl(second)
  const bg1 = hslToHex(a.h, Math.min(0.55, a.s * 0.8), 0.2)
  const bg2 = hslToHex(b.h, Math.min(0.5, b.s * 0.7), 0.1)

  // Accent: the most vivid colour, kept light enough to read on the dark background.
  const pick = bright.map(rgbToHsl).sort((x, y) => y.s * (1 - Math.abs(2 * y.l - 1)) - x.s * (1 - Math.abs(2 * x.l - 1)))[0] ?? a
  const accent = pick.s < 0.12
    ? '#f1f1f4'
    : hslToHex(pick.h, Math.min(0.9, Math.max(0.5, pick.s)), Math.min(0.7, Math.max(0.55, pick.l)))
  const accentText = luminance(accent) > 0.4 ? '#101114' : '#ffffff'
  return { bg1, bg2, accent, accentText }
}
