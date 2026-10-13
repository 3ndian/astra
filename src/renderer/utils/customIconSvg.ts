import {
  ASTRA_APP_ICON_SQUIRCLE_INSET_RATIO,
  ASTRA_APP_ICON_SQUIRCLE_RADIUS_RATIO,
} from '../components/icons/astraLogoShared'

export const MAX_ICON_SVG_BYTES = 512 * 1024

const SHAPE_SELECTOR = 'path,rect,circle,ellipse,polygon,polyline,line,text,tspan'
const DROP_SELECTOR = 'script,foreignObject,image,style,iframe,object,embed,audio,video,a,animate,set,animateTransform,animateMotion'

/**
 * Parses an SVG file's text into a safe, self-contained SVG string, or returns
 * null if it isn't usable. Scripts, external references, styles and event
 * handlers are stripped; only drawing shapes remain.
 */
export function sanitizeIconSvg(source: string): string | null {
  if (source.length > MAX_ICON_SVG_BYTES) return null
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null

  root.querySelectorAll(DROP_SELECTOR).forEach((el) => el.remove())
  const all = [root, ...Array.from(root.querySelectorAll('*'))]
  for (const el of all) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim().toLowerCase()
      if (name.startsWith('on') || name === 'href' || name === 'xlink:href' || name === 'style') {
        // Internal refs like #gradient are kept for gradients/clips; anything external is dropped.
        if ((name === 'href' || name === 'xlink:href') && value.startsWith('#')) continue
        el.removeAttribute(attr.name)
      } else if (value.includes('url(') && !/url\(\s*['"]?#/.test(value)) {
        el.removeAttribute(attr.name)
      }
    }
  }
  if (!root.querySelector(SHAPE_SELECTOR)) return null
  return new XMLSerializer().serializeToString(root)
}

function resolveViewBox(root: Element): string {
  const viewBox = root.getAttribute('viewBox')
  if (viewBox && viewBox.trim().split(/[\s,]+/).length === 4) return viewBox.trim().replace(/,/g, ' ')
  const width = parseFloat(root.getAttribute('width') ?? '')
  const height = parseFloat(root.getAttribute('height') ?? '')
  if (width > 0 && height > 0) return `0 0 ${width} ${height}`
  return '0 0 100 100'
}

/** Builds a square 1024 SVG, recolouring shapes with `fill` unless it is null. */
export function prepareIconSvg(sanitized: string, fill: string | null): string | null {
  const doc = new DOMParser().parseFromString(sanitized, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.nodeName.toLowerCase() !== 'svg') return null

  const viewBox = resolveViewBox(root)
  root.setAttribute('viewBox', viewBox)
  root.setAttribute('width', '1024')
  root.setAttribute('height', '1024')
  root.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  if (fill) {
    if (root.getAttribute('fill') !== 'none') root.setAttribute('fill', fill)
    root.querySelectorAll(SHAPE_SELECTOR).forEach((el) => {
      if (el.getAttribute('fill') !== 'none') el.setAttribute('fill', fill)
      const stroke = el.getAttribute('stroke')
      if (stroke && stroke !== 'none') el.setAttribute('stroke', fill)
    })
    const rootStroke = root.getAttribute('stroke')
    if (rootStroke && rootStroke !== 'none') root.setAttribute('stroke', fill)
  }
  return new XMLSerializer().serializeToString(root)
}

export interface CustomIconRenderOptions {
  sanitizedSvg: string
  /** Accent colour for recolouring, or null to keep the SVG's own colours. */
  fill: string | null
  background: string
  scale: number
}

export async function renderCustomIconPngDataUrl(
  options: CustomIconRenderOptions,
  size: number
): Promise<string | null> {
  const prepared = prepareIconSvg(options.sanitizedSvg, options.fill)
  if (!prepared) return null
  const dimension = Math.max(16, Math.min(2048, Math.round(size)))
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(prepared)}`

  return new Promise((resolve) => {
    const image = new Image()
    image.decoding = 'sync'
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = dimension
      canvas.height = dimension
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(null); return }

      const inset = Math.round(dimension * ASTRA_APP_ICON_SQUIRCLE_INSET_RATIO)
      const box = Math.max(1, dimension - inset * 2)
      const radius = Math.round(box * ASTRA_APP_ICON_SQUIRCLE_RADIUS_RATIO)
      ctx.beginPath()
      ctx.roundRect(inset, inset, box, box, radius)
      ctx.fillStyle = options.background
      ctx.fill()

      const symbol = box * Math.max(0.2, Math.min(1, options.scale))
      const offset = inset + (box - symbol) / 2
      ctx.drawImage(image, offset, offset, symbol, symbol)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => resolve(null)
    image.src = dataUrl
  })
}
