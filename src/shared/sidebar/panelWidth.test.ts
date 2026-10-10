import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clampRightPanelWidth, parseStoredPanelWidth } from './panelWidth'

test('clamps to the minimum and the lower of 640px and half the window', () => {
  assert.equal(clampRightPanelWidth(100, 1600, 288), 240)
  assert.equal(clampRightPanelWidth(900, 1600, 288), 640)
  assert.equal(clampRightPanelWidth(900, 1000, 288), 500)
  assert.equal(clampRightPanelWidth(400, 1600, 288), 400)
})

test('a window too small for the minimum still allows the minimum', () => {
  assert.equal(clampRightPanelWidth(400, 300, 288), 240)
})

test('non-numbers fall back', () => {
  assert.equal(clampRightPanelWidth(Number.NaN, 1600, 288), 288)
})

test('stored values outside the range are ignored', () => {
  assert.equal(parseStoredPanelWidth(null), null)
  assert.equal(parseStoredPanelWidth(''), null)
  assert.equal(parseStoredPanelWidth('100'), null)
  assert.equal(parseStoredPanelWidth('9000'), null)
  assert.equal(parseStoredPanelWidth('350.4'), 350)
})
