// Pitch shifter for the player (speed changes with steady pitch, and the [ ] semitone keys).
//
// WSOLA: the sound is cut into short overlapping grains. Each grain is read from the input at `ratio` times
// normal speed (which moves its pitch by `ratio`), and the grains are laid back down at the original pace,
// each one nudged to the spot where it lines up best with the end of the one before it. That keeps the
// result smooth, without the warble of the simple delay-line shifter (pitch-correct-worklet.js).
//
// Added delay: about 120 ms while it is switched in.
const DECIMATION = 4

class PitchWsolaProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }]
  }

  constructor() {
    super()
    const scale = sampleRate / 48000
    this.hop = Math.max(64, Math.round((640 * scale) / 2) * 2)
    this.grain = this.hop * 2
    this.search = Math.max(32, Math.round(384 * scale))
    this.latency = Math.ceil(this.grain * 4 + this.search + 256)
    this.size = 1 << 17
    this.mask = this.size - 1
    this.window = new Float32Array(this.grain)
    for (let n = 0; n < this.grain; n += 1) this.window[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / this.grain)
    this.target = new Float32Array(Math.ceil(this.hop / DECIMATION))
    this.inBuf = []
    this.outBuf = []
    this.mono = new Float32Array(this.size)
    this.reset()
    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'reset') this.reset()
    }
  }

  reset() {
    for (const buffer of this.inBuf) buffer.fill(0)
    for (const buffer of this.outBuf) buffer.fill(0)
    this.mono.fill(0)
    this.inWrite = 0
    this.outRead = -this.latency
    this.k = 0
    this.prevC = 0
    this.prevP = 1
  }

  ensureChannels(count) {
    while (this.inBuf.length < count) {
      this.inBuf.push(new Float32Array(this.size))
      this.outBuf.push(new Float32Array(this.size))
    }
  }

  monoAt(position) {
    const i = Math.floor(position)
    const f = position - i
    const a = this.mono[i & this.mask]
    const b = this.mono[(i + 1) & this.mask]
    return a + (b - a) * f
  }

  chanAt(buffer, position) {
    const i = Math.floor(position)
    const f = position - i
    const a = buffer[i & this.mask]
    const b = buffer[(i + 1) & this.mask]
    return a + (b - a) * f
  }

  grainReady(ratio) {
    const widest = Math.max(ratio, this.prevP)
    return this.inWrite > this.k * this.hop + this.search + Math.ceil(this.grain * widest) + 4
  }

  makeGrain(ratio, channels) {
    const hop = this.hop
    const pos = this.k * hop
    let start = pos
    if (this.k > 0) {
      const targetLength = this.target.length
      const prevBase = this.prevC + hop * this.prevP
      for (let j = 0; j < targetLength; j += 1) {
        this.target[j] = this.monoAt(prevBase + j * DECIMATION * this.prevP)
      }
      let bestScore = -Infinity
      let bestOffset = 0
      for (let d = -this.search; d <= this.search; d += 1) {
        const candidate = pos + d
        let sum = 0
        let energy = 1e-9
        for (let j = 0; j < targetLength; j += 1) {
          const v = this.monoAt(candidate + j * DECIMATION * ratio)
          sum += v * this.target[j]
          energy += v * v
        }
        const score = sum / Math.sqrt(energy)
        if (score > bestScore) {
          bestScore = score
          bestOffset = d
        }
      }
      start = pos + bestOffset
    }
    const outStart = this.k * hop
    for (let c = 0; c < channels; c += 1) {
      const input = this.inBuf[c]
      const output = this.outBuf[c]
      for (let n = 0; n < this.grain; n += 1) {
        output[(outStart + n) & this.mask] += this.chanAt(input, start + n * ratio) * this.window[n]
      }
    }
    this.prevC = start
    this.prevP = ratio
    this.k += 1
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    const output = outputs[0]
    const channels = output.length
    if (channels === 0) return true
    this.ensureChannels(channels)
    const frames = output[0].length
    const ratio = Math.min(4, Math.max(0.25, parameters.ratio[0]))
    const mask = this.mask

    for (let n = 0; n < frames; n += 1) {
      const at = (this.inWrite + n) & mask
      let total = 0
      for (let c = 0; c < channels; c += 1) {
        const source = input[c] || input[0]
        const v = source ? source[n] : 0
        this.inBuf[c][at] = v
        total += v
      }
      this.mono[at] = total / channels
    }
    this.inWrite += frames

    while (this.grainReady(ratio)) this.makeGrain(ratio, channels)

    for (let n = 0; n < frames; n += 1) {
      const o = this.outRead + n
      for (let c = 0; c < channels; c += 1) {
        if (o < 0) {
          output[c][n] = 0
        } else {
          const at = o & mask
          output[c][n] = this.outBuf[c][at]
          this.outBuf[c][at] = 0
        }
      }
    }
    this.outRead += frames
    return true
  }
}

registerProcessor('pitch-wsola-processor', PitchWsolaProcessor)
