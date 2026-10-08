import test from 'node:test'
import assert from 'node:assert/strict'
import { clampTransportHeight, heightFromDrag, TRANSPORT_HEIGHT_DEFAULT, TRANSPORT_HEIGHT_MAX, TRANSPORT_HEIGHT_MIN } from './height.ts'

test('clamps and falls back to the default', () => {
  assert.equal(clampTransportHeight(10), TRANSPORT_HEIGHT_MIN)
  assert.equal(clampTransportHeight(999), TRANSPORT_HEIGHT_MAX)
  assert.equal(clampTransportHeight('abc'), TRANSPORT_HEIGHT_DEFAULT)
  assert.equal(clampTransportHeight(100.4), 100)
})

test('dragging up grows, down shrinks, scale is respected', () => {
  assert.equal(heightFromDrag(112, 500, 490, 1), 122)
  assert.equal(heightFromDrag(112, 500, 520, 1), 92)
  assert.equal(heightFromDrag(112, 500, 480, 2), 122)
  assert.equal(heightFromDrag(112, 500, 900, 1), TRANSPORT_HEIGHT_MIN)
  assert.equal(heightFromDrag(112, 500, 500, 0), 112)
})
