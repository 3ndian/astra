import assert from 'node:assert/strict'
import test from 'node:test'
import { AudioEngine } from './AudioEngine.ts'
import type { ParallaxTimelineState } from '../../types/parallax.ts'

type GainEvent = { kind: 'set' | 'ramp' | 'cancel'; value: number; time: number }

function preparedEngine(enabled = true) {
  const gain = {
    value: 1,
    events: [] as GainEvent[],
    cancelScheduledValues(time: number) {
      this.events.push({ kind: 'cancel', value: this.value, time })
    },
    setValueAtTime(value: number, time: number) {
      this.events.push({ kind: 'set', value, time })
      if (time <= context.currentTime) this.value = value
    },
    linearRampToValueAtTime(value: number, time: number) {
      this.events.push({ kind: 'ramp', value, time })
    },
  }
  class Source {
    buffer: AudioBuffer | null = null
    onended: (() => void) | null = null
    starts: Array<{ when: number; offset: number }> = []
    stops: Array<{ when: number; gain: number }> = []
    start(when: number, offset = 0) { this.starts.push({ when, offset }) }
    stop(when = 0) { this.stops.push({ when, gain: gain.value }) }
    connect() {}
    disconnect() {}
  }
  const sources: Source[] = []
  const context = {
    currentTime: 10,
    sampleRate: 48_000,
    state: 'running',
    createBufferSource() {
      const source = new Source()
      sources.push(source)
      return source
    },
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
  }
  const buffer = { duration: 180, length: 8_640_000, sampleRate: 48_000, numberOfChannels: 2 } as AudioBuffer
  const engine = new AudioEngine()
  const internals = engine as unknown as {
    sourceNode: Source | null
    nextSourceNode: Source | null
    nextBuffer: AudioBuffer | null
    testToneBuffer: AudioBuffer | null
    testToneSourceNode: Source | null
    _playbackState: string
    pauseTime: number
    startTime: number
    scheduledEndTime: number
    pauseFadeTimer: ReturnType<typeof setTimeout> | null
    parallaxSinkState: unknown
    parallaxSinkNode: unknown
    performGaplessTransition: () => void
    scheduleGaplessTransition: () => void
  }
  Object.assign(engine, {
    context,
    audioBuffer: buffer,
    fadeGainNode: { gain },
    initContext: async () => undefined,
    connectSourceWithRouting() {},
    connectSourceToAnalysisTap() {},
    disconnectSourceRouting() {},
    startTimeUpdate() {},
    stopTimeUpdate() {},
    getAdaptiveUpmixLatencySeconds: () => 0,
    getParallaxEndpointLatencySeconds: () => 0,
    assertParallaxScheduledLead() {},
  })
  engine.playbackFadeEnabled = enabled
  gain.events = []
  return { engine, internals, context, gain, sources, buffer }
}

function timeline(): ParallaxTimelineState {
  return {
    streamId: 'fade-test',
    startFrame: 48_000,
    startHostTimeMs: performance.timeOrigin + performance.now() + 1_000,
    playbackState: 'playing',
  } as ParallaxTimelineState
}

