import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { WantedTracksStore, type WantedDb, type WantedNewEntry } from './wantedTracks.ts'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (path: string) => { prepare(sql: string): { run(...p: unknown[]): unknown; get(...p: unknown[]): unknown; all(...p: unknown[]): unknown[] } } }

function makeDb(): WantedDb {
  const db = new DatabaseSync(':memory:')
  return {
    run: (sql, params = []) => db.prepare(sql).run(...params),
    get: (sql, params = []) => db.prepare(sql).get(...params) as never,
    all: (sql, params = []) => db.prepare(sql).all(...params) as never
  }
}

function entry(n: number, extra: Partial<WantedNewEntry> = {}): WantedNewEntry {
  return {
    spotifyTrackId: `spotify:track:${n}`,
    title: `Song ${n}`,
    artist: `Artist ${n}`,
    album: 'Album',
    durationMs: 200000,
    cover: { mime: 'image/jpeg', bytes: Buffer.from('cover') },
    thumb: { mime: 'image/jpeg', bytes: Buffer.from('thumb') },
    ...extra
  }
}

const query = { sort: 'added', dir: 'desc', search: '' } as const

test('adds once and lists newest first', () => {
  const store = new WantedTracksStore(makeDb())
  assert.equal(store.add(entry(1), 1000), 'added')
  assert.equal(store.add(entry(1), 2000), 'exists')
  assert.equal(store.add(entry(2), 3000), 'added')
  const rows = store.list(query)
  assert.deepEqual(rows.map((r) => r.title), ['Song 2', 'Song 1'])
  assert.deepEqual(store.wantedSpotifyIds().sort(), ['spotify:track:1', 'spotify:track:2'])
})

test('covers: thumb in lists, full cover kept', () => {
  const store = new WantedTracksStore(makeDb())
  store.add(entry(1), 1000)
  const [row] = store.list(query)
  assert.equal(row.hasCover, true)
  assert.ok(store.getThumbs([row.id])[row.id].startsWith('data:image/jpeg;base64,'))
  assert.equal(store.getCover(row.id), `data:image/jpeg;base64,${Buffer.from('cover').toString('base64')}`)
})

test('importing a matching file clears the entry and drops its images', () => {
  const store = new WantedTracksStore(makeDb())
  store.add(entry(1, { title: 'Hello (Remastered)', artist: 'Adele' }), 1000)
  store.add(entry(2), 1000)
  const done = store.fulfill([{ title: 'Hello', artist: 'Adele', album: '25' }, { title: 'Other', artist: 'X' }], 5000)
  assert.deepEqual(done, [{ title: 'Hello (Remastered)', artist: 'Adele' }])
  assert.deepEqual(store.list(query).map((r) => r.title), ['Song 2'])
  assert.deepEqual(store.wantedSpotifyIds(), ['spotify:track:2'])
})

test('wanting a fulfilled song again brings it back', () => {
  const store = new WantedTracksStore(makeDb())
  store.add(entry(1), 1000)
  store.fulfill([{ title: 'Song 1', artist: 'Artist 1' }], 2000)
  assert.equal(store.list(query).length, 0)
  assert.equal(store.add(entry(1), 3000), 'added')
  assert.equal(store.list(query).length, 1)
})

test('search, sort and remove', () => {
  const store = new WantedTracksStore(makeDb())
  store.add(entry(1), 1000)
  store.add(entry(2, { title: '50% Off' }), 2000)
  assert.equal(store.list({ ...query, search: '50%' }).length, 1)
  assert.equal(store.list({ ...query, search: '%' }).length, 1)
  assert.equal(store.list({ ...query, sort: 'title', dir: 'asc' })[0].title, '50% Off')
  store.remove(store.list(query)[0].id)
  assert.equal(store.list(query).length, 1)
})

test('one import does not fulfill the same entry twice and ignores non-matches', () => {
  const store = new WantedTracksStore(makeDb())
  store.add(entry(1), 1000)
  const done = store.fulfill([{ title: 'Song 1', artist: 'Artist 1' }, { title: 'Song 1', artist: 'Artist 1' }, { title: 'Song 1', artist: 'Nobody' }], 2000)
  assert.equal(done.length, 1)
})
