/** A point of a lasso shape: a moment in the song and a frequency. */
export interface SelectionPoint {
  t: number
  hz: number
}

export interface SelectionBand {
  lowHz: number
  highHz: number
}

/** Earliest and latest moment the shape touches. */
export function polygonTimeExtent(points: readonly SelectionPoint[]): { start: number; end: number } | null {
  if (points.length === 0) return null
  let start = Infinity
  let end = -Infinity
  for (const p of points) {
    if (p.t < start) start = p.t
    if (p.t > end) end = p.t
  }
  return { start, end }
}

/**
 * The lowest and highest frequency of the (closed) shape at one moment, i.e. where a vertical line at time `t`
 * crosses its outline. Edges are straight in log-frequency, so the answer matches what a picture on a log axis shows.
 * Returns null when the shape is not there at that moment.
 */
export function polygonBandAtTime(points: readonly SelectionPoint[], t: number): SelectionBand | null {
  const n = points.length
  if (n < 3) return null
  let low = Infinity
  let high = -Infinity
  for (let i = 0; i < n; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    const lo = Math.min(a.t, b.t)
    const hi = Math.max(a.t, b.t)
    if (t < lo || t > hi) continue
    let y: number
    if (a.t === b.t) {
      // A vertical edge covers its whole frequency span at once.
      const ya = Math.log(Math.max(1, a.hz))
      const yb = Math.log(Math.max(1, b.hz))
      low = Math.min(low, ya, yb)
      high = Math.max(high, ya, yb)
      continue
    }
    const u = (t - a.t) / (b.t - a.t)
    y = Math.log(Math.max(1, a.hz)) * (1 - u) + Math.log(Math.max(1, b.hz)) * u
    if (y < low) low = y
    if (y > high) high = y
  }
  if (!(high >= low) || !Number.isFinite(low)) return null
  return { lowHz: Math.exp(low), highHz: Math.exp(high) }
}

/** True when `p` is within `radius` (same units as the coordinates passed) of `q`. */
export function isNear(ax: number, ay: number, bx: number, by: number, radius: number): boolean {
  return (ax - bx) * (ax - bx) + (ay - by) * (ay - by) <= radius * radius
}

/** Douglas-Peucker: the indices of the points that keep the path's shape to within `tolerance`. */
export function simplifyPath(points: readonly { x: number; y: number }[], tolerance: number): number[] {
  const n = points.length
  if (n <= 2) return points.map((_, i) => i)
  const keep = new Array<boolean>(n).fill(false)
  keep[0] = true
  keep[n - 1] = true
  const stack: [number, number][] = [[0, n - 1]]
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number]
    const dx = points[b].x - points[a].x
    const dy = points[b].y - points[a].y
    const len = Math.hypot(dx, dy)
    let worst = -1
    let worstDist = tolerance
    for (let i = a + 1; i < b; i++) {
      const d = len === 0
        ? Math.hypot(points[i].x - points[a].x, points[i].y - points[a].y)
        : Math.abs(dy * points[i].x - dx * points[i].y + points[b].x * points[a].y - points[b].y * points[a].x) / len
      if (d > worstDist) { worstDist = d; worst = i }
    }
    if (worst >= 0) {
      keep[worst] = true
      stack.push([a, worst], [worst, b])
    }
  }
  const out: number[] = []
  keep.forEach((k, i) => { if (k) out.push(i) })
  return out
}
