import test from 'node:test'
import assert from 'node:assert/strict'
import { isReachable, parseScopeWindowPrefs, resolveScopeWindowBounds } from './windowBounds.ts'

const limits = { minWidth: 420, minHeight: 220, defaultWidth: 760, defaultHeight: 320 }
const main = { x: 0, y: 0, width: 1920, height: 1080 }
const second = { x: 1920, y: 0, width: 1920, height: 1080 }

test('a saved window on a connected display is restored as-is', () => {
  const out = resolveScopeWindowBounds({ x: 2100, y: 100, width: 800, height: 400 }, [main, second], limits)
  assert.deepEqual(out, { x: 2100, y: 100, width: 800, height: 400 })
})

test('a window saved on a monitor that is gone keeps its size but loses its position', () => {
  const out = resolveScopeWindowBounds({ x: 2100, y: 100, width: 800, height: 400 }, [main], limits)
  assert.deepEqual(out, { width: 800, height: 400 })
})

test('barely-visible windows count as unreachable', () => {
  assert.equal(isReachable({ x: 1900, y: 100, width: 800, height: 400 }, [main]), false)
  assert.equal(isReachable({ x: 1700, y: 100, width: 800, height: 400 }, [main]), true)
  assert.equal(isReachable({ x: 100, y: 1060, width: 800, height: 400 }, [main]), false)
})

test('sizes are clamped to the minimums and junk falls back to defaults', () => {
  assert.deepEqual(resolveScopeWindowBounds({ x: 10, y: 10, width: 5, height: 5 }, [main], limits), { x: 10, y: 10, width: 420, height: 220 })
  assert.deepEqual(resolveScopeWindowBounds(null, [main], limits), { width: 760, height: 320 })
  assert.deepEqual(resolveScopeWindowBounds({ x: 'a', y: 1, width: 'b' }, [main], limits), { width: 760, height: 320 })
})

test('with no display info the saved position is trusted', () => {
  assert.deepEqual(resolveScopeWindowBounds({ x: -5000, y: 0, width: 500, height: 300 }, [], limits), { x: -5000, y: 0, width: 500, height: 300 })
})

test('parseScopeWindowPrefs keeps valid entries only', () => {
  const parsed = parseScopeWindowPrefs('{"spectrum":{"x":1,"y":2,"width":3,"height":4},"bad":{"x":1},"n":5}')
  assert.deepEqual(Object.keys(parsed), ['spectrum'])
  assert.deepEqual(parseScopeWindowPrefs('nope'), {})
  assert.deepEqual(parseScopeWindowPrefs('[1]'), {})
})
