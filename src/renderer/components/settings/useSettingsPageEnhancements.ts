import { useEffect, type RefObject } from 'react'

const STORAGE_KEY = 'astra.settings.collapsed.v1'
const HIDDEN_CLASS = 'settings-search-hidden'
const COLLAPSED_CLASS = 'is-collapsed'

type CollapsedMap = Record<string, boolean>

function readCollapsed(): CollapsedMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return parsed && typeof parsed === 'object' ? (parsed as CollapsedMap) : {}
  } catch {
    return {}
  }
}

function writeCollapsed(map: CollapsedMap): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // session only
  }
}

function labelOf(card: Element): Element | null {
  return card.querySelector(':scope > .settings-card-label, :scope > .settings-integration-card-head')
}

function keyFor(sectionKey: string, card: Element): string | null {
  const label = labelOf(card)
  const name = label?.querySelector('h4')?.textContent ?? label?.textContent
  const trimmed = name?.trim()
  return trimmed ? `${sectionKey}:${trimmed}` : null
}

/**
 * Adds two behaviours to the settings page without touching each card's markup:
 * cards fold up when their heading is clicked (remembered), and a search query hides
 * the settings that do not match. Cards stay unfolded while searching.
 */
export function useSettingsPageEnhancements(
  contentRef: RefObject<HTMLElement | null>,
  sectionKey: string,
  query: string
): void {
  // Fold / unfold on click, using one listener on the page.
  useEffect(() => {
    const root = contentRef.current
    if (!root) return
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      const head = target?.closest('.settings-card-label, .settings-integration-card-head')
      if (!head || !root.contains(head)) return
      if (target?.closest('button, a, input, select, label')) return
      const card = head.parentElement
      if (!card || labelOf(card) !== head) return
      const key = keyFor(sectionKey, card)
      if (!key) return
      const collapsed = !card.classList.contains(COLLAPSED_CLASS)
      card.classList.toggle(COLLAPSED_CLASS, collapsed)
      writeCollapsed({ ...readCollapsed(), [key]: collapsed })
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [contentRef, sectionKey])

  // Re-applied after every render so cards that mount later are handled too.
  useEffect(() => {
    const root = contentRef.current
    if (!root) return
    const needle = query.trim().toLowerCase()
    const stored = readCollapsed()

    root.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((el) => el.classList.remove(HIDDEN_CLASS))
    root.classList.toggle('settings-searching', needle.length > 0)

    const cards = Array.from(root.querySelectorAll<Element>('.settings-card, .settings-integration-card'))
    for (const card of cards) {
      const head = labelOf(card)
      if (!head) continue
      if (needle) {
        card.classList.remove(COLLAPSED_CLASS)
        continue
      }
      const key = keyFor(sectionKey, card)
      const isIntegration = card.classList.contains('settings-integration-card')
      const collapsed = key != null && key in stored ? stored[key] : isIntegration
      card.classList.toggle(COLLAPSED_CLASS, collapsed)
    }

    if (!needle) return
    const text = (el: Element) => (el.textContent ?? '').toLowerCase()
    let matches = 0
    for (const card of cards) {
      const head = labelOf(card)
      if (!text(card).includes(needle)) {
        card.classList.add(HIDDEN_CLASS)
        continue
      }
      matches += 1
      if (head && text(head).includes(needle)) continue
      card.querySelectorAll('.settings-field, .settings-integration-card-row').forEach((field) => {
        if (!text(field).includes(needle)) field.classList.add(HIDDEN_CLASS)
      })
    }
    // The section matched by name or keyword only: show it whole rather than an empty page.
    if (matches === 0) root.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((el) => el.classList.remove(HIDDEN_CLASS))
  })
}
