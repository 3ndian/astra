import { useEffect } from 'react'

/**
 * While `active`, a press outside the element matched by `insideSelector` only dismisses it: the press is swallowed
 * so it does not also click, select or play whatever was underneath.
 */
export function useOutsideDismiss(active: boolean, onDismiss: () => void, insideSelector: string): void {
  useEffect(() => {
    if (!active) return
    let swallowClickUntil = 0
    const outside = (event: Event): boolean => {
      const target = event.target as Element | null
      return !(target && typeof target.closest === 'function' && target.closest(insideSelector))
    }
    const onPointerDown = (event: Event): void => {
      if (!outside(event)) return
      swallowClickUntil = performance.now() + 600
      event.stopPropagation()
      event.preventDefault()
      onDismiss()
    }
    const swallow = (event: Event): void => {
      if (performance.now() > swallowClickUntil || !outside(event)) return
      event.stopPropagation()
      event.preventDefault()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('mousedown', swallow, true)
    document.addEventListener('mouseup', swallow, true)
    document.addEventListener('click', swallow, true)
    document.addEventListener('dblclick', swallow, true)
    document.addEventListener('contextmenu', swallow, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('mousedown', swallow, true)
      document.removeEventListener('mouseup', swallow, true)
      document.removeEventListener('click', swallow, true)
      document.removeEventListener('dblclick', swallow, true)
      document.removeEventListener('contextmenu', swallow, true)
    }
  }, [active, onDismiss, insideSelector])
}
