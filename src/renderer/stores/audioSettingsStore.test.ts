import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { audioEngine } from '../audio/AudioEngine.ts'
import { PLAYBACK_FADE_ENABLED_STORAGE_KEY } from '../constants/settingsStorageKeys.ts'
import { useAudioSettingsStore } from './audioSettingsStore.ts'

function prepareSettings(t: TestContext) {
  const values = new Map<string, string>()
  const initialState = useAudioSettingsStore.getState()
  const initialFade = audioEngine.playbackFadeEnabled
  const globals = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    navigator: { mediaDevices: { enumerateDevices: async () => [], addEventListener() {} } },
    window: { electronAPI: {
      getReplayGainScanEnabled: async () => false,
      setReplayGainScanEnabled: async () => undefined,
    } },
  }
  for (const [key, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, value })
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original)
      else Reflect.deleteProperty(globalThis, key)
    })
  }
  for (const method of [
    'setOutputDevice', 'setMultichannelEnabled', 'setIncludeLfeInDownmix',
    'setStereoUpmixMode', 'setSpatialMode', 'setVirtualSpeakers', 'setHrtfProfile',
    'setSourceSpeakerRoutingMap', 'setAnalysisDelayMs', 'ensureContextReady',
    'setExclusiveSampleRate', 'setExclusiveLimiterEnabled', 'setSpeakerOutputConfiguration',
  ] as const) {
    t.mock.method(audioEngine, method, async () => undefined)
  }
  t.mock.method(audioEngine, 'setPlaybackOutputMode', async () => ({
    activeMode: 'standard', capabilities: initialState.nativeAudioCapabilities,
  }))
  t.mock.method(initialState, 'refreshDevices', async () => undefined)
  t.mock.method(initialState, 'refreshHrtfProfiles', async () => undefined)
  t.after(() => {
    useAudioSettingsStore.setState(initialState, true)
    audioEngine.playbackFadeEnabled = initialFade
  })
  return values
}

test('playback fade preference defaults on, persists changes, and hydrates the engine', async (t) => {
  const values = prepareSettings(t)
  await useAudioSettingsStore.getState().initFromSaved()
  assert.equal(useAudioSettingsStore.getState().playbackFadeEnabled, true)
  assert.equal(audioEngine.playbackFadeEnabled, true)

  useAudioSettingsStore.getState().setPlaybackFadeEnabled(false)
  assert.equal(values.get(PLAYBACK_FADE_ENABLED_STORAGE_KEY), '0')
  assert.equal(audioEngine.playbackFadeEnabled, false)
  audioEngine.playbackFadeEnabled = true
  useAudioSettingsStore.setState({ playbackFadeEnabled: true })
  await useAudioSettingsStore.getState().initFromSaved()
  assert.equal(useAudioSettingsStore.getState().playbackFadeEnabled, false)
  assert.equal(audioEngine.playbackFadeEnabled, false)

  useAudioSettingsStore.getState().setPlaybackFadeEnabled(true)
  assert.equal(values.get(PLAYBACK_FADE_ENABLED_STORAGE_KEY), '1')
  assert.equal(audioEngine.playbackFadeEnabled, true)
})

test('resetting audio settings restores enabled fades and removes the saved override', async (t) => {
  const values = prepareSettings(t)
  useAudioSettingsStore.getState().setPlaybackFadeEnabled(false)
  await useAudioSettingsStore.getState().resetToDefaults()
  assert.equal(useAudioSettingsStore.getState().playbackFadeEnabled, true)
  assert.equal(audioEngine.playbackFadeEnabled, true)
  assert.equal(values.has(PLAYBACK_FADE_ENABLED_STORAGE_KEY), false)
})
