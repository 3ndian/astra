import type { WantedQuery, WantedSort, WantedTrackRow } from '../../types/spotify'
import { isWantedMatch, normalizeForMatch, type TrackIdentity } from '../../shared/wanted/wantedMatch'

// "Not downloaded" songs: tracks added from Spotify that are not in the music library yet.
// They live in their own table and are NOT rows of the `tracks` table, so they can never be
// played, queued, shuffled, counted in stats or shown as albums. When a matching file is
// imported, the entry is cleared automatically.

export interface WantedDb {
  run(sql: string, params?: unknown[]): unknown
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[]
}

export interface WantedImage {
  mime: string
  bytes: Uint8Array
}

export interface WantedNewEntry {
  spotifyTrackId: string
  title: string
  artist: string
  album: string
  durationMs: number
  cover: WantedImage | null
  thumb: WantedImage | null
}

export interface FulfilledEntry {
  title: string
  artist: string
}

const SORT_COLUMNS: Record<WantedSort, string> = {
  added: 'added_at',
  title: 'title COLLATE NOCASE',
  artist: 'artist COLLATE NOCASE',
  album: 'album COLLATE NOCASE'
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

function toDataUrl(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
}

export class WantedTracksStore {
  private readonly db: WantedDb

  constructor(db: WantedDb) {
    this.db = db
    db.run(`
      CREATE TABLE IF NOT EXISTS wanted_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spotify_track_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        cover BLOB,
        cover_mime TEXT,
        thumb BLOB,
        thumb_mime TEXT,
        added_at INTEGER NOT NULL,
        fulfilled_at INTEGER
      )
    `)
  }

  add(entry: WantedNewEntry, nowMs: number): 'added' | 'exists' {
    const existing = this.db.get<{ id: number | bigint; fulfilled_at: number | bigint | null }>(
      'SELECT id, fulfilled_at FROM wanted_tracks WHERE spotify_track_id = ?',
      [entry.spotifyTrackId]
    )
    if (existing && existing.fulfilled_at === null) return 'exists'

    if (existing) {
      // It was fulfilled earlier (and its images dropped); wanting it again brings it back.
      this.db.run(
        `UPDATE wanted_tracks SET title = ?, artist = ?, album = ?, duration_ms = ?, cover = ?, cover_mime = ?,
           thumb = ?, thumb_mime = ?, added_at = ?, fulfilled_at = NULL WHERE id = ?`,
        [entry.title, entry.artist, entry.album, Math.round(entry.durationMs), entry.cover?.bytes ?? null, entry.cover?.mime ?? null,
          entry.thumb?.bytes ?? null, entry.thumb?.mime ?? null, nowMs, existing.id]
      )
      return 'added'
    }

    this.db.run(
      `INSERT INTO wanted_tracks (spotify_track_id, title, artist, album, duration_ms, cover, cover_mime, thumb, thumb_mime, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [entry.spotifyTrackId, entry.title, entry.artist, entry.album, Math.round(entry.durationMs),
        entry.cover?.bytes ?? null, entry.cover?.mime ?? null, entry.thumb?.bytes ?? null, entry.thumb?.mime ?? null, nowMs]
    )
    return 'added'
  }

  list(query: WantedQuery): WantedTrackRow[] {
    const column = SORT_COLUMNS[query.sort] ?? SORT_COLUMNS.added
    const direction = query.dir === 'asc' ? 'ASC' : 'DESC'
    const search = query.search.trim()
    const like = `%${escapeLike(search)}%`
    const where = search
      ? "AND (title LIKE ? ESCAPE '\\' OR artist LIKE ? ESCAPE '\\' OR album LIKE ? ESCAPE '\\')"
      : ''
    const params = search ? [like, like, like] : []
    const rows = this.db.all<{
      id: number | bigint
      spotify_track_id: string
      title: string
      artist: string
      album: string
      duration_ms: number | bigint
      added_at: number | bigint
      has_cover: number | bigint
    }>(
      `SELECT id, spotify_track_id, title, artist, album, duration_ms, added_at,
              (CASE WHEN thumb IS NOT NULL THEN 1 ELSE 0 END) AS has_cover
       FROM wanted_tracks WHERE fulfilled_at IS NULL ${where}
       ORDER BY ${column} ${direction}, id DESC`,
      params
    )
    return rows.map((row) => ({
      id: Number(row.id),
      spotifyTrackId: row.spotify_track_id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      durationMs: Number(row.duration_ms),
      addedAtMs: Number(row.added_at),
      hasCover: Number(row.has_cover) === 1
    }))
  }

  /** Spotify track ids that are currently wanted (to show "Added" instead of "+"). */
  wantedSpotifyIds(): string[] {
    return this.db
      .all<{ spotify_track_id: string }>('SELECT spotify_track_id FROM wanted_tracks WHERE fulfilled_at IS NULL')
      .map((row) => row.spotify_track_id)
  }

  getThumbs(ids: number[]): Record<number, string> {
    const result: Record<number, string> = {}
    for (const id of ids.slice(0, 500)) {
      const row = this.db.get<{ thumb: Uint8Array | null; thumb_mime: string | null }>(
        'SELECT thumb, thumb_mime FROM wanted_tracks WHERE id = ?',
        [id]
      )
      if (row?.thumb && row.thumb_mime) result[id] = toDataUrl(row.thumb_mime, row.thumb)
    }
    return result
  }

  /** The full-size cover (kept permanently), or null. */
  getCover(id: number): string | null {
    const row = this.db.get<{ cover: Uint8Array | null; cover_mime: string | null }>(
      'SELECT cover, cover_mime FROM wanted_tracks WHERE id = ?',
      [id]
    )
    return row?.cover && row.cover_mime ? toDataUrl(row.cover_mime, row.cover) : null
  }

  remove(id: number): void {
    this.db.run('DELETE FROM wanted_tracks WHERE id = ?', [id])
  }

  /**
   * Clears entries whose song has just been imported. Returns what was fulfilled, so the app can
   * tell the user. Images are dropped; the row stays (marked fulfilled) so the "+" button knows.
   */
  fulfill(imported: TrackIdentity[], nowMs: number): FulfilledEntry[] {
    if (imported.length === 0) return []
    const wanted = this.db.all<{ id: number | bigint; title: string; artist: string; album: string }>(
      'SELECT id, title, artist, album FROM wanted_tracks WHERE fulfilled_at IS NULL'
    )
    if (wanted.length === 0) return []

    const byTitle = new Map<string, typeof wanted>()
    for (const row of wanted) {
      const key = normalizeForMatch(row.title)
      if (!key) continue
      const group = byTitle.get(key)
      if (group) group.push(row)
      else byTitle.set(key, [row])
    }

    const fulfilledIds = new Set<number>()
    const fulfilled: FulfilledEntry[] = []
    for (const candidate of imported) {
      const group = byTitle.get(normalizeForMatch(candidate.title))
      if (!group) continue
      for (const row of group) {
        const id = Number(row.id)
        if (fulfilledIds.has(id)) continue
        if (!isWantedMatch(row, candidate)) continue
        fulfilledIds.add(id)
        fulfilled.push({ title: row.title, artist: row.artist })
        this.db.run(
          'UPDATE wanted_tracks SET fulfilled_at = ?, cover = NULL, cover_mime = NULL, thumb = NULL, thumb_mime = NULL WHERE id = ?',
          [nowMs, id]
        )
      }
    }
    return fulfilled
  }
}

export type { WantedQuery, WantedSort }
