import { planCutBranches, planSolo, type FilterStage, type FrequencyFilterRange } from './plan'

// A small stateful biquad cascade for the visuals. It filters a copy of the samples the scopes draw,
// so a scope can show "what you hear" while the spectrogram keeps showing the whole song.
// Formulas are the usual RBJ cookbook ones (the same the native engine uses); Q is the plain linear Q.

interface Coefficients {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

export function biquadCoefficients(stage: FilterStage, sampleRate: number): Coefficients {
  const frequency = Math.min(Math.max(stage.frequency, 1), sampleRate * 0.49)
  const q = Math.min(Math.max(stage.Q, 0.1), 18)
  const w0 = (2 * Math.PI * frequency) / sampleRate
  const sine = Math.sin(w0)
  const cosine = Math.cos(w0)
  const alpha = sine / (2 * q)
  let b0 = 1
  let b1 = 0
  let b2 = 0
  let a0 = 1
  let a1 = 0
  let a2 = 0
  if (stage.type === 'highpass') {
    b0 = (1 + cosine) / 2
    b1 = -(1 + cosine)
    b2 = b0
    a0 = 1 + alpha
    a1 = -2 * cosine
    a2 = 1 - alpha
  } else if (stage.type === 'lowpass') {
    b0 = (1 - cosine) / 2
    b1 = 1 - cosine
    b2 = b0
    a0 = 1 + alpha
    a1 = -2 * cosine
    a2 = 1 - alpha
  } else {
    const a = Math.pow(10, stage.gain / 40)
    b0 = 1 + alpha * a
    b1 = -2 * cosine
    b2 = 1 - alpha * a
    a0 = 1 + alpha / a
    a1 = -2 * cosine
    a2 = 1 - alpha / a
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

export class BiquadCascade {
  private coefficients: Coefficients[] = []
  private types: string[] = []
  private z1: Float64Array = new Float64Array(0)
  private z2: Float64Array = new Float64Array(0)

  /** Set the stages. The running state is kept when only the numbers change, so dragging the band does not click. */
  configure(stages: readonly FilterStage[], sampleRate: number): void {
    const types = stages.map((stage) => stage.type)
    const sameShape = types.length === this.types.length && types.every((type, index) => type === this.types[index])
    this.coefficients = stages.map((stage) => biquadCoefficients(stage, sampleRate))
    this.types = types
    if (!sameShape) {
      this.z1 = new Float64Array(stages.length)
      this.z2 = new Float64Array(stages.length)
    }
  }

  reset(): void {
    this.z1.fill(0)
    this.z2.fill(0)
  }

  /** Returns a new array; the input is shared with other visuals and is never changed. */
  process(input: Float32Array): Float32Array {
    const output = new Float32Array(input.length)
    const count = this.coefficients.length
    for (let n = 0; n < input.length; n += 1) {
      let sample = input[n]
      for (let s = 0; s < count; s += 1) {
        const c = this.coefficients[s]
        const result = c.b0 * sample + this.z1[s]
        this.z1[s] = c.b1 * sample - c.a1 * result + this.z2[s]
        this.z2[s] = c.b2 * sample - c.a2 * result
        sample = result
      }
      output[n] = sample
    }
    return output
  }
}

/** The whole band filter for one channel: Solo is one line of stages, Cut is two lines whose outputs are added. */
export class BandFilter {
  private main = new BiquadCascade()
  private second = new BiquadCascade()
  private cutting = false
  private key = ''

  /** Does nothing if the band and sample rate are unchanged. */
  configure(range: FrequencyFilterRange, sampleRate: number): void {
    const key = `${range.mode}|${range.lowHz}|${range.highHz}|${sampleRate}`
    if (key === this.key) return
    if ((range.mode === 'cut') !== this.cutting) {
      this.main = new BiquadCascade()
      this.second = new BiquadCascade()
    }
    this.key = key
    this.cutting = range.mode === 'cut'
    if (this.cutting) {
      const branches = planCutBranches(range, sampleRate)
      this.main.configure(branches.below, sampleRate)
      this.second.configure(branches.above, sampleRate)
    } else {
      this.main.configure(planSolo(range, sampleRate), sampleRate)
    }
  }

  process(input: Float32Array): Float32Array {
    const first = this.main.process(input)
    if (!this.cutting) return first
    const other = this.second.process(input)
    for (let i = 0; i < first.length; i += 1) first[i] += other[i]
    return first
  }
}
