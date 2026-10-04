import { create } from 'zustand'
import {
  EMPTY_COLLECTIONS,
  createFolder as createFolderOp,
  deleteFolder as deleteFolderOp,
  normalizeFilter,
  renameFolder as renameFolderOp,
  sanitizeCollections,
  sanitizeFilter,
  toggleFavorite as toggleFavoriteOp,
  toggleInFolder as toggleInFolderOp,
  type Collections,
  type PresetFilter
} from '../../shared/milkdrop/collections'
import { sanitizeFpsCap, sanitizeQuality, type FpsCap, type Quality } from '../../shared/milkdrop/quality'

const STORAGE_KEY = 'astra.milkdrop.v1'

interface Persisted {
  enabled: boolean
  presetName: string | null
  autoCycleSeconds: number
  blendSeconds: number
  collections: Collections
  filter: PresetFilter
  quality: Quality
  fpsCap: FpsCap
}

const DEFAULTS: Persisted = {
  enabled: false,
  presetName: null,
  autoCycleSeconds: 30,
  blendSeconds: 3,
  collections: EMPTY_COLLECTIONS,
  filter: { kind: 'all' },
  quality: 'medium',
  fpsCap: 60
}

function load(): Persisted {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Persisted>
    const collections = sanitizeCollections(parsed.collections)
    return {
      enabled: parsed.enabled === true,
      presetName: typeof parsed.presetName === 'string' ? parsed.presetName : null,
      autoCycleSeconds: typeof parsed.autoCycleSeconds === 'number' ? parsed.autoCycleSeconds : DEFAULTS.autoCycleSeconds,
      blendSeconds: typeof parsed.blendSeconds === 'number' ? parsed.blendSeconds : DEFAULTS.blendSeconds,
      collections,
      filter: normalizeFilter(sanitizeFilter(parsed.filter), collections),
      quality: sanitizeQuality(parsed.quality),
      fpsCap: sanitizeFpsCap(parsed.fpsCap)
    }
  } catch {
    return DEFAULTS
  }
}

function save(state: Persisted): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage unavailable; settings just won't persist
  }
}

interface MilkdropStore extends Persisted {
  setEnabled: (enabled: boolean) => void
  setPresetName: (name: string | null) => void
  setAutoCycleSeconds: (seconds: number) => void
  setBlendSeconds: (seconds: number) => void
  setFilter: (filter: PresetFilter) => void
  setQuality: (quality: Quality) => void
  setFpsCap: (fpsCap: FpsCap) => void
  toggleFavorite: (presetName: string) => void
  createFolder: (name: string) => void
  renameFolder: (id: string, name: string) => void
  deleteFolder: (id: string) => void
  toggleInFolder: (folderId: string, presetName: string) => void
}

function persistedOf(s: MilkdropStore): Persisted {
  return {
    enabled: s.enabled,
    presetName: s.presetName,
    autoCycleSeconds: s.autoCycleSeconds,
    blendSeconds: s.blendSeconds,
    collections: s.collections,
    filter: s.filter,
    quality: s.quality,
    fpsCap: s.fpsCap
  }
}

function newId(): string {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export const useMilkdropStore = create<MilkdropStore>((set, get) => {
  const update = (patch: Partial<Persisted>) => {
    set(patch)
    save(persistedOf(get()))
  }
  return {
    ...load(),
    setEnabled: (enabled) => update({ enabled }),
    setPresetName: (presetName) => update({ presetName }),
    setAutoCycleSeconds: (autoCycleSeconds) => update({ autoCycleSeconds }),
    setBlendSeconds: (blendSeconds) => update({ blendSeconds }),
    setFilter: (filter) => update({ filter }),
    setQuality: (quality) => update({ quality }),
    setFpsCap: (fpsCap) => update({ fpsCap }),
    toggleFavorite: (name) => update({ collections: toggleFavoriteOp(get().collections, name) }),
    createFolder: (name) => update({ collections: createFolderOp(get().collections, name, newId()) }),
    renameFolder: (id, name) => update({ collections: renameFolderOp(get().collections, id, name) }),
    deleteFolder: (id) => {
      const collections = deleteFolderOp(get().collections, id)
      update({ collections, filter: normalizeFilter(get().filter, collections) })
    },
    toggleInFolder: (folderId, name) => update({ collections: toggleInFolderOp(get().collections, folderId, name) })
  }
})
