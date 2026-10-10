import type { LyricsLookupResult } from '../../types/lyrics'
import type { LyricsBulkState } from '../../types/lyricsBulk'

export interface BulkTrack {
  path: string
  title: string
  artist: string
  album?: string
  durationSeconds?: number
}

export interface LyricsBulkRunnerOptions {
  lookup: (track: BulkTrack) => Promise<LyricsLookupResult>
  minGapMs: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  onState?: (state: LyricsBulkState) => void
  /** Called after a lyric was newly fetched from the network. */
  onFetched?: (track: BulkTrack, result: Extract<LyricsLookupResult, { status: 'hit' }>) => Promise<void> | void
  rateLimitWaitMs?: number
  maxRateLimitPauses?: number
}

// Answers faster than this never touched the network (cache, embedded, sidecar), so no pause is needed.
const FAST_RESULT_MS = 150
const SLICE_MS = 250

function emptyState(): LyricsBulkState {
  return {
    status: 'idle',
    total: 0,
    done: 0,
    found: 0,
    notFound: 0,
    alreadyHad: 0,
    failed: 0,
    waitingUntil: null,
    message: null,
    current: null
  }
}

export class LyricsBulkRunner {
  private state: LyricsBulkState = emptyState()
  private paused = false
  private cancelled = false
  private running = false
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly rateLimitWaitMs: number
  private readonly maxRateLimitPauses: number

  private readonly options: LyricsBulkRunnerOptions

  constructor(options: LyricsBulkRunnerOptions) {
    this.options = options
    this.now = options.now ?? (() => Date.now())
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.rateLimitWaitMs = options.rateLimitWaitMs ?? 60_000
    this.maxRateLimitPauses = options.maxRateLimitPauses ?? 3
  }

  setMinGap(ms: number): void {
    this.options.minGapMs = ms
  }

  getState(): LyricsBulkState {
    return { ...this.state }
  }

  isActive(): boolean {
    return this.running
  }

  pause(): void {
    if (!this.running || this.paused) return
    this.paused = true
    this.set({ status: 'paused', waitingUntil: null, message: 'Paused' })
  }

  resume(): void {
    if (!this.running || !this.paused) return
    this.paused = false
    this.set({ status: 'running', message: null })
  }

  cancel(): void {
    if (!this.running) return
    this.cancelled = true
    this.paused = false
  }

  async run(tracks: BulkTrack[]): Promise<LyricsBulkState> {
    if (this.running) return this.getState()
    this.running = true
    this.paused = false
    this.cancelled = false
    this.state = { ...emptyState(), status: 'running', total: tracks.length }
    this.emit()

    let consecutivePauses = 0
    let index = 0
    try {
      while (index < tracks.length) {
        if (!(await this.holdWhilePaused())) break
        const track = tracks[index]
        this.set({ current: `${track.artist} – ${track.title}` })

        const startedAt = this.now()
        let result: LyricsLookupResult
        try {
          result = await this.options.lookup(track)
        } catch {
          result = { status: 'transient_error', message: 'lookup failed' }
        }
        const elapsed = this.now() - startedAt

        const unavailable =
          result.status === 'transient_error'
          || (result.status === 'not_found' && result.reason === 'provider-unavailable')
        if (unavailable) {
          consecutivePauses += 1
          if (consecutivePauses > this.maxRateLimitPauses) {
            this.state = {
              ...this.state,
              status: 'stopped',
              waitingUntil: null,
              current: null,
              message: 'The lyrics services are busy or limiting requests. Try again later: your progress is saved.'
            }
            this.emit()
            return this.getState()
          }
          const waitMs = this.rateLimitWaitMs * 2 ** (consecutivePauses - 1)
          this.set({
            status: 'waiting',
            waitingUntil: this.now() + waitMs,
            message: 'The lyrics service is busy or limiting requests. Waiting, then trying again…'
          })
          const completed = await this.waitInterruptible(waitMs)
          if (!completed) break
          this.set({ status: this.paused ? 'paused' : 'running', waitingUntil: null, message: null })
          continue // same track again
        }

        consecutivePauses = 0
        if (result.status === 'hit') {
          if (result.cached || elapsed < FAST_RESULT_MS) {
            this.state.alreadyHad += 1
          } else {
            this.state.found += 1
            try {
              await this.options.onFetched?.(track, result)
            } catch {
              // a failed sidecar save must not stop the run
            }
          }
        } else {
          this.state.notFound += 1
        }
        this.state.done += 1
        index += 1
        this.emit()

        if (elapsed >= FAST_RESULT_MS && index < tracks.length) {
          if (!(await this.waitInterruptible(this.options.minGapMs))) break
        }
      }
    } finally {
      this.running = false
    }

    if (this.cancelled) {
      this.state = { ...this.state, status: 'cancelled', waitingUntil: null, current: null, message: 'Stopped. Progress is saved.' }
    } else if (this.state.status !== 'stopped') {
      this.state = { ...this.state, status: 'done', waitingUntil: null, current: null, message: null }
    }
    this.emit()
    return this.getState()
  }

  private async holdWhilePaused(): Promise<boolean> {
    while (this.paused && !this.cancelled) await this.sleep(SLICE_MS)
    return !this.cancelled
  }

  /** Sleeps in slices so pause/cancel react quickly. Returns false when cancelled. */
  private async waitInterruptible(ms: number): Promise<boolean> {
    let left = ms
    while (left > 0) {
      if (this.cancelled) return false
      if (this.paused) {
        if (!(await this.holdWhilePaused())) return false
        continue
      }
      const slice = Math.min(SLICE_MS, left)
      await this.sleep(slice)
      left -= slice
    }
    return !this.cancelled
  }

  private set(patch: Partial<LyricsBulkState>): void {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  private emit(): void {
    this.options.onState?.(this.getState())
  }
}
