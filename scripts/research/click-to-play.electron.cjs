// Launch using the repository's Electron binary. Every invocation owns a fresh,
// disposable profile; the user's application, database and cache are never opened.
const { app, ipcMain, session } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (fs.existsSync(path.join(path.dirname(config.output), 'STOP'))) process.exit(3)
// Supply the packaged resource layout without changing Electron's installation.
const resources = path.join(root, '.astra-playback-benchmark/resources')
fs.mkdirSync(resources, { recursive: true })
for (const [name, target] of [['native', 'native/build/Release'], ['hrtf', 'resources/hrtf'], ['tray', 'resources/tray']]) {
  const link = path.join(resources, name)
  if (!fs.existsSync(link)) fs.symlinkSync(path.join(root, target), link, 'dir')
}
Object.defineProperty(process, 'resourcesPath', { value: resources })
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-playback-benchmark-'))
app.setPath('userData', profile)
app.setAppPath(root)
app.setName('Astra Playback Benchmark')
if (config.ui) globalThis.__astraBenchmarkSeed = () => require('./click-to-play.ui.cjs').seedDatabase(profile, config)
const events = []
const loudnessRequests = []
const collectionRequests = []
const samples = []
const mainRequests = []
let measuring = false
const performanceRequests = new Set()
let closing = false
const binaryProbes = []
if (config.binaryTrace) {
  const childProcess = require('node:child_process')
  const execFile = childProcess.execFile
  childProcess.execFile = function (file, args, ...rest) {
    if (args?.includes('-version')) binaryProbes.push({ file, startedAt: performance.now() })
    return execFile.call(this, file, args, ...rest)
  }
}
const originalHandle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, handler) => originalHandle(channel, async (...args) => {
  const receivedAt = performance.timeOrigin + performance.now()
  try {
    if (channel === 'app:getPerformanceStats') {
      if (closing) return null
      const pending = Promise.resolve(handler(...args))
      performanceRequests.add(pending)
      try { return await pending } finally { performanceRequests.delete(pending) }
    }
    if (config.debugSetup && channel.startsWith('library:')) console.log('IPC start', channel)
    if (channel === 'diagnostics:logEvent' && args[1]?.name === 'playback_attempt_completed') {
      events.push({ ...args[1].details, diagnosticOptions: args[2] })
    }
    if (channel === 'audio:analyzeTrackLoudness') {
      const startedAt = performance.now()
      const result = await handler(...args)
      loudnessRequests.push({ path: args[1], durationMs: performance.now() - startedAt, source: result?.source ?? null })
      return result
    }
    if (config.ui && ['library:getTracksByAlbum', 'library:getTracksByArtist', 'library:getPlaylistTracks', 'library:getTracksByPaths'].includes(channel)) {
      const startedAt = performance.now()
      const result = await handler(...args)
      collectionRequests.push({ channel, durationMs: performance.now() - startedAt, count: Array.isArray(result) ? result.length : null })
      return result
    }
    const value = await handler(...args)
    if (config.debugSetup && channel.startsWith('library:')) console.log('IPC end', channel)
    return value
  } finally {
    if (config.ui && measuring) mainRequests.push({ channel, receivedAt, durationMs: performance.timeOrigin + performance.now() - receivedAt })
  }
})
let started = false
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function drainAndClose(win) {
  if (!config.ui) return
  // Native process-memory workers must finish before Node tears down N-API.
  closing = true
  if (!win.isDestroyed()) win.destroy()
  await Promise.allSettled([...performanceRequests])
  await pause(100)
}
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }))
})
app.on('browser-window-created', (_event, win) => {
  win.webContents.setAudioMuted(true)
  win.webContents.on('did-finish-load', async () => {
    if (started || !win.webContents.getURL().includes('renderer/index.html')) return
    started = true
    try {
      for (let i = 0; i < 100; i++) {
        if (await win.webContents.executeJavaScript('Boolean(window.astraPlaybackBenchmark)')) break
        await pause(100)
      }
      // Allow normal app startup effects to settle, without starting playback.
      await pause(1000)
      if (config.ui) console.log('Application loaded; setting up UI')
      if (config.outputMode) {
        const result = await win.webContents.executeJavaScript(`window.astraPlaybackBenchmark.compatibility(${JSON.stringify(config)})`, true)
        fs.writeFileSync(config.output, JSON.stringify({ config, result }, null, 2))
        app.exit(0)
        return
      }
      const db = new (require('better-sqlite3'))(path.join(profile, 'library.db'))
      if (config.normalization === 'cached' && !config.ui) {
        await win.webContents.executeJavaScript(`window.electronAPI.analyzeTrackLoudness(${JSON.stringify(config.path)})`)
        if (config.alternatePath) await win.webContents.executeJavaScript(`window.electronAPI.analyzeTrackLoudness(${JSON.stringify(config.alternatePath)})`)
      }
      const setupResult = await win.webContents.executeJavaScript(`window.astraPlaybackBenchmark.setup(${JSON.stringify(config)})`)
      if (config.ui) console.log('UI setup complete', setupResult)
      const capabilities = await win.webContents.executeJavaScript('window.nativeAudioAPI.getCapabilities()')
      for (let i = 0; i <= (config.warmClicks ?? 20); i++) {
        if (config.ui) {
          await win.webContents.executeJavaScript('window.astraPlaybackBenchmark.prepare()')
          // Drain library work triggered by fixture setup/rendering before clicking.
          await win.webContents.executeJavaScript('window.electronAPI.library.getTrackCount()')
        }
        if (config.normalization === 'uncached') db.prepare('DELETE FROM track_loudness').run()
        events.length = 0
        loudnessRequests.length = 0
        collectionRequests.length = 0
        mainRequests.length = 0
        let inspectorSession
        const inspectorCommand = (name) => new Promise((resolve, reject) => inspectorSession.post(name, (error, result) => error ? reject(error) : resolve(result)))
        if (config.profileClick) {
          inspectorSession = new (require('node:inspector').Session)()
          inspectorSession.connect()
          await inspectorCommand('Profiler.enable')
          await inspectorCommand('Profiler.start')
          win.webContents.debugger.attach('1.3')
          await win.webContents.debugger.sendCommand('Profiler.enable')
          await win.webContents.debugger.sendCommand('Profiler.start')
        }
        measuring = true
        const sample = await win.webContents.executeJavaScript('window.astraPlaybackBenchmark.click()', true)
        if (config.profileClick) {
          const renderer = await win.webContents.debugger.sendCommand('Profiler.stop')
          const main = await inspectorCommand('Profiler.stop')
          fs.writeFileSync(`${config.output}.${i}.renderer.cpuprofile`, JSON.stringify(renderer.profile))
          fs.writeFileSync(`${config.output}.${i}.main.cpuprofile`, JSON.stringify(main.profile))
          win.webContents.debugger.detach()
          inspectorSession.disconnect()
        }
        await pause(100)
        measuring = false
        const attempt = events.find((event) => event.outcome === 'loaded') ?? events[0] ?? null
        if (!config.controlled && (sample.state !== 'playing' || attempt?.outcome !== 'loaded' || attempt.backend !== 'standard')) {
          throw new Error(`Unexpected playback outcome: ${JSON.stringify({ sample, attempt })}`)
        }
        if (config.ui && !config.controlled && attempt?.attemptId !== sample.marks.find((entry) => entry.name === 'scheduled')?.details.attemptId) throw new Error('IPC diagnostics do not match the clicked attempt')
        samples.push({ kind: i === 0 ? 'cold' : 'warm', ...sample, loudnessRequests: [...loudnessRequests], collectionRequests: [...collectionRequests], mainRequests: [...mainRequests], attempt })
      }
      db.close()
      fs.writeFileSync(config.output, JSON.stringify({ config, profile, capabilities, binaryProbes, hardware: { cpu: os.cpus()[0].model, cpus: os.cpus().length, memory: os.totalmem(), platform: os.platform(), release: os.release(), arch: os.arch(), versions: process.versions }, samples }, null, 2))
      await drainAndClose(win)
      app.exit(0)
    } catch (error) {
      console.error('PLAYBACK BENCHMARK FAILED', error)
      const debug = config.ui ? await win.webContents.executeJavaScript('window.astraPlaybackBenchmark?.debug()').catch(() => null) : null
      fs.writeFileSync(config.output, JSON.stringify({ config, profile, samples, failure: String(error), debug, mainRequests: [...mainRequests] }, null, 2))
      await drainAndClose(win)
      app.exit(1)
    }
  })
})
setTimeout(() => { console.error('PLAYBACK BENCHMARK TIMEOUT'); app.exit(2) }, 300000).unref()
require(path.resolve(root, '.astra-playback-benchmark', config.build, 'main/index.js'))
