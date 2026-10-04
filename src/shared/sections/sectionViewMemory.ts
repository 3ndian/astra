// Remembers, per library section, which page you were on, so switching to another section and
// back does not drop you on Home. Pure and storage-agnostic so it can be tested.

export interface SectionViewMemoryEntry {
  /** The top-level page (home, library, stats, playlist, ...). */
  view: string
  /** The library browse mode (tracks, albums, artists, ...), when the library page was involved. */
  libraryViewMode?: string
  /** The open playlist, when the page was a playlist. */
  playlistId?: number | null
  /** Whether the visualizer strip at the top was shown in this section. */
  analyzerVisible?: boolean
}

export type SectionViewMemory = Record<string, SectionViewMemoryEntry>

const KNOWN_VIEWS = new Set(['home', 'library', 'stats', 'graph', 'eq', 'settings', 'playlist', 'spotify', 'wanted'])
const KNOWN_LIBRARY_MODES = new Set(['tracks', 'albums', 'artists', 'genres', 'years', 'folders'])

export function sanitizeMemory(raw: unknown): SectionViewMemory {
  const result: SectionViewMemory = {}
  if (!raw || typeof raw !== 'object') return result
  for (const [sectionId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const record = value as Record<string, unknown>
    if (typeof record.view !== 'string' || !KNOWN_VIEWS.has(record.view)) continue
    const entry: SectionViewMemoryEntry = { view: record.view }
    if (typeof record.libraryViewMode === 'string' && KNOWN_LIBRARY_MODES.has(record.libraryViewMode)) {
      entry.libraryViewMode = record.libraryViewMode
    }
    if (typeof record.playlistId === 'number' && Number.isInteger(record.playlistId)) {
      entry.playlistId = record.playlistId
    }
    if (typeof record.analyzerVisible === 'boolean') entry.analyzerVisible = record.analyzerVisible
    result[sectionId] = entry
  }
  return result
}

export function rememberSectionView(
  memory: SectionViewMemory,
  sectionId: string,
  entry: SectionViewMemoryEntry
): SectionViewMemory {
  return { ...memory, [sectionId]: entry }
}

export interface RestorePlan {
  view: string
  libraryViewMode: string | null
  /** Set when the playlist page should be reopened: the playlist must still exist. */
  playlistId: number | null
}

/**
 * What to restore for a section. `playlistExists` is asked about once playlists have loaded;
 * a playlist that was deleted in the meantime sends you to the library page instead.
 */
export function planRestore(
  entry: SectionViewMemoryEntry | undefined,
  playlistExists: (id: number) => boolean
): RestorePlan {
  if (!entry) return { view: 'home', libraryViewMode: null, playlistId: null }
  const libraryViewMode = entry.libraryViewMode ?? null
  if (entry.view === 'playlist') {
    if (typeof entry.playlistId === 'number' && playlistExists(entry.playlistId)) {
      return { view: 'playlist', libraryViewMode, playlistId: entry.playlistId }
    }
    return { view: 'library', libraryViewMode, playlistId: null }
  }
  return { view: entry.view, libraryViewMode, playlistId: null }
}
