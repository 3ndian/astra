import test from 'node:test'
import assert from 'node:assert/strict'
import { polygonBandAtTime, polygonTimeExtent } from './selectionGeometry.ts'

const diamond = [
  { t: 10, hz: 1000 },
  { t: 12, hz: 4000 },
  { t: 14, hz: 1000 },
  { t: 12, hz: 250 }
]

test('time extent covers the whole shape', () => {
  assert.deepEqual(polygonTimeExtent(diamond), { start: 10, end: 14 })
  assert.equal(polygonTimeExtent([]), null)
})

test('band is widest in the middle and narrows to the tips', () => {
  const mid = polygonBandAtTime(diamond, 12)!
  assert.ok(Math.abs(mid.lowHz - 250) < 1 && Math.abs(mid.highHz - 4000) < 1)
  const early = polygonBandAtTime(diamond, 11)!
  assert.ok(early.lowHz > 250 && early.highHz < 4000)
  assert.ok(Math.abs(early.lowHz - 500) < 2 && Math.abs(early.highHz - 2000) < 2)
})

test('nothing outside the shape in time, and no band for fewer than 3 points', () => {
  assert.equal(polygonBandAtTime(diamond, 9), null)
  assert.equal(polygonBandAtTime(diamond, 15), null)
  assert.equal(polygonBandAtTime(diamond.slice(0, 2), 11), null)
})

import { simplifyPath } from './selectionGeometry.ts'

test('simplifyPath keeps the corners of a noisy square and drops the middle of straight runs', () => {
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i <= 10; i++) pts.push({ x: i * 10, y: 0.2 * (i % 2) })
  for (let i = 1; i <= 10; i++) pts.push({ x: 100, y: i * 10 })
  const kept = simplifyPath(pts, 2)
  assert.ok(kept.length <= 4)
  assert.equal(kept[0], 0)
  assert.equal(kept[kept.length - 1], pts.length - 1)
})
