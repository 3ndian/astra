import type { SpotifyStatus, SpotifyTrackInfo } from '../../types/spotify'

// AppleScript prints one tab-separated line. These are the field positions.
//   state \t id \t title \t artist \t album \t artworkUrl \t positionSeconds \t durationMs
export const SPOTIFY_STATUS_SCRIPT = `
if application "Spotify" is running then
  tell application "Spotify"
    set st to player state as string
    if st is "stopped" then return "stopped"
    set t to current track
    set sep to (ASCII character 9)
    set pos to (player position as string)
    set dur to ((duration of t) as string)
    return st & sep & (id of t) & sep & (name of t) & sep & (artist of t) & sep & (album of t) & sep & (artwork url of t) & sep & pos & sep & dur
  end tell
else
  return "notrunning"
end if
`

/** AppleScript formats numbers using the system locale, so "12,5" must be read as 12.5. */
export function parseLocaleNumber(value: string): number {
  const parsed = Number(value.trim().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export function emptySpotifyStatus(state: SpotifyStatus['state'], message: string | null = null): SpotifyStatus {
  return { state, track: null, positionSeconds: 0, artworkDataUrl: null, message }
}

export function parseSpotifyStatusOutput(output: string): SpotifyStatus {
  const line = output.replace(/[\r\n]+$/, '')
  if (line === 'notrunning') return emptySpotifyStatus('notrunning')
  if (line === 'stopped' || line === '') return emptySpotifyStatus('stopped')

  const fields = line.split('\t')
  if (fields.length < 8) return emptySpotifyStatus('error', 'Unexpected reply from Spotify')

  const [state, id, title, artist, album, artworkUrl, position, duration] = fields
  if (state !== 'playing' && state !== 'paused') return emptySpotifyStatus('stopped')

  const track: SpotifyTrackInfo = {
    id,
    title,
    artist,
    album,
    artworkUrl: artworkUrl && artworkUrl !== 'missing value' ? artworkUrl : null,
    // Spotify reports duration in milliseconds.
    durationMs: Math.max(0, Math.round(parseLocaleNumber(duration)))
  }
  return {
    state,
    track,
    positionSeconds: Math.max(0, parseLocaleNumber(position)),
    artworkDataUrl: null,
    message: null
  }
}

export function scriptForCommand(command: import('../../types/spotify').SpotifyCommand): string | null {
  switch (command.kind) {
    case 'playpause':
      return 'if application "Spotify" is running then tell application "Spotify" to playpause'
    case 'next':
      return 'if application "Spotify" is running then tell application "Spotify" to next track'
    case 'previous':
      return 'if application "Spotify" is running then tell application "Spotify" to previous track'
    case 'seek': {
      if (!Number.isFinite(command.seconds) || command.seconds < 0) return null
      // Plain dot-decimal literal; AppleScript source is parsed with the dot regardless of locale.
      const seconds = Math.round(command.seconds * 10) / 10
      return `if application "Spotify" is running then tell application "Spotify" to set player position to ${seconds}`
    }
  }
}
