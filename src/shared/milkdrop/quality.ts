// Render quality and frame-rate cap for the Milkdrop visual.

export type Quality = 'low' | 'medium' | 'high'
export type FpsCap = 30 | 60

export const QUALITY_CHOICES: { id: Quality; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' }
]
export const FPS_CAP_CHOICES: FpsCap[] = [30, 60]

/**
 * Multiplier from CSS pixels to canvas pixels. Low renders at half size (a quarter of the
 * pixels), medium at 1x, high at the display's density up to 2x.
 */
export function qualityScale(quality: Quality, devicePixelRatio: number): number {
  switch (quality) {
    case 'low':
      return 0.5
    case 'medium':
      return 1
    case 'high':
      return Math.min(Math.max(devicePixelRatio, 1), 2)
  }
}

export function sanitizeQuality(raw: unknown): Quality {
  return raw === 'low' || raw === 'high' ? raw : 'medium'
}

export function sanitizeFpsCap(raw: unknown): FpsCap {
  return raw === 30 ? 30 : 60
}
