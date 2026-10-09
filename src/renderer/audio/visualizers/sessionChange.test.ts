import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSessionChange } from './sessionChange.ts'

test('pausing and resuming hold the picture', () => {
  assert.equal(resolveSessionChange({ event: 'state', previous: 'playing', next: 'paused' }, false), 'hold')
  assert.equal(resolveSessionChange({ event: 'state', previous: 'paused', next: 'playing' }, false), 'hold')
})

test('stop, load and new tracks reset when history is not kept', () => {
  assert.equal(resolveSessionChange({ event: 'state', previous: 'playing', next: 'stopped' }, false), 'reset')
  assert.equal(resolveSessionChange({ event: 'state', previous: 'stopped', next: 'loading' }, false), 'reset')
  assert.equal(resolveSessionChange({ event: 'track' }, false), 'reset')
})

test('kept history never resets and marks track changes', () => {
  assert.equal(resolveSessionChange({ event: 'track' }, true), 'track')
  assert.equal(resolveSessionChange({ event: 'state', previous: 'playing', next: 'stopped' }, true), 'hold')
  assert.equal(resolveSessionChange({ event: 'state', previous: 'playing', next: 'paused' }, true), 'hold')
})
