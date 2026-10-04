import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { SpotifyHistoryStore, type HistoryDatabase } from './spotifyHistory.ts'
import type { SpotifyPlayRecord } from '../../shared/spotify/playTracker.ts'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => HistoryDatabase }

function makeStore(maxCovers = 500) {
  return new SpotifyHistoryStore(new DatabaseSync(':memory:'), {
    maxCovers,
    makeThumbnail: (dataUrl) => ({ mime: 'image/jpeg', bytes: Buffer.from(dataUrl) })
  })
}

function play(n: number, extra: Partial<SpotifyPlayRecord> = {}): SpotifyPlayRecord {
  return {
    trackId: `spotify:track:${n}`,
    title: `Song ${n}`,
    artist: `Artist ${n % 3}`,
    album: `Album ${n % 2}`,
    artworkUrl: `https://i.scdn.co/image/${n}`,
    durationMs: 200000,
    playedAtMs: 1000 * n,
    ...extra
  }
}

const query = { sort: 'played', dir: 'desc', search: '', limit: 100, offset: 0 } as const

test('records plays newest first with covers', () => {
  const store = makeStore()
  store.record(play(1), 'data:image/jpeg;base64,AAA')
  store.record(play(2), 'data:image/jpeg;base64,BBB')
  const page = store.list(query)
  assert.equal(page.total, 2)
  assert.equal(page.rows[0].title, 'Song 2')
  const covers = store.getCovers(page.rows.map((r) => r.coverKey!))
  assert.equal(Object.keys(covers).length, 2)
  assert.ok(covers['https://i.scdn.co/image/1'].startsWith('data:image/jpeg;base64,'))
})

test('sorts by title, artist and album', () => {
  const store = makeStore()
  for (const n of [3, 1, 2]) store.record(play(n), null)
  assert.deepEqual(store.list({ ...query, sort: 'title', dir: 'asc' }).rows.map((r) => r.title), ['Song 1', 'Song 2', 'Song 3'])
  assert.deepEqual(store.list({ ...query, sort: 'artist', dir: 'asc' }).rows.map((r) => r.artist), ['Artist 0', 'Artist 1', 'Artist 2'])
  assert.equal(store.list({ ...query, sort: 'album', dir: 'desc' }).rows[0].album, 'Album 1')
})

test('searches across title, artist and album, and escapes wildcards', () => {
  const store = makeStore()
  store.record(play(1, { title: '100% Pure' }), null)
  store.record(play(2), null)
  assert.equal(store.list({ ...query, search: '100%' }).total, 1)
  assert.equal(store.list({ ...query, search: '%' }).total, 1)
  assert.equal(store.list({ ...query, search: 'artist 2' }).total, 1)
})

test('keeps only the newest thumbnails', () => {
  const store = makeStore(2)
  for (const n of [1, 2, 3]) store.record(play(n), 'data:image/jpeg;base64,X')
  const covers = store.getCovers(['https://i.scdn.co/image/1', 'https://i.scdn.co/image/2', 'https://i.scdn.co/image/3'])
  assert.deepEqual(Object.keys(covers).sort(), ['https://i.scdn.co/image/2', 'https://i.scdn.co/image/3'])
  assert.equal(store.list(query).total, 3)
})

test('paging and a shared album cover', () => {
  const store = makeStore()
  for (const n of [1, 2, 3]) store.record(play(n, { artworkUrl: 'https://i.scdn.co/image/same' }), 'data:image/jpeg;base64,X')
  assert.equal(store.list({ ...query, limit: 2, offset: 2 }).rows.length, 1)
  assert.equal(Object.keys(store.getCovers(['https://i.scdn.co/image/same'])).length, 1)
})
