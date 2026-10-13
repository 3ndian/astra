import { create } from 'zustand'

const KEY = 'astra.appIcon.v1'

export const DEFAULT_ICON_BACKGROUND = '#05070a'

export type IconColorMode = 'accent' | 'original'

interface PersistedIcon {
  svg: string | null
  fileName: string | null
  bgColor: string
  colorMode: IconColorMode
  scale: number
  /** False = never touch the Dock icon; macOS keeps the icon set via Get Info. */
  dynamicDockIcon: boolean
}

interface AppIconState extends PersistedIcon {
  setSvg: (svg: string, fileName: string) => void
  clearSvg: () => void
  setBgColor: (color: string) => void
  resetBgColor: () => void
  setColorMode: (mode: IconColorMode) => void
  setScale: (scale: number) => void
  setDynamicDockIcon: (enabled: boolean) => void
}

const DEFAULTS: PersistedIcon = {
  svg: null,
  fileName: null,
  bgColor: DEFAULT_ICON_BACKGROUND,
  colorMode: 'accent',
  scale: 0.62,
  dynamicDockIcon: true,
}

function read(): PersistedIcon {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PersistedIcon>
    return {
      svg: typeof parsed.svg === 'string' ? parsed.svg : null,
      fileName: typeof parsed.fileName === 'string' ? parsed.fileName : null,
      bgColor: typeof parsed.bgColor === 'string' && /^#[0-9a-f]{6}$/i.test(parsed.bgColor)
        ? parsed.bgColor : DEFAULTS.bgColor,
      colorMode: parsed.colorMode === 'original' ? 'original' : 'accent',
      scale: typeof parsed.scale === 'number' && parsed.scale >= 0.2 && parsed.scale <= 1
        ? parsed.scale : DEFAULTS.scale,
      dynamicDockIcon: parsed.dynamicDockIcon !== false,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function persist(state: PersistedIcon): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      svg: state.svg,
      fileName: state.fileName,
      bgColor: state.bgColor,
      colorMode: state.colorMode,
      scale: state.scale,
      dynamicDockIcon: state.dynamicDockIcon,
    }))
  } catch { /* kept for this session only */ }
}

export const useAppIconStore = create<AppIconState>((set, get) => ({
  ...read(),
  setSvg: (svg, fileName) => { set({ svg, fileName }); persist(get()) },
  clearSvg: () => { set({ svg: null, fileName: null }); persist(get()) },
  setBgColor: (bgColor) => { set({ bgColor }); persist(get()) },
  resetBgColor: () => { set({ bgColor: DEFAULT_ICON_BACKGROUND }); persist(get()) },
  setColorMode: (colorMode) => { set({ colorMode }); persist(get()) },
  setDynamicDockIcon: (dynamicDockIcon) => { set({ dynamicDockIcon }); persist(get()) },
  setScale: (scale) => { set({ scale: Math.max(0.2, Math.min(1, scale)) }); persist(get()) },
}))
