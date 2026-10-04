import test from 'node:test'
import assert from 'node:assert/strict'
import { looksLikePreset, parsePresetFile, presetNameFromFile, sanitizePresetFileName, stepIndex, sortPresetNames } from './presets.ts'

const good = { baseVals: { decay: 0.9 }, shapes: [], waves: [] }

test('looksLikePreset needs a baseVals object', () => {
  assert.equal(looksLikePreset(good), true)
  assert.equal(looksLikePreset({}), false)
  assert.equal(looksLikePreset({ baseVals: 3 }), false)
  assert.equal(looksLikePreset([good]), false)
  assert.equal(looksLikePreset(null), false)
})

test('single preset file takes its name from the file', () => {
  const r = parsePresetFile('Aderrasi - Cool.json', JSON.stringify(good))
  assert.ok(r.ok)
  assert.equal(r.presets.length, 1)
  assert.equal(r.presets[0].name, 'Aderrasi - Cool')
})

test('pack file yields every valid preset and skips junk', () => {
  const r = parsePresetFile('pack.json', JSON.stringify({ A: good, B: good, C: { nope: 1 } }))
  assert.ok(r.ok)
  assert.deepEqual(r.presets.map((p) => p.name), ['A', 'B'])
})

test('rejections have specific reasons', () => {
  assert.deepEqual(parsePresetFile('x.milk', 'per_frame_1=...'), { ok: false, reason: 'milk-unsupported' })
  assert.deepEqual(parsePresetFile('x.json', '{oops'), { ok: false, reason: 'invalid-json' })
  assert.deepEqual(parsePresetFile('x.json', '{"a":1}'), { ok: false, reason: 'not-a-preset' })
  assert.deepEqual(parsePresetFile('x.json', '[1,2]'), { ok: false, reason: 'not-a-preset' })
})

test('names and file names', () => {
  assert.equal(presetNameFromFile('a.JSON'), 'a')
  assert.equal(presetNameFromFile('.json'), 'Untitled preset')
  assert.equal(sanitizePresetFileName('a/b:c*?.json'), 'a_b_c__.json')
  assert.equal(sanitizePresetFileName('   '), 'preset.json')
})

test('stepIndex wraps and handles tiny lists', () => {
  assert.equal(stepIndex(0, 0, 'next'), -1)
  assert.equal(stepIndex(1, 0, 'random'), 0)
  assert.equal(stepIndex(5, 4, 'next'), 0)
  assert.equal(stepIndex(5, 0, 'previous'), 4)
  assert.equal(stepIndex(5, -1, 'next'), 0)
})

test('random never repeats current and covers all other indices', () => {
  const seen = new Set<number>()
  for (let i = 0; i < 100; i++) {
    const r = i / 100
    const idx = stepIndex(4, 2, 'random', () => r)
    assert.notEqual(idx, 2)
    assert.ok(idx >= 0 && idx < 4)
    seen.add(idx)
  }
  assert.deepEqual([...seen].sort(), [0, 1, 3])
  assert.equal(stepIndex(4, 3, 'random', () => 0.999999), 2)
})

test('sortPresetNames is case-insensitive', () => {
  assert.deepEqual(sortPresetNames(['b', 'A', 'c']), ['A', 'b', 'c'])
})

test('random from outside the list can pick any index including the first', () => {
  assert.equal(stepIndex(4, -1, 'random', () => 0), 0)
  assert.equal(stepIndex(4, -1, 'random', () => 0.999999), 3)
})
