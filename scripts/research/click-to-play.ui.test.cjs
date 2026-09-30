const test = require('node:test')
const assert = require('node:assert/strict')
const { cases, completedMigrations } = require('./click-to-play.ui.cjs')
const { metrics, quantile } = require('./click-to-play.ui.summary.cjs')

test('matrix pairs real/controlled modes for every condition and isolates the large-context variants', () => {
  const matrix = cases()
  assert.equal(matrix.length, 50)
  assert.equal(new Set(matrix.map((entry) => entry.name)).size, matrix.length)
  for (const item of matrix.filter((entry) => entry.controlled)) {
    assert.ok(matrix.some((other) => !other.controlled && other.route === item.route && other.size === item.size && other.position === item.position && other.variant === item.variant))
  }
  assert.ok(matrix.filter((entry) => !['primary', 'fixed-library'].includes(entry.variant)).every((entry) => entry.size === 50000))
  assert.ok(matrix.filter((entry) => entry.variant === 'fixed-library').every((entry) => entry.size === 12 && entry.librarySize === 50000))
})

test('top-level wall-clock stages partition click-to-play without adding overlapping decode or hydration measurements', () => {
  const marks = Object.entries({ click: 10, collectionFetchStart: 11, collectionFetchEnd: 35, storeEnter: 40, pathsPrepared: 50, queuePublished: 57, queuePrepared: 60, loaderEnter: 70, scheduled: 270 }).map(([name, at]) => ({ name, at }))
  marks.push({ name: 'completed', at: 272, details: { attempt: { selectedTrackHydrationMs: 8 }, timings: { ffmpegMs: 150, loudnessMs: 5, postDeliveryCommitMs: 10, webAudioBufferAllocationMs: 1, pcmDeinterleaveMs: 6, pcmCommitMs: 2 } } })
  const value = metrics({ marks })
  assert.equal(value.clickToScheduledPlay, 260)
  assert.equal(value.clickToStore + value.queuePreparation + value.postQueueToLoader + value.audioLoadToScheduledPlay, 260)
  assert.equal(value.pathSnapshots + value.queueBuildAndPublication + value.queueCleanup, value.queuePreparation)
  assert.equal(value.collectionFetch, 24)
  assert.equal(value.selectedTrackHydration, 8)
  assert.equal(value.ffmpeg, 150)
  assert.equal(value.audioLoadToScheduledPlay, 200)
  assert.equal(value.audioBufferPreparation, 10)
  assert.equal(value.webAudioBufferAllocation, 1)
  assert.equal(value.pcmDeinterleave, 6)
  assert.equal(value.pcmCommit, 2)
  assert.equal(value.clickToFeedbackFrame, null)
  assert.equal(metrics({ marks: marks.filter((mark) => mark.name !== 'scheduled') }).clickToScheduledPlay, null)
})

test('nearest-rank p95 and even median exclude absent observations', () => {
  assert.equal(quantile([null, undefined, 1, 2, 3, 4], 0.5), 2.5)
  assert.equal(quantile(Array.from({ length: 50 }, (_, i) => i + 1), 0.95), 48)
  assert.equal(quantile([], 0.5), null)
})

test('already-scanned fixtures cover every scheduled startup backfill migration', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/main/index.ts'), 'utf8')
  const keys = [...source.matchAll(/const \w+_BACKFILL_MIGRATION_KEY = '([^']+)'/g)].map((match) => match[1])
  assert.deepEqual([...completedMigrations].sort(), keys.sort())
})
