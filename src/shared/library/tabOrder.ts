// Order of the library tabs (Tracks, Albums, ...), chosen per section.

export const LIBRARY_TAB_IDS = ['tracks', 'albums', 'artists', 'genres', 'years', 'folders'] as const
export type LibraryTabId = (typeof LIBRARY_TAB_IDS)[number]

export const DEFAULT_LIBRARY_TAB_ORDER: readonly LibraryTabId[] = LIBRARY_TAB_IDS

const KNOWN: ReadonlySet<string> = new Set(LIBRARY_TAB_IDS)

/** Keeps known tabs in the saved order, drops unknown/duplicate ones, appends any that are missing. */
export function normalizeTabOrder(saved: unknown): LibraryTabId[] {
  const seen = new Set<LibraryTabId>()
  if (Array.isArray(saved)) {
    for (const value of saved) {
      if (typeof value === 'string' && KNOWN.has(value)) seen.add(value as LibraryTabId)
    }
  }
  for (const id of LIBRARY_TAB_IDS) seen.add(id)
  return [...seen]
}

/** Moves the tab at `from` so it ends up at index `to` (both clamped). Never mutates. */
export function moveTab(order: readonly LibraryTabId[], from: number, to: number): LibraryTabId[] {
  const next = [...order]
  if (from < 0 || from >= next.length) return next
  const target = Math.max(0, Math.min(next.length - 1, to))
  const [moved] = next.splice(from, 1)
  next.splice(target, 0, moved)
  return next
}

export function isDefaultTabOrder(order: readonly LibraryTabId[]): boolean {
  return order.every((id, index) => id === DEFAULT_LIBRARY_TAB_ORDER[index])
}

export type TabOrderBySection = Record<string, LibraryTabId[]>

export function parseTabOrders(raw: string | null): TabOrderBySection {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: TabOrderBySection = {}
    for (const [sectionId, order] of Object.entries(parsed as Record<string, unknown>)) {
      out[sectionId] = normalizeTabOrder(order)
    }
    return out
  } catch {
    return {}
  }
}
