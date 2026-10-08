import { formatTimings, type TimingEntry } from '../../shared/sections/switchTiming'

// Collects step timings while switching library sections and prints them once, in the DevTools
// console, so we can see whether the wait is the database open or loading the lists.

let clickAt: number | null = null
let pre: TimingEntry[] = []
let collecting: TimingEntry[] | null = null

/** Called when the user asks for a section switch. */
export function markSwitchClick(): void {
  clickAt = performance.now()
  pre = []
  collecting = null
}

export function addPreEntry(label: string, ms: number): void {
  pre.push({ label, ms })
}

/** Called when the "switched" event arrives and the lists start reloading. */
export function beginCollect(): void {
  collecting = [...pre]
}

export function addEntry(label: string, ms: number): void {
  collecting?.push({ label, ms })
}

/** Times a promise; a no-op unless a switch is being measured. */
export function recordTiming<T>(label: string, promise: Promise<T>): Promise<T> {
  const sink = collecting
  if (!sink) return promise
  const start = performance.now()
  return promise.finally(() => {
    sink.push({ label, ms: performance.now() - start })
  })
}

export function endCollect(sectionId: string): void {
  const entries = collecting
  collecting = null
  if (!entries) return
  const total = clickAt === null ? undefined : performance.now() - clickAt
  clickAt = null
  pre = []
  console.log(formatTimings(`[section-switch] -> ${sectionId} (indented "list:" rows run in parallel, so they overlap)`, entries, total))
}
