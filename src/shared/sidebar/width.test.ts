import test from 'node:test'
import assert from 'node:assert/strict'
import { clampSidebarWidth, defaultSidebarWidth, parseStoredSidebarWidth } from './width.ts'

test('default matches the old clamp(272px, 23vw, 352px)', () => {
  assert.equal(defaultSidebarWidth(800), 272)
  assert.equal(defaultSidebarWidth(1200), 276)
  assert.equal(defaultSidebarWidth(1600), 352)
  assert.equal(defaultSidebarWidth(3000), 352)
})

test('clamp keeps the width between min and max', () => {
  assert.equal(clampSidebarWidth(100, 1600), 220)
  assert.equal(clampSidebarWidth(9999, 1600), 520)
  assert.equal(clampSidebarWidth(300.4, 1600), 300)
})

test('clamp never lets the pane exceed half the window', () => {
  assert.equal(clampSidebarWidth(500, 800), 400)
  assert.equal(clampSidebarWidth(500, 300), 220)
})

test('clamp falls back to the default for junk', () => {
  assert.equal(clampSidebarWidth(Number.NaN, 1600), 352)
})

test('parseStoredSidebarWidth', () => {
  assert.equal(parseStoredSidebarWidth(null), null)
  assert.equal(parseStoredSidebarWidth(''), null)
  assert.equal(parseStoredSidebarWidth('abc'), null)
  assert.equal(parseStoredSidebarWidth('100'), null)
  assert.equal(parseStoredSidebarWidth('9999'), null)
  assert.equal(parseStoredSidebarWidth('300'), 300)
})
