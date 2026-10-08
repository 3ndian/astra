import test from 'node:test'
import assert from 'node:assert/strict'
import { extractAlbumPalette, liftForDisplay, sampleGradient } from './albumPalette.ts'

function solid(parts: Array<[number, number, number, number]>): Uint8Array {
  const out: number[] = []
  for (const [r, g, b, n] of parts) for (let i = 0; i < n; i += 1) out.push(r, g, b, 255)
  return Uint8Array.from(out)
}

test('picks distinct colours, darkest first', () => {
  const palette = extractAlbumPalette(solid([[200, 30, 30, 50], [30, 30, 200, 40], [240, 220, 60, 30]]), 3)
  assert.equal(palette.length, 3)
  const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16)
  assert.ok(lum(palette[0]) <= lum(palette[1]) && lum(palette[1]) <= lum(palette[2]))
})

test('a grey cover gives greys', () => {
  const palette = extractAlbumPalette(solid([[40, 40, 40, 30], [128, 128, 128, 30], [220, 220, 220, 30]]), 4)
  assert.ok(palette.length >= 2)
  for (const hex of palette) {
    assert.equal(hex.slice(1, 3), hex.slice(3, 5))
    assert.equal(hex.slice(3, 5), hex.slice(5, 7))
  }
})

test('transparent or empty input gives no palette', () => {
  assert.deepEqual(extractAlbumPalette(new Uint8Array(0)), [])
  assert.deepEqual(extractAlbumPalette(Uint8Array.from([10, 20, 30, 0])), [])
})

test('sampleGradient interpolates and clamps', () => {
  assert.equal(sampleGradient(['#000000', '#ffffff'], 0), '#000000')
  assert.equal(sampleGradient(['#000000', '#ffffff'], 1), '#ffffff')
  assert.equal(sampleGradient(['#000000', '#ffffff'], 0.5), '#808080')
  assert.equal(sampleGradient(['#000000', '#ffffff'], 9), '#ffffff')
  assert.equal(sampleGradient([], 0.5), '#ffffff')
})

test('liftForDisplay lightens only dark colours', () => {
  const [dark, light] = liftForDisplay(['#101010', '#f0f0f0'])
  assert.notEqual(dark, '#101010')
  assert.equal(light, '#f0f0f0')
})
