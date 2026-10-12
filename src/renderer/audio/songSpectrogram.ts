import { frequencyAtNormalizedPosition, type FrequencyScaleMode } from '../../types/frequencyScale'
import { normalizeHeatDb } from './visualizers/heatScale'

/**
 * A spectrogram of the whole song, computed once from the decoded audio so the view can pan anywhere in it.
 * Rows follow the same frequency mapping as the live spectrogram (and the band selector), so a shaded
 * band lines up with what is drawn.
 */
export interface SongSpectrogramOptions {
  fftSize: number
  columnsPerSecond: number
  rows: number
  minHz: number
  maxHz: number
  scaleMode: FrequencyScaleMode
  tiltDbPerOctave: number
}

export interface SongSpectrogram {
  columns: number
  rows: number
  columnsPerSecond: number
  durationSeconds: number
  /** Column-major heat values 0-255: index = column * rows + row. Row 0 is the lowest frequency. */
  data: Uint8Array
}

function buildFft(size: number): { transform: (re: Float64Array, im: Float64Array) => void } {
  const levels = Math.log2(size)
  if (!Number.isInteger(levels)) throw new Error('FFT size must be a power of two')
  const cos = new Float64Array(size / 2)
  const sin = new Float64Array(size / 2)
  for (let i = 0; i < size / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / size)
    sin[i] = Math.sin((2 * Math.PI * i) / size)
  }
  const reverse = new Uint32Array(size)
  for (let i = 0; i < size; i++) {
    let r = 0
    for (let b = 0; b < levels; b++) r = (r << 1) | ((i >>> b) & 1)
    reverse[i] = r
  }
  return {
    transform(re, im) {
      for (let i = 0; i < size; i++) {
        const j = reverse[i]
        if (j > i) {
          const tr = re[i]; re[i] = re[j]; re[j] = tr
          const ti = im[i]; im[i] = im[j]; im[j] = ti
        }
      }
      for (let half = 1; half < size; half <<= 1) {
        const step = size / (half * 2)
        for (let start = 0; start < size; start += half * 2) {
          for (let k = 0; k < half; k++) {
            const c = cos[k * step]
            const s = -sin[k * step]
            const a = start + k
            const b = a + half
            const tr = re[b] * c - im[b] * s
            const ti = re[b] * s + im[b] * c
            re[b] = re[a] - tr
            im[b] = im[a] - ti
            re[a] += tr
            im[a] += ti
          }
        }
      }
    }
  }
}

export interface SongSpectrogramJob {
  /** Does work for about budgetMs; returns true once the whole song is done. */
  step: (budgetMs: number) => boolean
  progress: () => number
  result: () => SongSpectrogram
}

export function createSongSpectrogramJob(
  mono: Float32Array,
  sampleRate: number,
  options: SongSpectrogramOptions
): SongSpectrogramJob {
  const size = options.fftSize
  const fft = buildFft(size)
  const duration = mono.length / sampleRate
  const columns = Math.max(1, Math.ceil(duration * options.columnsPerSecond))
  const rows = options.rows
  const data = new Uint8Array(columns * rows)
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  const window = new Float64Array(size)
  for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size)

  const nyquist = sampleRate / 2
  const maxHz = Math.min(options.maxHz, nyquist)
  const binScale = size / sampleRate
  // For each row: the range of FFT bins it covers, and the tilt to apply at its centre frequency.
  const binLo = new Float64Array(rows)
  const binHi = new Float64Array(rows)
  const tilt = new Float64Array(rows)
  for (let r = 0; r < rows; r++) {
    const lo = frequencyAtNormalizedPosition((r - 0.5) / rows, options.minHz, maxHz, options.scaleMode)
    const hi = frequencyAtNormalizedPosition((r + 1.5) / rows, options.minHz, maxHz, options.scaleMode)
    const mid = frequencyAtNormalizedPosition((r + 0.5) / rows, options.minHz, maxHz, options.scaleMode)
    binLo[r] = lo * binScale
    binHi[r] = hi * binScale
    tilt[r] = options.tiltDbPerOctave * Math.log2(Math.max(1, mid) / 1000)
  }
  const mag = new Float64Array(size / 2 + 1)
  const hop = sampleRate / options.columnsPerSecond
  let column = 0

  const computeColumn = (c: number): void => {
    const center = Math.round(c * hop)
    const start = center - size / 2
    for (let i = 0; i < size; i++) {
      const idx = start + i
      re[i] = idx >= 0 && idx < mono.length ? mono[idx] * window[i] : 0
      im[i] = 0
    }
    fft.transform(re, im)
    for (let k = 0; k <= size / 2; k++) mag[k] = Math.hypot(re[k], im[k])
    const base = c * rows
    for (let r = 0; r < rows; r++) {
      const lo = Math.max(0, binLo[r])
      const hi = Math.min(size / 2, binHi[r])
      let m: number
      if (hi - lo <= 1) {
        const pos = Math.min(size / 2, Math.max(0, (lo + hi) / 2))
        const i0 = Math.floor(pos)
        const i1 = Math.min(size / 2, i0 + 1)
        const f = pos - i0
        m = mag[i0] * (1 - f) + mag[i1] * f
      } else {
        m = 0
        for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) if (mag[k] > m) m = mag[k]
      }
      // A full-scale sine under a Hann window peaks at size/4, so this puts it at 0 dB.
      const db = 20 * Math.log10((m * 4) / size + 1e-9) + tilt[r]
      data[base + r] = Math.round(normalizeHeatDb(db) * 255)
    }
  }

  return {
    step(budgetMs) {
      const deadline = performance.now() + budgetMs
      while (column < columns) {
        computeColumn(column)
        column += 1
        if ((column & 7) === 0 && performance.now() > deadline) break
      }
      return column >= columns
    },
    progress: () => column / columns,
    result: () => ({ columns, rows, columnsPerSecond: options.columnsPerSecond, durationSeconds: duration, data })
  }
}

/** Average all channels into one, which is what the picture is drawn from. */
export function mixToMono(buffer: { numberOfChannels: number; length: number; getChannelData: (c: number) => Float32Array }): Float32Array {
  const count = buffer.numberOfChannels
  if (count === 1) return buffer.getChannelData(0)
  const out = new Float32Array(buffer.length)
  for (let c = 0; c < count; c++) {
    const channel = buffer.getChannelData(c)
    for (let i = 0; i < out.length; i++) out[i] += channel[i]
  }
  const gain = 1 / count
  for (let i = 0; i < out.length; i++) out[i] *= gain
  return out
}
