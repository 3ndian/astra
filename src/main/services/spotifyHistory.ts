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
      CREATE TABLE IF NOT EXISTS covers (
        cover_key TEXT PRIMARY KEY,
        mime TEXT NOT NULL,
        thumb BLOB NOT NULL,
        last_used_at INTEGER NOT NULL
      );
    `)
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
        'INSERT INTO plays (track_id, title, artist, album, cover_key, duration_ms, played_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(play.trackId, play.title, play.artist, play.album, coverKey, Math.round(play.durationMs), Math.round(play.playedAtMs))

    this.db
      .prepare('DELETE FROM covers WHERE cover_key NOT IN (SELECT cover_key FROM covers ORDER BY last_used_at DESC LIMIT ?)')
      .run(this.maxCovers)
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
        `SELECT id, track_id, title, artist, album, cover_key, duration_ms, played_at
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
      }>

    const mapped: SpotifyHistoryRow[] = rows.map((row) => ({
      id: Number(row.id),
      trackId: row.track_id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      coverKey: row.cover_key,
      durationMs: Number(row.duration_ms),
      playedAtMs: Number(row.played_at)
    }))
    return { rows: mapped, total: Number(totalRow.n) }
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
