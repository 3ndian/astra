import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayTracker } from './playTracker.ts'
import type { SpotifyStatus } from '../../types/spotify.ts'

function status(id: string, state: SpotifyStatus['state'], position: number, durationMs = 200_000): SpotifyStatus {
  return {
    state,
    track: { id, title: 'T', artist: 'A', album: 'B', artworkUrl: null, durationMs },
    positionSeconds: position,
    volume: 50,
    artworkDataUrl: null,
    message: null
  }
}

function run(tracker: ReturnType<typeof createPlayTracker>, id: string, seconds: number, startMs = 0, startPos = 0) {
  const records = []
  for (let s = 0; s <= seconds; s++) {
    const r = tracker.observe(status(id, 'playing', startPos + s), startMs + s * 1000)
    if (r) records.push(r)
  }
  return records
}

test('records once after 30 seconds of listening', () => {
  const tracker = createPlayTracker()
  assert.equal(run(tracker, 'spotify:track:a', 29).length, 0)
  const tracker2 = createPlayTracker()
  assert.equal(run(tracker2, 'spotify:track:a', 60).length, 1)
})

test('skipping before 30 seconds records nothing', () => {
  const tracker = createPlayTracker()
  assert.equal(run(tracker, 'spotify:track:a', 20).length, 0)
  assert.equal(run(tracker, 'spotify:track:b', 20, 21_000).length, 0)
})

test('paused time does not count', () => {
  const tracker = createPlayTracker()
  run(tracker, 'spotify:track:a', 20)
  for (let s = 21; s < 120; s += 2) tracker.observe(status('spotify:track:a', 'paused', 20), s * 1000)
  assert.equal(tracker.observe(status('spotify:track:a', 'playing', 20), 121_000), null)
  const records = run(tracker, 'spotify:track:a', 15, 122_000, 20)
  assert.equal(records.length, 1)
})

test('ads and podcast episodes are skipped', () => {
  const tracker = createPlayTracker()
  assert.equal(run(tracker, 'spotify:ad:123', 60).length, 0)
  assert.equal(run(tracker, 'spotify:episode:9', 60, 70_000).length, 0)
})

test('a repeat of the same track records again', () => {
  const tracker = createPlayTracker()
  assert.equal(run(tracker, 'spotify:track:a', 40).length, 1)
  assert.equal(run(tracker, 'spotify:track:a', 40, 41_000, 0).length, 1)
})

test('a long gap between observations is not counted', () => {
  const tracker = createPlayTracker()
  tracker.observe(status('spotify:track:a', 'playing', 0), 0)
  assert.equal(tracker.observe(status('spotify:track:a', 'playing', 1), 600_000), null)
})

test('short tracks need half their length', () => {
  const tracker = createPlayTracker()
  const records = []
  for (let s = 0; s <= 12; s++) {
    const r = tracker.observe(status('spotify:track:s', 'playing', s, 20_000), s * 1000)
    if (r) records.push(r)
  }
  assert.equal(records.length, 1)
})
