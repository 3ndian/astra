// One place for Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z. Anything in the app that has something to undo registers a
// "scope" here; the key press goes to the highest-priority scope that has something to undo (or redo).
// Text fields keep their own native undo, and nothing happens while a dialog is open.

export interface UndoScope {
  id: string
  /** Higher wins when more than one scope can act. */
  priority: number
  canUndo: () => boolean
  canRedo: () => boolean
  undo: () => void
  redo: () => void
}

export type UndoAction = 'undo' | 'redo'

export function pickUndoScope(scopes: Iterable<UndoScope>, action: UndoAction): UndoScope | null {
  let best: UndoScope | null = null
  for (const scope of scopes) {
    const available = action === 'undo' ? scope.canUndo() : scope.canRedo()
    if (available && (best === null || scope.priority > best.priority)) best = scope
  }
  return best
}

export function undoActionForKey(event: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }, isMac: boolean): UndoAction | null {
  if (event.altKey) return null
  const modifier = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (!modifier) return null
  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && !isMac && !event.shiftKey) return 'redo'
  return null
}

const scopes = new Map<string, UndoScope>()
let installed = false

function isEditable(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element || typeof element.tagName !== 'string') return false
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || isEditable(event.target)) return
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
  const action = undoActionForKey(event, isMac)
  if (!action) return
  if (document.querySelector('.modal-overlay, [role="dialog"], .settings-overlay, .quick-launch-overlay')) return
  const scope = pickUndoScope(scopes.values(), action)
  if (!scope) return
  event.preventDefault()
  if (action === 'undo') scope.undo()
  else scope.redo()
}

export function registerUndoScope(scope: UndoScope): () => void {
  scopes.set(scope.id, scope)
  if (!installed && typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown)
    installed = true
  }
  return () => {
    if (scopes.get(scope.id) === scope) scopes.delete(scope.id)
  }
}
