import type {
  SpotifyHistoryPage,
  SpotifyHistoryQuery,
  SpotifyHistoryRow,
  SpotifyHistorySort
} from '../../types/spotify'
import type { SpotifyPlayRecord } from '../../shared/spotify/playTracker'

// Spotify listen history. Lives in its own database file, completely separate from the music
// library, so nothing here can touch library data (and a library reset cannot touch this).

export interface HistoryStatement {
  run(...params: unknown[]): unknown
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
}

export interface HistoryDatabase {
  exec(sql: string): unknown
  prepare(sql: string): HistoryStatement
}

export interface HistoryThumbnail {
  mime: string
  bytes: Uint8Array
}

export interface SpotifyHistoryOptions {
  /** Shrinks the 640 px cover to a ~300 px thumbnail. Null means "keep nothing". */
  makeThumbnail: (dataUrl: string) => HistoryThumbnail | null
  /** Thumbnails kept (newest first); older plays show a placeholder. */
  maxCovers?: number
}

const DEFAULT_MAX_COVERS = 500
const MAX_PAGE_SIZE = 500

const SORT_COLUMNS: Record<SpotifyHistorySort, string> = {
  title: 'title COLLATE NOCASE',
  artist: 'artist COLLATE NOCASE',
  album: 'album COLLATE NOCASE',
  played: 'played_at'
}

const YEAR_RETRY_MS = 14 * 24 * 60 * 60 * 1000

