// Turns "solo (or cut) this band of frequencies" into a list of biquad filter stages.
// Pure, so the Web Audio path and the native exclusive-output path build the same sound,
// and so it can be tested without any audio.

export type FrequencyFilterMode = 'solo' | 'cut'

export interface FrequencyFilterRange {
  lowHz: number
  highHz: number
  mode: FrequencyFilterMode
}

export interface FilterStage {
  type: 'highpass' | 'lowpass' | 'peaking'
  frequency: number
  Q: number
  /** dB. Only used by 'peaking'. */
  gain: number
}

export const FILTER_MIN_HZ = 20
/** Narrowest selection allowed: about a sixth of an octave. */
export const FILTER_MIN_RATIO = 1.12

// Q values that make two cascaded biquads a 4th-order Butterworth (24 dB per octave, flat passband).
const BUTTERWORTH_4_Q = [0.5412, 1.3066] as const

export interface CutPlanOptions {
  /** Overlapping bells spread across the band. */
  centers: number
  /** Copies of each bell stacked on top of each other (the native engine caps one at 12 dB). */
  stacks: number
  /** Gain of each copy in dB (negative). */
  gainDb: number
}

/** For the native engine, which can only run filters one after another. It clamps band gain to +/-12 dB, so each centre is stacked three times (about -36 dB). */
export const NATIVE_CUT_PLAN: CutPlanOptions = { centers: 2, stacks: 3, gainDb: -12 }

function maxFilterHz(sampleRate: number): number {
  return Math.max(FILTER_MIN_HZ * FILTER_MIN_RATIO, sampleRate * 0.45)
}

/** Puts the edges in order, inside the audible range for this sample rate, and not thinner than the minimum. */
export function clampFilterRange(range: FrequencyFilterRange, sampleRate: number): FrequencyFilterRange {
  const top = maxFilterHz(sampleRate)
  let low = Number.isFinite(range.lowHz) ? range.lowHz : FILTER_MIN_HZ
  let high = Number.isFinite(range.highHz) ? range.highHz : top
  if (low > high) [low, high] = [high, low]
  low = Math.min(Math.max(low, FILTER_MIN_HZ), top / FILTER_MIN_RATIO)
  high = Math.min(Math.max(high, low * FILTER_MIN_RATIO), top)
  if (high < low * FILTER_MIN_RATIO) low = high / FILTER_MIN_RATIO
  return { lowHz: low, highHz: high, mode: range.mode === 'cut' ? 'cut' : 'solo' }
}

/** Keep only the band: two high-pass stages at the low edge, two low-pass stages at the high edge. */
export function planSolo(range: FrequencyFilterRange, sampleRate: number): FilterStage[] {
  const { lowHz, highHz } = clampFilterRange(range, sampleRate)
  return [
    ...BUTTERWORTH_4_Q.map((Q): FilterStage => ({ type: 'highpass', frequency: lowHz, Q, gain: 0 })),
    ...BUTTERWORTH_4_Q.map((Q): FilterStage => ({ type: 'lowpass', frequency: highHz, Q, gain: 0 }))
  ]
}

/**
 * Remove the band with stacked bells (soft edges, about -36 dB). Only for the native engine, which can run
 * filters one after another but not side by side. Everywhere else uses planCutBranches.
 */
export function planCut(range: FrequencyFilterRange, sampleRate: number, options: CutPlanOptions = NATIVE_CUT_PLAN): FilterStage[] {
  const { lowHz, highHz } = clampFilterRange(range, sampleRate)
  const centers = Math.max(1, Math.floor(options.centers))
  const stacks = Math.max(1, Math.floor(options.stacks))
  const step = Math.pow(highHz / lowHz, 1 / centers)
  // Each bell is a little wider than its slice so neighbours overlap and the dip stays level.
  const bandwidthOctaves = Math.log2(step) * 1.3
  const Q = Math.min(18, Math.max(0.3, 1 / (2 * Math.sinh((Math.LN2 / 2) * bandwidthOctaves))))
  const stages: FilterStage[] = []
  for (let i = 0; i < centers; i += 1) {
    const frequency = lowHz * Math.pow(step, i + 0.5)
    for (let s = 0; s < stacks; s += 1) {
      stages.push({ type: 'peaking', frequency, Q, gain: options.gainDb })
    }
  }
  return stages
}

/**
 * Remove the band with two filters side by side whose outputs are added: everything below the band
 * (low-pass at the low edge) plus everything above it (high-pass at the high edge). Steep, clean edges.
 */
export function planCutBranches(range: FrequencyFilterRange, sampleRate: number): { below: FilterStage[]; above: FilterStage[] } {
  const { lowHz, highHz } = clampFilterRange(range, sampleRate)
  const q = Math.SQRT1_2
  return {
    below: [0, 1].map((): FilterStage => ({ type: 'lowpass', frequency: lowHz, Q: q, gain: 0 })),
    above: [0, 1].map((): FilterStage => ({ type: 'highpass', frequency: highHz, Q: q, gain: 0 }))
  }
}

/** Stages for the native engine, which runs everything in one line. */
export function planFrequencyFilter(range: FrequencyFilterRange, sampleRate: number, cutPlan: CutPlanOptions = NATIVE_CUT_PLAN): FilterStage[] {
  return range.mode === 'cut' ? planCut(range, sampleRate, cutPlan) : planSolo(range, sampleRate)
}

export function formatHz(hz: number): string {
  if (hz >= 1000) {
    const k = hz / 1000
    return `${k >= 10 ? k.toFixed(1) : k.toFixed(2).replace(/0$/, '')} kHz`.replace('.0 ', ' ')
  }
  return `${Math.round(hz)} Hz`
}
