import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSidecarLrcContent, formatLrcTimestamp } from './sidecarExport.ts'

test('formats timestamps with centisecond rounding and carry', () => {
  assert.equal(formatLrcTimestamp(0), '[00:00.00]')
  assert.equal(formatLrcTimestamp(1250), '[00:01.25]')
  assert.equal(formatLrcTimestamp(61_005), '[01:01.01]')
  assert.equal(formatLrcTimestamp(59_996), '[01:00.00]')
  assert.equal(formatLrcTimestamp(6_000_000), '[100:00.00]')
  assert.equal(formatLrcTimestamp(-5), '[00:00.00]')
  assert.equal(formatLrcTimestamp(Number.NaN), '[00:00.00]')
})

test('prefers timed lines and keeps blank (instrumental) lines', () => {
  const result = buildSidecarLrcContent({
    plainLyrics: 'ignored',
    syncedLyrics: '[00:00.00]ignored',
    syncedLines: [
      { timestampMs: 1000, text: 'First line' },
      { timestampMs: 5000, text: '' },
      { timestampMs: 7500, text: 'Second\nline  ' }
    ]
  })
  assert.deepEqual(result, {
    kind: 'synced',
    content: '[00:01.00]First line\n[00:05.00]\n[00:07.50]Second line\n'
  })
})

test('falls back to raw synced text, then plain text, then nothing', () => {
  assert.deepEqual(
    buildSidecarLrcContent({ plainLyrics: 'p', syncedLyrics: '[00:01.00]hi\r\n[00:02.00]yo', syncedLines: [] }),
    { kind: 'synced', content: '[00:01.00]hi\n[00:02.00]yo\n' }
  )
  assert.deepEqual(
    buildSidecarLrcContent({ plainLyrics: 'line one\r\nline two\n\n', syncedLyrics: null, syncedLines: [] }),
    { kind: 'plain', content: 'line one\nline two\n' }
  )
  assert.equal(buildSidecarLrcContent({ plainLyrics: '  ', syncedLyrics: '', syncedLines: [] }), null)
})

test('timed lines that are all blank do not count as synced lyrics', () => {
  const result = buildSidecarLrcContent({
    plainLyrics: 'real words',
    syncedLyrics: null,
    syncedLines: [{ timestampMs: 0, text: '' }]
  })
  assert.deepEqual(result, { kind: 'plain', content: 'real words\n' })
})
