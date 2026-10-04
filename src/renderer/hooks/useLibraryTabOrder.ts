import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_LIBRARY_TAB_ORDER,
  isDefaultTabOrder,
  moveTab,
  normalizeTabOrder,
  parseTabOrders,
  type LibraryTabId,
  type TabOrderBySection
} from '../../shared/library/tabOrder'

const STORAGE_KEY = 'astra-library-tab-order-v1'

function readAll(): TabOrderBySection {
  try {
    return parseTabOrders(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return {}
  }
}

function writeAll(all: TabOrderBySection): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // storage unavailable; the order just won't persist
  }
}

/** The library tab order for one section, with helpers to move tabs. Saved per section. */
export function useLibraryTabOrder(sectionId: string): {
  order: LibraryTabId[]
  move: (from: number, to: number) => void
  reset: () => void
  isCustom: boolean
} {
  const [order, setOrder] = useState<LibraryTabId[]>(() => normalizeTabOrder(readAll()[sectionId]))

  useEffect(() => {
    setOrder(normalizeTabOrder(readAll()[sectionId]))
  }, [sectionId])

  const save = useCallback((next: LibraryTabId[]) => {
    setOrder(next)
    const all = readAll()
    if (isDefaultTabOrder(next)) delete all[sectionId]
    else all[sectionId] = next
    writeAll(all)
  }, [sectionId])

  const move = useCallback((from: number, to: number) => {
    save(moveTab(order, from, to))
  }, [order, save])

  const reset = useCallback(() => save([...DEFAULT_LIBRARY_TAB_ORDER]), [save])

  return { order, move, reset, isCustom: !isDefaultTabOrder(order) }
}
