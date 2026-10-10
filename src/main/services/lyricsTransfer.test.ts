import assert from 'node:assert/strict'
import test from 'node:test'
import { buildExportFile, matchImport, normalizeKey, parseExportFile, type LyricsExportEntry } from './lyricsTransfer.ts'

const entry = (over: Partial<LyricsExportEntry> = {}): LyricsExportEntry => ({
  title: 'Karma Police', artist: 'Radiohead', album: 'OK Computer', durationSeconds: 264,
  format: 'lrc', plainLyrics: null, syncedLyrics: '[00:01.00]hi', ...over
})

test('normalizeKey ignores case, accents, punctuation and bracketed suffixes', () => {
  assert.equal(normalizeKey('Beyoncé – Halo (Remastered 2020)'), normalizeKey('beyonce halo'))
})

test('export file round trips and drops junk entries', () => {
  const json = JSON.stringify(buildExportFile([entry()]))
  const parsed = parseExportFile(json)
  assert.equal(parsed?.length, 1)
  assert.equal(parseExportFile('nope'), null)
  assert.equal(parseExportFile('{"kind":"other","entries":[]}'), null)
  const withJunk = JSON.parse(json)
  withJunk.entries.push({ title: 'x', artist: 'y' })
  assert.equal(parseExportFile(JSON.stringify(withJunk))?.length, 1)
})

test('matches by title and artist, honours duration, skips songs that have lyrics', () => {
  const targets = [
    { path: '/a', title: 'Karma Police', artist: 'Radiohead', durationSeconds: 265 },
    { path: '/b', title: 'Karma Police', artist: 'Radiohead', durationSeconds: 400 },
    { path: '/c', title: 'Paranoid Android', artist: 'Radiohead', durationSeconds: 380 }
  ]
  const entries = [entry(), entry({ title: 'Paranoid Android', durationSeconds: 383 }), entry({ title: 'Lucky' })]
  const result = matchImport(entries, targets, (p) => p === '/c')
  assert.deepEqual(result.matches.map((m) => m.path), ['/a'])
  assert.equal(result.skipped, 1)
  assert.equal(result.unmatched, 1)
})
