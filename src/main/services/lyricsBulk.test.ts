import assert from 'node:assert/strict'
import test from 'node:test'
import { LyricsBulkRunner, type BulkTrack } from './lyricsBulk.ts'
import type { LyricsLookupResult } from '../../types/lyrics.ts'

const payload = { source: 'lrclib', provider: 'lrclib', format: 'plain', plainLyrics: 'la', syncedLyrics: null, syncedLines: [] } as const
const tracks = (n: number): BulkTrack[] => Array.from({ length: n }, (_, i) => ({ path: `/t${i}`, title: `T${i}`, artist: 'A' }))

function harness(script: (track: BulkTrack, call: number) => { result: LyricsLookupResult; ms: number }) {
  let clock = 0
  const sleeps: number[] = []
  let call = 0
  const runner = new LyricsBulkRunner({
    minGapMs: 1000,
    rateLimitWaitMs: 60_000,
    now: () => clock,
    sleep: async (ms) => { sleeps.push(ms); clock += ms },
    lookup: async (track) => {
      const step = script(track, call++)
      clock += step.ms
      return step.result
    }
  })
  return { runner, sleeps, calls: () => call }
}

test('counts found, cached, not found and spaces network calls only', async () => {
  const { runner, sleeps } = harness((_t, i) => {
    if (i === 0) return { result: { status: 'hit', lyrics: payload as never, cached: false }, ms: 400 }
    if (i === 1) return { result: { status: 'hit', lyrics: payload as never, cached: true }, ms: 5 }
    return { result: { status: 'not_found', reason: 'provider-not-found' }, ms: 5 }
  })
  const state = await runner.run(tracks(3))
  assert.equal(state.status, 'done')
  assert.deepEqual([state.found, state.alreadyHad, state.notFound, state.done], [1, 1, 1, 3])
  assert.equal(sleeps.reduce((a, b) => a + b, 0), 1000) // one gap after the one slow call
})

test('a rate limit waits, retries the same song, then continues', async () => {
  let clock = 0
  let calls = 0
  const waits: Array<number | null> = []
  const runner = new LyricsBulkRunner({
    minGapMs: 0,
    rateLimitWaitMs: 60_000,
    now: () => clock,
    sleep: async (ms) => { clock += ms },
    lookup: async () => {
      calls += 1
      clock += 300
      return calls === 1
        ? { status: 'not_found', reason: 'provider-unavailable' }
        : { status: 'hit', lyrics: payload as never, cached: false }
    },
    onState: (s) => { if (s.status === 'waiting') waits.push(s.waitingUntil) }
  })
  const state = await runner.run(tracks(1))
  assert.equal(state.status, 'done')
  assert.equal(state.found, 1)
  assert.equal(calls, 2)
  assert.ok(waits.length > 0 && waits[0] !== null)
})

test('stops with a message after repeated rate limits and keeps progress', async () => {
  const { runner } = harness((_t, i) =>
    i === 0
      ? { result: { status: 'hit', lyrics: payload as never, cached: false }, ms: 300 }
      : { result: { status: 'transient_error', message: '429' }, ms: 10 })
  const state = await runner.run(tracks(3))
  assert.equal(state.status, 'stopped')
  assert.equal(state.found, 1)
  assert.equal(state.done, 1)
  assert.match(state.message ?? '', /Try again later/)
})

test('cancel ends the run and keeps counts', async () => {
  let runnerRef: LyricsBulkRunner
  let n = 0
  let clock = 0
  runnerRef = new LyricsBulkRunner({
    minGapMs: 1000, now: () => clock, sleep: async (ms) => { clock += ms },
    lookup: async () => { clock += 400; if (++n === 2) runnerRef.cancel(); return { status: 'not_found', reason: 'provider-not-found' } }
  })
  const state = await runnerRef.run(tracks(10))
  assert.equal(state.status, 'cancelled')
  assert.equal(state.done, 2)
})

test('pause holds until resume', async () => {
  let clock = 0
  let sleeps = 0
  let r: LyricsBulkRunner
  r = new LyricsBulkRunner({
    minGapMs: 0, now: () => clock,
    sleep: async (ms) => { clock += ms; sleeps += 1; if (sleeps === 3) r.resume() },
    lookup: async () => { clock += 400; return { status: 'not_found', reason: 'provider-not-found' } },
    onState: undefined
  })
  const p = r.run(tracks(2))
  r.pause()
  const state = await p
  assert.equal(state.status, 'done')
  assert.equal(state.done, 2)
})
