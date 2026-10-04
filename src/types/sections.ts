import type { SectionConfig, SectionRegistry } from '../shared/sections/sections'

export type { SectionConfig, SectionFlagKey, SectionKind, SectionRegistry } from '../shared/sections/sections'

export interface SectionsPayload {
  registry: SectionRegistry
  activeSectionId: string
}

export type SectionsMutationResult =
  | ({ success: true; section?: SectionConfig } & SectionsPayload)
  | { success: false; error: string }
