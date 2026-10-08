import test from 'node:test'
import assert from 'node:assert/strict'
import { formatTimings } from './switchTiming.ts'

test('lists entries in order and marks only the slowest', () => {
  const text = formatTimings('[switch]', [
    { label: 'open db', ms: 12.34 },
    { label: 'albums', ms: 80 },
    { label: 'tracks', ms: 5 }
  ], 100)
  const lines = text.split('\n')
  assert.equal(lines[0], '[switch]')
  assert.ok(lines[1].includes('open db') && lines[1].includes('12.3 ms'))
  assert.ok(lines[2].includes('albums') && lines[2].endsWith('<--'))
  assert.ok(!lines[1].includes('<--') && !lines[3].includes('<--'))
  assert.ok(lines[4].includes('total') && lines[4].includes('100 ms'))
})

test('a single entry is not marked as slowest', () => {
  const text = formatTimings('t', [{ label: 'only', ms: 9 }])
  assert.ok(!text.includes('<--'))
})

test('bad durations print as zero', () => {
  const text = formatTimings('t', [{ label: 'a', ms: -5 }, { label: 'b', ms: Number.NaN }], Number.POSITIVE_INFINITY)
  assert.equal((text.match(/ 0 ms/g) ?? []).length, 3)
  assert.ok(!text.includes('<--'))
})

test('no entries still prints the title and total', () => {
  assert.equal(formatTimings('hi', [], 5).split('\n').length, 2)
})
