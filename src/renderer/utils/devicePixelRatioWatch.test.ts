import assert from 'node:assert/strict'
import { test } from 'node:test'

type Handler = () => void

function installFakeWindow(initialDpr: number) {
  const mediaHandlers = new Map<string, Set<Handler>>()
  const windowHandlers = new Map<string, Set<Handler>>()
  const fake = {
    devicePixelRatio: initialDpr,
    matchMedia(query: string) {
      return {
        addEventListener(_type: string, handler: Handler) {
          if (!mediaHandlers.has(query)) mediaHandlers.set(query, new Set())
          mediaHandlers.get(query)?.add(handler)
        },
        removeEventListener(_type: string, handler: Handler) {
          mediaHandlers.get(query)?.delete(handler)
        }
      }
    },
    addEventListener(type: string, handler: Handler) {
      if (!windowHandlers.has(type)) windowHandlers.set(type, new Set())
      windowHandlers.get(type)?.add(handler)
    },
    removeEventListener(type: string, handler: Handler) {
      windowHandlers.get(type)?.delete(handler)
    }
  }
  ;(globalThis as unknown as { window: unknown }).window = fake
  return {
    fake,
    fireMedia(query: string) { mediaHandlers.get(query)?.forEach((h) => h()) },
    fireWindow(type: string) { windowHandlers.get(type)?.forEach((h) => h()) },
    mediaCount() { return [...mediaHandlers.values()].reduce((n, set) => n + set.size, 0) },
    windowCount() { return [...windowHandlers.values()].reduce((n, set) => n + set.size, 0) }
  }
}

test('listeners hear about a pixel density change and the watcher cleans up after itself', async () => {
  const env = installFakeWindow(2)
  const { subscribeDevicePixelRatio } = await import('./devicePixelRatioWatch')
  const seen: number[] = []
  const unsubscribe = subscribeDevicePixelRatio((dpr) => seen.push(dpr))

  // Same ratio: nothing to report.
  env.fireWindow('resize')
  assert.deepEqual(seen, [])

  // The display changes (monitor unplugged): the old media query stops matching.
  env.fake.devicePixelRatio = 1
  env.fireMedia('(resolution: 2dppx)')
  assert.deepEqual(seen, [1])
  assert.equal(env.mediaCount(), 1, 'now watching the new ratio only')

  // A change that only shows up as a resize is still caught.
  env.fake.devicePixelRatio = 1.5
  env.fireWindow('resize')
  assert.deepEqual(seen, [1, 1.5])

  unsubscribe()
  assert.equal(env.mediaCount(), 0)
  assert.equal(env.windowCount(), 0)
})
