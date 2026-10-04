// How sections look in the sidebar rail: a colour per section, and which sections are pinned
// (shown as their own icons) versus tucked behind the "more" button. Pure, so it can be tested.

export const MAX_PINNED_SECTIONS = 3

export interface SectionStyleInput {
  id: string
  kind: 'music' | 'audiobook' | 'custom'
  /** A colour the user chose (#rrggbb); wins over the automatic one. */
  color?: string
}

const MUSIC_COLOR = '#9b8cff'
const AUDIOBOOK_COLOR = '#e0a458'
const CUSTOM_COLORS = ['#5fc9b0', '#e06c8a', '#5fa8d3', '#d98c5f', '#b48ead', '#8fbf5f']

export function sectionColor(section: SectionStyleInput): string {
  if (section.color && /^#[0-9a-f]{6}$/i.test(section.color)) return section.color
  if (section.kind === 'music') return MUSIC_COLOR
  if (section.kind === 'audiobook') return AUDIOBOOK_COLOR
  let hash = 0
  for (let index = 0; index < section.id.length; index++) {
    hash = (hash * 31 + section.id.charCodeAt(index)) >>> 0
  }
  return CUSTOM_COLORS[hash % CUSTOM_COLORS.length]
}

function defaultPinned(sections: SectionStyleInput[]): string[] {
  const ordered = [
    ...sections.filter((section) => section.kind === 'music'),
    ...sections.filter((section) => section.kind === 'audiobook'),
    ...sections.filter((section) => section.kind === 'custom')
  ]
  return ordered.slice(0, MAX_PINNED_SECTIONS).map((section) => section.id)
}

/** The pinned ids to use: the saved choice when it is still valid, else a sensible default. */
export function resolvePinned(sections: SectionStyleInput[], stored: unknown): string[] {
  if (!Array.isArray(stored)) return defaultPinned(sections)
  const known = new Set(sections.map((section) => section.id))
  const result: string[] = []
  for (const id of stored) {
    if (typeof id === 'string' && known.has(id) && !result.includes(id)) result.push(id)
    if (result.length >= MAX_PINNED_SECTIONS) break
  }
  return result.length > 0 ? result : defaultPinned(sections)
}

/** Pinned sections in registry order, plus the active one if it is not pinned (so it is never hidden). */
export function visibleRailIds(sections: SectionStyleInput[], pinned: string[], activeId: string): string[] {
  const shown = new Set(pinned)
  shown.add(activeId)
  return sections.filter((section) => shown.has(section.id)).map((section) => section.id)
}

export type TogglePinResult = { pinned: string[]; changed: boolean }

export function togglePinned(pinned: string[], id: string): TogglePinResult {
  if (pinned.includes(id)) {
    if (pinned.length <= 1) return { pinned, changed: false } // keep at least one pinned
    return { pinned: pinned.filter((candidate) => candidate !== id), changed: true }
  }
  if (pinned.length >= MAX_PINNED_SECTIONS) return { pinned, changed: false }
  return { pinned: [...pinned, id], changed: true }
}
