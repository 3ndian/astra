import type { ViewMode } from '../stores/libraryStore'

export type LibraryTabTransitionDirection = 'forward' | 'backward' | null

const LIBRARY_TAB_MOTION_ORDER: ViewMode[] = ['tracks', 'albums', 'artists', 'genres', 'years', 'folders']

export function resolveLibraryTabTransitionDirection(
  sourceMode: ViewMode | null | undefined,
  targetMode: ViewMode | null | undefined,
  order: readonly ViewMode[] = LIBRARY_TAB_MOTION_ORDER
): LibraryTabTransitionDirection {
  if (!sourceMode || !targetMode || sourceMode === targetMode) return null

  const sourceIndex = order.indexOf(sourceMode)
  const targetIndex = order.indexOf(targetMode)
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return null

  return targetIndex > sourceIndex ? 'forward' : 'backward'
}

export function getLibraryTabTransitionScopeClasses(
  sourceMode: ViewMode,
  targetMode: ViewMode,
  order: readonly ViewMode[] = LIBRARY_TAB_MOTION_ORDER
): string[] {
  const scopeClassNames = ['library-tab-transition']
  const direction = resolveLibraryTabTransitionDirection(sourceMode, targetMode, order)
  if (direction) {
    scopeClassNames.push(`library-tab-transition-${direction}`)
  }
  return scopeClassNames
}
