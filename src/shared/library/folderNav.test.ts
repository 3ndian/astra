import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveFolderNav, type FolderNavRow } from './folderNav.ts'

// root (open)
//   sub (closed)
//   song1
// other (closed)
const rows: FolderNavRow[] = [
  { key: 'f:root', kind: 'folder', parentKey: null, expanded: true },
  { key: 'f:sub', kind: 'folder', parentKey: 'f:root', expanded: false },
  { key: 't:song1', kind: 'track', parentKey: 'f:root' },
  { key: 'f:other', kind: 'folder', parentKey: null, expanded: false }
]

test('down/up move and clamp; nothing selected starts at the top', () => {
  assert.deepEqual(resolveFolderNav(rows, null, 'ArrowDown'), { type: 'select', key: 'f:root' })
  assert.deepEqual(resolveFolderNav(rows, 'f:root', 'ArrowDown'), { type: 'select', key: 'f:sub' })
  assert.deepEqual(resolveFolderNav(rows, 'f:other', 'ArrowDown'), { type: 'select', key: 'f:other' })
  assert.deepEqual(resolveFolderNav(rows, 'f:sub', 'ArrowUp'), { type: 'select', key: 'f:root' })
  assert.deepEqual(resolveFolderNav(rows, 'f:root', 'ArrowUp'), { type: 'select', key: 'f:root' })
})

test('right expands a closed folder, then steps into its first child', () => {
  assert.deepEqual(resolveFolderNav(rows, 'f:sub', 'ArrowRight'), { type: 'expand', key: 'f:sub' })
  assert.deepEqual(resolveFolderNav(rows, 'f:root', 'ArrowRight'), { type: 'select', key: 'f:sub' })
  assert.deepEqual(resolveFolderNav(rows, 't:song1', 'ArrowRight'), { type: 'none' })
})

test('right on an open folder with no visible child does nothing', () => {
  const lone: FolderNavRow[] = [
    { key: 'f:a', kind: 'folder', parentKey: null, expanded: true },
    { key: 'f:b', kind: 'folder', parentKey: null, expanded: false }
  ]
  assert.deepEqual(resolveFolderNav(lone, 'f:a', 'ArrowRight'), { type: 'none' })
})

test('left collapses an open folder, otherwise jumps to the parent', () => {
  assert.deepEqual(resolveFolderNav(rows, 'f:root', 'ArrowLeft'), { type: 'collapse', key: 'f:root' })
  assert.deepEqual(resolveFolderNav(rows, 'f:sub', 'ArrowLeft'), { type: 'select', key: 'f:root' })
  assert.deepEqual(resolveFolderNav(rows, 't:song1', 'ArrowLeft'), { type: 'select', key: 'f:root' })
  assert.deepEqual(resolveFolderNav(rows, 'f:other', 'ArrowLeft'), { type: 'none' })
})

test('enter plays a track and toggles a folder', () => {
  assert.deepEqual(resolveFolderNav(rows, 't:song1', 'Enter'), { type: 'play', key: 't:song1' })
  assert.deepEqual(resolveFolderNav(rows, 'f:sub', 'Enter'), { type: 'expand', key: 'f:sub' })
  assert.deepEqual(resolveFolderNav(rows, 'f:root', 'Enter'), { type: 'collapse', key: 'f:root' })
})

test('empty rows, unknown keys and stale selections are safe', () => {
  assert.deepEqual(resolveFolderNav([], null, 'ArrowDown'), { type: 'none' })
  assert.deepEqual(resolveFolderNav(rows, 'f:root', 'x'), { type: 'none' })
  assert.deepEqual(resolveFolderNav(rows, 'f:gone', 'Enter'), { type: 'none' })
  assert.deepEqual(resolveFolderNav(rows, 'f:gone', 'ArrowDown'), { type: 'select', key: 'f:root' })
})
