export type SpotifyPlayerState =
  | 'unsupported' // not macOS (Linux support is planned)
  | 'notrunning' // Spotify desktop app is not open
  | 'stopped'
  | 'playing'
  | 'paused'
  | 'error'

export interface SpotifyTrackInfo {
  id: string
  title: string
  artist: string
  album: string
  artworkUrl: string | null
  durationMs: number
}

export interface SpotifyStatus {
  state: SpotifyPlayerState
  track: SpotifyTrackInfo | null
  positionSeconds: number
  /** Spotify's own volume, 0-100, or null when unknown. */
  volume: number | null
  /** Cover as a data: URL (fetched by the main process and cached), or null when unavailable. */
  artworkDataUrl: string | null
  message: string | null
}

export type SpotifyCommand =
  | { kind: 'playpause' }
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'next' }
  | { kind: 'previous' }
  | { kind: 'seek'; seconds: number }
  | { kind: 'volume'; percent: number }

export type SpotifyHistorySort = 'title' | 'artist' | 'album' | 'played'

export interface SpotifyHistoryQuery {
  sort: SpotifyHistorySort
  dir: 'asc' | 'desc'
  search: string
  limit: number
  offset: number
}

export interface SpotifyHistoryRow {
  id: number
  trackId: string
  title: string
  artist: string
  album: string
  /** Key for `getHistoryCovers`; null when the play had no artwork. */
  coverKey: string | null
  durationMs: number
  playedAtMs: number
}

export interface SpotifyHistoryPage {
  rows: SpotifyHistoryRow[]
  total: number
}

export type WantedSort = 'added' | 'title' | 'artist' | 'album'

export interface WantedQuery {
  sort: WantedSort
  dir: 'asc' | 'desc'
  search: string
}

/** A song added from Spotify that is not in the library yet ("Not downloaded"). */
export interface WantedTrackRow {
  id: number
  spotifyTrackId: string
  title: string
  artist: string
  album: string
  durationMs: number
  addedAtMs: number
  hasCover: boolean
}

export interface WantedAddRequest {
  spotifyTrackId: string
  title: string
  artist: string
  album: string
  durationMs: number
  artworkUrl: string | null
}

export type SpotifyPlaylistEntryResult = { status: 'added' | 'exists' } | { status: 'error'; message: string }

export type WantedAddResult = { status: 'added' | 'exists' } | { status: 'error'; message: string }
