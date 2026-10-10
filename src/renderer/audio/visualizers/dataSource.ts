import { audioEngine } from '../AudioEngine'
import { isPlaybackAnalyzerActive } from '../visualizerSilence'
import { resolveSessionChange, type SessionChangeAction } from './sessionChange'

// Session-level signals shared by every visualizer's data source.
// In Astra these are driven by the playback AudioEngine (Prism drove them from a
// system-audio capture router); the scope classes only need sample rate, a
// "should the loop run" flag, and a reset signal on track/state changes.
export interface VisualizerSessionSource {
  getSampleRate: () => number
  isPlaying: () => boolean
  /** True while playback is paused: scopes hold their last picture instead of fading or clearing. */
  isPaused?: () => boolean
  /**
   * `listener` gets no argument or 'reset' to clear the display, or 'track' when a new song started
   * and the history should stay (only sent to views that ask to keep history across tracks).
   */
  subscribeToSessionChanges: (
    listener: (action?: Exclude<SessionChangeAction, 'hold'>) => void,
    options?: { keepAcrossTracks?: () => boolean; onWake?: () => void }
  ) => () => void
}

export const defaultVisualizerSessionSource: VisualizerSessionSource = {
  getSampleRate: () => audioEngine.getSampleRate(),
  // Keep the scopes "alive" while paused (analyzer active = playing OR paused) so they
  // hold their last frame instead of blanking; they only reset/blank once stopped.
  isPlaying: () => isPlaybackAnalyzerActive(audioEngine.playbackState),
  isPaused: () => audioEngine.playbackState === 'paused',
  subscribeToSessionChanges: (listener, options) => {
    let previousState: string = audioEngine.playbackState
    const keep = (): boolean => options?.keepAcrossTracks?.() ?? false
    const deliver = (action: SessionChangeAction): void => {
      if (action === 'hold') return
      listener(action)
    }
    // Views that keep their history get no reset on 'hold', but their frame loop may have gone to
    // sleep while playback was stopped or loading (a seek can do that). Wake it on every change.
    const wake = (): void => options?.onWake?.()
    const offTrackChange = audioEngine.onTrackChange(() => {
      deliver(resolveSessionChange({ event: 'track' }, keep()))
      wake()
    })
    const offStateChange = audioEngine.on('stateChange', () => {
      const next: string = audioEngine.playbackState
      const action = resolveSessionChange({ event: 'state', previous: previousState, next }, keep())
      previousState = next
      deliver(action)
      wake()
    })
    return () => {
      offTrackChange?.()
      offStateChange?.()
    }
  },
}
