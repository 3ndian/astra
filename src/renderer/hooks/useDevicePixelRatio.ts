import { useEffect, useState } from 'react'
import { subscribeDevicePixelRatio } from '../utils/devicePixelRatioWatch'

/** The window's current pixel density, updating when it moves to a different display. */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1))
  useEffect(() => {
    setDpr(window.devicePixelRatio || 1)
    return subscribeDevicePixelRatio(setDpr)
  }, [])
  return dpr
}
