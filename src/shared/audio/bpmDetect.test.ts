import assert from 'node:assert/strict'
import test from 'node:test'
import { BPM_DETECT_SAMPLE_RATE, detectBpm } from './bpmDetect.ts'

function makeTrack(bpm: number, seconds: number, opts: { swing?: boolean; noise?: number } = {}): Float32Array {
  const sr = BPM_DETECT_SAMPLE_RATE
  const out = new Float32Array(sr * seconds)
  let seed = 12345
  const rand = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff - 0.5 }
  const beat = (60 / bpm) * sr
  for (let b = 0; b * beat < out.length; b++) {
    const start = Math.floor(b * beat)
    // Kick: decaying 60 Hz sine.
    for (let i = 0; i < 2200 && start + i < out.length; i++) {
      out[start + i] += 0.8 * Math.sin((2 * Math.PI * 60 * i) / sr) * Math.exp(-i / 700)
    }
    // Off-beat hat: noise burst half a beat later.
    const hat = start + Math.floor(beat / 2)
    for (let i = 0; i < 500 && hat + i < out.length; i++) {
      out[hat + i] += 0.25 * rand() * Math.exp(-i / 120)
    }
  }
  const noise = opts.noise ?? 0.02
  for (let i = 0; i < out.length; i++) out[i] += noise * rand()
  return out
}

for (const bpm of [78, 96, 110, 128, 140, 168]) {
  test(`detects ${bpm} BPM`, () => {
    const result = detectBpm(makeTrack(bpm, 60))
    assert.ok(result)
    const err = Math.min(Math.abs(result.bpm - bpm), Math.abs(result.bpm - bpm * 2), Math.abs(result.bpm - bpm / 2))
    assert.ok(err < 1.5, `got ${result.bpm} for ${bpm}`)
    // Folded answers are allowed only when the true tempo lies outside 70-180.
    if (bpm >= 70 && bpm <= 180) assert.ok(Math.abs(result.bpm - bpm) < 1.5, `octave error: ${result.bpm} vs ${bpm}`)
  })
}

test('returns null for silence and too-short audio', () => {
  assert.equal(detectBpm(new Float32Array(BPM_DETECT_SAMPLE_RATE * 30)), null)
  assert.equal(detectBpm(new Float32Array(BPM_DETECT_SAMPLE_RATE * 2)), null)
})
