// Library sections: fully separate libraries (music, audiobooks, game music, ...).
// Each section owns its own database, artwork cache, folders, playlists and stats, so
// nothing from one section can ever show up in another section's queue or shuffle.
// This module is pure (no Electron / fs) so it can be unit tested.

export const DEFAULT_SECTION_ID = 'music'
export const SECTION_NAME_MAX_LENGTH = 40
export const SECTIONS_REGISTRY_VERSION = 1

export type SectionKind = 'music' | 'audiobook' | 'custom'

export interface SectionConfig {
  id: string
  name: string
  kind: SectionKind
  createdAt: number
  /** Send plays from this section to Last.fm. */
  scrobble: boolean
  /** Show this section's playback on Discord. */
  discordPresence: boolean
  /** Count this section toward listening stats. */
  listeningStats: boolean
  /** Chosen colour for the section's sidebar icon (#rrggbb). Absent = automatic. */
  color?: string
}

export interface SectionRegistry {
  version: typeof SECTIONS_REGISTRY_VERSION
  activeId: string
  sections: SectionConfig[]
}

export type SectionFlagKey = 'scrobble' | 'discordPresence' | 'listeningStats'

const SECTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/
const SECTION_KINDS: ReadonlySet<string> = new Set(['music', 'audiobook', 'custom'])

export function isValidSectionId(value: unknown): value is string {
  return typeof value === 'string' && SECTION_ID_PATTERN.test(value)
}

export function defaultFlagsForKind(kind: SectionKind): Pick<SectionConfig, SectionFlagKey> {
  // Audiobooks are not "listening" in the music sense: off by default so they don't
  // pollute scrobbles, Discord status or top-artist stats. Everything else is on.
  if (kind === 'audiobook') {
    return { scrobble: false, discordPresence: false, listeningStats: false }
  }
  return { scrobble: true, discordPresence: true, listeningStats: true }
}

export function createDefaultRegistry(now: number): SectionRegistry {
  return {
    version: SECTIONS_REGISTRY_VERSION,
    activeId: DEFAULT_SECTION_ID,
    sections: [
      {
        id: DEFAULT_SECTION_ID,
        name: 'Music',
        kind: 'music',
        createdAt: now,
        ...defaultFlagsForKind('music')
      }
    ]
  }
}

export function normalizeSectionColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^#([0-9a-fA-F]{6})$/.exec(value.trim())
  return match ? `#${match[1].toLowerCase()}` : null
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, SECTION_NAME_MAX_LENGTH)
}

function normalizeSection(raw: unknown, now: number): SectionConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (!isValidSectionId(record.id)) return null
  const name = normalizeName(record.name)
  if (!name) return null
  const kind: SectionKind =
    typeof record.kind === 'string' && SECTION_KINDS.has(record.kind) ? (record.kind as SectionKind) : 'custom'
  const defaults = defaultFlagsForKind(kind)
  const color = normalizeSectionColor(record.color)
  return {
    id: record.id,
    name,
    kind,
    createdAt: typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) ? record.createdAt : now,
    scrobble: typeof record.scrobble === 'boolean' ? record.scrobble : defaults.scrobble,
    discordPresence: typeof record.discordPresence === 'boolean' ? record.discordPresence : defaults.discordPresence,
    listeningStats: typeof record.listeningStats === 'boolean' ? record.listeningStats : defaults.listeningStats,
    ...(color ? { color } : {})
  }
}

/** Repairs anything read from disk: the default section always exists and ids are unique. */
export function normalizeRegistry(raw: unknown, now: number): SectionRegistry {
  const fallback = createDefaultRegistry(now)
  if (!raw || typeof raw !== 'object') return fallback
  const record = raw as Record<string, unknown>
  const rawSections = Array.isArray(record.sections) ? record.sections : []

  const seen = new Set<string>()
  const sections: SectionConfig[] = []
  for (const entry of rawSections) {
    const section = normalizeSection(entry, now)
    if (!section || seen.has(section.id)) continue
    seen.add(section.id)
    sections.push(section)
  }

  if (!seen.has(DEFAULT_SECTION_ID)) {
    sections.unshift(fallback.sections[0])
  }

  const knownIds = new Set(sections.map((section) => section.id))
  const activeId =
    typeof record.activeId === 'string' && knownIds.has(record.activeId) ? record.activeId : DEFAULT_SECTION_ID

  return { version: SECTIONS_REGISTRY_VERSION, activeId, sections }
}

