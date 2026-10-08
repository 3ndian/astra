// Formats the step timings logged while switching library sections, so it is obvious where
// the wait comes from. Pure, no DOM or Electron.

export interface TimingEntry {
  label: string
  ms: number
}

const round = (ms: number): number => Math.round(ms * 10) / 10

/**
 * One block of text, entries in the order they happened, the slowest one marked with "<--".
 * Negative or non-finite durations are shown as 0 so a clock hiccup never prints nonsense.
 */
export function formatTimings(title: string, entries: TimingEntry[], totalMs?: number): string {
  const clean = entries.map((entry) => ({
    label: entry.label,
    ms: Number.isFinite(entry.ms) && entry.ms > 0 ? round(entry.ms) : 0
  }))
  const slowest = clean.reduce((max, entry) => (entry.ms > max ? entry.ms : max), 0)
  const width = clean.reduce((max, entry) => Math.max(max, entry.label.length), 0)

  const lines = clean.map((entry) => {
    const mark = slowest > 0 && entry.ms === slowest && clean.length > 1 ? '  <--' : ''
    return `  ${entry.label.padEnd(width)}  ${String(entry.ms).padStart(7)} ms${mark}`
  })
  if (totalMs !== undefined) {
    const total = Number.isFinite(totalMs) && totalMs > 0 ? round(totalMs) : 0
    lines.push(`  ${'total'.padEnd(width)}  ${String(total).padStart(7)} ms`)
  }
  return [title, ...lines].join('\n')
}
