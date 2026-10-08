import { useEffect, useRef, useState } from 'react'
import { formatRemaining } from '../../../shared/sleepTimer'
import { audioEngine } from '../../audio/AudioEngine'
import { useSectionsStore } from '../../stores/sectionsStore'
import { usePlayerStore } from '../../stores/playerStore'
import {
  SLEEP_TIMER_MAX_MINUTES,
  SLEEP_TIMER_PRESET_MINUTES,
  useSleepTimerStore
} from '../../stores/sleepTimerStore'
import { useSleepEndOfFileStore } from '../../stores/sleepEndOfFileStore'
import { getActiveSection } from '../../../shared/sections/sections'
import AudiobookExtras from './AudiobookExtras'

export const SKIP_BACK_SECONDS = 10
export const SKIP_FORWARD_SECONDS = 30

export function skipBy(seconds: number): void {
  const state = usePlayerStore.getState()
  if (!state.currentTrack || state.playbackState === 'loading') return
  const now = Number.isFinite(audioEngine.currentTime) ? audioEngine.currentTime : state.currentTime
  const duration = state.duration > 0 ? state.duration : state.currentTrack.duration
  const max = duration > 0 ? Math.max(0, duration - 0.5) : Number.POSITIVE_INFINITY
  void state.seek(Math.min(max, Math.max(0, now + seconds)))
}

/** Skip buttons and the sleep timer; only shown while an Audiobook section is active. */
export default function AudiobookControls() {
  const isAudiobook = useSectionsStore((state) => {
    const registry = state.registry
    return registry ? getActiveSection(registry).kind === 'audiobook' : false
  })
  const hasTrack = usePlayerStore((state) => state.currentTrack !== null)
  const minutesActive = useSleepTimerStore((state) => state.isActive)
  const minutesRemainingMs = useSleepTimerStore((state) => state.remainingMs)
  const endOfFileArmed = useSleepEndOfFileStore((state) => state.armed !== null)
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  if (!isAudiobook) return null

  const timerRunning = minutesActive || endOfFileArmed
  const timerLabel = minutesActive
    ? formatRemaining(minutesRemainingMs)
    : endOfFileArmed
      ? 'End'
      : null

  const startMinutes = (minutes: number) => {
    useSleepEndOfFileStore.getState().cancel()
    useSleepTimerStore.getState().startTimer(minutes)
  }
  const startEndOfFile = () => {
    useSleepTimerStore.getState().cancelTimer()
    useSleepEndOfFileStore.getState().arm()
  }
  const extend = (minutes: number) => {
    const store = useSleepTimerStore.getState()
    const next = Math.min(SLEEP_TIMER_MAX_MINUTES, Math.ceil(store.remainingMs / 60_000) + minutes)
    store.replaceTimer(next)
  }
  const cancel = () => {
    useSleepTimerStore.getState().cancelTimer()
    useSleepEndOfFileStore.getState().cancel()
  }

  return (
    <div className="audiobook-controls" ref={rootRef}>
      <button
        type="button"
        className="control-btn audiobook-skip-btn"
        onClick={() => skipBy(-SKIP_BACK_SECONDS)}
        disabled={!hasTrack}
        aria-label={`Back ${SKIP_BACK_SECONDS} seconds`}
        title={`Back ${SKIP_BACK_SECONDS} seconds`}
      >
        <span aria-hidden="true">&#8634;{SKIP_BACK_SECONDS}</span>
      </button>
      <button
        type="button"
        className="control-btn audiobook-skip-btn"
        onClick={() => skipBy(SKIP_FORWARD_SECONDS)}
        disabled={!hasTrack}
        aria-label={`Forward ${SKIP_FORWARD_SECONDS} seconds`}
        title={`Forward ${SKIP_FORWARD_SECONDS} seconds`}
      >
        <span aria-hidden="true">{SKIP_FORWARD_SECONDS}&#8635;</span>
      </button>
      <AudiobookExtras />
      <button
        type="button"
        className={`control-btn audiobook-sleep-btn ${timerRunning ? 'active' : ''}`.trim()}
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="Sleep timer"
        aria-expanded={menuOpen}
        title={timerLabel ? `Sleep timer: ${timerLabel}` : 'Sleep timer'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
        {timerLabel && <span className="audiobook-sleep-label">{timerLabel}</span>}
      </button>
      {menuOpen && (
        <div className="audiobook-sleep-menu" role="menu">
          {SLEEP_TIMER_PRESET_MINUTES.map((minutes) => (
            <button key={minutes} type="button" role="menuitem" onClick={() => { startMinutes(minutes); setMenuOpen(false) }}>
              {minutes} minutes
            </button>
          ))}
          <button type="button" role="menuitem" onClick={() => { startEndOfFile(); setMenuOpen(false) }} disabled={!hasTrack}>
            End of this file
          </button>
          {minutesActive && (
            <button type="button" role="menuitem" onClick={() => extend(15)}>+ 15 minutes</button>
          )}
          {timerRunning && (
            <button type="button" role="menuitem" className="audiobook-sleep-off" onClick={() => { cancel(); setMenuOpen(false) }}>
              Turn off
            </button>
          )}
        </div>
      )}
    </div>
  )
}
