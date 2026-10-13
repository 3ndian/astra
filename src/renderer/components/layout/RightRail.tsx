import type { ReactNode } from 'react'
import { useInfoSidebarTabStore } from '../../stores/infoSidebarTabStore'
import { useLyricsPopoutStore } from '../../stores/lyricsPopoutStore'
import { useQueueTabStore } from '../../stores/queueTabStore'
import { useRightRailStore } from '../../stores/rightRailStore'
import { useSpectrogramExpandStore } from '../../stores/spectrogramExpandStore'
import { useUIStore } from '../../stores/uiStore'

interface RailItem {
  id: string
  label: string
  active: boolean
  onClick: () => void
  icon: ReactNode
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true
}

/**
 * A slim icon strip down the right edge, the mirror of the left side: one tap opens Queue, History,
 * Track info, Lyrics or the Spectrogram, and a tap on a lit icon closes it again.
 */
export default function RightRail() {
  const collapsed = useRightRailStore((s) => s.collapsed)
  const setCollapsed = useRightRailStore((s) => s.setCollapsed)
  const showQueue = useUIStore((s) => s.showQueue)
  const showInfoSidebar = useUIStore((s) => s.showInfoSidebar)
  const showLyricsShelf = useUIStore((s) => s.showLyricsShelf)
  const toggleQueue = useUIStore((s) => s.toggleQueue)
  const toggleInfoSidebar = useUIStore((s) => s.toggleInfoSidebar)
  const toggleLyricsShelf = useUIStore((s) => s.toggleLyricsShelf)
  const closeLyricsShelf = useUIStore((s) => s.closeLyricsShelf)
  const lyricsPopoutIsOpen = useLyricsPopoutStore((s) => s.windowState.isOpen)
  const handleLyricsToggle = () => {
    if (showLyricsShelf && lyricsPopoutIsOpen) {
      void window.electronAPI.lyricsPopout.close()
      closeLyricsShelf()
      return
    }
    toggleLyricsShelf()
  }
  const infoTab = useInfoSidebarTabStore((s) => s.tab)
  const setInfoTab = useInfoSidebarTabStore((s) => s.setTab)
  const setCoverHidden = useInfoSidebarTabStore((s) => s.setCoverHidden)
  const lyricsInPanelActive = showInfoSidebar && infoTab === 'lyrics'
  const handleLyricsInPanel = () => {
    if (lyricsInPanelActive) { toggleInfoSidebar(); return }
    // Straight to the lyrics with the cover out of the way; the eye icon in the panel brings it back.
    setInfoTab('lyrics')
    setCoverHidden(true)
    if (!showInfoSidebar) toggleInfoSidebar()
  }
  const queueTab = useQueueTabStore((s) => s.tab)
  const setQueueTab = useQueueTabStore((s) => s.setTab)
  const spectrogramOpen = useSpectrogramExpandStore((s) => s.open)
  const toggleSpectrogram = useSpectrogramExpandStore((s) => s.toggle)

  const openQueueOn = (tab: 'queue' | 'history') => {
    if (showQueue && queueTab === tab) {
      toggleQueue()
      return
    }
    setQueueTab(tab)
    if (!showQueue) toggleQueue()
  }

  const items: RailItem[] = [
    {
      id: 'queue',
      label: 'Queue',
      active: showQueue && queueTab === 'queue',
      onClick: () => openQueueOn('queue'),
      icon: (
        <svg {...iconProps}>
          <path d="M4 6h11M4 11h11M4 16h7" />
          <path d="M18 9v8" />
          <circle cx="16" cy="17" r="2" />
        </svg>
      )
    },
    {
      id: 'history',
      label: 'History',
      active: showQueue && queueTab === 'history',
      onClick: () => openQueueOn('history'),
      icon: (
        <svg {...iconProps}>
          <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
          <path d="M3.5 4.5v4h4" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      )
    },
    {
      id: 'info',
      label: 'Track info',
      active: showInfoSidebar && infoTab !== 'lyrics',
      onClick: () => {
        if (showInfoSidebar && infoTab !== 'lyrics') { toggleInfoSidebar(); return }
        setInfoTab('info')
        if (!showInfoSidebar) toggleInfoSidebar()
      },
      icon: (
        <svg {...iconProps}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 11v5" />
          <path d="M12 7.8v.1" />
        </svg>
      )
    },
    {
      id: 'lyrics-panel',
      label: 'Lyrics',
      active: lyricsInPanelActive,
      onClick: handleLyricsInPanel,
      icon: (
        <svg {...iconProps}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
          <path d="M12 18v3M9 21h6" />
        </svg>
      )
    },
    {
      id: 'lyrics',
      label: 'Lyrics shelf',
      active: showLyricsShelf,
      onClick: handleLyricsToggle,
      icon: (
        <svg {...iconProps}>
          <path d="M4 7h16M4 12h12M4 17h9" />
        </svg>
      )
    },
    {
      id: 'spectrogram',
      label: 'Spectrogram',
      active: spectrogramOpen,
      onClick: toggleSpectrogram,
      icon: (
        <svg {...iconProps}>
          <path d="M5 18v-4M9 18V8M13 18v-7M17 18V5M21 18v-3" />
        </svg>
      )
    }
  ]

  if (collapsed) {
    return (
      <nav className="right-rail is-collapsed" aria-label="Side panels">
        <button type="button" className="right-rail-toggle" onClick={() => setCollapsed(false)} aria-label="Show the side panel icons" data-label="Show icons">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
      </nav>
    )
  }

  return (
    <nav className="right-rail" aria-label="Side panels">
      <div className="right-rail-items">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`right-rail-btn${item.active ? ' is-active' : ''}`}
            onClick={item.onClick}
            aria-pressed={item.active}
            aria-label={item.label}
            data-label={item.label}
            data-track-drop-queue-toggle={item.id === 'queue' ? '' : undefined}
          >
            {item.icon}
          </button>
        ))}
      </div>
      <button type="button" className="right-rail-toggle" onClick={() => setCollapsed(true)} aria-label="Hide the side panel icons" data-label="Hide icons">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>
    </nav>
  )
}
