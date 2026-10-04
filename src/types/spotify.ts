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
  /** Cover as a data: URL (fetched by the main process and cached), or null when unavailable. */
  artworkDataUrl: string | null
  message: string | null
}

export type SpotifyCommand =
  | { kind: 'playpause' }
  | { kind: 'next' }
  | { kind: 'previous' }
  | { kind: 'seek'; seconds: number }
