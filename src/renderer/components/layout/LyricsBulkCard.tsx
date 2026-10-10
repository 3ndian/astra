import { useEffect, useState } from 'react'
import { useLyricsBulkStore } from '../../stores/lyricsBulkStore'

const RADIUS = 20
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function formatWait(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`
}

export default function LyricsBulkCard() {
  const state = useLyricsBulkStore((s) => s.state)
  const dismissed = useLyricsBulkStore((s) => s.dismissed)
  const dismiss = useLyricsBulkStore((s) => s.dismiss)
  const init = useLyricsBulkStore((s) => s.init)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => init(), [init])
  useEffect(() => {
    if (state?.status !== 'waiting') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [state?.status])

  if (!state || state.status === 'idle' || dismissed) return null

  const finished = state.status === 'done' || state.status === 'cancelled' || state.status === 'stopped'
  const active = !finished
  const fraction = state.total > 0 ? Math.min(1, state.done / state.total) : 0
  const api = window.electronAPI.lyricsBulk
  const waitLeft = state.status === 'waiting' && state.waitingUntil ? state.waitingUntil - now : null

  let title = 'Getting lyrics'
  if (state.status === 'paused') title = 'Lyrics paused'
  if (state.status === 'waiting') title = 'Lyrics service is busy'
  if (state.status === 'done') title = 'Lyrics finished'
  if (state.status === 'cancelled') title = 'Lyrics stopped'
  if (state.status === 'stopped') title = 'Try again later'

  return (
    <div className={`lyrics-bulk-card ${state.status === 'waiting' || state.status === 'stopped' ? 'is-warning' : ''}`} role="status">
      <svg className="lyrics-bulk-ring" width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r={RADIUS} className="lyrics-bulk-ring-track" />
        <circle
          cx="26"
          cy="26"
          r={RADIUS}
          className="lyrics-bulk-ring-fill"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          transform="rotate(-90 26 26)"
        />
        <text x="26" y="30" textAnchor="middle" className="lyrics-bulk-ring-text">
          {Math.round(fraction * 100)}%
        </text>
      </svg>
      <div className="lyrics-bulk-body">
        <div className="lyrics-bulk-title">{title}</div>
        <div className="lyrics-bulk-line">
          {state.done} of {state.total} songs
          {waitLeft !== null ? ` · retrying in ${formatWait(waitLeft)}` : ''}
        </div>
        {state.message && <div className="lyrics-bulk-note">{state.message}</div>}
        {active && !state.message && state.current && <div className="lyrics-bulk-current" title={state.current}>{state.current}</div>}
        <div className="lyrics-bulk-line lyrics-bulk-counts">
          {state.found} found · {state.alreadyHad} already had · {state.notFound} not found
        </div>
      </div>
      <div className="lyrics-bulk-actions">
        {active && state.status !== 'paused' && (
          <button type="button" onClick={() => void api.pause()}>Pause</button>
        )}
        {active && state.status === 'paused' && (
          <button type="button" onClick={() => void api.resume()}>Resume</button>
        )}
        {active && <button type="button" onClick={() => void api.cancel()}>Cancel</button>}
        {finished && <button type="button" onClick={dismiss}>Close</button>}
      </div>
    </div>
  )
}
