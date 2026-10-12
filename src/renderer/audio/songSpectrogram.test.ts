import assert from 'node:assert/strict'
import test from 'node:test'
import { createSongSpectrogramJob } from './songSpectrogram.ts'
import { frequencyAtNormalizedPosition } from '../../types/frequencyScale.ts'

function run(mono: Float32Array, sr: number) {
  const job = createSongSpectrogramJob(mono, sr, {
    fftSize: 4096, columnsPerSecond: 20, rows: 256, minHz: 20, maxHz: 20000, scaleMode: 'log', tiltDbPerOctave: 0
  })
  while (!job.step(1000)) { /* keep going */ }
  return job.result()
}

test('a 1 kHz tone lights the row for 1 kHz, only while it plays', () => {
  const sr = 44100
  const mono = new Float32Array(sr * 6)
  for (let i = sr * 2; i < sr * 4; i++) mono[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / sr)
  const s = run(mono, sr)
  assert.equal(s.columns, 120)
  const peakRow = (col: number) => {
    let best = 0
    for (let r = 1; r < s.rows; r++) if (s.data[col * s.rows + r] > s.data[col * s.rows + best]) best = r
    return best
  }
  const hz = frequencyAtNormalizedPosition((peakRow(60) + 0.5) / s.rows, 20, 20000, 'log')
  assert.ok(Math.abs(hz - 1000) < 60, `peak at ${hz} Hz`)
  const loud = s.data[60 * s.rows + peakRow(60)]
  const quiet = s.data[10 * s.rows + peakRow(60)]
  assert.ok(loud > 150 && quiet < 20, `loud ${loud} quiet ${quiet}`)
})