export function slugifySectionName(name: string, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds)
  const base =
    normalizeName(name)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30)
      .replace(/-+$/g, '') || 'section'

  if (!taken.has(base)) return base
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base}-${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now().toString(36)}`
}

export type SectionResult =
  | { ok: true; registry: SectionRegistry; section: SectionConfig }
  | { ok: false; error: string }

function nameTaken(registry: SectionRegistry, name: string, exceptId?: string): boolean {
  const lowered = name.toLowerCase()
  return registry.sections.some((section) => section.id !== exceptId && section.name.toLowerCase() === lowered)
}

export function addSection(
  registry: SectionRegistry,
  input: { name: string; kind?: SectionKind },
  now: number
): SectionResult {
  const name = normalizeName(input.name)
  if (!name) return { ok: false, error: 'Section name is required.' }
  if (nameTaken(registry, name)) return { ok: false, error: `A section named "${name}" already exists.` }

  const kind: SectionKind = input.kind && SECTION_KINDS.has(input.kind) ? input.kind : 'custom'
  const id = slugifySectionName(name, registry.sections.map((section) => section.id))
  const section: SectionConfig = { id, name, kind, createdAt: now, ...defaultFlagsForKind(kind) }
  return { ok: true, registry: { ...registry, sections: [...registry.sections, section] }, section }
}

export function renameSection(registry: SectionRegistry, id: string, nextName: string): SectionResult {
  const name = normalizeName(nextName)
  if (!name) return { ok: false, error: 'Section name is required.' }
  const existing = registry.sections.find((section) => section.id === id)
  if (!existing) return { ok: false, error: 'Section not found.' }
  if (nameTaken(registry, name, id)) return { ok: false, error: `A section named "${name}" already exists.` }
  const section = { ...existing, name }
  return {
    ok: true,
    section,
    registry: { ...registry, sections: registry.sections.map((entry) => (entry.id === id ? section : entry)) }
  }
}

export function updateSectionFlag(
  registry: SectionRegistry,
  id: string,
  flag: SectionFlagKey,
  value: boolean
): SectionResult {
  const existing = registry.sections.find((section) => section.id === id)
  if (!existing) return { ok: false, error: 'Section not found.' }
  const section = { ...existing, [flag]: Boolean(value) }
  return {
    ok: true,
    section,
    registry: { ...registry, sections: registry.sections.map((entry) => (entry.id === id ? section : entry)) }
  }
}

/** Sets a section's icon colour; null goes back to the automatic colour. */
export function setSectionColor(registry: SectionRegistry, id: string, color: string | null): SectionResult {
  const existing = registry.sections.find((section) => section.id === id)
  if (!existing) return { ok: false, error: 'Section not found.' }
  const normalized = color === null ? null : normalizeSectionColor(color)
  if (color !== null && !normalized) return { ok: false, error: 'That is not a valid colour.' }
  const { color: _previous, ...rest } = existing
  void _previous
  const section: SectionConfig = normalized ? { ...rest, color: normalized } : rest
  return {
    ok: true,
    section,
    registry: { ...registry, sections: registry.sections.map((entry) => (entry.id === id ? section : entry)) }
  }
}

export function setActiveSection(registry: SectionRegistry, id: string): SectionResult {
  const section = registry.sections.find((entry) => entry.id === id)
  if (!section) return { ok: false, error: 'Section not found.' }
  return { ok: true, section, registry: { ...registry, activeId: id } }
}

export function removeSection(registry: SectionRegistry, id: string): SectionResult {
  if (id === DEFAULT_SECTION_ID) return { ok: false, error: 'The default Music section cannot be removed.' }
  const existing = registry.sections.find((section) => section.id === id)
  if (!existing) return { ok: false, error: 'Section not found.' }
  const sections = registry.sections.filter((section) => section.id !== id)
  const activeId = registry.activeId === id ? DEFAULT_SECTION_ID : registry.activeId
  return { ok: true, section: existing, registry: { ...registry, sections, activeId } }
}

export function getActiveSection(registry: SectionRegistry): SectionConfig {
  return registry.sections.find((section) => section.id === registry.activeId) ?? registry.sections[0]
}

/**
 * Relative directory (inside userData) holding a section's database and caches.
 * The default section keeps the legacy layout (empty = userData root) so existing
 * installs need no migration.
 */
export function sectionDataSubdir(id: string): string[] {
  if (id === DEFAULT_SECTION_ID) return []
  if (!isValidSectionId(id)) throw new Error(`Invalid section id: ${id}`)
  return ['sections', id]
}