for (const enabled of [true, false]) {
  test(`play and pause use ${enabled ? '150 ms fades' : 'immediate transitions'}`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const { engine, internals, context, gain, sources } = preparedEngine(enabled)
    assert.equal(engine.playbackFadeEnabled, enabled)
    await engine.play()
    assert.deepEqual(sources[0].starts, [{ when: 0, offset: 0 }])
    assert.equal(internals._playbackState, 'playing')
    assert.deepEqual(gain.events.filter(event => event.kind === 'ramp'), enabled
      ? [{ kind: 'ramp', value: 1, time: 10.15 }] : [])
    if (!enabled) assert.equal(gain.value, 1)
    if (enabled) assert.deepEqual(gain.events, [
      { kind: 'cancel', value: 1, time: 10 },
      { kind: 'set', value: 0, time: 10 },
      { kind: 'ramp', value: 1, time: 10.15 },
    ])

    context.currentTime = 12
    gain.value = 1
    gain.events = []
    engine.pause()
    assert.equal(internals._playbackState, 'paused')
    assert.equal(internals.pauseTime, 2)
    assert.equal(sources[0].stops.length, enabled ? 0 : 1)
    assert.equal(internals.pauseFadeTimer !== null, enabled)
    assert.deepEqual(gain.events.filter(event => event.kind === 'ramp'), enabled
      ? [{ kind: 'ramp', value: 0, time: 12.15 }] : [])
    if (enabled) assert.deepEqual(gain.events, [
      { kind: 'cancel', value: 1, time: 12 },
      { kind: 'set', value: 1, time: 12 },
      { kind: 'ramp', value: 0, time: 12.15 },
    ])
    t.mock.timers.tick(170)
    assert.equal(sources[0].stops.length, 1)
    assert.equal(internals.sourceNode, null)
    assert.equal(internals.pauseFadeTimer, null)
  })

  test(`rapid pause/resume cannot leave a teardown behind (fades ${enabled})`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const { engine, internals, context, gain, sources } = preparedEngine(enabled)
    await engine.play()
    context.currentTime = 11
    gain.value = 1
    engine.pause()
    gain.value = enabled ? 0.4 : 1
    gain.events = []
    await engine.play()
    assert.equal(sources.length, enabled ? 1 : 2)
    assert.equal(internals.pauseFadeTimer, null)
    if (enabled) assert.deepEqual(gain.events[1], { kind: 'set', value: 0.4, time: 11 })
    t.mock.timers.tick(1_000)
    assert.equal(internals._playbackState, 'playing')
    assert.equal(sources.at(-1)?.stops.length, 0)
  })

  test(`Parallax host, sink, and trim tone restore gain at their scheduled onset (fades ${enabled})`, async () => {
    for (const path of ['host', 'sink', 'tone'] as const) {
      const { engine, internals, gain, sources, buffer } = preparedEngine(enabled)
      gain.value = 0
      let onset: number
      if (path === 'sink') {
        const messages: Array<{ startAtContextTime: number }> = []
        internals.parallaxSinkState = { streamId: 'fade-test' }
        internals.parallaxSinkNode = { port: { postMessage: (message: { startAtContextTime: number }) => messages.push(message) } }
        engine.applyParallaxTimeline(timeline(), { startAtContextTime: 11 })
        onset = messages[0].startAtContextTime
        assert.equal(onset, 11)
      } else {
        if (path === 'tone') {
          internals.testToneBuffer = buffer
          await engine.playTestToneOnParallaxTimeline(timeline())
        } else {
          await engine.playCurrentBufferOnParallaxTimeline(timeline())
        }
        onset = sources[0].starts[0].when
        assert.ok(onset > 10.5 && onset <= 11)
      }
      assert.deepEqual(gain.events.at(-1), {
        kind: enabled ? 'ramp' : 'set', value: 1, time: onset + (enabled ? 0.15 : 0),
      }, path)
      assert.equal(gain.value, 0, 'scheduled playback must not restore gain before onset')
      if (enabled) assert.deepEqual(gain.events, [
        { kind: 'cancel', value: 0, time: 10 },
        ...(path === 'host' ? [] : [{ kind: 'set', value: 0, time: 10 }]),
        { kind: 'set', value: 0, time: onset },
        { kind: 'ramp', value: 1, time: onset + 0.15 },
      ], `${path} must retain its original gain schedule`)
    }
  })

  test(`releasing a pending Parallax start honors fades ${enabled}`, async () => {
    const { engine, internals, gain, sources } = preparedEngine(enabled)
    await engine.play()
    internals.startTime = 15
    gain.events = []
    assert.equal(engine.releasePendingParallaxHostStartDelay(), true)
    assert.deepEqual(sources[1].starts, [{ when: 10, offset: 0 }])
    assert.deepEqual(gain.events.at(-1), {
      kind: enabled ? 'ramp' : 'set', value: 1, time: enabled ? 10.15 : 10,
    })
  })

  test(`natural gapless handoff and skip click suppression survive fades ${enabled}`, async () => {
    const { engine, internals, context, gain, buffer, sources } = preparedEngine(enabled)
    await engine.play()
    gain.value = 1
    gain.events = []
    internals.nextBuffer = buffer
    internals.scheduleGaplessTransition()
    assert.equal(internals.scheduledEndTime, 190)
    assert.deepEqual(sources[1].starts, [{ when: 190, offset: 0 }])
    context.currentTime = 190
    internals.performGaplessTransition()
    assert.equal(internals.sourceNode, sources[1])
    assert.equal(gain.events.length, 0, 'natural handoff must not fade')

    internals.nextBuffer = buffer
    assert.equal(engine.skipToPreBuffered(), true)
    assert.deepEqual(gain.events.filter(event => event.kind === 'ramp'), [
      { kind: 'ramp', value: 0, time: 190.012 },
      { kind: 'ramp', value: 1, time: 190.024 },
    ])
    assert.equal(sources[1].stops[0].when, 190.012)
  })

  test(`streaming resume and pause still bypass playback fades (toggle ${enabled})`, async () => {
    const { engine, internals, gain } = preparedEngine(enabled)
    const remoteState = { started: true, paused: true, playRequested: false }
    const messages: unknown[] = []
    Object.assign(engine, {
      remoteStreamState: remoteState,
      remoteStreamNode: { port: { postMessage: (message: unknown) => messages.push(message) } },
    })
    await engine.play()
    assert.equal(remoteState.paused, false)
    assert.equal(internals._playbackState, 'playing')
    engine.pause()
    assert.equal(remoteState.paused, true)
    assert.equal(internals._playbackState, 'paused')
    assert.equal(internals.pauseFadeTimer, null)
    assert.equal(gain.events.length, 0)
    assert.deepEqual(messages, [
      { type: 'set-playing', playing: true },
      { type: 'set-playing', playing: false },
    ])
  })
}