export function albumKey(artist: string, album: string): string {
  return `${artist.trim().toLowerCase()}\u001f${album.trim().toLowerCase()}`
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

export class SpotifyHistoryStore {
  private readonly db: HistoryDatabase
  private readonly options: SpotifyHistoryOptions
  private readonly maxCovers: number

  constructor(db: HistoryDatabase, options: SpotifyHistoryOptions) {
    this.db = db
    this.options = options
    this.maxCovers = options.maxCovers ?? DEFAULT_MAX_COVERS
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT NOT NULL,
        cover_key TEXT,
        duration_ms INTEGER NOT NULL,
        played_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_plays_played_at ON plays(played_at);
      CREATE TABLE IF NOT EXISTS album_years (
        album_key TEXT PRIMARY KEY,
        year INTEGER,
        checked_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS covers (
        cover_key TEXT PRIMARY KEY,
        mime TEXT NOT NULL,
        thumb BLOB NOT NULL,
        last_used_at INTEGER NOT NULL
      );
    `)
    // Older databases predate these columns.
    const columns = (this.db.prepare('PRAGMA table_info(plays)').all() as Array<{ name: string }>).map((c) => c.name)
    if (!columns.includes('track_number')) this.db.exec('ALTER TABLE plays ADD COLUMN track_number INTEGER')
    if (!columns.includes('disc_number')) this.db.exec('ALTER TABLE plays ADD COLUMN disc_number INTEGER')
  }

  record(play: SpotifyPlayRecord, artworkDataUrl: string | null): void {
    let coverKey: string | null = null
    if (play.artworkUrl) {
      const existing = this.db.prepare('SELECT cover_key FROM covers WHERE cover_key = ?').get(play.artworkUrl)
      if (existing) {
        this.db.prepare('UPDATE covers SET last_used_at = ? WHERE cover_key = ?').run(play.playedAtMs, play.artworkUrl)
        coverKey = play.artworkUrl
      } else if (artworkDataUrl) {
        const thumb = this.options.makeThumbnail(artworkDataUrl)
        if (thumb) {
          this.db
            .prepare('INSERT OR REPLACE INTO covers (cover_key, mime, thumb, last_used_at) VALUES (?, ?, ?, ?)')
            .run(play.artworkUrl, thumb.mime, thumb.bytes, play.playedAtMs)
          coverKey = play.artworkUrl
        }
      }
    }

    this.db
      .prepare(
        'INSERT INTO plays (track_id, title, artist, album, cover_key, duration_ms, played_at, track_number, disc_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        play.trackId, play.title, play.artist, play.album, coverKey, Math.round(play.durationMs), Math.round(play.playedAtMs),
        play.trackNumber ?? null, play.discNumber ?? null
      )

    this.db
      .prepare('DELETE FROM covers WHERE cover_key NOT IN (SELECT cover_key FROM covers ORDER BY last_used_at DESC LIMIT ?)')
      .run(this.maxCovers)
  }

  /** Listens per Spotify song (all of them, or just the given track ids). */
  listenTotals(trackIds?: readonly string[]): Array<{
    trackId: string
    title: string
    artist: string
    plays: number
    lastPlayedAtMs: number
  }> {
    const where = trackIds && trackIds.length > 0 ? `WHERE track_id IN (${trackIds.map(() => '?').join(', ')})` : ''
    const rows = this.db
      .prepare(
        `SELECT track_id, MAX(title) AS title, MAX(artist) AS artist, COUNT(*) AS n, MAX(played_at) AS last
         FROM plays ${where} GROUP BY track_id`
      )
      .all(...(trackIds && trackIds.length > 0 ? trackIds : [])) as Array<{
        track_id: string
        title: string
        artist: string
        n: number | bigint
        last: number | bigint
      }>
    return rows.map((row) => ({
      trackId: row.track_id,
      title: row.title,
      artist: row.artist,
      plays: Number(row.n),
      lastPlayedAtMs: Number(row.last)
    }))
  }

  list(query: SpotifyHistoryQuery): SpotifyHistoryPage {
    const column = SORT_COLUMNS[query.sort] ?? SORT_COLUMNS.played
    const direction = query.dir === 'asc' ? 'ASC' : 'DESC'
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(query.limit) || 100))
    const offset = Math.max(0, Math.floor(query.offset) || 0)

    const search = query.search.trim()
    const where = search ? "WHERE title LIKE ? ESCAPE '\\' OR artist LIKE ? ESCAPE '\\' OR album LIKE ? ESCAPE '\\'" : ''
    const like = `%${escapeLike(search)}%`
    const whereParams = search ? [like, like, like] : []

    const totalRow = this.db.prepare(`SELECT COUNT(*) AS n FROM plays ${where}`).get(...whereParams) as { n: number | bigint }
    const rows = this.db
      .prepare(
        `SELECT id, track_id, title, artist, album, cover_key, duration_ms, played_at, track_number, disc_number
         FROM plays ${where} ORDER BY ${column} ${direction}, id DESC LIMIT ? OFFSET ?`
      )
      .all(...whereParams, limit, offset) as Array<{
        id: number | bigint
        track_id: string
        title: string
        artist: string
        album: string
        cover_key: string | null
        duration_ms: number | bigint
        played_at: number | bigint
        track_number: number | bigint | null
        disc_number: number | bigint | null
      }>

    const yearOf = this.db.prepare('SELECT year FROM album_years WHERE album_key = ?')
    const years = new Map<string, number | null>()
    const mapped: SpotifyHistoryRow[] = rows.map((row) => ({
      id: Number(row.id),
      trackId: row.track_id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      coverKey: row.cover_key,
      durationMs: Number(row.duration_ms),
      playedAtMs: Number(row.played_at),
      trackNumber: row.track_number === null || row.track_number === undefined ? null : Number(row.track_number),
      discNumber: row.disc_number === null || row.disc_number === undefined ? null : Number(row.disc_number),
      year: (() => {
        const key = albumKey(row.artist, row.album)
        if (!years.has(key)) {
          const found = yearOf.get(key) as { year: number | bigint | null } | undefined
          years.set(key, found && found.year !== null ? Number(found.year) : null)
        }
        return years.get(key) ?? null
      })()
    }))
    return { rows: mapped, total: Number(totalRow.n) }
  }

  /** Albums played but never looked up (or looked up long ago without success). */
  albumsNeedingYear(limit: number, nowMs: number): Array<{ artist: string; album: string }> {
    const retryBefore = nowMs - YEAR_RETRY_MS
    const rows = this.db
      .prepare('SELECT artist, album FROM plays WHERE album <> \'\' GROUP BY artist, album ORDER BY MAX(played_at) DESC')
      .all() as Array<{ artist: string; album: string }>
    const check = this.db.prepare('SELECT year, checked_at FROM album_years WHERE album_key = ?')
    const needed: Array<{ artist: string; album: string }> = []
    for (const row of rows) {
      const found = check.get(albumKey(row.artist, row.album)) as { year: number | null; checked_at: number } | undefined
      if (!found || (found.year === null && found.checked_at < retryBefore)) needed.push(row)
      if (needed.length >= limit) break
    }
    return needed
  }

  setAlbumYear(artist: string, album: string, year: number | null, nowMs: number): void {
    this.db
      .prepare('INSERT OR REPLACE INTO album_years (album_key, year, checked_at) VALUES (?, ?, ?)')
      .run(albumKey(artist, album), year, Math.round(nowMs))
  }

  getCovers(keys: string[]): Record<string, string> {
    const result: Record<string, string> = {}
    const statement = this.db.prepare('SELECT mime, thumb FROM covers WHERE cover_key = ?')
    for (const key of keys.slice(0, MAX_PAGE_SIZE)) {
      const row = statement.get(key) as { mime: string; thumb: Uint8Array } | undefined
      if (!row) continue
      result[key] = `data:${row.mime};base64,${Buffer.from(row.thumb).toString('base64')}`
    }
    return result
  }
}
