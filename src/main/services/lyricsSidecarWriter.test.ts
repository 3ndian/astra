import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import test from 'node:test'
import { saveSidecarLrc } from './lyricsSidecarWriter.ts'
import type { LyricsPayload } from '../../types/lyrics.ts'

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'astra-sidecar-writer-'))
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) }
}

function payload(overrides: Partial<LyricsPayload> = {}): LyricsPayload {
  return {
    source: 'lrclib',
    provider: 'lrclib',
    format: 'lrc',
    plainLyrics: 'Hello\nWorld',
    syncedLyrics: '[00:01.00]Hello\n[00:03.00]World',
    syncedLines: [
      { timestampMs: 1000, text: 'Hello' },
      { timestampMs: 3000, text: 'World' }
    ],
    ...overrides
  }
}

test('writes <name>.lrc next to the audio and leaves the audio untouched', async (t) => {
  const temp = await createTempDir()
  t.after(temp.cleanup)
  const audio = join(temp.dir, 'Song.flac')
  await writeFile(audio, 'AUDIO-BYTES')

  const result = await saveSidecarLrc(audio, payload())
  assert.deepEqual(result, { status: 'saved', path: join(temp.dir, 'Song.lrc'), kind: 'synced' })
  assert.equal(await readFile(join(temp.dir, 'Song.lrc'), 'utf-8'), '[00:01.00]Hello\n[00:03.00]World\n')
  assert.equal(await readFile(audio, 'utf-8'), 'AUDIO-BYTES')
  assert.deepEqual((await readdir(temp.dir)).sort(), ['Song.flac', 'Song.lrc'])
})

test('never overwrites an existing .lrc or .xlrc', async (t) => {
  const temp = await createTempDir()
  t.after(temp.cleanup)
  const audio = join(temp.dir, 'Song.flac')
  await writeFile(audio, 'A')
  await writeFile(join(temp.dir, 'Song.lrc'), 'MINE')

  const first = await saveSidecarLrc(audio, payload())
  assert.equal(first.status, 'exists')
  assert.equal(await readFile(join(temp.dir, 'Song.lrc'), 'utf-8'), 'MINE')

  const audio2 = join(temp.dir, 'Other.flac')
  await writeFile(audio2, 'A')
  await writeFile(join(temp.dir, 'Other.xlrc'), 'X')
  assert.equal((await saveSidecarLrc(audio2, payload())).status, 'exists')
  assert.deepEqual((await readdir(temp.dir)).filter((name) => name.endsWith('.tmp')), [])
})

test('skips remote paths, missing audio, empty lyrics, and lyrics that already came from a sidecar', async (t) => {
  const temp = await createTempDir()
  t.after(temp.cleanup)
  const audio = join(temp.dir, 'Song.flac')
  await writeFile(audio, 'A')

  assert.deepEqual(await saveSidecarLrc('https://example.com/a.flac', payload()), { status: 'skipped', reason: 'not-local' })
  assert.deepEqual(await saveSidecarLrc(join(temp.dir, 'Missing.flac'), payload()), { status: 'skipped', reason: 'audio-missing' })
  assert.deepEqual(
    await saveSidecarLrc(audio, payload({ plainLyrics: null, syncedLyrics: null, syncedLines: [] })),
    { status: 'skipped', reason: 'no-lyrics' }
  )
  assert.deepEqual(await saveSidecarLrc(audio, payload({ source: 'lrc' })), { status: 'skipped', reason: 'already-sidecar' })
  assert.deepEqual(await readdir(temp.dir), ['Song.flac'])
})

test('plain-only lyrics are saved as plain text', async (t) => {
  const temp = await createTempDir()
  t.after(temp.cleanup)
  const audio = join(temp.dir, 'Song.mp3')
  await writeFile(audio, 'A')

  const result = await saveSidecarLrc(audio, payload({ syncedLyrics: null, syncedLines: [] }))
  assert.equal(result.status, 'saved')
  assert.equal(result.status === 'saved' && result.kind, 'plain')
  assert.equal(await readFile(join(temp.dir, 'Song.lrc'), 'utf-8'), 'Hello\nWorld\n')
})

test('with a Lyrics folder, mirrors the structure there and leaves the music folder clean', async (t) => {
  const temp = await createTempDir()
  t.after(temp.cleanup)
  const albumDir = join(temp.dir, 'Music', 'Artist', 'Album')
  await mkdir(albumDir, { recursive: true })
  const audio = join(albumDir, '01 Song.flac')
  await writeFile(audio, 'A')
  const lyricsFolder = { root: join(temp.dir, 'Lyrics'), libraryRoots: [join(temp.dir, 'Music')] }

  const result = await saveSidecarLrc(audio, payload(), { lyricsFolder })
  const expected = join(temp.dir, 'Lyrics', 'Music', 'Artist', 'Album', '01 Song.lrc')
  assert.deepEqual(result, { status: 'saved', path: expected, kind: 'synced' })
  assert.equal(await readFile(expected, 'utf-8'), '[00:01.00]Hello\n[00:03.00]World\n')
  assert.deepEqual((await readdir(albumDir)).sort(), ['01 Song.flac'])

  const again = await saveSidecarLrc(audio, payload({ plainLyrics: 'changed' }), { lyricsFolder })
  assert.deepEqual(again, { status: 'exists', path: expected })
  assert.equal(await readFile(expected, 'utf-8'), '[00:01.00]Hello\n[00:03.00]World\n')
})

test('with a Lyrics folder, tracks outside every library folder are skipped, never written beside the audio', async (t) => {
  const temp = await createTempDir()
  t.after(temp.cleanup)
  const audio = join(temp.dir, 'Stray.flac')
  await writeFile(audio, 'A')

  const result = await saveSidecarLrc(audio, payload(), {
    lyricsFolder: { root: join(temp.dir, 'Lyrics'), libraryRoots: [join(temp.dir, 'Music')] }
  })
  assert.deepEqual(result, { status: 'skipped', reason: 'outside-library' })
  assert.deepEqual((await readdir(temp.dir)).sort(), ['Stray.flac'])
})
