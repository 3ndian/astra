import test from 'node:test'
import assert from 'node:assert/strict'
import { isSpotifyEntryPath, normalizeSpotifyPlaylistEntryRequest, spotifyEntryPath } from './playlistEntry.ts'

test('entry path round-trips', () => {
  assert.equal(spotifyEntryPath('abc123'), 'spotify:track:abc123')
  assert.ok(isSpotifyEntryPath('spotify:track:abc123'))
  assert.ok(!isSpotifyEntryPath('/Users/x/song.flac'))
})

test('valid request is cleaned', () => {
  assert.deepEqual(
    normalizeSpotifyPlaylistEntryRequest({ playlistId: 3, spotifyTrackId: ' 4uLU6hMCjMI75M1A2tKUQC ', title: '  Never   Gonna ', artist: 'A', album: 'B' }),
    { playlistId: 3, spotifyTrackId: '4uLU6hMCjMI75M1A2tKUQC', title: 'Never Gonna', artist: 'A', album: 'B' }
  )
})

test('bad requests are refused', () => {
  assert.equal(normalizeSpotifyPlaylistEntryRequest(null), null)
  assert.equal(normalizeSpotifyPlaylistEntryRequest({ playlistId: 0, spotifyTrackId: 'abc', title: 'x' }), null)
  assert.equal(normalizeSpotifyPlaylistEntryRequest({ playlistId: 1, spotifyTrackId: 'a b', title: 'x' }), null)
  assert.equal(normalizeSpotifyPlaylistEntryRequest({ playlistId: 1, spotifyTrackId: 'abc', title: '   ' }), null)
  assert.equal(normalizeSpotifyPlaylistEntryRequest({ playlistId: 1.5, spotifyTrackId: 'abc', title: 'x' }), null)
})
