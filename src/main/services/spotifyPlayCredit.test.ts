import assert from 'node:assert/strict'
import test from 'node:test'
import { creditSpotifyListens, type CreditDb } from './spotifyPlayCredit'

function makeDb(opts: { backfilled?: boolean } = {}) {
  const tracks = [
    { path: '/m/a.flac', title: 'Blinding Lights', artist: 'The Weeknd', play_count: 3, last_played_at: 100 as number | null },
    { path: '/m/b.flac', title: 'Other', artist: 'Someone', play_count: 0, last_played_at: null as number | null }
  ]
  const origins = new Map<string, { play_count: number; last: number }>()
  const db: CreditDb = {
    run(sql, p = []) {
      if (sql.includes('INSERT INTO track_play_origins')) {
        const [path, origin, n, last] = p as [string, string, number, number]
        const key = `${path}|${origin}`
        const prev = origins.get(key)
        origins.set(key, { play_count: n, last: Math.max(prev?.last ?? 0, last) })
      } else if (sql.includes('UPDATE tracks')) {
        const [delta, last, path] = p as [number, number, string]
        const t = tracks.find((x) => x.path === path)!
        t.play_count = Math.max(0, t.play_count + delta)
        t.last_played_at = Math.max(t.last_played_at ?? 0, last)
      }
      return undefined
    },
    get(sql, p = []) {
      if (sql.includes('app_meta')) return (opts.backfilled === false ? undefined : { ok: 1 }) as never
      if (sql.includes('FROM track_play_origins')) {
        const r = origins.get(`${p[0]}|${p[1]}`)
        return (r ? { play_count: r.play_count } : undefined) as never
      }
      return undefined
    },
    all() {
      return tracks.map(({ path, title, artist }) => ({ path, title, artist })) as never
    }
  }
  return { db, tracks, origins }
}

const song = (plays: number, last = 500) => ({
  trackId: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA',
  title: 'Blinding Lights',
  artist: 'The Weeknd',
  plays,
  lastPlayedAtMs: last
})

test('credits listens to the matching local track, keeping local plays', () => {
  const { db, tracks } = makeDb()
  assert.equal(creditSpotifyListens(db, [song(2)]), 1)
  assert.equal(tracks[0].play_count, 5)
  assert.equal(tracks[0].last_played_at, 500)
  assert.equal(tracks[1].play_count, 0)
})

test('running again does not double count', () => {
  const { db, tracks } = makeDb()
  creditSpotifyListens(db, [song(2)])
  assert.equal(creditSpotifyListens(db, [song(2)]), 0)
  assert.equal(tracks[0].play_count, 5)
})

test('a later listen adds exactly one', () => {
  const { db, tracks } = makeDb()
  creditSpotifyListens(db, [song(2)])
  creditSpotifyListens(db, [song(3, 900)])
  assert.equal(tracks[0].play_count, 6)
})

test('does nothing before the play-origin backfill, or with no match', () => {
  const early = makeDb({ backfilled: false })
  assert.equal(creditSpotifyListens(early.db, [song(2)]), 0)
  assert.equal(early.tracks[0].play_count, 3)
  const { db, tracks } = makeDb()
  creditSpotifyListens(db, [{ ...song(2), title: 'Unknown Song' }])
  assert.equal(tracks[0].play_count, 3)
})
