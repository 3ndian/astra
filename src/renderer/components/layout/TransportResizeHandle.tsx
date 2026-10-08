import { useCallback, useEffect, useRef } from 'react'
import {
  TRANSPORT_HEIGHT_DEFAULT,
  TRANSPORT_HEIGHT_KEY_STEP,
  clampTransportHeight,
  heightFromDrag
} from '../../../shared/transport/height'

const STORAGE_KEY = 'astra-transport-height-v1'

function readStored(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw === null ? TRANSPORT_HEIGHT_DEFAULT : clampTransportHeight(raw)
  } catch {
    return TRANSPORT_HEIGHT_DEFAULT
  }
}

function apply(height: number): void {
  document.documentElement.style.setProperty('--now-playing-height', `${height}px`)
}

function store(height: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(height))
  } catch {
    // session only
  }
}

function uiScale(): number {
  const host = document.querySelector('.app-scale-host')
  const value = host ? Number.parseFloat(getComputedStyle(host).getPropertyValue('--ui-scale')) : 1
  return Number.isFinite(value) && value > 0 ? value : 1
}

/** Drag the top edge of the player bar to change its height. Double-click resets it. */
export default function TransportResizeHandle() {
  const heightRef = useRef(TRANSPORT_HEIGHT_DEFAULT)

  useEffect(() => {
    heightRef.current = readStored()
    apply(heightRef.current)
  }, [])

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startY = event.clientY
    const startHeight = heightRef.current
    const scale = uiScale()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    document.body.classList.add('is-resizing-transport')
    const onMove = (move: PointerEvent) => {
      heightRef.current = heightFromDrag(startHeight, startY, move.clientY, scale)
      apply(heightRef.current)
    }
    const onUp = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      document.body.classList.remove('is-resizing-transport')
      store(heightRef.current)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }, [])

  const set = (height: number) => {
    heightRef.current = clampTransportHeight(height)
    apply(heightRef.current)
    store(heightRef.current)
  }

  return (
    <div
      className="transport-resize-handle"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize player bar"
      title="Drag to resize the player bar. Double-click to reset."
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => set(TRANSPORT_HEIGHT_DEFAULT)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          set(heightRef.current + TRANSPORT_HEIGHT_KEY_STEP)
        } else if (event.key === 'ArrowDown') {
          event.preventDefault()
          set(heightRef.current - TRANSPORT_HEIGHT_KEY_STEP)
        }
      }}
    />
  )
}
