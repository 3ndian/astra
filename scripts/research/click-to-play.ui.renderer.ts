import { useLibraryStore, type DbTrack } from '../../src/renderer/stores/libraryStore'
import { usePlayerStore } from '../../src/renderer/stores/playerStore'
import { useAudioSettingsStore } from '../../src/renderer/stores/audioSettingsStore'
import { useUIStore } from '../../src/renderer/stores/uiStore'
import { usePlaylistStore } from '../../src/renderer/stores/playlistStore'
import { audioEngine } from '../../src/renderer/audio/AudioEngine'

interface Config {
  fixtures: string
  librarySize?: number
  size: number
  route: 'row' | 'album' | 'artist' | 'home'
  position: 'first' | 'middle' | 'last'
  controlled: boolean
  variant: 'primary' | 'shuffle' | 'panel' | 'metadata' | 'fixed-library'
}
interface Mark { name: string; at: number; details?: any }
interface Trace { timeOrigin: number; marks: Mark[]; longTasks: Array<{ start: number; duration: number }>; before: Record<string, unknown>; loaderResult?: string; error?: string }
let config: Config
let tracks: DbTrack[] = []
let allTracks = new Map<string, DbTrack>()
let trace: Trace | null = null
let clickCount = 0
let clickTarget: HTMLElement | null = null
let expectedPath = ''
let expectedGroup = 'A'
const originalRandom = Math.random
function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5
    return (value >>> 0) / 4294967296
  }
}
const realLoad = usePlayerStore.getState()._loadAndPlayTrack
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
async function until(test: () => unknown, label: string) {
  const start = performance.now()
  while (!test()) {
    if (performance.now() - start > 30000) {
      mark('timeout', { label, thresholdMs: 30000 })
      throw new Error(`Timed out: ${label}`)
    }
    await wait(20)
  }
}
function mark(name: string, details?: any) {
  if (!trace) return
  trace.marks.push({ name, at: performance.now(), details })
  if (name === 'storeEnter' && config.variant === 'shuffle') Math.random = seededRandom(0x41a57 + clickCount)
  if (name === 'queuePublished') Math.random = originalRandom
  if (name === 'storeEnter' && config.variant === 'metadata') {
    // Evict only at command entry: the real row still has the metadata it rendered.
    // This deliberately tests an otherwise-ready UI with an uncached player context.
    useLibraryStore.setState({ trackByPath: new Map() })
  }
}
Object.assign(globalThis, { __astraClickTrace: mark })
if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
  new PerformanceObserver((list) => {
    if (!trace) return
    for (const entry of list.getEntries()) {
      const clicked = trace.marks.find((entry) => entry.name === 'click')?.at
      if (clicked !== undefined && entry.startTime + entry.duration >= clicked) trace.longTasks.push({ start: entry.startTime, duration: entry.duration })
    }
  }).observe({ type: 'longtask' })
}
document.addEventListener('click', (event) => {
  if (trace && clickTarget?.contains(event.target as Node)) mark('click')
}, true)
usePlayerStore.subscribe((state, prev) => {
  if (!trace) return
  if (state.playbackState === 'loading' && prev.playbackState !== 'loading') mark('loadingState')
})
const feedbackObserver = new MutationObserver(() => {
  if (!trace || trace.marks.some((entry) => entry.name === 'feedbackDom')) return
  const pending = config.route === 'row'
    ? clickTarget?.classList.contains('track-row-loading')
    : clickTarget?.getAttribute('aria-busy') === 'true'
  if (pending) {
    const owner = trace
    mark('feedbackDom')
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (trace === owner) mark('feedbackFrame')
    }))
  }
})
feedbackObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-busy'] })

