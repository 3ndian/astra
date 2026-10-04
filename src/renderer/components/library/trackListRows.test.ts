import { strict as assert } from 'node:assert'
import test from 'node:test'
import { buildTrackListRows, type TrackListDiscTrackLike, type TrackListVirtualRow } from './trackListRows.ts'

function track(discNumber: number | null | undefined): TrackListDiscTrackLike {
  return { disc_number: discNumber }
}

function summarizeRows(rows: readonly TrackListVirtualRow[]): string[] {
  return rows.map((row) => {
    if (row.kind === 'disc-header') return `disc:${row.discNumber}`
    if (row.kind === 'track') return `track:${row.trackIndex}`
    if (row.kind === 'placeholder-header') return `placeholders:${row.count}`
    return `placeholder:${row.placeholderIndex}`
  })
}

test('buildTrackListRows inserts headers for multi-disc albums', () => {
  const rows = buildTrackListRows([
    track(1),
    track(1),
    track(2),
    track(2)
  ], true)

  assert.deepEqual(summarizeRows(rows), [
    'disc:1',
    'track:0',
    'track:1',
    'disc:2',
    'track:2',
    'track:3'
  ])
})

test('buildTrackListRows skips headers for untagged or single-disc albums', () => {
  assert.deepEqual(summarizeRows(buildTrackListRows([
    track(null),
    track(undefined),
    track(0)
  ], true)), [
    'track:0',
    'track:1',
    'track:2'
  ])

  assert.deepEqual(summarizeRows(buildTrackListRows([
    track(1),
    track(1)
  ], true)), [
    'track:0',
    'track:1'
  ])
})

test('buildTrackListRows groups missing disc numbers as disc one when later discs exist', () => {
  const rows = buildTrackListRows([
    track(null),
    track(0),
    track(2)
  ], true)

  assert.deepEqual(summarizeRows(rows), [
    'disc:1',
    'track:0',
    'track:1',
    'disc:2',
    'track:2'
  ])
})

test('buildTrackListRows preserves original track indexes', () => {
  const rows = buildTrackListRows([
    track(1),
    track(2),
    track(3)
  ], true)

  assert.deepEqual(
    rows.filter((row): row is Extract<TrackListVirtualRow, { kind: 'track' }> => row.kind === 'track')
      .map((row) => row.trackIndex),
    [0, 1, 2]
  )
})

test('buildTrackListRows can be disabled', () => {
  const rows = buildTrackListRows([
    track(1),
    track(2)
  ], false)

  assert.deepEqual(summarizeRows(rows), [
    'track:0',
    'track:1'
  ])
})

test('buildTrackListRows appends a not-downloaded group after the tracks', () => {
  assert.deepEqual(summarizeRows(buildTrackListRows([track(1)], true, 2)), [
    'track:0',
    'placeholders:2',
    'placeholder:0',
    'placeholder:1'
  ])
})

test('buildTrackListRows puts placeholders after disc headers and works with no tracks', () => {
  assert.deepEqual(summarizeRows(buildTrackListRows([track(1), track(2)], true, 1)), [
    'disc:1',
    'track:0',
    'disc:2',
    'track:1',
    'placeholders:1',
    'placeholder:0'
  ])
  assert.deepEqual(summarizeRows(buildTrackListRows([], true, 1)), ['placeholders:1', 'placeholder:0'])
  assert.deepEqual(summarizeRows(buildTrackListRows([track(1)], true, 0)), ['track:0'])
})
