import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import {
  SIDEBAR_KEY_STEP,
  clampSidebarWidth,
  defaultSidebarWidth,
  parseStoredSidebarWidth
} from '../../shared/sidebar/width'

const STORAGE_KEY = 'astra.sidebarExpandedWidth'

function readStored(): number | null {
  try {
    return parseStoredSidebarWidth(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

function writeStored(width: number | null): void {
  try {
    if (width === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, String(width))
  } catch {
    // remembered for this session only
  }
}

/**
 * Drag-to-resize for the expanded left pane. The width lives in the --sidebar-expanded-width
 * CSS variable, which the pane, the cover and the bottom player bar all read.
 */
export function useSidebarWidth(sidebarRef: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState<number | null>(readStored)
  const [isResizing, setIsResizing] = useState(false)
  const latestRef = useRef<number | null>(width)

  useEffect(() => {
    latestRef.current = width
    const root = document.documentElement
    if (width === null) root.style.removeProperty('--sidebar-expanded-width')
    else root.style.setProperty('--sidebar-expanded-width', `${width}px`)
  }, [width])

  // Layout units differ from screen pixels when the app UI is scaled.
  const measure = useCallback(() => {
    const el = sidebarRef.current
    if (!el) return { left: 0, scale: 1, viewport: window.innerWidth }
    const rect = el.getBoundingClientRect()
    const scale = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1
    return { left: rect.left, scale, viewport: window.innerWidth / scale }
  }, [sidebarRef])

  const startDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const { left, scale, viewport } = measure()
    setIsResizing(true)

    const onMove = (move: PointerEvent) => {
      setWidth(clampSidebarWidth((move.clientX - left) / scale, viewport))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      setIsResizing(false)
      writeStored(latestRef.current)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [measure])

  const reset = useCallback(() => {
    setWidth(null)
    writeStored(null)
  }, [])

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const { viewport } = measure()
    const current = latestRef.current ?? defaultSidebarWidth(viewport)
    let next: number | null = null
    if (event.key === 'ArrowLeft') next = current - SIDEBAR_KEY_STEP
    else if (event.key === 'ArrowRight') next = current + SIDEBAR_KEY_STEP
    else if (event.key === 'Home' || event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      reset()
      return
    }
    if (next === null) return
    event.preventDefault()
    event.stopPropagation()
    const clamped = clampSidebarWidth(next, viewport)
    setWidth(clamped)
    writeStored(clamped)
  }, [measure, reset])

  return { startDrag, reset, onKeyDown, isResizing }
}
