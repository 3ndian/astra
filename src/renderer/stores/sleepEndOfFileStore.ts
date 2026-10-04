import { create } from 'zustand'
import { shouldFire, startEndOfTrack, type SleepTimerState } from '../../shared/sleepTimer'
import { audioEngine } from '../audio/AudioEngine'
import { usePlayerStore } from './playerStore'

// "Pause at the end of this file" for audiobooks. The minutes-based sleep timer is the
// app's existing sleepTimerStore; this only adds the end-of-file variant.

interface SleepEndOfFileStore {
  armed: SleepTimerState
  arm: () => void
  cancel: () => void
}

export const useSleepEndOfFileStore = create<SleepEndOfFileStore>((set) => ({
  armed: null,
  arm: () => set({ armed: startEndOfTrack(usePlayerStore.getState().currentTrack?.path ?? null) }),
  cancel: () => set({ armed: null })
}))

/** Pauses playback when the armed file ends. Call once from App. */
export function startSleepEndOfFileWatcher(): () => void {
  const id = window.setInterval(() => {
    const { armed } = useSleepEndOfFileStore.getState()
    if (!armed) return
    const player = usePlayerStore.getState()
    const fire = shouldFire(armed, Date.now(), {
      path: player.currentTrack?.path ?? null,
      currentTime: Number.isFinite(audioEngine.currentTime) ? audioEngine.currentTime : player.currentTime,
      duration: player.duration
    })
    if (!fire) return
    if (player.playbackState === 'playing') player.pause()
    useSleepEndOfFileStore.setState({ armed: null })
  }, 500)
  return () => window.clearInterval(id)
}
