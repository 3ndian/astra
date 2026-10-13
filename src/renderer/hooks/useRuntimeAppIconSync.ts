import { useEffect, useRef } from 'react'
import {
  ASTRA_APP_ICON_SQUIRCLE_INSET_RATIO,
  ASTRA_APP_ICON_SQUIRCLE_RADIUS_RATIO,
  ASTRA_APP_ICON_SYMBOL_SCALE,
  renderAstraLogoPngDataUrl,
} from '../components/icons/astraLogoShared'
import { useAppIconStore } from '../stores/appIconStore'
import { renderCustomIconPngDataUrl } from '../utils/customIconSvg'
import { deriveAccentHue, deriveAccentSaturationScale, useThemeStore } from '../stores/themeStore'

const ICON_SYNC_DEBOUNCE_MS = 140
const ICON_RENDER_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024] as const

interface RuntimeIconImageSetPayload {
  images: Array<{
    size: number
    dataUrl: string
  }>
}

// `saturationScale` is 0 for grey accents so the icon goes grey instead of
// taking hue 0's red, matching the in-app logo (see --accent-sat-scale).
interface CustomIconConfig {
  svg: string | null
  bgColor: string
  colorMode: 'accent' | 'original'
  scale: number
}

async function renderRuntimeIconImageSet(
  hue: number,
  saturationScale: number,
  custom: CustomIconConfig
): Promise<RuntimeIconImageSetPayload | null> {
  const mainFill = `hsl(${hue} ${100 * saturationScale}% 50%)`
  if (custom.svg) {
    const customSvg = custom.svg
    const customImages = await Promise.all(ICON_RENDER_SIZES.map(async (size) => {
      const dataUrl = await renderCustomIconPngDataUrl({
        sanitizedSvg: customSvg,
        fill: custom.colorMode === 'accent' ? mainFill : null,
        background: custom.bgColor,
        scale: custom.scale,
      }, size)
      return dataUrl ? { size, dataUrl } : null
    }))
    if (customImages.some((image) => image === null)) return null
    return { images: customImages as RuntimeIconImageSetPayload['images'] }
  }
  const images = await Promise.all(ICON_RENDER_SIZES.map(async (size) => {
    const dataUrl = await renderAstraLogoPngDataUrl({
      includeBackground: false,
      backgroundMode: 'squircle',
      symbolScale: ASTRA_APP_ICON_SYMBOL_SCALE,
      squircleInsetRatio: ASTRA_APP_ICON_SQUIRCLE_INSET_RATIO,
      squircleRadiusRatio: ASTRA_APP_ICON_SQUIRCLE_RADIUS_RATIO,
      backgroundFill: custom.bgColor,
      mainFill,
      shadowFill: `hsl(${hue} ${40 * saturationScale}% 14%)`,
    }, size)
    return dataUrl ? { size, dataUrl } : null
  }))

  if (images.some((image) => image === null)) return null
  return { images: images as RuntimeIconImageSetPayload['images'] }
}

function createRuntimeIconImageSetKey(payload: RuntimeIconImageSetPayload): string {
  return payload.images
    .map((image) => `${image.size}:${image.dataUrl}`)
    .join('|')
}

export function useRuntimeAppIconSync(): void {
  const accent = useThemeStore((state) => state.resolvedTokens.accent)
  const iconSvg = useAppIconStore((state) => state.svg)
  const iconBg = useAppIconStore((state) => state.bgColor)
  const iconColorMode = useAppIconStore((state) => state.colorMode)
  const iconScale = useAppIconStore((state) => state.scale)
  const dynamicDockIcon = useAppIconStore((state) => state.dynamicDockIcon)
  const timeoutRef = useRef<number | null>(null)
  const lastPayloadKeyRef = useRef<string | null>(null)
  const requestTokenRef = useRef(0)

  useEffect(() => {
    requestTokenRef.current += 1
    const requestToken = requestTokenRef.current
    const syncRuntimeIcon = window.electronAPI?.theme?.setRuntimeIconDataUrl
    if (typeof syncRuntimeIcon !== 'function') return
    // Leave the Dock icon alone so the icon chosen in Finder's Get Info stays.
    if (!dynamicDockIcon) return

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null
      void (async () => {
        const payload = await renderRuntimeIconImageSet(deriveAccentHue(accent), deriveAccentSaturationScale(accent), {
          svg: iconSvg, bgColor: iconBg, colorMode: iconColorMode, scale: iconScale,
        })
        if (!payload) return
        if (requestTokenRef.current !== requestToken) return

        const payloadKey = createRuntimeIconImageSetKey(payload)
        if (lastPayloadKeyRef.current === payloadKey) return
        lastPayloadKeyRef.current = payloadKey

        try {
          syncRuntimeIcon(payload)
        } catch {
          // Ignore runtime icon sync failures and keep renderer responsive.
        }
      })()
    }, ICON_SYNC_DEBOUNCE_MS)

    return () => {
      requestTokenRef.current += 1
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [accent, iconSvg, iconBg, iconColorMode, iconScale, dynamicDockIcon])
}
