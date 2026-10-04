import test from 'node:test'
import assert from 'node:assert/strict'
import {
  contrastRatio,
  createCustomTheme,
  deriveCustomTokens,
  findContrastWarnings,
  hslToRgb,
  normalizeHex,
  previewHexes,
  rgbToHsl,
  sanitizeCustomTheme
} from './customTheme.ts'

const base = createCustomTheme('t1', 'Test', '#e0405a')

test('hsl round trip', () => {
  const rgb = { r: 224, g: 64, b: 90 }
  const { h, s, l } = rgbToHsl(rgb)
  const back = hslToRgb(h, s, l)
  assert.ok(Math.abs(back.r - rgb.r) < 1 && Math.abs(back.g - rgb.g) < 1 && Math.abs(back.b - rgb.b) < 1)
})

test('backgrounds follow the accent hue and get lighter in steps', () => {
  const tokens = deriveCustomTokens(base)
  const hue = rgbToHsl(hexRgb(tokens.bgTertiary)).h
  const accentHue = rgbToHsl(hexRgb('#e0405a')).h
  assert.ok(Math.abs(hue - accentHue) < 12, `${hue} vs ${accentHue}`)
  assert.ok(lightness(tokens.bgPrimary) < lightness(tokens.bgSecondary))
  assert.ok(lightness(tokens.bgSecondary) < lightness(tokens.bgTertiary))
})

test('changing the accent changes the backgrounds, unless follow is off', () => {
  const blue = { ...base, accent: '#3060e0' }
  assert.notEqual(deriveCustomTokens(base).bgSecondary, deriveCustomTokens(blue).bgSecondary)
  const fixedRed = { ...base, followAccent: false, surfaceHue: 0 }
  const fixedBlue = { ...fixedRed, accent: '#3060e0' }
  assert.equal(deriveCustomTokens(fixedRed).bgSecondary, deriveCustomTokens(fixedBlue).bgSecondary)
})

test('zero tint is neutral grey and a grey accent stays grey', () => {
  const neutral = deriveCustomTokens({ ...base, tintStrength: 0 })
  const { r, g, b } = hexRgb(neutral.bgTertiary)
  assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 1)
  const grey = deriveCustomTokens({ ...base, accent: '#808080' })
  const gr = hexRgb(grey.bgTertiary)
  assert.ok(Math.max(gr.r, gr.g, gr.b) - Math.min(gr.r, gr.g, gr.b) <= 1)
})

test('hue shift and the cover-art surface accent move the backgrounds', () => {
  const shifted = deriveCustomTokens({ ...base, hueShift: 120 })
  assert.notEqual(shifted.bgTertiary, deriveCustomTokens(base).bgTertiary)
  assert.notEqual(deriveCustomTokens(base, '#20c060').bgTertiary, deriveCustomTokens(base).bgTertiary)
})

test('derived text is readable for every slider position', () => {
  for (const depth of [0, 50, 100]) {
    for (const tintStrength of [0, 50, 100]) {
      for (const textContrast of [0, 50, 100]) {
        const tokens = deriveCustomTokens({ ...base, depth, tintStrength, textContrast })
        assert.deepEqual(findContrastWarnings(tokens), [], JSON.stringify({ depth, tintStrength, textContrast }))
      }
    }
  }
})

test('overrides replace derived colours and bad text is flagged', () => {
  const tokens = deriveCustomTokens({ ...base, overrides: { bgPrimary: '#102030', textPrimary: '#222222' } })
  assert.equal(tokens.bgPrimary, '#102030')
  assert.equal(tokens.textPrimary, '#222222')
  assert.equal(findContrastWarnings(tokens).some((w) => w.key === 'textPrimary'), true)
  assert.equal(previewHexes(tokens).bgPrimary, '#102030')
})

test('contrast ratio sanity', () => {
  assert.ok(contrastRatio('#ffffff', '#000000') > 20)
  assert.ok(contrastRatio('#777777', '#777777') < 1.01)
})

test('saved data is cleaned', () => {
  assert.equal(sanitizeCustomTheme({ accent: 'nope', id: 'x' }), null)
  const cleaned = sanitizeCustomTheme({ id: 'a', name: '  ', accent: '#ABC', tintStrength: 900, overrides: { bgPrimary: '#102030', textPrimary: 'red' } })
  assert.equal(cleaned?.accent, '#aabbcc')
  assert.equal(cleaned?.tintStrength, 100)
  assert.equal(cleaned?.name, 'Custom')
  assert.deepEqual(cleaned?.overrides, { bgPrimary: '#102030' })
  assert.equal(normalizeHex('#FFF'), '#ffffff')
})

function hexRgb(hex: string) {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }
}
function lightness(hex: string) {
  return rgbToHsl(hexRgb(hex)).l
}
