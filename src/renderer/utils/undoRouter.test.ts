import test from 'node:test'
import assert from 'node:assert/strict'
import { pickUndoScope, undoActionForKey, type UndoScope } from './undoRouter.ts'

function scope(id: string, priority: number, canUndo: boolean, canRedo = false): UndoScope {
  return { id, priority, canUndo: () => canUndo, canRedo: () => canRedo, undo: () => undefined, redo: () => undefined }
}
const key = (k: string, extra: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
  ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...extra })

test('the highest-priority scope that can act gets the key', () => {
  const picked = pickUndoScope([scope('low', 1, true), scope('high', 9, true), scope('idle', 99, false)], 'undo')
  assert.equal(picked?.id, 'high')
})

test('nothing is picked when no scope has anything to undo or redo', () => {
  assert.equal(pickUndoScope([scope('a', 1, false)], 'undo'), null)
  assert.equal(pickUndoScope([scope('a', 1, true, false)], 'redo'), null)
})

test('Cmd+Z undoes and Cmd+Shift+Z redoes on a Mac', () => {
  assert.equal(undoActionForKey(key('z', { metaKey: true }), true), 'undo')
  assert.equal(undoActionForKey(key('Z', { metaKey: true, shiftKey: true }), true), 'redo')
  assert.equal(undoActionForKey(key('z', { ctrlKey: true }), true), null)
  assert.equal(undoActionForKey(key('z'), true), null)
})

test('Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y work elsewhere', () => {
  assert.equal(undoActionForKey(key('z', { ctrlKey: true }), false), 'undo')
  assert.equal(undoActionForKey(key('z', { ctrlKey: true, shiftKey: true }), false), 'redo')
  assert.equal(undoActionForKey(key('y', { ctrlKey: true }), false), 'redo')
  assert.equal(undoActionForKey(key('y', { metaKey: true }), true), null)
})
