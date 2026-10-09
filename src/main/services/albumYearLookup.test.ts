import assert from 'node:assert/strict'
import test from 'node:test'
import { lookupAlbumYear } from './albumYearLookup'

const respond = (results: unknown[], ok = true) => async () => ({ ok, json: async () => ({ results }) })

test('picks the earliest matching edition', async () => {
  const year = await lookupAlbumYear('The Weeknd', 'After Hours', respond([
    { collectionName: 'After Hours (Deluxe)', artistName: 'The Weeknd', releaseDate: '2020-03-20T07:00:00Z' },
    { collectionName: 'After Hours', artistName: 'The Weeknd', releaseDate: '2020-03-20T07:00:00Z' },
    { collectionName: 'After Hours (Remastered)', artistName: 'The Weeknd', releaseDate: '2024-01-01T07:00:00Z' },
    { collectionName: 'After Hours', artistName: 'Someone Else', releaseDate: '1999-01-01T07:00:00Z' }
  ]))
  assert.equal(year, 2020)
})

test('null when nothing matches, throws when the request fails', async () => {
  assert.equal(await lookupAlbumYear('A', 'B', respond([{ collectionName: 'C', artistName: 'A', releaseDate: '2001-01-01' }])), null)
  await assert.rejects(lookupAlbumYear('A', 'B', respond([], false)))
})
