import type { SpotifyStatus } from '../../types/spotify'

// Decides when a Spotify play "counts" for the history: the same track has to be heard for a
// while (30 s, or half of a very short track). Fed one status at a time, in order.

export interface SpotifyPlayRecord {
  trackId: string
  title: string
  artist: string
  album: string
  artworkUrl: string | null
  durationMs: number
  playedAtMs: number
  trackNumber?: number | null
  discNumber?: number | null
}

export interface PlayTracker {
  observe(status: SpotifyStatus, nowMs: number): SpotifyPlayRecord | null
}

export const PLAY_QUALIFY_MS = 30_000
/** A gap longer than this between two observations (sleep, app frozen) is not counted as listening. */
const MAX_GAP_MS = 3_000

export function isHistoryTrackId(id: string): boolean {
  // Ads and podcast episodes have other id kinds and are skipped.
  return id.startsWith('spotify:track:')
}

export function createPlayTracker(): PlayTracker {
  let currentId: string | null = null
  let listenedMs = 0
  let lastAt = 0
  let lastPosition = 0
  let wasPlaying = false
  let recorded = false

  return {
    observe(status, nowMs) {
      const track = status.track
      const active = track && (status.state === 'playing' || status.state === 'paused') && isHistoryTrackId(track.id)
      if (!track || !active) {
        currentId = null
        listenedMs = 0
        wasPlaying = false
        recorded = false
        return null
      }

      const position = status.positionSeconds
      if (track.id !== currentId) {
        currentId = track.id
        listenedMs = 0
        recorded = false
      } else {
        if (wasPlaying) listenedMs += Math.min(Math.max(0, nowMs - lastAt), MAX_GAP_MS)
        // Same track starting over (repeat): jumped back to the beginning after being counted.
        if (recorded && position < 10 && lastPosition - position > 20) {
          listenedMs = 0
          recorded = false
        }
      }
      lastAt = nowMs
      lastPosition = position
      wasPlaying = status.state === 'playing'

      const needed = Math.min(PLAY_QUALIFY_MS, track.durationMs > 0 ? track.durationMs / 2 : PLAY_QUALIFY_MS)
      if (!recorded && listenedMs >= needed) {
        recorded = true
        return {
          trackId: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          artworkUrl: track.artworkUrl,
          durationMs: track.durationMs,
          playedAtMs: nowMs,
          trackNumber: track.trackNumber ?? null,
          discNumber: track.discNumber ?? null
        }
      }
      return null
    }
  }
}
