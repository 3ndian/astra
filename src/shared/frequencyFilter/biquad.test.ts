import test from 'node:test'
import assert from 'node:assert/strict'
import { BandFilter, BiquadCascade } from './biquad.ts'
import { planSolo } from './plan.ts'

const RATE = 48000

function sine(frequency: number, seconds = 0.5): Float32Array {
  const out = new Float32Array(Math.floor(RATE * seconds))
  for (let i = 0; i < out.length; i += 1) out[i] = Math.sin((2 * Math.PI * frequency * i) / RATE)
  return out
}

/** Peak level of the last quarter second, once the filter has settled. */
function settledPeak(signal: Float32Array): number {
  let peak = 0
  for (let i = Math.floor(signal.length / 2); i < signal.length; i += 1) peak = Math.max(peak, Math.abs(signal[i]))
  return peak
}

function run(cascade: BiquadCascade, frequency: number): number {
  return settledPeak(cascade.process(sine(frequency)))
}

test('solo passes the middle of the band and removes what is far outside it', () => {
  const solo = new BiquadCascade()
  solo.configure(planSolo({ lowHz: 800, highHz: 3200, mode: 'solo' }, RATE), RATE)
  assert.ok(run(solo, 1600) > 0.85, 'inside the band stays loud')
  solo.reset()
  assert.ok(run(solo, 100) < 0.01, 'well below the band is gone')
  solo.reset()
  assert.ok(run(solo, 15000) < 0.01, 'well above the band is gone')
})

test('cut removes the middle of the band and keeps what is outside it', () => {
  const make = () => {
    const filter = new BandFilter()
    filter.configure({ lowHz: 800, highHz: 3200, mode: 'cut' }, RATE)
    return filter
  }
  const level = (frequency: number) => settledPeak(make().process(sine(frequency)))
  assert.ok(level(1600) < 0.05, 'inside the band is removed')
  assert.ok(level(100) > 0.9, 'below the band is kept')
  assert.ok(level(9500) > 0.9, 'above the band is kept')
  assert.ok(level(5000) > 0.8, 'a little above the band is mostly kept')
})

test('the input is never changed', () => {
  const input = sine(440, 0.05)
  const copy = Float32Array.from(input)
  const cascade = new BiquadCascade()
  cascade.configure(planSolo({ lowHz: 200, highHz: 900, mode: 'solo' }, RATE), RATE)
  cascade.process(input)
  assert.deepEqual(input, copy)
})
