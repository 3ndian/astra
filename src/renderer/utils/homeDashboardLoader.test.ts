import assert from 'node:assert/strict'
import test from 'node:test'
import { createHomeDashboardLoader } from './homeDashboardLoader.ts'
import type { HomeDashboard } from '../../types/home'

const dashboard: HomeDashboard = {
  day_key: '2026-09-30', recent_sources: [], active_source: null,
  recent_releases: [], rediscover_releases: [], newly_added_releases: []
}
const unexpected = () => { assert.fail('Unexpected dashboard callback') }
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

test('Home coalesces refreshes while a query runs and never displays its stale result', async () => {
  const calls: number[] = []
  const completed: number[] = []
  const pending: Array<(value: HomeDashboard) => void> = []
  const loader = createHomeDashboardLoader((query) => {
    calls.push(query.rotation!)
    return new Promise((resolve) => pending.push(resolve))
  })
  loader.request({ rotation: 0 }, () => completed.push(0), unexpected)
  await flush()
  loader.request({ rotation: 1 }, () => completed.push(1), unexpected)
  loader.request({ rotation: 2 }, () => completed.push(2), unexpected)
  await flush()
  assert.deepEqual(calls, [0])
  pending.shift()!(dashboard)
  await flush()
  assert.deepEqual(completed, [])
  assert.deepEqual(calls, [0, 2])
  pending.shift()!(dashboard)
  await flush()
  assert.deepEqual(completed, [2])
})

test('Home cancels queued refreshes when playback starts or the view unmounts', async () => {
  let calls = 0
  let finish!: (value: HomeDashboard) => void
  const loader = createHomeDashboardLoader(() => {
    calls++
    return new Promise((resolve) => { finish = resolve })
  })
  const canceledBeforeStart = loader.request({}, unexpected, unexpected)
  canceledBeforeStart()
  await flush()
  assert.equal(calls, 0)
  const cancelActive = loader.request({}, unexpected, unexpected)
  await flush()
  const cancelQueued = loader.request({}, unexpected, unexpected)
  cancelActive()
  cancelQueued()
  finish(dashboard)
  await flush()
  assert.equal(calls, 1)
  let resumed = false
  loader.request({}, () => { resumed = true }, unexpected)
  await flush()
  finish(dashboard)
  await flush()
  assert.equal(resumed, true)
})

test('Home ignores stale errors, reports current failures and allows retry', async () => {
  const errors: unknown[] = []
  const rejects: Array<(error: unknown) => void> = []
  const loader = createHomeDashboardLoader(() => new Promise((_, reject) => rejects.push(reject)))
  loader.request({}, unexpected, (error) => errors.push(error))
  await flush()
  loader.request({}, unexpected, (error) => errors.push(error))
  rejects.shift()!('stale')
  await flush()
  assert.equal(errors.length, 0)
  rejects.shift()!('current')
  await flush()
  assert.deepEqual([...errors], ['current'])
  loader.request({}, unexpected, (error) => errors.push(error))
  await flush()
  rejects.shift()!('retry')
  await flush()
  assert.deepEqual([...errors], ['current', 'retry'])
})
