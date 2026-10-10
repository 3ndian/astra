import assert from 'node:assert/strict'
import test from 'node:test'
import { clampPopoutSize, normalizeSpotifyPopoutPrefs } from './spotifyPopout'

test('defaults', () => {
  const prefs = normalizeSpotifyPopoutPrefs(null)
  assert.equal(prefs.layout, 'square')
  assert.equal(prefs.alwaysOnTop, true)
  assert.equal(prefs.albumColors, true)
  assert.equal(normalizeSpotifyPopoutPrefs({ albumColors: false }).albumColors, false)
  assert.deepEqual(prefs.square, { width: 260, height: 260 })
  assert.deepEqual(prefs.wide, { width: 420, height: 120 })
})

test('square stays square and within limits; wide is independent', () => {
  assert.deepEqual(clampPopoutSize('square', 100, 900), { width: 640, height: 640 })
  assert.deepEqual(clampPopoutSize('square', 300, 250), { width: 300, height: 300 })
  assert.deepEqual(clampPopoutSize('wide', 2000, 10), { width: 1000, height: 90 })
})

test('forgets a position that is no longer on any screen', () => {
  const display = [{ x: 0, y: 0, width: 1000, height: 800 }]
  const kept = normalizeSpotifyPopoutPrefs({ layout: 'wide', wide: { x: 50, y: 60, width: 500, height: 140 } }, display)
  assert.equal(kept.layout, 'wide')
  assert.deepEqual(kept.wide, { x: 50, y: 60, width: 500, height: 140 })
  const lost = normalizeSpotifyPopoutPrefs({ wide: { x: 5000, y: 60, width: 500, height: 140 } }, display)
  assert.deepEqual(lost.wide, { width: 500, height: 140 })
})

import { proportionalCornerResize } from './spotifyPopout'

const start = { x: 100, y: 100, width: 420, height: 120 }

test('corner drag keeps the shape and anchors the opposite corner', () => {
  const grown = proportionalCornerResize(start, { x: 100, y: 100, width: 630, height: 130 }, 'bottom-right')
  assert.deepEqual(grown, { x: 100, y: 100, width: 630, height: 180 })
  const topLeft = proportionalCornerResize(start, { x: 40, y: 60, width: 480, height: 160 }, 'top-left')
  assert.equal(topLeft?.width, 560)
  assert.equal(topLeft?.height, 160)
  assert.equal(topLeft?.x, 100 + 420 - 560)
  assert.equal(topLeft?.y, 100 + 120 - 160)
})

test('sides, top and bottom are left alone; corner drag respects the limits', () => {
  assert.equal(proportionalCornerResize(start, { ...start, width: 500 }, 'right'), null)
  assert.equal(proportionalCornerResize(start, { ...start, height: 200 }, 'bottom'), null)
  const small = proportionalCornerResize(start, { x: 100, y: 100, width: 100, height: 30 }, 'bottom-right')
  assert.ok(small && small.width >= 340 && small.height >= 90)
  const big = proportionalCornerResize(start, { x: 100, y: 100, width: 5000, height: 1400 }, 'bottom-right')
  assert.ok(big && big.width <= 1000 && big.height <= 900)
})

import { wideShape } from './spotifyPopout'

test('wide layout: strip while wide, stacked once it gets tall', () => {
  assert.equal(wideShape(420, 120).stacked, false)
  assert.equal(wideShape(420, 120).cover, 120)
  assert.equal(wideShape(340, 90).stacked, false)
  const tall = wideShape(340, 520)
  assert.equal(tall.stacked, true)
  assert.equal(tall.cover, 340)
  const nearlySquare = wideShape(420, 330)
  assert.equal(nearlySquare.stacked, true)
  assert.ok(nearlySquare.cover < 420 && nearlySquare.cover > 100)
})
