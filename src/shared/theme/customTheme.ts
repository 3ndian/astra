// Custom themes: pick one accent colour and the rest of the palette (backgrounds, borders, text)
// is derived from it. Every derivation knob is exposed, and any single colour can be overridden.
// Dark themes only for now. Pure (no DOM / Electron) so it can be tested.

export const CUSTOM_COLOR_KEYS = [
  'bgPrimary',
  'bgSecondary',
  'bgTertiary',
  'border',
  'textPrimary',
  'textSecondary',
  'textTertiary'
] as const

export type CustomColorKey = (typeof CUSTOM_COLOR_KEYS)[number]

export const CUSTOM_COLOR_LABELS: Record<CustomColorKey, string> = {
  bgPrimary: 'Background',
  bgSecondary: 'Side panels',
  bgTertiary: 'Raised panels',
  border: 'Borders',
  textPrimary: 'Main text',
  textSecondary: 'Secondary text',
  textTertiary: 'Faint text'
}

export interface CustomThemeParams {
  /** Backgrounds take their hue from the accent (the default). */
  followAccent: boolean
  /** With followAccent on and the cover-art accent active, backgrounds follow the album colour too. */
  followCoverArt: boolean
  /** 0 neutral grey, 100 strongly coloured backgrounds. */
  tintStrength: number
  /** 0 near-black, 100 lighter dark. */
  depth: number
  /** Degrees added to the accent hue for the backgrounds (followAccent on). */
  hueShift: number
  /** Fixed background hue (followAccent off). */
  surfaceHue: number
  /** 0 softer text, 100 stronger text. */
  textContrast: number
  /** Smoky glass: a blurred copy of the playing cover sits behind the app. */
  smokyGlass: boolean
  /** Blur radius of the smoky glass cover, in px. */
  glassBlur: number
  /** How solid the panels are over the cover, 30 (see-through) to 95 (almost solid). */
  glassPanelOpacity: number
}

export interface CustomTheme extends CustomThemeParams {
  id: string
  name: string
  accent: string
  overrides: Partial<Record<CustomColorKey, string>>
}

export interface CustomBaseTokens {
  bgPrimary: string
  bgSecondary: string
  bgTertiary: string
  glassBg: string
  glassBorder: string
  glassHighlight: string
  textPrimary: string
  textSecondary: string
  textTertiary: string
}

export const DEFAULT_CUSTOM_PARAMS: CustomThemeParams = {
  followAccent: true,
  followCoverArt: false,
  tintStrength: 50,
  depth: 30,
  hueShift: 0,
  surfaceHue: 210,
  textContrast: 30,
  smokyGlass: false,
  glassBlur: 60,
  glassPanelOpacity: 62
}

const MIN_CONTRAST: Partial<Record<CustomColorKey, number>> = {
  textPrimary: 4.5,
  textSecondary: 4.5,
  textTertiary: 3
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const short = /^#([0-9a-fA-F]{3})$/.exec(trimmed)
  if (short) {
    const [r, g, b] = short[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(trimmed)
  return full ? `#${full[1].toLowerCase()}` : null
}

interface Rgb { r: number; g: number; b: number }
interface Rgba extends Rgb { a: number }

function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex) ?? '#000000'
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16)
  }
}

function rgbToHex({ r, g, b }: Rgb): string {
  const part = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

export function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const nr = r / 255
  const ng = g / 255
  const nb = b / 255
  const max = Math.max(nr, ng, nb)
  const min = Math.min(nr, ng, nb)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === nr) h = ((ng - nb) / d) % 6
  else if (max === ng) h = (nb - nr) / d + 2
  else h = (nr - ng) / d + 4
  return { h: (h * 60 + 360) % 360, s, l }
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (hue < 60) [r, g, b] = [c, x, 0]
  else if (hue < 120) [r, g, b] = [x, c, 0]
  else if (hue < 180) [r, g, b] = [0, c, x]
  else if (hue < 240) [r, g, b] = [0, x, c]
  else if (hue < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

export function parseColor(value: string): Rgba | null {
  const hex = normalizeHex(value)
  if (hex) return { ...hexToRgb(hex), a: 1 }
  const match = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/.exec(value.trim())
  if (!match) return null
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] === undefined ? 1 : Number(match[4]) }
}

