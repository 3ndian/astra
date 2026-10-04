import test from 'node:test'
import assert from 'node:assert/strict'
import { planRestore, rememberSectionView, sanitizeMemory } from './sectionViewMemory.ts'

const always = () => true
const never = () => false

test('a section with nothing remembered opens Home', () => {
  assert.deepEqual(planRestore(undefined, always), { view: 'home', libraryViewMode: null, playlistId: null })
})

test('each section keeps its own page', () => {
  let memory = rememberSectionView({}, 'audiobooks', { view: 'library', libraryViewMode: 'albums' })
  memory = rememberSectionView(memory, 'music', { view: 'stats' })
  assert.deepEqual(planRestore(memory.audiobooks, always), { view: 'library', libraryViewMode: 'albums', playlistId: null })
  assert.deepEqual(planRestore(memory.music, always), { view: 'stats', libraryViewMode: null, playlistId: null })
})

test('a playlist is reopened only if it still exists', () => {
  const entry = { view: 'playlist', playlistId: 7 }
  assert.deepEqual(planRestore(entry, always), { view: 'playlist', libraryViewMode: null, playlistId: 7 })
  assert.deepEqual(planRestore(entry, never), { view: 'library', libraryViewMode: null, playlistId: null })
  assert.deepEqual(planRestore({ view: 'playlist' }, always), { view: 'library', libraryViewMode: null, playlistId: null })
})

test('saved data is cleaned on load', () => {
  const cleaned = sanitizeMemory({
    music: { view: 'library', libraryViewMode: 'albums', playlistId: 3 },
    bad: { view: 'nonsense' },
    worse: 5,
    odd: { view: 'home', libraryViewMode: 'weird', playlistId: 'x' }
  })
  assert.deepEqual(cleaned, {
    music: { view: 'library', libraryViewMode: 'albums', playlistId: 3 },
    odd: { view: 'home' }
  })
  assert.deepEqual(sanitizeMemory(null), {})
  assert.deepEqual(sanitizeMemory({ a: { view: 'home', analyzerVisible: false }, b: { view: 'home', analyzerVisible: 'no' } }), {
    a: { view: 'home', analyzerVisible: false },
    b: { view: 'home' }
  })
})
