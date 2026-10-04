import { createRequire } from 'node:module'
import { SpotifyHistoryStore, type HistoryDatabase, type HistoryThumbnail } from './spotifyHistory'

const require = createRequire(import.meta.url)
const BetterSqlite = require('better-sqlite3') as new (filename: string) => HistoryDatabase & { pragma(sql: string): unknown }

export function openSpotifyHistoryStore(
  filename: string,
  makeThumbnail: (dataUrl: string) => HistoryThumbnail | null
): SpotifyHistoryStore {
  const db = new BetterSqlite(filename)
  db.pragma('journal_mode = WAL')
  return new SpotifyHistoryStore(db, { makeThumbnail })
}
