import test from 'node:test'
import assert from 'node:assert/strict'
import { clampFilterRange, formatHz, planCut, planCutBranches, planFrequencyFilter, planSolo, NATIVE_CUT_PLAN } from './plan.ts'

test('solo is two high-pass and two low-pass stages at the edges', () => {
  const stages = planSolo({ lowHz: 400, highHz: 800, mode: 'solo' }, 48000)
  assert.deepEqual(stages.map((s) => s.type), ['highpass', 'highpass', 'lowpass', 'lowpass'])
  assert.equal(stages[0].frequency, 400)
  assert.equal(stages[3].frequency, 800)
})

test('edges are ordered, kept in range and never thinner than the minimum', () => {
  const swapped = clampFilterRange({ lowHz: 900, highHz: 300, mode: 'solo' }, 48000)
  assert.equal(swapped.lowHz, 300)
  assert.equal(swapped.highHz, 900)
  const thin = clampFilterRange({ lowHz: 1000, highHz: 1000, mode: 'solo' }, 48000)
  assert.ok(thin.highHz / thin.lowHz >= 1.119)
  const wide = clampFilterRange({ lowHz: 1, highHz: 99999, mode: 'cut' }, 44100)
  assert.equal(wide.lowHz, 20)
  assert.ok(wide.highHz <= 44100 * 0.45 + 1e-6)
  assert.equal(wide.mode, 'cut')
})

test('cut runs a low-pass at the low edge and a high-pass at the high edge side by side', () => {
  const { below, above } = planCutBranches({ lowHz: 200, highHz: 3200, mode: 'cut' }, 48000)
  assert.deepEqual(below.map((s) => [s.type, s.frequency]), [['lowpass', 200], ['lowpass', 200]])
  assert.deepEqual(above.map((s) => [s.type, s.frequency]), [['highpass', 3200], ['highpass', 3200]])
})

test('the native cut places its bells inside the band', () => {
  const stages = planCut({ lowHz: 200, highHz: 3200, mode: 'cut' }, 48000)
  for (const stage of stages) {
    assert.equal(stage.type, 'peaking')
    assert.ok(stage.frequency > 200 && stage.frequency < 3200)
  }
})

test('native cut stays within the 12 dB per band the engine allows and the band budget', () => {
  const stages = planFrequencyFilter({ lowHz: 100, highHz: 400, mode: 'cut' }, 48000, NATIVE_CUT_PLAN)
  assert.equal(stages.length, NATIVE_CUT_PLAN.centers * NATIVE_CUT_PLAN.stacks)
  assert.ok(stages.every((s) => Math.abs(s.gain) <= 12))
  assert.ok(stages.every((s) => s.Q >= 0.1 && s.Q <= 18))
})

test('frequencies read nicely', () => {
  assert.equal(formatHz(440), '440 Hz')
  assert.equal(formatHz(1000), '1 kHz')
  assert.equal(formatHz(2500), '2.5 kHz')
  assert.equal(formatHz(12000), '12 kHz')
})
