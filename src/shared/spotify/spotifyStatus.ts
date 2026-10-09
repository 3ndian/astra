import type { SpotifyStatus, SpotifyTrackInfo } from '../../types/spotify'

// AppleScript prints one tab-separated line. These are the field positions.
//   state \t id \t title \t artist \t album \t artworkUrl \t positionSeconds \t durationMs \t volume \t trackNumber \t discNumber
export const SPOTIFY_STATUS_SCRIPT = `
if application "Spotify" is running then
  tell application "Spotify"
    set astraPlayerState to (player state as string)
    if astraPlayerState is "stopped" then return "stopped"
    set astraTrack to current track
    set astraTab to (ASCII character 9)
    set astraPosition to (player position as string)
    set astraDuration to ((duration of astraTrack) as string)
    set astraLine to astraPlayerState & astraTab & (id of astraTrack) & astraTab & (name of astraTrack)
    set astraLine to astraLine & astraTab & (artist of astraTrack) & astraTab & (album of astraTrack)
    set astraLine to astraLine & astraTab & (artwork url of astraTrack) & astraTab & astraPosition & astraTab & astraDuration
    set astraLine to astraLine & astraTab & ((sound volume) as string)
    set astraLine to astraLine & astraTab & ((track number of astraTrack) as string) & astraTab & ((disc number of astraTrack) as string)
    return astraLine
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
  return { state, track: null, positionSeconds: 0, volume: null, artworkDataUrl: null, message }
}

export function parseSpotifyStatusOutput(output: string): SpotifyStatus {
  const line = output.replace(/[\r\n]+$/, '')
  if (line === 'notrunning') return emptySpotifyStatus('notrunning')
  if (line === 'stopped' || line === '') return emptySpotifyStatus('stopped')

  const fields = line.split('\t')
  if (fields.length < 8) return emptySpotifyStatus('error', 'Unexpected reply from Spotify')

  const [state, id, title, artist, album, artworkUrl, position, duration, volumeText, trackNumberText, discNumberText] = fields
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
  const trackNumber = Math.round(parseLocaleNumber(trackNumberText ?? ''))
  const discNumber = Math.round(parseLocaleNumber(discNumberText ?? ''))
  if (trackNumber > 0) track.trackNumber = trackNumber
  if (discNumber > 0) track.discNumber = discNumber
  return {
    state,
    track,
    positionSeconds: Math.max(0, parseLocaleNumber(position)),
    volume: volumeText !== undefined && volumeText.trim() !== ''
      ? Math.min(100, Math.max(0, Math.round(parseLocaleNumber(volumeText))))
      : null,
    artworkDataUrl: null,
    message: null
  }
}

/** A Spotify track URI: 22 base-62 characters, nothing else (this string goes into AppleScript). */
export const SPOTIFY_TRACK_URI = /^spotify:track:[A-Za-z0-9]{22}$/

export function scriptForCommand(command: import('../../types/spotify').SpotifyCommand): string | null {
  switch (command.kind) {
    case 'playpause':
      return 'if application "Spotify" is running then tell application "Spotify" to playpause'
    case 'play':
      // Explicit play (never a toggle), so a paused Spotify is not started by mistake elsewhere.
      return 'if application "Spotify" is running then tell application "Spotify" to play'
    case 'pause':
      return 'if application "Spotify" is running then tell application "Spotify" to pause'
    case 'volume': {
      if (!Number.isFinite(command.percent)) return null
      const percent = Math.min(100, Math.max(0, Math.round(command.percent)))
      return `if application "Spotify" is running then tell application "Spotify" to set sound volume to ${percent}`
    }
    case 'playuri': {
      if (!SPOTIFY_TRACK_URI.test(command.uri)) return null
      // If Spotify is closed, open it in the background (-g keeps it from taking focus, -j hides it),
      // wait until it answers, then play exactly that track.
      return [
        'if application "Spotify" is not running then',
        '  do shell script "open -g -j -a Spotify"',
        '  repeat 30 times',
        '    delay 0.5',
        '    if application "Spotify" is running then exit repeat',
        '  end repeat',
        '  delay 2',
        'end if',
        'tell application "Spotify"',
        `  play track "${command.uri}"`,
        'end tell'
      ].join('\n')
    }
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
