import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
  RIGHT_PANEL_KEY_STEP,
  clampRightPanelWidth,
  parseStoredPanelWidth
} from '../../../shared/sidebar/panelWidth'

function readStored(key: string): number | null {
  try {
    return parseStoredPanelWidth(window.localStorage.getItem(key))
  } catch {
    return null
  }
}

function writeStored(key: string, width: number | null): void {
  try {
    if (width === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, String(width))
  } catch {
    // remembered for this session only
  }
}

/**
 * A drag edge on the left side of a right-hand panel. Put it inside the panel's container (which needs
 * `position: relative`). The width is kept in a CSS variable on the root, so the panel and anything sized
 * from it follow. Double-click resets; arrow keys nudge.
 */
export default function RightPanelResizer({
  storageKey,
  cssVar,
  defaultWidth,
  label
}: {
  storageKey: string
  cssVar: string
  defaultWidth: number
  label: string
}) {
  const handleRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState<number | null>(() => readStored(storageKey))
  const latestRef = useRef<number | null>(width)

  useEffect(() => {
    latestRef.current = width
    const root = document.documentElement
    if (width === null) root.style.removeProperty(cssVar)
    else root.style.setProperty(cssVar, `${width}px`)
  }, [width, cssVar])

  // Layout units differ from screen pixels when the app UI is scaled.
  const measure = useCallback(() => {
    const panel = handleRef.current?.parentElement
    if (!panel) return { right: window.innerWidth, scale: 1, viewport: window.innerWidth }
    const rect = panel.getBoundingClientRect()
    const scale = panel.offsetWidth > 0 ? rect.width / panel.offsetWidth : 1
    return { right: rect.right, scale, viewport: window.innerWidth / scale }
  }, [])

  const startDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const { right, scale, viewport } = measure()
    const root = document.documentElement
    root.classList.add('right-panel-resizing')

    const onMove = (move: PointerEvent) => {
      setWidth(clampRightPanelWidth((right - move.clientX) / scale, viewport, defaultWidth))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      root.classList.remove('right-panel-resizing')
      writeStored(storageKey, latestRef.current)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [defaultWidth, measure, storageKey])

  const reset = useCallback(() => {
    setWidth(null)
    writeStored(storageKey, null)
  }, [storageKey])

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const { viewport } = measure()
    const current = latestRef.current ?? defaultWidth
    let next: number | null = null
    if (event.key === 'ArrowLeft') next = current + RIGHT_PANEL_KEY_STEP
    else if (event.key === 'ArrowRight') next = current - RIGHT_PANEL_KEY_STEP
    else if (event.key === 'Home') {
      event.preventDefault()
      reset()
      return
    }
    if (next === null) return
    event.preventDefault()
    const clamped = clampRightPanelWidth(next, viewport, defaultWidth)
    setWidth(clamped)
    writeStored(storageKey, clamped)
  }, [defaultWidth, measure, reset, storageKey])

  return (
    <div
      ref={handleRef}
      className="right-panel-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label}. Double-click to reset.`}
      title="Drag to resize (double-click to reset)"
      tabIndex={0}
      onPointerDown={startDrag}
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
    />
  )
}