test('Parallax host and sink leave unity gain untouched on timeline updates', async () => {
  for (const path of ['host', 'sink'] as const) {
    const { engine, internals, gain } = preparedEngine()
    if (path === 'host') {
      await engine.playCurrentBufferOnParallaxTimeline(timeline())
    } else {
      internals.parallaxSinkState = { streamId: 'fade-test' }
      internals.parallaxSinkNode = { port: { postMessage() {} } }
      engine.applyParallaxTimeline(timeline(), { startAtContextTime: 11 })
    }
    assert.equal(gain.events.length, 0, `${path} must preserve its existing gain guard`)
  }
})

test('disabling a pause fade stops its source before restoring gain and cancels teardown', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { engine, internals, context, gain, sources } = preparedEngine()
  await engine.play()
  context.currentTime = 12
  engine.pause()
  gain.value = 0.4
  engine.playbackFadeEnabled = false
  assert.deepEqual(sources[0].stops, [{ when: 0, gain: 0.4 }])
  assert.equal(gain.value, 1)
  assert.equal(internals.pauseTime, 2)
  assert.equal(internals._playbackState, 'paused')
  assert.equal(internals.pauseFadeTimer, null)
  await engine.play()
  t.mock.timers.tick(1_000)
  assert.deepEqual(sources[1].starts, [{ when: 0, offset: 2 }])
  assert.equal(sources[1].stops.length, 0)
})

test('turning playback fades off during a manual skip preserves its click-suppression automation', async () => {
  const { engine, internals, gain, buffer } = preparedEngine()
  await engine.play()
  internals.nextBuffer = buffer
  assert.equal(engine.skipToPreBuffered(), true)
  const skipEvents = [...gain.events]
  engine.playbackFadeEnabled = false
  assert.deepEqual(gain.events, skipEvents)
})

test('disabling a fade-in restores unity without restart; enabling only affects later transitions', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { engine, gain, sources } = preparedEngine()
  await engine.play()
  gain.value = 0.4
  gain.events = []
  engine.playbackFadeEnabled = false
  assert.equal(gain.value, 1)
  assert.equal(gain.events[0].kind, 'cancel')
  assert.equal(gain.events.some(event => event.kind === 'ramp'), false)
  gain.events = []
  engine.playbackFadeEnabled = true
  assert.deepEqual(gain.events, [])
  assert.equal(sources.length, 1)
  assert.equal(sources[0].stops.length, 0)
  engine.pause()
  assert.deepEqual(gain.events.at(-1), { kind: 'ramp', value: 0, time: 10.15 })
  t.mock.timers.tick(170)
})
