import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_POPOUT_SCHEME, popoutScheme } from './popoutScheme'

test('no cover colours gives the default scheme', () => {
  assert.deepEqual(popoutScheme([], []), DEFAULT_POPOUT_SCHEME)
})

test('backgrounds stay dark and the accent stays bright, whatever the cover', () => {
  for (const cover of ['#e5497b', '#ffd400', '#0a1a40', '#808080', '#ffffff']) {
    const scheme = popoutScheme([cover, '#35206e'], [cover])
    const lightness = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      return (Math.max(n >> 16, (n >> 8) & 255, n & 255) + Math.min(n >> 16, (n >> 8) & 255, n & 255)) / 510
    }
    assert.ok(lightness(scheme.bg1) <= 0.45, `bg1 too light for ${cover}`)
    assert.ok(lightness(scheme.bg2) <= 0.3, `bg2 too light for ${cover}`)
    assert.ok(lightness(scheme.accent) >= 0.45, `accent too dark for ${cover}`)
    assert.match(scheme.accentText, /^#[0-9a-f]{6}$/)
  }
})

test('a grey cover gets a neutral accent', () => {
  assert.equal(popoutScheme(['#808080'], ['#808080']).accent, '#f1f1f4')
})