function rgba({ r, g, b }: Rgb, a: number): string {
  return `rgba(${Math.round(clamp(r, 0, 255))}, ${Math.round(clamp(g, 0, 255))}, ${Math.round(clamp(b, 0, 255))}, ${Math.round(a * 1000) / 1000})`
}

function composite(fg: Rgba, bg: Rgb): Rgb {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a)
  }
}

function luminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio of a (possibly translucent) foreground over a background colour. */
export function contrastRatio(foreground: string, background: string): number {
  const bg = parseColor(background)
  const fg = parseColor(foreground)
  if (!bg || !fg) return 21
  const bgRgb: Rgb = bg
  const fgRgb = composite(fg, bgRgb)
  const l1 = luminance(fgRgb)
  const l2 = luminance(bgRgb)
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

export function createCustomTheme(id: string, name: string, accent: string): CustomTheme {
  return {
    ...DEFAULT_CUSTOM_PARAMS,
    id,
    name,
    accent: normalizeHex(accent) ?? '#38bdf8',
    overrides: {}
  }
}

export function sanitizeCustomTheme(raw: unknown): CustomTheme | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const accent = normalizeHex(record.accent)
  if (!accent || typeof record.id !== 'string' || !record.id) return null
  const num = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback
  const overrides: Partial<Record<CustomColorKey, string>> = {}
  if (record.overrides && typeof record.overrides === 'object') {
    for (const key of CUSTOM_COLOR_KEYS) {
      const hex = normalizeHex((record.overrides as Record<string, unknown>)[key])
      if (hex) overrides[key] = hex
    }
  }
  const d = DEFAULT_CUSTOM_PARAMS
  return {
    id: record.id.slice(0, 64),
    name: (typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'Custom').slice(0, 40),
    accent,
    followAccent: typeof record.followAccent === 'boolean' ? record.followAccent : d.followAccent,
    followCoverArt: typeof record.followCoverArt === 'boolean' ? record.followCoverArt : d.followCoverArt,
    tintStrength: num(record.tintStrength, d.tintStrength, 0, 100),
    depth: num(record.depth, d.depth, 0, 100),
    hueShift: num(record.hueShift, d.hueShift, -180, 180),
    surfaceHue: num(record.surfaceHue, d.surfaceHue, 0, 360),
    textContrast: num(record.textContrast, d.textContrast, 0, 100),
    smokyGlass: typeof record.smokyGlass === 'boolean' ? record.smokyGlass : d.smokyGlass,
    glassBlur: num(record.glassBlur, d.glassBlur, 10, 120),
    glassPanelOpacity: num(record.glassPanelOpacity, d.glassPanelOpacity, 30, 95),
    overrides
  }
}

/**
 * Derives the base palette. `surfaceAccent` replaces the theme accent as the colour the
 * backgrounds follow (used for the album-cover colour).
 */
