import test from 'node:test'
import assert from 'node:assert/strict'
import { isWantedMatch, normalizeForMatch } from './wantedMatch.ts'

test('same song with different punctuation, case and accents matches', () => {
  assert.ok(isWantedMatch({ title: 'Café del Mar', artist: 'Energy 52' }, { title: 'cafe del mar!', artist: 'ENERGY 52' }))
})

test('remaster and explicit tags do not matter', () => {
  assert.ok(isWantedMatch({ title: 'Song (Remastered 2011)', artist: 'A' }, { title: 'Song', artist: 'A' }))
  assert.ok(isWantedMatch({ title: 'Song - 2011 Remaster', artist: 'A' }, { title: 'Song [Explicit]', artist: 'A' }))
})

test('featured artists in the title are ignored', () => {
  assert.ok(isWantedMatch({ title: 'Song (feat. B)', artist: 'A' }, { title: 'Song', artist: 'A' }))
})

test('artist lists overlap in any common format', () => {
  assert.ok(isWantedMatch({ title: 'T', artist: 'A, B' }, { title: 'T', artist: 'B' }))
  assert.ok(isWantedMatch({ title: 'T', artist: 'A' }, { title: 'T', artist: 'A feat. C' }))
  assert.ok(isWantedMatch({ title: 'T', artist: 'A & B' }, { title: 'T', artist: 'A; B' }))
})

test('the album is ignored (deluxe or remaster editions)', () => {
  assert.ok(isWantedMatch({ title: 'T', artist: 'A', album: 'Album' }, { title: 'T', artist: 'A', album: 'Album (Deluxe)' }))
})

test('different songs and different artists do not match', () => {
  assert.equal(isWantedMatch({ title: 'Song', artist: 'A' }, { title: 'Song Two', artist: 'A' }), false)
  assert.equal(isWantedMatch({ title: 'Song', artist: 'A' }, { title: 'Song', artist: 'Z' }), false)
  assert.equal(isWantedMatch({ title: 'Song', artist: 'A' }, { title: 'Song (Live)', artist: 'A' }), false)
  assert.equal(isWantedMatch({ title: '', artist: 'A' }, { title: '', artist: 'A' }), false)
})

test('normalize keeps non-latin titles', () => {
  assert.equal(normalizeForMatch('夜に駆ける'), '夜に駆ける')
})
