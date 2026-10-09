import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSpotifyStatusOutput, parseLocaleNumber, scriptForCommand } from './spotifyStatus.ts'

test('parses a playing track', () => {
  const s = parseSpotifyStatusOutput('playing\tspotify:track:1\tNeon Harbor\tVelvet Static\tNight Signals\thttps://i.scdn.co/image/abc\t12.5\t268000\t55\t7\t2\n')
  assert.equal(s.state, 'playing')
  assert.equal(s.track?.title, 'Neon Harbor')
  assert.equal(s.track?.durationMs, 268000)
  assert.equal(s.track?.trackNumber, 7)
  assert.equal(s.track?.discNumber, 2)
  assert.equal(s.positionSeconds, 12.5)
  assert.equal(s.volume, 55)
  assert.equal(s.track?.artworkUrl, 'https://i.scdn.co/image/abc')
})

test('handles comma decimals and missing artwork', () => {
  const s = parseSpotifyStatusOutput('paused\tid\tT\tA\tAl\tmissing value\t3,25\t1000')
  assert.equal(s.state, 'paused')
  assert.equal(s.positionSeconds, 3.25)
  assert.equal(s.track?.artworkUrl, null)
})

test('stopped, not running and garbage', () => {
  assert.equal(parseSpotifyStatusOutput('stopped').state, 'stopped')
  assert.equal(parseSpotifyStatusOutput('notrunning\n').state, 'notrunning')
  assert.equal(parseSpotifyStatusOutput('what').state, 'error')
})

test('volume and play/pause commands', () => {
  assert.match(scriptForCommand({ kind: 'pause' }) ?? '', /to pause$/)
  assert.match(scriptForCommand({ kind: 'play' }) ?? '', /to play$/)
  assert.match(scriptForCommand({ kind: 'volume', percent: 150 }) ?? '', /sound volume to 100$/)
  assert.equal(scriptForCommand({ kind: 'volume', percent: Number.NaN }), null)
  assert.equal(parseSpotifyStatusOutput('playing\tid\tT\tA\tAl\tu\t1\t1000').volume, null)
})

test('locale numbers and command scripts', () => {
  assert.equal(parseLocaleNumber('1,5'), 1.5)
  assert.equal(parseLocaleNumber('abc'), 0)
  assert.match(scriptForCommand({ kind: 'next' }) ?? '', /next track/)
  assert.match(scriptForCommand({ kind: 'seek', seconds: 61.234 }) ?? '', /player position to 61.2$/)
  assert.equal(scriptForCommand({ kind: 'seek', seconds: -1 }), null)
})

test('playuri builds a script only for a well-formed track URI', () => {
  const ok = scriptForCommand({ kind: 'playuri', uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC' })
  assert.ok(ok && ok.includes('play track "spotify:track:4uLU6hMCjMI75M1A2tKUQC"'))
  assert.equal(scriptForCommand({ kind: 'playuri', uri: 'spotify:track:x" & (do shell script "id")' }), null)
  assert.equal(scriptForCommand({ kind: 'playuri', uri: 'spotify:album:4uLU6hMCjMI75M1A2tKUQC' }), null)
})