export function deriveCustomTokens(theme: CustomTheme, surfaceAccent?: string | null): CustomBaseTokens {
  const followedAccent = normalizeHex(surfaceAccent) ?? theme.accent
  const accentHsl = rgbToHsl(hexToRgb(followedAccent))
  const hue = theme.followAccent
    ? (accentHsl.h + theme.hueShift + 360) % 360
    : theme.surfaceHue

  // A grey accent should give grey backgrounds, a vivid one fully coloured ones.
  const accentVividness = theme.followAccent ? clamp(accentHsl.s / 0.6, 0, 1) : 1
  const saturation = (theme.tintStrength / 100) * 0.9 * accentVividness

  const base = (theme.depth / 100) * 0.14
  const bg = (lightness: number) => hslToRgb(hue, saturation, lightness)

  const textBase = hslToRgb(hue, 0.25 * (theme.tintStrength / 100), 0.96)
  const t = clamp(theme.textContrast, 0, 100) / 100
  const borderBase = hslToRgb(hue, 0.3, 0.85)

  const tokens: CustomBaseTokens = {
    bgPrimary: rgbToHex(bg(base)),
    bgSecondary: rgbToHex(bg(base + 0.022)),
    bgTertiary: rgbToHex(bg(base + 0.046)),
    glassBg: 'rgba(255, 255, 255, 0.03)',
    glassBorder: rgba(borderBase, 0.09),
    glassHighlight: 'rgba(255, 255, 255, 0.05)',
    textPrimary: rgba(textBase, 0.95),
    textSecondary: rgba(textBase, 0.54 + 0.26 * t),
    textTertiary: rgba(textBase, 0.38 + 0.24 * t)
  }

  const o = theme.overrides
  if (o.bgPrimary) tokens.bgPrimary = o.bgPrimary
  if (o.bgSecondary) tokens.bgSecondary = o.bgSecondary
  if (o.bgTertiary) tokens.bgTertiary = o.bgTertiary

  // Derived text is never allowed to be hard to read, however light the backgrounds are set:
  // its opacity is raised just enough. (Colours picked by hand are left alone and only warned about.)
  const backgrounds = [tokens.bgPrimary, tokens.bgSecondary, tokens.bgTertiary]
  const ensureReadable = (key: 'textPrimary' | 'textSecondary' | 'textTertiary', alpha: number): string => {
    const minimum = MIN_CONTRAST[key] ?? 3
    let a = alpha
    while (a < 0.99 && Math.min(...backgrounds.map((bgColor) => contrastRatio(rgba(textBase, a), bgColor))) < minimum) a += 0.02
    return rgba(textBase, Math.min(a, 1))
  }
  tokens.textPrimary = ensureReadable('textPrimary', 0.95)
  tokens.textSecondary = ensureReadable('textSecondary', 0.54 + 0.26 * t)
  tokens.textTertiary = ensureReadable('textTertiary', 0.38 + 0.24 * t)

  if (o.bgPrimary) tokens.bgPrimary = o.bgPrimary
  if (o.bgSecondary) tokens.bgSecondary = o.bgSecondary
  if (o.bgTertiary) tokens.bgTertiary = o.bgTertiary
  if (o.border) tokens.glassBorder = o.border
  if (o.textPrimary) tokens.textPrimary = o.textPrimary
  if (o.textSecondary) tokens.textSecondary = o.textSecondary
  if (o.textTertiary) tokens.textTertiary = o.textTertiary
  return tokens
}

/** The colour each editable slot currently has, as a hex for the colour inputs. */
export function previewHexes(tokens: CustomBaseTokens): Record<CustomColorKey, string> {
  const base = hexToRgb(normalizeHex(tokens.bgPrimary) ?? '#000000')
  const flat = (value: string): string => {
    const parsed = parseColor(value)
    return parsed ? rgbToHex(composite(parsed, base)) : '#000000'
  }
  return {
    bgPrimary: flat(tokens.bgPrimary),
    bgSecondary: flat(tokens.bgSecondary),
    bgTertiary: flat(tokens.bgTertiary),
    border: flat(tokens.glassBorder),
    textPrimary: flat(tokens.textPrimary),
    textSecondary: flat(tokens.textSecondary),
    textTertiary: flat(tokens.textTertiary)
  }
}

export interface ContrastWarning {
  key: CustomColorKey
  label: string
  ratio: number
}

/** Text slots that would be hard to read on the main background and the raised panels. */
export function findContrastWarnings(tokens: CustomBaseTokens): ContrastWarning[] {
  const warnings: ContrastWarning[] = []
  for (const key of ['textPrimary', 'textSecondary', 'textTertiary'] as const) {
    const minimum = MIN_CONTRAST[key] ?? 3
    const value = tokens[key]
    const worst = Math.min(
      contrastRatio(value, tokens.bgPrimary),
      contrastRatio(value, tokens.bgSecondary),
      contrastRatio(value, tokens.bgTertiary)
    )
    if (worst < minimum) warnings.push({ key, label: CUSTOM_COLOR_LABELS[key], ratio: Math.round(worst * 10) / 10 })
  }
  return warnings
}
