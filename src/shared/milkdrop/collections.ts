// Favorites and folders for Milkdrop presets. Presets are referenced by name, which is
// stable for both the bundled pack and imported files. Pure data helpers, no DOM.

export interface PresetFolder {
  id: string
  name: string
  presets: string[]
}

export interface Collections {
  favorites: string[]
  folders: PresetFolder[]
}

export type PresetFilter =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'mine' }
  | { kind: 'folder'; id: string }

export const EMPTY_COLLECTIONS: Collections = { favorites: [], folders: [] }
export const MAX_FOLDER_NAME = 40

export function isFavorite(c: Collections, name: string): boolean {
  return c.favorites.includes(name)
}

export function toggleFavorite(c: Collections, name: string): Collections {
  return {
    ...c,
    favorites: isFavorite(c, name) ? c.favorites.filter((n) => n !== name) : [...c.favorites, name]
  }
}

function cleanFolderName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_NAME)
}

function nameTaken(c: Collections, name: string, exceptId?: string): boolean {
  const lower = name.toLowerCase()
  return c.folders.some((f) => f.id !== exceptId && f.name.toLowerCase() === lower)
}

/** Returns the new collections, or the same object if the name is empty or already used. */
export function createFolder(c: Collections, name: string, id: string): Collections {
  const clean = cleanFolderName(name)
  if (!clean || nameTaken(c, clean) || c.folders.some((f) => f.id === id)) return c
  return { ...c, folders: [...c.folders, { id, name: clean, presets: [] }] }
}

export function renameFolder(c: Collections, id: string, name: string): Collections {
  const clean = cleanFolderName(name)
  if (!clean || nameTaken(c, clean, id)) return c
  return { ...c, folders: c.folders.map((f) => (f.id === id ? { ...f, name: clean } : f)) }
}

export function deleteFolder(c: Collections, id: string): Collections {
  return { ...c, folders: c.folders.filter((f) => f.id !== id) }
}

export function inFolder(c: Collections, folderId: string, preset: string): boolean {
  return c.folders.find((f) => f.id === folderId)?.presets.includes(preset) ?? false
}

export function toggleInFolder(c: Collections, folderId: string, preset: string): Collections {
  return {
    ...c,
    folders: c.folders.map((f) => {
      if (f.id !== folderId) return f
      return f.presets.includes(preset)
        ? { ...f, presets: f.presets.filter((n) => n !== preset) }
        : { ...f, presets: [...f.presets, preset] }
    })
  }
}

/** A filter pointing at a deleted folder falls back to "all". */
export function normalizeFilter(filter: PresetFilter, c: Collections): PresetFilter {
  if (filter.kind === 'folder' && !c.folders.some((f) => f.id === filter.id)) return { kind: 'all' }
  return filter
}

export function applyFilter<T extends { name: string; user: boolean }>(entries: T[], filter: PresetFilter, c: Collections): T[] {
  switch (filter.kind) {
    case 'all':
      return entries
    case 'mine':
      return entries.filter((e) => e.user)
    case 'favorites': {
      const set = new Set(c.favorites)
      return entries.filter((e) => set.has(e.name))
    }
    case 'folder': {
      const set = new Set(c.folders.find((f) => f.id === filter.id)?.presets ?? [])
      return entries.filter((e) => set.has(e.name))
    }
  }
}

export function filterToValue(filter: PresetFilter): string {
  return filter.kind === 'folder' ? `folder:${filter.id}` : filter.kind
}

export function valueToFilter(value: string): PresetFilter {
  if (value.startsWith('folder:')) return { kind: 'folder', id: value.slice(7) }
  if (value === 'favorites' || value === 'mine') return { kind: value }
  return { kind: 'all' }
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [])

/** Defensive parse of whatever came out of storage. */
export function sanitizeCollections(raw: unknown): Collections {
  if (!raw || typeof raw !== 'object') return EMPTY_COLLECTIONS
  const r = raw as Record<string, unknown>
  const folders: PresetFolder[] = []
  if (Array.isArray(r.folders)) {
    for (const f of r.folders) {
      if (!f || typeof f !== 'object') continue
      const { id, name, presets } = f as Record<string, unknown>
      if (typeof id !== 'string' || typeof name !== 'string') continue
      const clean = cleanFolderName(name)
      if (!clean || folders.some((x) => x.id === id)) continue
      folders.push({ id, name: clean, presets: strings(presets) })
    }
  }
  return { favorites: strings(r.favorites), folders }
}

export function sanitizeFilter(raw: unknown): PresetFilter {
  if (!raw || typeof raw !== 'object') return { kind: 'all' }
  const r = raw as Record<string, unknown>
  if (r.kind === 'favorites' || r.kind === 'mine') return { kind: r.kind }
  if (r.kind === 'folder' && typeof r.id === 'string') return { kind: 'folder', id: r.id }
  return { kind: 'all' }
}
