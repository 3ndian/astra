// A Spotify song saved into an Astra playlist before the file exists: stored as a "missing" playlist
// entry (fake path + title/artist/album) that links up by metadata once the real file is imported.

export const SPOTIFY_ENTRY_PATH_PREFIX = 'spotify:track:'

export function spotifyEntryPath(trackId: string): string {
  return `${SPOTIFY_ENTRY_PATH_PREFIX}${trackId}`
}

export function isSpotifyEntryPath(path: string): boolean {
  return path.startsWith(SPOTIFY_ENTRY_PATH_PREFIX)
}

export interface SpotifyPlaylistEntryRequest {
  playlistId: number
  spotifyTrackId: string
  title: string
  artist: string
  album: string
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

/** Validates an untrusted request; null when it cannot be used. */
export function normalizeSpotifyPlaylistEntryRequest(raw: unknown): SpotifyPlaylistEntryRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const playlistId = Number(value.playlistId)
  if (!Number.isInteger(playlistId) || playlistId <= 0) return null
  const spotifyTrackId = typeof value.spotifyTrackId === 'string' ? value.spotifyTrackId.trim() : ''
  if (!/^[A-Za-z0-9]{1,64}$/.test(spotifyTrackId)) return null
  const title = cleanText(value.title, 300)
  if (!title) return null
  return {
    playlistId,
    spotifyTrackId,
    title,
    artist: cleanText(value.artist, 300),
    album: cleanText(value.album, 300)
  }
}
