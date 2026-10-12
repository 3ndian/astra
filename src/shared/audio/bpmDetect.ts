// Tempo (BPM) detection from raw mono audio. Pure and dependency free so it can run
// in the main process and be tested with synthetic audio.
//
// Method: build an onset-strength envelope (how suddenly the low and high parts of the
// sound get louder), autocorrelate it to find the repeat period, nudge the answer toward
// common dance/pop tempos, and fold half/double answers into 70-180 BPM.

export interface BpmDetectionResult {
  bpm: number
  /** 0-1: how much stronger the winning tempo is than the average repeat. Low means a guess. */
  confidence: number
}

export const BPM_DETECT_SAMPLE_RATE = 11025
const HOP = 128
const WINDOW = 256
const MIN_BPM = 60
const MAX_BPM = 200
const FOLD_MIN = 70
const FOLD_MAX = 180
const PRIOR_CENTER_BPM = 110
const PRIOR_SIGMA_OCTAVES = 1.1

function onsetEnvelope(samples: Float32Array, sampleRate: number): { env: Float32Array; fps: number } {
  // One-pole low pass (~180 Hz) separates kick/bass from the rest.
  const lowCoef = 1 - Math.exp((-2 * Math.PI * 180) / sampleRate)
  const frames = Math.max(0, Math.floor((samples.length - WINDOW) / HOP))
  const lowE = new Float32Array(frames)
  const highE = new Float32Array(frames)
  let low = 0
  let prev = 0
  // Pre-split once so frame windows can just sum squares.
  const lowSig = new Float32Array(samples.length)
  const highSig = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]
    low += lowCoef * (x - low)
    lowSig[i] = low
    // First difference of the remainder acts as a crude high pass.
    const rest = x - low
    highSig[i] = rest - prev
    prev = rest
  }
  for (let f = 0; f < frames; f++) {
    const start = f * HOP
    let l = 0
    let h = 0
    for (let i = start; i < start + WINDOW; i++) {
      l += lowSig[i] * lowSig[i]
      h += highSig[i] * highSig[i]
    }
    lowE[f] = Math.log1p(1000 * Math.sqrt(l / WINDOW))
    highE[f] = Math.log1p(1000 * Math.sqrt(h / WINDOW))
  }
  const env = new Float32Array(frames)
  for (let f = 1; f < frames; f++) {
    env[f] = 2 * Math.max(0, lowE[f] - lowE[f - 1]) + Math.max(0, highE[f] - highE[f - 1])
  }
  // Remove the slow average so loud sections do not dominate.
  const radius = 43 // about half a second each side
  const out = new Float32Array(frames)
  let running = 0
  const prefix = new Float64Array(frames + 1)
  for (let f = 0; f < frames; f++) { running += env[f]; prefix[f + 1] = running }
  for (let f = 0; f < frames; f++) {
    const a = Math.max(0, f - radius)
    const b = Math.min(frames, f + radius + 1)
    const mean = (prefix[b] - prefix[a]) / (b - a)
    out[f] = Math.max(0, env[f] - mean)
  }
  return { env: out, fps: sampleRate / HOP }
}

export function detectBpm(samples: Float32Array, sampleRate: number = BPM_DETECT_SAMPLE_RATE): BpmDetectionResult | null {
  if (samples.length < sampleRate * 8) return null
  const { env, fps } = onsetEnvelope(samples, sampleRate)
  if (env.length < fps * 6) return null

  const minLag = Math.floor((fps * 60) / MAX_BPM)
  const maxLag = Math.ceil((fps * 60) / MIN_BPM)
  const n = env.length
  const acMax = maxLag * 2 + 2
  const ac = new Float64Array(acMax + 1)
  let energy = 0
  for (let i = 0; i < n; i++) energy += env[i] * env[i]
  if (energy <= 1e-9) return null
  for (let lag = minLag - 1; lag <= acMax && lag < n; lag++) {
    let sum = 0
    for (let i = 0; i + lag < n; i++) sum += env[i] * env[i + lag]
    // Normalise by overlap so long lags are not punished for having less data.
    ac[lag] = sum / (n - lag)
  }

  let bestLag = -1
  let bestScore = -Infinity
  let scoreSum = 0
  let scoreCount = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (fps * 60) / lag
    // Reinforce with the double-length repeat (a bar or two later) for a steadier peak.
    const double = lag * 2 <= acMax ? ac[lag * 2] : 0
    const octaves = Math.log2(bpm / PRIOR_CENTER_BPM)
    const prior = Math.exp(-0.5 * (octaves / PRIOR_SIGMA_OCTAVES) ** 2)
    const score = (ac[lag] + 0.5 * double) * prior
    scoreSum += ac[lag]
    scoreCount += 1
    const isPeak = ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]
    if (isPeak && score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }
  if (bestLag < 0) return null

  // Parabolic interpolation for a sub-frame lag.
  const y0 = ac[bestLag - 1]
  const y1 = ac[bestLag]
  const y2 = ac[bestLag + 1]
  const denom = y0 - 2 * y1 + y2
  const shift = denom !== 0 ? 0.5 * (y0 - y2) / denom : 0
  const lag = bestLag + Math.max(-1, Math.min(1, shift))

  let bpm = (fps * 60) / lag
  while (bpm > FOLD_MAX) bpm /= 2
  while (bpm < FOLD_MIN) bpm *= 2
  const mean = scoreCount > 0 ? scoreSum / scoreCount : 0
  const confidence = mean > 0 ? Math.max(0, Math.min(1, (y1 / mean - 1) / 4)) : 0
  return { bpm: Math.round(bpm * 10) / 10, confidence }
}
