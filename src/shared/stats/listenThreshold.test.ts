import assert from 'node:assert/strict'
import test from 'node:test'
import { listenThresholdSeconds } from './listenThreshold'

test('listen threshold is half the track, between 30 s and 2 min', () => {
  assert.equal(listenThresholdSeconds(40), 30)
  assert.equal(listenThresholdSeconds(100), 50)
  assert.equal(listenThresholdSeconds(180), 90)
  assert.equal(listenThresholdSeconds(600), 120)
})

test('short or unknown tracks', () => {
  assert.equal(listenThresholdSeconds(4), 4)
  assert.equal(listenThresholdSeconds(0), 30)
  assert.equal(listenThresholdSeconds(null), 30)
})
