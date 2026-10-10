import { useEffect, useMemo } from 'react'
import { audioEngine } from '../../audio/AudioEngine'
import { FrameScheduler } from '../../audio/visualizers/frameScheduler'
import { usePresence } from '../../hooks/usePresence'
import { useSpectrogramExpandStore } from '../../stores/spectrogramExpandStore'
import { useThemeStore } from '../../stores/themeStore'
import { useVisualizerSettingsStore } from '../../stores/visualizerSettingsStore'
import { DockedSpectrogramTile } from '../visualizers/VisualizerPanel'

/**
 * The spectrogram stretched into a tall panel down the right edge, from the title bar to the player bar.
 * Time runs down the panel (newest at the top), frequency runs across. Opened by clicking the spectrogram
 * in the analyzer row; the small docked copy steps aside while this is open.
 */
export default function ExpandedSpectrogramPanel() {
  const open = useSpectrogramExpandStore((s) => s.open)
  const setOpen = useSpectrogramExpandStore((s) => s.setOpen)
  const presence = usePresence(open)
  const frameScheduler = useMemo(() => new FrameScheduler(), [])
  const lineColor = useVisualizerSettingsStore((s) => s.lineColor)
  const fftSize = useVisualizerSettingsStore((s) => s.spectrogramFftSize)
  const scrollSpeed = useVisualizerSettingsStore((s) => s.spectrogramScrollSpeed)
  const clarityMode = useVisualizerSettingsStore((s) => s.spectrogramClarityMode)
  const rangeMode = useVisualizerSettingsStore((s) => s.spectrogramRangeMode)
  const scaleMode = useVisualizerSettingsStore((s) => s.spectrogramScaleMode)
  const tiltDbPerOctave = useVisualizerSettingsStore((s) => s.spectrogramTiltDbPerOctave)
  const contrast = useVisualizerSettingsStore((s) => s.spectrogramContrast)
  const isRunning = useVisualizerSettingsStore((s) => s.isRunning)
  const theme = useThemeStore((s) => s.resolvedTokens)
  const displayColors = useMemo(() => ({
    backgroundColor: theme.stageBg,
    gridColor: theme.stageGrid,
    gridMutedColor: theme.isLight ? 'rgba(15, 23, 42, 0.07)' : 'rgba(255, 255, 255, 0.04)',
    labelColor: theme.stageTextMuted,
    phaseRiskColor: theme.stageWarning,
    meterTickColor: theme.stageGrid,
    meterTextColor: theme.stageText,
  }), [theme])

  useEffect(() => {
    if (!open) return
    audioEngine.setVisualizerConsumerDemand('spectrogram-expanded', { spectrogram: isRunning })
    return () => audioEngine.clearVisualizerConsumerDemand('spectrogram-expanded')
  }, [open, isRunning])

  if (!presence.shouldRender) return null
  return (
    <aside
      className="spectrogram-expanded"
      data-presence={presence.phase}
      aria-label="Spectrogram"
      aria-hidden={presence.phase === 'exiting'}
    >
      <div className="spectrogram-expanded-head">
        <span>Spectrogram</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close spectrogram panel" title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div className="spectrogram-expanded-body">
        <DockedSpectrogramTile
          frameScheduler={frameScheduler}
          lineColor={lineColor}
          displayColors={displayColors}
          fftSize={fftSize}
          scrollSpeed={scrollSpeed}
          clarityMode={clarityMode}
          rangeMode={rangeMode}
          scaleMode={scaleMode}
          tiltDbPerOctave={tiltDbPerOctave}
          contrast={contrast}
          orientation="vertical"
          isRunning={open && isRunning}
        />
      </div>
    </aside>
  )
}
