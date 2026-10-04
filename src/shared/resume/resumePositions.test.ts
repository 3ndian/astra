import test from 'node:test'
import assert from 'node:assert/strict'
import {
  RESUME_MAX_ENTRIES,
  parseResumeMap,
  recordPosition,
  removePosition,
  resolveResumeStart
} from './resumePositions.ts'

test('records a position and resumes slightly before it', () => {
  const map = recordPosition({}, '/a.m4b', 600, 3600, 1)
  assert.equal(resolveResumeStart(map, '/a.m4b', 3600), 597)
})

test('very early positions are not remembered', () => {
  assert.deepEqual(recordPosition({}, '/a', 5, 3600, 1), {})
})

test('near the end counts as finished and clears the entry', () => {
  const map = recordPosition({}, '/a', 600, 3600, 1)
  assert.deepEqual(recordPosition(map, '/a', 3590, 3600, 2), {})
})

test('a stale entry near the end resumes from the start', () => {
  const map = { '/a': { position: 3590, duration: 3600, updatedAt: 1 } }
  assert.equal(resolveResumeStart(map, '/a', 3600), 0)
})

test('unknown paths start at 0 and removePosition is non-mutating', () => {
  const map = recordPosition({}, '/a', 100, 0, 1)
  assert.equal(resolveResumeStart(map, '/b', 100), 0)
  const cleared = removePosition(map, '/a')
  assert.ok('/a' in map)
  assert.deepEqual(cleared, {})
})

test('oldest entries are pruned past the limit', () => {
  let map = {}
  for (let i = 0; i < RESUME_MAX_ENTRIES + 5; i += 1) map = recordPosition(map, `/f${i}`, 100, 5000, i)
  assert.equal(Object.keys(map).length, RESUME_MAX_ENTRIES)
  assert.ok(!('/f0' in map))
  assert.ok(`/f${RESUME_MAX_ENTRIES + 4}` in map)
})

test('parse tolerates junk', () => {
  assert.deepEqual(parseResumeMap('nope'), {})
  assert.deepEqual(parseResumeMap('[1]'), {})
  assert.equal(parseResumeMap('{"/a":{"position":50}}')['/a'].position, 50)
  assert.deepEqual(parseResumeMap('{"/a":{"position":"x"}}'), {})
})
