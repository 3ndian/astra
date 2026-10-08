import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addBookmark, formatTimestamp, parseBookmarks, parseTimestamp, removeBookmark, serializeBookmarks, updateBookmarkNote
} from './bookmarks.ts'
import { chapterIndexAt, chapterJumpTarget, formatLeft, normalizeChapters, progressInfo } from './chapters.ts'

test('timestamps format and parse', () => {
  assert.equal(formatTimestamp(0), '0:00')
  assert.equal(formatTimestamp(65), '1:05')
  assert.equal(formatTimestamp(3723), '1:02:03')
  assert.equal(parseTimestamp('1:02:03'), 3723)
  assert.equal(parseTimestamp('02:03'), 123)
  assert.equal(parseTimestamp('1:75'), null)
  assert.equal(parseTimestamp('abc'), null)
})

test('bookmarks round-trip through markdown, including multi-line notes', () => {
  let list = addBookmark([], 3723, 'Great line\nabout the lighthouse', 1760000000000)
  list = addBookmark(list, 65, '', 1760000000001)
  const text = serializeBookmarks('My Book', list)
  assert.match(text, /^# Bookmarks: My Book/)
  const back = parseBookmarks(text)
  assert.equal(back.length, 2)
  assert.equal(back[0].position, 65)
  assert.equal(back[0].note, '')
  assert.equal(back[1].position, 3723)
  assert.equal(back[1].note, 'Great line\nabout the lighthouse')
  assert.equal(back[1].createdAt, 1760000000000)
})

test('hand-written bookmark files still parse', () => {
  const back = parseBookmarks('# notes\n\nrandom text\n- [5:00] plain\n- [1:00:00]\n- [x] not one\n')
  assert.deepEqual(back.map((b) => [b.position, b.note]), [[300, 'plain'], [3600, '']])
})

test('edit helpers', () => {
  const list = addBookmark([], 10, 'a', 1)
  const id = list[0].id
  assert.equal(updateBookmarkNote(list, id, ' b ')[0].note, 'b')
  assert.equal(removeBookmark(list, id).length, 0)
  assert.equal(addBookmark(list, -5, 'x', 2).length, 1)
})

test('chapters normalise using timeScale, sample offset, then milliseconds', () => {
  const chapters = normalizeChapters([
    { title: 'B', start: 90000, timeScale: 1000 },
    { title: '', start: 0, timeScale: 1000 },
    { title: 'dup', start: 90100, timeScale: 1000 },
    { title: 'C', sampleOffset: 44100 * 200, start: 0 }
  ], 44100)
  assert.deepEqual(chapters.map((c) => [c.title, c.start]), [['Chapter 2', 0], ['B', 90], ['C', 200]].map(([t, s]) => [t, s]))
  assert.deepEqual(normalizeChapters(undefined), [])
  assert.equal(normalizeChapters([{ title: 'ms', start: 5000 }])[0].start, 5)
})

test('chapter lookup and jumps', () => {
  const ch = [{ title: 'A', start: 0 }, { title: 'B', start: 100 }, { title: 'C', start: 200 }]
  assert.equal(chapterIndexAt(ch, 150), 1)
  assert.equal(chapterIndexAt([], 5), -1)
  assert.equal(chapterJumpTarget(ch, 150, 1), 200)
  assert.equal(chapterJumpTarget(ch, 250, 1), null)
  assert.equal(chapterJumpTarget(ch, 150, -1), 100)
  assert.equal(chapterJumpTarget(ch, 101, -1), 0)
  assert.equal(chapterJumpTarget([], 5, 1), null)
})

test('progress and remaining text', () => {
  assert.deepEqual(progressInfo(50, 200), { percent: 25, remainingSeconds: 150 })
  assert.equal(progressInfo(5, 0), null)
  assert.equal(formatLeft(3 * 3600 + 12 * 60), '3h 12m left')
  assert.equal(formatLeft(125), '2m left')
  assert.equal(formatLeft(30), '30s left')
})
