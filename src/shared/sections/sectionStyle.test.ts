import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePinned, sectionColor, togglePinned, visibleRailIds, type SectionStyleInput } from './sectionStyle.ts'

const music: SectionStyleInput = { id: 'music', kind: 'music' }
const books: SectionStyleInput = { id: 'audiobooks', kind: 'audiobook' }
const game: SectionStyleInput = { id: 'game-music', kind: 'custom' }
const jazz: SectionStyleInput = { id: 'jazz', kind: 'custom' }
const all = [music, game, jazz, books]

test('default pins music, audiobooks, then the first custom section', () => {
  assert.deepEqual(resolvePinned(all, null), ['music', 'audiobooks', 'game-music'])
})

test('saved pins are kept, cleaned of unknown or duplicate ids and capped at three', () => {
  assert.deepEqual(resolvePinned(all, ['jazz', 'gone', 'jazz', 'music', 'game-music', 'audiobooks']), ['jazz', 'music', 'game-music'])
  assert.deepEqual(resolvePinned(all, ['gone']), ['music', 'audiobooks', 'game-music'])
})

test('the active section is always visible, in registry order', () => {
  assert.deepEqual(visibleRailIds(all, ['music', 'audiobooks'], 'jazz'), ['music', 'jazz', 'audiobooks'])
  assert.deepEqual(visibleRailIds(all, ['music'], 'music'), ['music'])
})

test('pinning respects the limit and keeps one pinned', () => {
  assert.deepEqual(togglePinned(['music', 'audiobooks', 'game-music'], 'jazz'), { pinned: ['music', 'audiobooks', 'game-music'], changed: false })
  assert.deepEqual(togglePinned(['music', 'audiobooks'], 'jazz'), { pinned: ['music', 'audiobooks', 'jazz'], changed: true })
  assert.deepEqual(togglePinned(['music'], 'music'), { pinned: ['music'], changed: false })
  assert.deepEqual(togglePinned(['music', 'jazz'], 'jazz'), { pinned: ['music'], changed: true })
})

test('colours are stable per section', () => {
  assert.equal(sectionColor(music), '#9b8cff')
  assert.equal(sectionColor(books), '#e0a458')
  assert.equal(sectionColor(game), sectionColor({ ...game }))
})