const benchmark = {
  debug: () => ({ trace, text: document.body.innerText.slice(0, 3000), expectedPath }),
  async setup(next: Config) {
    config = next
    const librarySize = config.librarySize ?? config.size
    await useAudioSettingsStore.getState().setPlaybackOutputMode('standard')
    await useAudioSettingsStore.getState().setDelayCompensationEnabled(false)
    useAudioSettingsStore.getState().setNormalizationEnabled(true)
    audioEngine.setReplayGainEnabled(false)
    usePlayerStore.setState({ shuffle: config.variant === 'shuffle', repeat: 'none' })
    await until(() => !useLibraryStore.getState().isLoading && useLibraryStore.getState().totalTrackCount === librarySize * 2, 'initial library load')
    // Fixture construction is outside the experiment. Avoid a second full-library
    // reload and 200 paged IPC reads just to reproduce known cached metadata.
    const albumKeys = new Map(useLibraryStore.getState().albums.map((album) => [album.album, album.identity_key]))
    tracks = ['A', 'B'].flatMap((group, groupIndex) => Array.from({ length: librarySize }, (_, index) => {
      const artist = `Benchmark Artist ${group}`
      const album = `Benchmark Album ${group}` + (librarySize > 12 ? ` ${String(Math.floor(index / 12)).padStart(6, '0')}` : '')
      return {
        id: groupIndex * librarySize + index + 1, path: `${config.fixtures}/${group}/${String(index).padStart(6, '0')}.flac`,
        title: `Track ${String(index).padStart(6, '0')}`, artist, artist_names: [artist], album,
        album_artist: artist, album_artist_names: [artist], album_identity_key: albumKeys.get(album),
        duration: 180, track_number: index % 12 + 1, track_total: Math.min(12, librarySize - Math.floor(index / 12) * 12),
        disc_number: 1, disc_total: 1, genre: `Benchmark Genre ${group}`, genres: [`Benchmark Genre ${group}`],
        format: 'flac', sample_rate: 48000, bit_depth: 16, channels: 2, source_type: 'local', source_id: null,
        is_available: 1, is_new: false, artwork_hash: null, base_artwork_hash: null, play_count: 0,
        year: null, last_played_at: null, added_at: 1, modified_at: 1
      } as DbTrack
    }))
    allTracks = new Map(tracks.map((track) => [track.path, track]))
    if (tracks.length !== librarySize * 2) throw new Error(`Fixture cache has ${tracks.length} tracks; expected ${librarySize * 2}`)
    useLibraryStore.setState({ trackByPath: allTracks, trackCacheVersion: useLibraryStore.getState().trackCacheVersion + 1 })
    usePlaylistStore.setState({ sidebarPinnedPlaylistIds: [1, 2] })
    useUIStore.setState({ activeView: config.route === 'home' ? 'home' : 'library', showQueue: config.variant === 'panel' })
    if (config.route === 'row') {
      useLibraryStore.setState({ viewMode: 'genres', selectedGenre: 'Benchmark Genre A', trackPaths: tracks.slice(0, config.size).map((track) => track.path) })
    } else if (config.route !== 'home') {
      useLibraryStore.getState().setViewMode(config.route === 'album' ? 'albums' : 'artists')
    }
    usePlayerStore.setState({ _loadAndPlayTrack: async (track, options) => {
      mark('loaderEnter', { path: track.path })
      try {
        const outcome = config.controlled ? 'loaded' : await realLoad(track, options)
        if (trace) trace.loaderResult = outcome
        mark('loaderReturn', { outcome })
        return outcome
      } catch (error) {
        if (trace) trace.error = String(error)
        throw error
      }
    } })
    // Normal startup, collection rendering, and fixture-cache preparation are outside clicks.
    await wait(1000)
    await frame()
    await frame()
    return { tracks: tracks.length, albums: useLibraryStore.getState().albums.length, artists: useLibraryStore.getState().artists.length }
  },
  async prepare() {
    trace = null
    const group = clickCount % 2 === 0 ? 'A' : 'B'
    expectedGroup = config.route === 'row' ? 'A' : group
    // Restore the same fully cached initial condition after background hydration/pruning.
    if (useLibraryStore.getState().trackByPath !== allTracks) {
      useLibraryStore.setState({ trackByPath: allTracks, trackCacheVersion: useLibraryStore.getState().trackCacheVersion + 1 })
    }
    if (config.route === 'row') {
      const index = config.position === 'first' ? clickCount % 2
        : config.position === 'last' ? config.size - 1 - clickCount % 2
          : Math.floor(config.size / 2) - clickCount % 2
      const title = `Track ${String(index).padStart(6, '0')}`
      expectedPath = tracks.find((track) => track.artist === 'Benchmark Artist A' && track.title === title)!.path
      useUIStore.getState().requestLibraryTrackReveal(expectedPath)
      await until(() => document.querySelector(`[data-controller-key=${JSON.stringify(`track:${expectedPath}`)}]`), 'track revealed')
      clickTarget = document.querySelector<HTMLElement>(`[data-controller-key=${JSON.stringify(`track:${expectedPath}`)}]`)
    } else {
      const title = `Benchmark ${config.route === 'home' ? 'Playlist' : config.route === 'album' ? 'Album' : 'Artist'} ${group}`
        + (config.route === 'album' ? ` by Benchmark Artist ${group}` : '')
      const selector = `${config.route === 'home' ? '.home-playback-control' : '.library-card-playback'}[aria-label=${JSON.stringify(`Play ${title}`)}]`
      await until(() => document.querySelector(selector), `card ${title}`)
      clickTarget = document.querySelector<HTMLElement>(selector)
      expectedPath = tracks.find((track) => track.artist === `Benchmark Artist ${group}` && track.title === 'Track 000000')!.path
      if (config.variant === 'shuffle') {
        const index = 1 + Math.floor(seededRandom(0x41a57 + clickCount)() * (config.size - 1))
        expectedPath = tracks.find((track) => track.artist === `Benchmark Artist ${group}` && track.title === `Track ${String(index).padStart(6, '0')}`)!.path
      }
    }
    if (!clickTarget) throw new Error('Missing actual playback control')
    clickTarget.scrollIntoView({ block: 'center' })
    await frame()
    await frame()
    return { expectedPath, label: clickTarget.getAttribute('aria-label') }
  },
  async click() {
    if (!clickTarget) throw new Error('prepare() must select a control')
    const state = usePlayerStore.getState()
    trace = { timeOrigin: performance.timeOrigin, marks: [], longTasks: [], before: {
      queueSize: state.queueItems.length, playbackState: state.playbackState,
      hasNextBuffered: audioEngine.hasNextBuffered, nextBufferedTrackPath: audioEngine.nextBufferedTrackPath,
      metadataCount: useLibraryStore.getState().trackByPath.size,
      outputMode: audioEngine.getPlaybackOutputMode(), outputDelayMs: useAudioSettingsStore.getState().effectiveDelayMs
    } }
    clickTarget.click()
    await until(() => trace?.loaderResult || trace?.error, 'selected loader completion')
    await frame()
    await frame()
    const result = trace as Trace
    const marks = new Map(result.marks.map((entry) => [entry.name, entry]))
    const required = ['click', 'storeEnter', 'pathsPrepared', 'queuePublished', 'queuePrepared', 'loaderEnter', 'loaderReturn']
    if (!config.controlled) required.push('loadingState', 'scheduled', 'completed')
    if (config.route !== 'row') required.push('collectionFetchStart', 'collectionFetchEnd')
    for (const name of required) if (!marks.has(name)) throw new Error(`Missing ${name}`)
    const published = marks.get('queuePublished')!.details
    const loaded = marks.get('loaderEnter')!.details
    if (published.queueSize !== config.size || usePlayerStore.getState().queueItems.length !== config.size) throw new Error('Incorrect queue size')
    const expected = expectedPath
    if (published.selectedPath !== expected || loaded.path !== expected) throw new Error('Incorrect selected track')
    if (allTracks.get(loaded.path)?.artist !== `Benchmark Artist ${expectedGroup}`) throw new Error('Incorrect collection')
    const missing = marks.get('pathsPrepared')!.details.missingCount
    if (missing !== (config.variant === 'metadata' ? config.size : 0)) throw new Error(`Unexpected metadata misses: ${missing}`)
    if (result.loaderResult !== 'loaded' || result.error) throw new Error(result.error ?? 'Loader did not load')
    if (!config.controlled) {
      const done = marks.get('completed')!.details
      if (done.outcome !== 'loaded' || done.attempt.intent !== 'context' || done.timings.backend !== 'standard') throw new Error('Incorrect playback attempt')
      if (done.attempt.id !== marks.get('scheduled')!.details.attemptId) throw new Error('Uncorrelated playback attempt')
      if (usePlayerStore.getState().currentTrack?.path !== expected || usePlayerStore.getState().playbackState !== 'playing') throw new Error('Playback did not reach playing')
      if (done.timings.loudnessSource !== 'cache') throw new Error(`Normalization cache miss: ${done.timings.loudnessSource}`)
    }
    clickCount++
    trace = null
    return { ...result, expectedPath: expected, actualPath: loaded.path, state: usePlayerStore.getState().playbackState, queueSize: published.queueSize }
  }
}
Object.assign(window, { astraPlaybackBenchmark: benchmark })
