import { isWantedMatch, normalizeForMatch } from '../../shared/wanted/wantedMatch'

// Credits Spotify listens to the matching track in the music library, so a song's play count
// reflects every time you heard it, wherever you heard it.
//
// How double counting is avoided: each Spotify song gets its OWN origin row
// (`spotify:<track id>`) in track_play_origins, and that row is SET to the number of listens in
// the Spotify history, never incremented. Running this any number of times (every new listen,
// every import, every app start) therefore gives the same answer. tracks.play_count is moved by
// the difference between the old and the new row value, so the plays you made in Astra itself
// are never touched or recounted.

export interface CreditDb {
  run(sql: string, params?: unknown[]): unknown
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[]
}

export interface SpotifySongListens {
  trackId: string
  title: string
  artist: string
  plays: number
  lastPlayedAtMs: number
}

export const SPOTIFY_ORIGIN_PREFIX = 'spotify:'
const PLAY_ORIGINS_BACKFILL_KEY = 'track_play_origins_backfilled_v1'

export function spotifyOriginId(trackId: string): string {
  const bare = trackId.startsWith('spotify:track:') ? trackId.slice('spotify:track:'.length) : trackId
  return `${SPOTIFY_ORIGIN_PREFIX}${bare}`
}

interface LocalRow {
  path: string
  title: string
  artist: string
}

/**
 * Returns how many tracks changed. Safe to call repeatedly. A song that matches several local
 * files (duplicates, two editions) credits all of them, because each file really is that song.
 */
export function creditSpotifyListens(db: CreditDb, songs: readonly SpotifySongListens[]): number {
  if (songs.length === 0) return 0

  // Until the one-time per-origin backfill has run, tracks.play_count is still the only record
  // of local plays and the backfill would fold our delta into the local origin.
  const backfilled = db.get('SELECT 1 AS ok FROM app_meta WHERE key = ? LIMIT 1', [PLAY_ORIGINS_BACKFILL_KEY])
  if (!backfilled) return 0

  const rows = db.all<LocalRow>("SELECT path, title, artist FROM tracks WHERE source_type = 'local'")
  const byTitle = new Map<string, LocalRow[]>()
  for (const row of rows) {
    const key = normalizeForMatch(row.title ?? '')
    if (!key) continue
    const group = byTitle.get(key)
    if (group) group.push(row)
    else byTitle.set(key, [row])
  }

  let changed = 0
  for (const song of songs) {
    if (song.plays <= 0) continue
    const group = byTitle.get(normalizeForMatch(song.title))
    if (!group) continue
    const origin = spotifyOriginId(song.trackId)
    for (const local of group) {
      if (!isWantedMatch({ title: song.title, artist: song.artist }, { title: local.title, artist: local.artist ?? '' })) continue
      const existing = db.get<{ play_count: number | bigint }>(
        'SELECT play_count FROM track_play_origins WHERE track_path = ? AND origin_id = ?',
        [local.path, origin]
      )
      const previous = existing ? Number(existing.play_count) : 0
      const delta = song.plays - previous
      if (delta === 0) continue
      db.run(
        `INSERT INTO track_play_origins (track_path, origin_id, play_count, last_played_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(track_path, origin_id) DO UPDATE SET
           play_count = excluded.play_count,
           last_played_at = MAX(COALESCE(track_play_origins.last_played_at, 0), COALESCE(excluded.last_played_at, 0))`,
        [local.path, origin, song.plays, Math.round(song.lastPlayedAtMs)]
      )
      db.run(
        `UPDATE tracks SET
           play_count = MAX(0, COALESCE(play_count, 0) + ?),
           last_played_at = MAX(COALESCE(last_played_at, 0), ?)
         WHERE path = ?`,
        [delta, Math.round(song.lastPlayedAtMs), local.path]
      )
      changed += 1
    }
  }
  return changed
}
