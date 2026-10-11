// Keeps the pitch steady while the playback speed changes.
// The player slows or speeds the audio (which also moves its pitch); this stage then shifts the pitch back by
// `ratio` (1 / speed). It is a two-tap delay-line pitch shifter: two read heads sweep through a short buffer
// and cross-fade, so the sound stays continuous. Works on any number of channels.
class PitchCorrectProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 10, automationRate: 'k-rate' }]
  }

  constructor() {
    super()
    this.windowSize = Math.max(256, Math.round(sampleRate * 0.05))
    this.bufferSize = this.windowSize * 4
    this.buffers = []
    this.writeIndex = 0
    this.phase = 0
  }

  ensureBuffers(channelCount) {
    while (this.buffers.length < channelCount) this.buffers.push(new Float32Array(this.bufferSize))
  }

  readTap(buffer, delay) {
    let position = this.writeIndex - delay
    while (position < 0) position += this.bufferSize
    const i0 = Math.floor(position)
    const frac = position - i0
    const a = buffer[i0 % this.bufferSize]
    const b = buffer[(i0 + 1) % this.bufferSize]
    return a + (b - a) * frac
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    const output = outputs[0]
    const channelCount = output.length
    if (channelCount === 0) return true
    this.ensureBuffers(channelCount)
    const frames = output[0].length
    const ratio = parameters.ratio[0]
    const step = (1 - ratio) / this.windowSize
    const size = this.bufferSize
    const windowSize = this.windowSize

    let phase = this.phase
    let writeIndex = this.writeIndex
    for (let n = 0; n < frames; n += 1) {
      const phase2 = phase + 0.5 >= 1 ? phase - 0.5 : phase + 0.5
      const delay1 = phase * windowSize + 2
      const delay2 = phase2 * windowSize + 2
      const gain1 = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase)
      const gain2 = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase2)
      for (let c = 0; c < channelCount; c += 1) {
        const buffer = this.buffers[c]
        const source = input[c] || input[0]
        buffer[writeIndex] = source ? source[n] : 0
        this.writeIndex = writeIndex
        output[c][n] = this.readTap(buffer, delay1) * gain1 + this.readTap(buffer, delay2) * gain2
      }
      writeIndex = (writeIndex + 1) % size
      phase += step
      if (phase >= 1) phase -= 1
      else if (phase < 0) phase += 1
    }
    this.writeIndex = writeIndex
    this.phase = phase
    return true
  }
}

registerProcessor('pitch-correct-processor', PitchCorrectProcessor)
