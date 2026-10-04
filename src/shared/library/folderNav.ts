// Finder-style keyboard navigation for the Folders tree. Pure: the view feeds in the visible rows.

export interface FolderNavRow {
  key: string
  kind: 'folder' | 'track'
  /** Key of the containing folder; null for top-level folders. */
  parentKey: string | null
  /** Folders only. */
  expanded?: boolean
}

export type FolderNavAction =
  | { type: 'none' }
  | { type: 'select'; key: string }
  | { type: 'expand'; key: string }
  | { type: 'collapse'; key: string }
  | { type: 'play'; key: string }

const NONE: FolderNavAction = { type: 'none' }

export function resolveFolderNav(
  rows: readonly FolderNavRow[],
  selectedKey: string | null,
  keyName: string
): FolderNavAction {
  if (rows.length === 0) return NONE
  const index = selectedKey === null ? -1 : rows.findIndex((row) => row.key === selectedKey)
  const current = index >= 0 ? rows[index] : null

  switch (keyName) {
    case 'ArrowDown':
      return { type: 'select', key: rows[Math.min(rows.length - 1, index + 1)].key }
    case 'ArrowUp':
      return { type: 'select', key: rows[index <= 0 ? 0 : index - 1].key }
    case 'Home':
      return { type: 'select', key: rows[0].key }
    case 'End':
      return { type: 'select', key: rows[rows.length - 1].key }
    case 'ArrowRight': {
      if (!current) return { type: 'select', key: rows[0].key }
      if (current.kind !== 'folder') return NONE
      if (!current.expanded) return { type: 'expand', key: current.key }
      const next = rows[index + 1]
      return next && next.parentKey === current.key ? { type: 'select', key: next.key } : NONE
    }
    case 'ArrowLeft': {
      if (!current) return NONE
      if (current.kind === 'folder' && current.expanded) return { type: 'collapse', key: current.key }
      return current.parentKey !== null ? { type: 'select', key: current.parentKey } : NONE
    }
    case 'Enter': {
      if (!current) return NONE
      if (current.kind === 'track') return { type: 'play', key: current.key }
      return { type: current.expanded ? 'collapse' : 'expand', key: current.key }
    }
    default:
      return NONE
  }
}
