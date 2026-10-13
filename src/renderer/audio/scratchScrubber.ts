/**
 * Plays short grains of the song under the pointer while it is dragged along the picture, so you hear the audio as you
 * scratch through it (backwards when you drag backwards, faster or slower with your speed). It is separate from the
 * normal playback, which is paused while you drag.
 */
export interface ScrubTarget {
  context: BaseAudioContext
  destination: AudioNode
  buffer: AudioBuffer
}

const GRAIN_SECONDS = 0.075
const FADE_IN_SECONDS = 0.012
const FADE_OUT_SECONDS = 0.03
const GRAIN_GAIN = 0.55
const MIN_SPEED = 0.08
const MAX_SPEED = 6

export class Scratcher {
  private lastTime: number | null = null
  private lastWall = 0
  private velocity = 0

  constructor(private readonly target: ScrubTarget) {}

  /** Call as the playhead moves to `time` (seconds into the song). */
  move(time: number): void {
    const now = performance.now() / 1000
    if (this.lastTime !== null) {
      const elapsed = Math.max(0.001, now - this.lastWall)
      const instant = (time - this.lastTime) / elapsed
      this.velocity = this.velocity * 0.5 + instant * 0.5
    } else {
      this.velocity = 0
    }
    this.lastTime = time
    this.lastWall = now
    // Holding still, or barely moving, is silent, like stopping a record with your hand.
    if (Math.abs(this.velocity) < MIN_SPEED) return
    this.grain(time, this.velocity)
  }

  private grain(time: number, velocity: number): void {
    const { context, destination, buffer } = this.target
    const rate = Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.abs(velocity)))
    const span = GRAIN_SECONDS * rate
    const duration = buffer.duration
    const forward = velocity > 0
    const source = context.createBufferSource()
    const gain = context.createGain()
    const when = context.currentTime
    let sourceBuffer = buffer
    let offset = Math.min(Math.max(0, time), Math.max(0, duration - 0.01))

    if (!forward) {
      // Backwards: a short reversed copy of [time - span, time].
      const sampleRate = buffer.sampleRate
      const end = Math.min(duration, Math.max(0, time))
      const start = Math.max(0, end - span)
      const frames = Math.max(1, Math.floor((end - start) * sampleRate))
      const startFrame = Math.floor(start * sampleRate)
      const slice = context.createBuffer(buffer.numberOfChannels, frames, sampleRate)
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const from = buffer.getChannelData(channel)
        const into = slice.getChannelData(channel)
        for (let i = 0; i < frames; i += 1) into[i] = from[startFrame + frames - 1 - i] ?? 0
      }
      sourceBuffer = slice
      offset = 0
    }

    source.buffer = sourceBuffer
    source.playbackRate.value = rate
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(GRAIN_GAIN, when + FADE_IN_SECONDS)
    gain.gain.setValueAtTime(GRAIN_GAIN, when + GRAIN_SECONDS - FADE_OUT_SECONDS)
    gain.gain.linearRampToValueAtTime(0, when + GRAIN_SECONDS)
    source.connect(gain)
    gain.connect(destination)
    source.onended = () => {
      try { source.disconnect(); gain.disconnect() } catch { /* already gone */ }
    }
    source.start(when, offset)
    source.stop(when + GRAIN_SECONDS + 0.02)
  }
}
