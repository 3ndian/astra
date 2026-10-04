import test from 'node:test'
import assert from 'node:assert/strict'
import { isDefaultTabOrder, moveTab, normalizeTabOrder, parseTabOrders } from './tabOrder.ts'

test('normalize fills in missing tabs and drops junk', () => {
  assert.deepEqual(normalizeTabOrder(['folders', 'bogus', 'folders', 'albums']), ['folders', 'albums', 'tracks', 'artists', 'genres', 'years'])
  assert.deepEqual(normalizeTabOrder(null), ['tracks', 'albums', 'artists', 'genres', 'years', 'folders'])
})

test('moveTab moves to the front and clamps', () => {
  const base = normalizeTabOrder(null)
  assert.equal(moveTab(base, 5, 0)[0], 'folders')
  assert.equal(moveTab(base, 0, 99).at(-1), 'tracks')
  assert.deepEqual(moveTab(base, 9, 0), base)
  assert.equal(moveTab(base, 5, 0).length, 6)
})

test('isDefaultTabOrder', () => {
  assert.ok(isDefaultTabOrder(normalizeTabOrder(null)))
  assert.ok(!isDefaultTabOrder(moveTab(normalizeTabOrder(null), 5, 0)))
})

test('parseTabOrders is per section and tolerant', () => {
  const parsed = parseTabOrders('{"games":["folders"],"music":"x"}')
  assert.equal(parsed.games[0], 'folders')
  assert.equal(parsed.games.length, 6)
  assert.equal(parsed.music.length, 6)
  assert.deepEqual(parseTabOrders('nope'), {})
})
