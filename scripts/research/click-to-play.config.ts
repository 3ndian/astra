// Production-only benchmark entry points. The regular build never imports the harness.
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const root = process.cwd()
const output = resolve(root, '.astra-playback-benchmark', process.env.ASTRA_PLAY_BENCH_BUILD ?? 'after')
const baselineRef = process.env.ASTRA_PLAY_BENCH_BASELINE_REF ?? '7e9d3dd'
const uiBenchmark = process.env.ASTRA_PLAY_BENCH_UI === '1'
function replaceOnce(code: string, from: string, to: string): string {
  if (code.split(from).length !== 2) throw new Error(`Benchmark instrumentation marker changed: ${from}`)
  return code.replace(from, to)
}
const mark = (name: string, details = 'undefined') => `globalThis.__astraClickTrace?.(${JSON.stringify(name)}, ${details});`
const baseline = process.env.ASTRA_PLAY_BENCH_BUILD === 'before'
  ? execFileSync('git', ['show', `${baselineRef}:src/renderer/stores/playerStore.ts`], { encoding: 'utf8' })
  : null
function restoreSection(code: string, start: string, end: string): string {
  const from = code.indexOf(start)
  const to = code.indexOf(end, from)
  const oldFrom = baseline!.indexOf(start)
  const oldTo = baseline!.indexOf(end, oldFrom)
  if ([from, to, oldFrom, oldTo].some((index) => index < 0)) throw new Error('Queue benchmark baseline markers changed')
  return code.slice(0, from) + baseline!.slice(oldFrom, oldTo) + code.slice(to)
}
export default defineConfig({
  main: { plugins: [externalizeDepsPlugin(), {
    name: 'click-to-play-fixture-seed', enforce: 'pre',
    transform(code, id) {
      if (uiBenchmark && id.endsWith('/src/main/services/library.ts')) {
        return replaceOnce(code, '  rebuildDerivedLibraryState()\n  await saveDatabase()', '  globalThis.__astraBenchmarkSeed?.()\n  rebuildDerivedLibraryState()\n  await saveDatabase()')
      }
    }
  }], build: { outDir: resolve(output, 'main') } },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: resolve(output, 'preload'),
      rollupOptions: { output: {
        banner: `Object.defineProperty(process, 'resourcesPath', { value: ${JSON.stringify(resolve(root, '.astra-playback-benchmark/resources'))} });`
      } }
    }
  },
  renderer: {
    plugins: [react(), {
      name: 'click-to-play-benchmark',
      enforce: 'pre',
      transform(code, id) {
        if (uiBenchmark && id.endsWith('/src/renderer/stores/playerStore.ts')) {
          code = replaceOnce(code, '    startPlaybackContextByPaths: async (paths: string[], startIndex = 0, options) => {',
            '    startPlaybackContextByPaths: async (paths: string[], startIndex = 0, options) => {\n' + mark('storeEnter', '{ size: paths.length, startIndex, prebufferInFlight: prebufferInFlightPromise !== null, prebufferScheduled: prebufferScheduleTimerId !== null || prebufferIdleCallbackId !== null, activeStandardTransitionLoads }'))
          code = replaceOnce(code, '      const { entries, missingPaths } = preparePlaybackContextPaths(paths)',
            '      const { entries, missingPaths } = preparePlaybackContextPaths(paths)\n' + mark('pathsPrepared', '{ missingCount: missingPaths.size }'))
          code = replaceOnce(code, '    // The newly committed context is authoritative', mark('queuePublished', '{ selectedPath: currentItem.entry.path, queueSize: queueItems.length }') + '\n    // The newly committed context is authoritative')
          code = replaceOnce(code, '    const queuePreparationMs = performance.now() - commandStartedAtMs',
            '    const queuePreparationMs = performance.now() - commandStartedAtMs\n' + mark('queuePrepared'))
          code = replaceOnce(code, '    if (attempt.playingAtMs === null) attempt.playingAtMs = performance.now()',
            '    if (attempt.playingAtMs === null) { attempt.playingAtMs = performance.now(); ' + mark('scheduled', '{ attemptId: attempt.id }') + ' }')
          code = replaceOnce(code, '    if (attempt.completed) return', '    if (attempt.completed) return\n' + mark('completed', '{ attempt: { ...attempt }, outcome, timings }'))
          return code
        }
        if (uiBenchmark && id.endsWith('/src/renderer/utils/libraryCardPlayback.ts')) {
          return replaceOnce(code, '            const tracks = await actions.getTracks(source)',
            `            ${mark('collectionFetchStart')}\n            const tracks = await actions.getTracks(source)\n            ${mark('collectionFetchEnd', '{ count: tracks.length }')}`)
        }
        if (uiBenchmark && id.endsWith('/src/renderer/components/views/HomeDashboardView.tsx')) {
          code = replaceOnce(code, '          switch (source.type) {', `          ${mark('collectionFetchStart')}\n          switch (source.type) {`)
          return replaceOnce(code, '          const paths = tracks.filter((track) => track.is_available !== 0).map((track) => track.path)',
            `          ${mark('collectionFetchEnd', '{ count: tracks.length }')}\n          const paths = tracks.filter((track) => track.is_available !== 0).map((track) => track.path)`)
        }
        if (baseline && id.endsWith('/src/renderer/stores/playerStore.ts')) {
          code = restoreSection(code, 'export function createQueueEntriesFromPaths(', 'export async function createQueueEntriesFromPathsWithFetch(')
          return restoreSection(code, '    startPlaybackContextByPaths: async (', '    enqueueTrack: (')
        }
        if (id.endsWith('/src/renderer/main.tsx')) {
          return `${code}\nimport ${JSON.stringify(resolve(root, uiBenchmark ? 'scripts/research/click-to-play.ui.renderer.ts' : 'scripts/research/click-to-play.renderer.ts'))};`
        }
      }
    }],
    build: { outDir: resolve(output, 'renderer') }
  }
})
