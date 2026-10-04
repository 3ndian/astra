import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import test from 'node:test'
import { createSidecarLookup, mirroredLyricsPath } from './lyricsSidecarLocation.ts'

test('mirrors the library folder structure inside the lyrics folder', () => {
  assert.equal(
    mirroredLyricsPath('/m/Music/Artist/Album/01 Song.flac', ['/m/Music'], '/m/Lyrics'),
    join('/m/Lyrics', 'Music', 'Artist', 'Album', '01 Song.lrc')
  )
  assert.equal(
    mirroredLyricsPath('/m/Music/Artist/Album/01 Song.flac', ['/m/Music'], '/m/Lyrics', '.xlrc'),
    join('/m/Lyrics', 'Music', 'Artist', 'Album', '01 Song.xlrc')
  )
})

test('tracks directly inside a library folder, and nested library folders', () => {
  assert.equal(mirroredLyricsPath('/m/Music/Song.mp3', ['/m/Music'], '/m/Lyrics'), join('/m/Lyrics', 'Music', 'Song.lrc'))
  assert.equal(
    mirroredLyricsPath('/m/Music/Game/OST/a.flac', ['/m/Music', '/m/Music/Game'], '/m/Lyrics'),
    join('/m/Lyrics', 'Game', 'OST', 'a.lrc')
  )
})

test('returns null for tracks outside every library folder, remote paths, or an empty lyrics folder', () => {
  assert.equal(mirroredLyricsPath('/elsewhere/a.flac', ['/m/Music'], '/m/Lyrics'), null)
  assert.equal(mirroredLyricsPath('/m/MusicOther/a.flac', ['/m/Music'], '/m/Lyrics'), null)
  assert.equal(mirroredLyricsPath('https://x/a.flac', ['/m/Music'], '/m/Lyrics'), null)
  assert.equal(mirroredLyricsPath('/m/Music/a.flac', ['/m/Music'], ''), null)
})

test('lookup reads from the lyrics folder, and prefers a file beside the audio', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'astra-lyrics-loc-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const musicDir = join(root, 'Music', 'Artist')
  const lyricsDir = join(root, 'Lyrics', 'Music', 'Artist')
  await mkdir(musicDir, { recursive: true })
  await mkdir(lyricsDir, { recursive: true })
  const audio = join(musicDir, 'Song.flac')
  await writeFile(audio, 'A')
  await writeFile(join(lyricsDir, 'Song.lrc'), '[00:01.00]From lyrics folder\n', 'utf-8')

  const lookup = createSidecarLookup({
    getLyricsRoot: () => join(root, 'Lyrics'),
    getLibraryRoots: () => [join(root, 'Music')]
  })
  const fromFolder = await lookup(audio)
  assert.equal(fromFolder?.status, 'hit')
  assert.equal(fromFolder?.lyrics.syncedLines[0]?.text, 'From lyrics folder')

  await writeFile(join(musicDir, 'Song.lrc'), '[00:01.00]Beside the file\n', 'utf-8')
  const beside = await lookup(audio)
  assert.equal(beside?.lyrics.syncedLines[0]?.text, 'Beside the file')

  const noFolder = createSidecarLookup({ getLyricsRoot: () => null, getLibraryRoots: () => [] })
  await rm(join(musicDir, 'Song.lrc'))
  assert.equal(await noFolder(audio), null)
})
