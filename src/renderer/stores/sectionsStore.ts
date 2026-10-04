import { create } from 'zustand'
import {
  DEFAULT_SECTION_ID,
  getActiveSection,
  type SectionConfig,
  type SectionFlagKey,
  type SectionKind,
  type SectionRegistry
} from '../../shared/sections/sections'
import type { SectionsPayload } from '../../types/sections'

interface SectionsStore {
  registry: SectionRegistry | null
  activeSectionId: string
  isSwitching: boolean
  errorMessage: string
  init: () => Promise<void>
  createSection: (name: string, kind?: SectionKind) => Promise<SectionConfig | null>
  renameSection: (id: string, name: string) => Promise<boolean>
  setSectionFlag: (id: string, flag: SectionFlagKey, value: boolean) => Promise<boolean>
  setSectionColor: (id: string, color: string | null) => Promise<boolean>
  switchSection: (id: string) => Promise<boolean>
  deleteSection: (id: string) => Promise<boolean>
}

let unsubscribeRegistry: (() => void) | null = null

// Work to finish against the section being left, before the library database switches.
let beforeSwitchHook: (() => Promise<void>) | null = null
export function setBeforeSectionSwitchHook(hook: (() => Promise<void>) | null): void {
  beforeSwitchHook = hook
}

function applyPayload(payload: SectionsPayload): Pick<SectionsStore, 'registry' | 'activeSectionId'> {
  return { registry: payload.registry, activeSectionId: payload.activeSectionId }
}

export const useSectionsStore = create<SectionsStore>((set, get) => ({
  registry: null,
  activeSectionId: DEFAULT_SECTION_ID,
  isSwitching: false,
  errorMessage: '',

  init: async () => {
    try {
      const payload = await window.electronAPI.sections.get()
      set({ ...applyPayload(payload), errorMessage: '' })
    } catch (error) {
      console.error('Failed to load library sections:', error)
      return
    }
    unsubscribeRegistry?.()
    unsubscribeRegistry = window.electronAPI.sections.onRegistryChanged((payload) => {
      set(applyPayload(payload))
    })
  },

  createSection: async (name, kind) => {
    const result = await window.electronAPI.sections.create({ name, kind })
    if (!result.success) {
      set({ errorMessage: result.error })
      return null
    }
    set({ ...applyPayload(result), errorMessage: '' })
    return result.section ?? null
  },

  renameSection: async (id, name) => {
    const result = await window.electronAPI.sections.rename(id, name)
    if (!result.success) {
      set({ errorMessage: result.error })
      return false
    }
    set({ ...applyPayload(result), errorMessage: '' })
    return true
  },

  setSectionFlag: async (id, flag, value) => {
    const result = await window.electronAPI.sections.setFlag(id, flag, value)
    if (!result.success) {
      set({ errorMessage: result.error })
      return false
    }
    set({ ...applyPayload(result), errorMessage: '' })
    return true
  },

  setSectionColor: async (id, color) => {
    const result = await window.electronAPI.sections.setColor(id, color)
    if (!result.success) {
      set({ errorMessage: result.error })
      return false
    }
    set({ ...applyPayload(result), errorMessage: '' })
    return true
  },

  switchSection: async (id) => {
    if (get().isSwitching || id === get().activeSectionId) return false
    set({ isSwitching: true, errorMessage: '' })
    try {
      try {
        await beforeSwitchHook?.()
      } catch (error) {
        console.warn('Before-switch hook failed:', error)
      }
      const result = await window.electronAPI.sections.switchTo(id)
      if (!result.success) {
        set({ errorMessage: result.error })
        return false
      }
      set(applyPayload(result))
      return true
    } finally {
      set({ isSwitching: false })
    }
  },

  deleteSection: async (id) => {
    const result = await window.electronAPI.sections.remove(id)
    if (!result.success) {
      set({ errorMessage: result.error })
      return false
    }
    set({ ...applyPayload(result), errorMessage: '' })
    return true
  }
}))

export function selectActiveSection(state: Pick<SectionsStore, 'registry'>): SectionConfig | null {
  return state.registry ? getActiveSection(state.registry) : null
}

/**
 * Whether plays in the active section should be reported to an outside service.
 * Defaults to true until the registry has loaded so nothing is silently dropped at startup.
 */
export function isSectionFlagEnabled(flag: SectionFlagKey): boolean {
  const section = selectActiveSection(useSectionsStore.getState())
  return section ? section[flag] : true
}
