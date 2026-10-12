// The pitch-shifting stage used for steady-pitch speed changes and the [ ] semitone keys.
//
// Every engine is an AudioWorklet that takes a stereo signal and shifts its pitch by the `ratio` parameter
// (1 = unchanged, 2 = one octave up), at the same speed. To add another one (for example a Rubber Band
// WebAssembly build):
//   1. put its worklet file in src/renderer/public/ and make it register a processor with a `ratio` AudioParam,
//   2. add an entry below,
//   3. make it the default, or set localStorage 'astra.pitchEngine.v1' to its id to try it.
export type PitchEngineId = 'wsola' | 'rubberband' | 'simple'

export interface PitchEngineDefinition {
  id: PitchEngineId
  label: string
  moduleUrl: string
  processorName: string
  /** 'worklet' engines are plain AudioWorklets with a `ratio` parameter. 'rubberband' needs the rubberband-web package (see rubberbandEngine.ts). */
  kind: 'worklet' | 'rubberband'
}

export const PITCH_ENGINES: Record<PitchEngineId, PitchEngineDefinition> = {
  wsola: {
    id: 'wsola',
    label: 'Smooth (WSOLA)',
    moduleUrl: './pitch-wsola-worklet.js',
    processorName: 'pitch-wsola-processor',
    kind: 'worklet'
  },
  rubberband: {
    id: 'rubberband',
    label: 'Rubber Band (best quality)',
    moduleUrl: './rubberband-processor.js',
    processorName: '',
    kind: 'rubberband'
  },
  simple: {
    id: 'simple',
    label: 'Simple (lowest delay)',
    moduleUrl: './pitch-correct-worklet.js',
    processorName: 'pitch-correct-processor',
    kind: 'worklet'
  }
}

/** The order the quality button cycles through. */
export const PITCH_ENGINE_ORDER: readonly PitchEngineId[] = ['wsola', 'rubberband', 'simple']

export const DEFAULT_PITCH_ENGINE_ID: PitchEngineId = 'wsola'
export const PITCH_ENGINE_STORAGE_KEY = 'astra.pitchEngine.v1'

export function resolvePitchEngineId(value: unknown): PitchEngineId {
  return typeof value === 'string' && value in PITCH_ENGINES ? (value as PitchEngineId) : DEFAULT_PITCH_ENGINE_ID
}

export function readStoredPitchEngineId(): PitchEngineId {
  try {
    return resolvePitchEngineId(localStorage.getItem(PITCH_ENGINE_STORAGE_KEY))
  } catch {
    return DEFAULT_PITCH_ENGINE_ID
  }
}
