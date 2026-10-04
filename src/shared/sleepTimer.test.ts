import test from 'node:test'
import assert from 'node:assert/strict'
import { extendMinutes, formatRemaining, remainingMs, shouldFire, startEndOfTrack, startMinutes } from './sleepTimer.ts'

const player = { path: '/a.m4b', currentTime: 100, duration: 3600 }

test('minutes timer fires only once the time is up', () => {
  const state = startMinutes(1000, 30)
  assert.equal(remainingMs(state, 1000), 30 * 60_000)
  assert.equal(shouldFire(state, 1000 + 29 * 60_000, player), false)
  assert.equal(shouldFire(state, 1000 + 30 * 60_000, player), true)
  assert.equal(remainingMs(state, 1000 + 99 * 60_000), 0)
})

test('extend adds time to a minutes timer and ignores others', () => {
  const state = extendMinutes(startMinutes(0, 15), 15)
  assert.equal(remainingMs(state, 0), 30 * 60_000)
  const eot = startEndOfTrack('/a.m4b')
  assert.equal(extendMinutes(eot, 15), eot)
  assert.equal(extendMinutes(null, 15), null)
})

test('end-of-track fires near the end or when the file changes', () => {
  const state = startEndOfTrack('/a.m4b')
  assert.equal(shouldFire(state, 0, player), false)
  assert.equal(shouldFire(state, 0, { ...player, currentTime: 3599.8 }), true)
  assert.equal(shouldFire(state, 0, { ...player, path: '/b.m4b', currentTime: 0 }), true)
  assert.equal(shouldFire(state, 0, { ...player, duration: 0 }), false)
})

test('bad inputs make no timer', () => {
  assert.equal(startMinutes(0, 0), null)
  assert.equal(startMinutes(0, NaN), null)
  assert.equal(startEndOfTrack(null), null)
  assert.equal(shouldFire(null, 0, player), false)
})

test('formatRemaining', () => {
  assert.equal(formatRemaining(61_000), '1:01')
  assert.equal(formatRemaining(3_725_000), '1:02:05')
  assert.equal(formatRemaining(0), '0:00')
})
