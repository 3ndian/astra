import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_COLLECTIONS, applyFilter, createFolder, deleteFolder, filterToValue, inFolder, isFavorite,
  normalizeFilter, renameFolder, sanitizeCollections, sanitizeFilter, toggleFavorite, toggleInFolder, valueToFilter
} from './collections.ts'

const entries = [
  { name: 'A', user: false },
  { name: 'B', user: false },
  { name: 'C', user: true }
]

test('favorites toggle on and off', () => {
  let c = toggleFavorite(EMPTY_COLLECTIONS, 'A')
  assert.equal(isFavorite(c, 'A'), true)
  c = toggleFavorite(c, 'A')
  assert.equal(isFavorite(c, 'A'), false)
})

test('folders: create, reject empty and duplicate names, rename, delete', () => {
  let c = createFolder(EMPTY_COLLECTIONS, '  Chill   vibes ', 'f1')
  assert.equal(c.folders[0].name, 'Chill vibes')
  assert.equal(createFolder(c, '', 'f2'), c)
  assert.equal(createFolder(c, 'chill VIBES', 'f2'), c)
  c = createFolder(c, 'Hype', 'f2')
  assert.equal(c.folders.length, 2)
  assert.equal(renameFolder(c, 'f2', 'chill vibes'), c)
  c = renameFolder(c, 'f2', 'Hype!')
  assert.equal(c.folders[1].name, 'Hype!')
  assert.equal(renameFolder(c, 'f1', 'Chill vibes').folders[0].name, 'Chill vibes')
  c = deleteFolder(c, 'f1')
  assert.deepEqual(c.folders.map((f) => f.id), ['f2'])
})

test('folder membership toggles', () => {
  let c = createFolder(EMPTY_COLLECTIONS, 'X', 'f1')
  c = toggleInFolder(c, 'f1', 'A')
  assert.equal(inFolder(c, 'f1', 'A'), true)
  assert.equal(inFolder(c, 'nope', 'A'), false)
  c = toggleInFolder(c, 'f1', 'A')
  assert.equal(inFolder(c, 'f1', 'A'), false)
})

test('applyFilter', () => {
  let c = toggleFavorite(EMPTY_COLLECTIONS, 'B')
  c = createFolder(c, 'X', 'f1')
  c = toggleInFolder(c, 'f1', 'C')
  c = toggleInFolder(c, 'f1', 'Gone') // preset no longer exists: ignored
  assert.deepEqual(applyFilter(entries, { kind: 'all' }, c).map((e) => e.name), ['A', 'B', 'C'])
  assert.deepEqual(applyFilter(entries, { kind: 'favorites' }, c).map((e) => e.name), ['B'])
  assert.deepEqual(applyFilter(entries, { kind: 'mine' }, c).map((e) => e.name), ['C'])
  assert.deepEqual(applyFilter(entries, { kind: 'folder', id: 'f1' }, c).map((e) => e.name), ['C'])
  assert.deepEqual(applyFilter(entries, { kind: 'folder', id: 'zzz' }, c), [])
})

test('normalizeFilter drops filters for deleted folders', () => {
  const c = createFolder(EMPTY_COLLECTIONS, 'X', 'f1')
  assert.deepEqual(normalizeFilter({ kind: 'folder', id: 'f1' }, c), { kind: 'folder', id: 'f1' })
  assert.deepEqual(normalizeFilter({ kind: 'folder', id: 'f9' }, c), { kind: 'all' })
})

test('filter <-> select value round trip', () => {
  for (const f of [{ kind: 'all' }, { kind: 'favorites' }, { kind: 'mine' }, { kind: 'folder', id: 'f1' }] as const) {
    assert.deepEqual(valueToFilter(filterToValue(f)), f)
  }
  assert.deepEqual(valueToFilter('garbage'), { kind: 'all' })
})

test('sanitize survives junk from storage', () => {
  assert.deepEqual(sanitizeCollections(null), EMPTY_COLLECTIONS)
  assert.deepEqual(sanitizeCollections('x'), EMPTY_COLLECTIONS)
  const c = sanitizeCollections({
    favorites: ['A', 'A', 3, 'B'],
    folders: [{ id: 'f1', name: ' ok ', presets: ['A', 'A', 7] }, { id: 'f1', name: 'dup' }, { id: 2, name: 'x' }, { id: 'f3', name: '   ' }, null]
  })
  assert.deepEqual(c.favorites, ['A', 'B'])
  assert.deepEqual(c.folders, [{ id: 'f1', name: 'ok', presets: ['A'] }])
  assert.deepEqual(sanitizeFilter({ kind: 'folder', id: 'f1' }), { kind: 'folder', id: 'f1' })
  assert.deepEqual(sanitizeFilter({ kind: 'folder' }), { kind: 'all' })
  assert.deepEqual(sanitizeFilter(undefined), { kind: 'all' })
})
