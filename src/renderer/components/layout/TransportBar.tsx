import { useEffect, useState, useRef, useCallback } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import TransportResizeHandle from './TransportResizeHandle'
import { usePlayerStore } from '../../stores/playerStore'
import { useUIStore } from '../../stores/uiStore'
import { useEQStore } from '../../stores/eqStore'
import { useLibraryStore } from '../../stores/libraryStore'
import {
  BIT_PERFECT_DSP_DISABLED_MESSAGE,
  resolveOutputDeviceLabel,
  useAudioSettingsStore
} from '../../stores/audioSettingsStore'
import { useOpenArtistInLibrary } from '../../hooks/useOpenArtistInLibrary'
import { useOpenAlbumInLibrary } from '../../hooks/useOpenAlbumInLibrary'
import { useJumpToNowPlaying } from '../../hooks/useJumpToNowPlaying'
import { usePlaybackClock } from '../../hooks/usePlaybackClock'
import { audioEngine } from '../../audio/AudioEngine'
import { describeSavedPitch, useSavedPitchStore } from '../../stores/savedPitchStore'
import { PITCH_ENGINES, PITCH_ENGINE_ORDER, type PitchEngineId } from '../../audio/pitchEngines'
import AlbumArtwork from '../library/AlbumArtwork'
import ArtistNameLinks from '../library/ArtistNameLinks'
import WaveformSeekBar from '../player/WaveformSeekBar'
import VolumeControl from '../player/VolumeControl'
import EQPopover from '../eq/EQPopover'
import { usePresence } from '../../hooks/usePresence'
import EQResponsePreview from '../eq/EQResponsePreview'
import AudioPipelineShelf from './AudioPipelineShelf'
import TransportLyricsShelf from './TransportLyricsShelf'
import OutputDevicePicker, { OPEN_OUTPUT_PICKER_EVENT } from './OutputDevicePicker'
import AudiobookControls from './AudiobookControls'
import { useParallaxStore } from '../../stores/parallaxStore'
import { resolveTransportInfoLine } from '../../utils/transportInfoLine'
import type { MiniPlayerWindowState } from '../../../types/miniPlayer'
import { useMilkdropBackgroundStore } from '../../stores/milkdropBackgroundStore'

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function TransportWaveformSection({
  loadingLabel,
  loadingPercent
}: {
  loadingLabel: string | null
  loadingPercent: number | null
}) {
  const waveformData = usePlayerStore((s) => s.waveformData)
  const waveformBufferedRatio = usePlayerStore((s) => s.waveformBufferedRatio)
  const waveformAnalyzedRatio = usePlayerStore((s) => s.waveformAnalyzedRatio)
  const remoteBufferedSeconds = usePlayerStore((s) => s.remoteBufferedSeconds)
  // 30Hz keeps the waveform playhead visually smooth without re-rendering
  // the transport section at display refresh rate.
  const currentTime = usePlaybackClock(1 / 30)
  const duration = usePlayerStore((s) => s.duration)
  const seek = usePlayerStore((s) => s.seek)
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const effectiveDelayMs = useAudioSettingsStore((s) => s.effectiveDelayMs)
  const waveformTimeDisplayMode = useUIStore((s) => s.waveformTimeDisplayMode)
  const toggleWaveformTimeDisplayMode = useUIStore((s) => s.toggleWaveformTimeDisplayMode)

  const effectiveDelaySec = Math.max(0, effectiveDelayMs / 1000)
  const compensatedTime = duration > 0
    ? Math.max(0, Math.min(duration, currentTime - effectiveDelaySec))
    : 0
  const progress = duration > 0 ? (compensatedTime / duration) * 100 : 0
  const remaining = duration > 0 ? duration - compensatedTime : 0
  const showingRemainingTime = waveformTimeDisplayMode === 'remaining'
  const rightTimeLabel = showingRemainingTime ? `-${formatTime(remaining)}` : formatTime(duration)
  const rightTimeToggleLabel = showingRemainingTime ? 'Show track duration' : 'Show remaining time'

  return (
    <div className="transport-waveform-wrap">
      <span className="waveform-time waveform-time-current">{formatTime(compensatedTime)}</span>
      <button
        type="button"
        className="waveform-time waveform-time-remaining waveform-time-toggle"
        onClick={toggleWaveformTimeDisplayMode}
        aria-label={rightTimeToggleLabel}
        title={rightTimeToggleLabel}
      >
        {rightTimeLabel}
      </button>
      <WaveformSeekBar
        waveformData={waveformData}
        waveformKey={currentTrack?.path ?? null}
        progress={progress}
        duration={duration}
        currentTime={compensatedTime}
        bufferedRatio={waveformBufferedRatio}
        analyzedRatio={waveformAnalyzedRatio}
        seekableDuration={currentTrack?.sourceType && currentTrack.sourceType !== 'local' ? remoteBufferedSeconds : duration}
        onSeek={(time) => {
          const rawSeekTime = Math.max(0, Math.min(duration, time + effectiveDelaySec))
          void seek(rawSeekTime)
        }}
      />
      {loadingLabel && (
        <div className="transport-loading-hint" role="status" aria-live="polite">
          <span className="transport-loading-hint-label">{loadingLabel}</span>
          <span
            className={`transport-loading-hint-bar ${loadingPercent === null ? 'indeterminate' : ''}`}
            aria-hidden="true"
          >
            <span
              className="transport-loading-hint-fill"
              style={loadingPercent === null ? undefined : { width: `${Math.round(loadingPercent * 100)}%` }}
            />
          </span>
        </div>
      )}
    </div>
  )
}

export default function TransportBar() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playbackState = usePlayerStore((s) => s.playbackState)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const playNext = usePlayerStore((s) => s.playNext)
  const playPrevious = usePlayerStore((s) => s.playPrevious)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat)
  const playbackRate = usePlayerStore((s) => s.playbackRate)
  const pitchLock = usePlayerStore((s) => s.pitchLock)
  const resetPlaybackRate = usePlayerStore((s) => s.resetPlaybackRate)
  const setPlaybackRateTo = usePlayerStore((s) => s.setPlaybackRateTo)
  const pitchShift = usePlayerStore((s) => s.pitchShift)
  const resetPitchShift = usePlayerStore((s) => s.resetPitchShift)
  const setPitchShiftTo = usePlayerStore((s) => s.setPitchShiftTo)
  const stereoMode = usePlayerStore((s) => s.stereoMode)
  const [pitchEngine, setPitchEngineLabelId] = useState<PitchEngineId>(() => audioEngine.getPitchEngine())
  useEffect(() => {
    const sync = (): void => setPitchEngineLabelId(audioEngine.getPitchEngine())
    sync()
    const off = audioEngine.on('stateChange', sync)
    return () => off?.()
  }, [])
  const cyclePitchEngine = (): void => {
    const next = PITCH_ENGINE_ORDER[(PITCH_ENGINE_ORDER.indexOf(audioEngine.getPitchEngine()) + 1) % PITCH_ENGINE_ORDER.length]
    audioEngine.setPitchEngine(next)
    setPitchEngineLabelId(audioEngine.getPitchEngine())
  }
  const cycleStereoMode = usePlayerStore((s) => s.cycleStereoMode)
  const speedDragRef = useRef<{ startX: number; startRate: number; moved: boolean } | null>(null)
  const handleSpeedPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    speedDragRef.current = { startX: event.clientX, startRate: usePlayerStore.getState().playbackRate, moved: false }
  }
  const handleSpeedPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = speedDragRef.current
    if (!drag) return
    const dx = event.clientX - drag.startX
    if (!drag.moved && Math.abs(dx) < 3) return
    drag.moved = true
    if (noteShuttleBlocked()) return
    setShuttleNote(null)
    // 200 px of drag is one whole 1x; hold Shift for ten times finer.
    setPlaybackRateTo(drag.startRate + dx * (event.shiftKey ? 0.0005 : 0.005))
  }
  const handleSpeedPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = speedDragRef.current
    speedDragRef.current = null
    if (!drag) return
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* ignore */ }
    if (!drag.moved && event.type === 'pointerup') resetPlaybackRate()
  }
  const currentTrackPath = usePlayerStore((s) => s.currentTrack?.path ?? null)
  const savedPitches = useSavedPitchStore((s) => (currentTrackPath ? s.byTrack[currentTrackPath] : undefined))
  const saveCurrentPitch = useSavedPitchStore((s) => s.saveCurrent)
  const removeSavedPitch = useSavedPitchStore((s) => s.remove)
  const applySavedPitch = useSavedPitchStore((s) => s.apply)
  const bypassedPitch = useSavedPitchStore((s) => s.bypassed)
  const toggleOriginalPitch = useSavedPitchStore((s) => s.toggleOriginal)
  const [shuttleNote, setShuttleNote] = useState<string | null>(null)
  const noteShuttleBlocked = (): boolean => {
    const reason = audioEngine.getShuttleBlockReason()
    setShuttleNote(reason)
    return reason !== null
  }
  const pitchDragRef = useRef<{ startX: number; startPitch: number; moved: boolean } | null>(null)
  const handlePitchPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pitchDragRef.current = { startX: event.clientX, startPitch: usePlayerStore.getState().pitchShift, moved: false }
  }
  const handlePitchPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = pitchDragRef.current
    if (!drag) return
    const dx = event.clientX - drag.startX
    if (!drag.moved && Math.abs(dx) < 3) return
    drag.moved = true
    if (noteShuttleBlocked()) return
    setShuttleNote(null)
    // 200 px of drag is one whole 1x; hold Shift for ten times finer.
    setPitchShiftTo(drag.startPitch + dx * (event.shiftKey ? 0.0005 : 0.005))
  }
  const handlePitchPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = pitchDragRef.current
    pitchDragRef.current = null
    if (!drag) return
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* ignore */ }
    if (!drag.moved && event.type === 'pointerup') resetPitchShift()
  }
  const togglePitchLock = usePlayerStore((s) => s.togglePitchLock)
  const remoteLoadProgress = usePlayerStore((s) => s.remoteLoadProgress)
  const loadingStatus = usePlayerStore((s) => s.loadingStatus)
  const resolvedQueueLength = usePlayerStore((s) => s.getResolvedQueueLength())

  const {
    showPipelineShelf,
    showLyricsShelf,
    togglePipelineShelf,
    transportInfoLineMode,
    isSidebarExpanded,
    setFullscreen
  } = useUIStore()
  const eqEnabled = useEQStore((s) => s.enabled)
  const favorites = useLibraryStore((s) => s.favorites)
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite)
  const openArtistInLibrary = useOpenArtistInLibrary()
  const openAlbumInLibrary = useOpenAlbumInLibrary()
  const selectedOutputDeviceId = useAudioSettingsStore((s) => s.selectedDeviceId)
  const availableOutputDevices = useAudioSettingsStore((s) => s.availableDevices)
  const normalizationEnabled = useAudioSettingsStore((s) => s.normalizationEnabled)
  const replayGainScanEnabled = useAudioSettingsStore((s) => s.replayGainScanEnabled)
  const playbackOutputMode = useAudioSettingsStore((s) => s.playbackOutputMode)
  const nativeAudioCapabilities = useAudioSettingsStore((s) => s.nativeAudioCapabilities)
  const nativeAudioOutputStatus = useAudioSettingsStore((s) => s.nativeAudioOutputStatus)
  const playbackModeStatusMessage = useAudioSettingsStore((s) => s.playbackModeStatusMessage)
  const parallaxSinkConnected = useParallaxStore((s) => Boolean(s.status?.sink.connected))
  const jumpToNowPlaying = useJumpToNowPlaying()

  const isAssociationTrack = currentTrack?.origin === 'associated-external'
  const isFavorite = currentTrack && !isAssociationTrack ? favorites.has(currentTrack.path) : false

  const [showEQPopover, setShowEQPopover] = useState(false)
  const eqPopoverPresence = usePresence(showEQPopover)
  const milkdropBgOn = useMilkdropBackgroundStore((s) => s.enabled)
  const setMilkdropBgOn = useMilkdropBackgroundStore((s) => s.setEnabled)
  const [readoutExpanded, setReadoutExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem('astra.transport.readoutExpanded.v1') === '1' } catch { return false }
  })
  const toggleReadoutExpanded = useCallback(() => {
    setReadoutExpanded((value) => {
      const next = !value
      try { localStorage.setItem('astra.transport.readoutExpanded.v1', next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }, [])
  const [miniWindowState, setMiniWindowState] = useState<MiniPlayerWindowState>({
    isOpen: false,
    alwaysOnTop: true,
    visualizerMode: 'spectrum'
  })

  // Marquee scroll for long titles
  const titleOuterRef = useRef<HTMLButtonElement>(null)
  const titleInnerRef = useRef<HTMLSpanElement>(null)
  const [titleOverflows, setTitleOverflows] = useState(false)

  const checkTitleOverflow = useCallback(() => {
    const outer = titleOuterRef.current
    const inner = titleInnerRef.current
    if (!outer || !inner) return
    const overflows = inner.scrollWidth > outer.clientWidth
    setTitleOverflows(overflows)
    if (overflows) {
      outer.style.setProperty('--marquee-offset', `${outer.clientWidth - inner.scrollWidth}px`)
    }
  }, [])

  useEffect(() => {
    checkTitleOverflow()
  }, [currentTrack, checkTitleOverflow])

  useEffect(() => {
    const outer = titleOuterRef.current
    if (!outer) return
    const ro = new ResizeObserver(checkTitleOverflow)
    ro.observe(outer)
    return () => ro.disconnect()
  }, [checkTitleOverflow])

  useEffect(() => {
    let isMounted = true

    void window.electronAPI.miniPlayer.getWindowState().then((state) => {
      if (!isMounted) return
      setMiniWindowState(state)
    })

    const unsubscribe = window.electronAPI.miniPlayer.onWindowState((state) => {
      setMiniWindowState(state)
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (playbackOutputMode !== 'bitperfect') return
    if (!showEQPopover) return
    setShowEQPopover(false)
  }, [playbackOutputMode, showEQPopover])

  const bitPerfectModeActive = playbackOutputMode === 'bitperfect'
  const exclusiveDspModeActive = playbackOutputMode === 'exclusive'
  const disabledControlMessage = playbackModeStatusMessage ?? BIT_PERFECT_DSP_DISABLED_MESSAGE
  const eqControlDisabled = bitPerfectModeActive
  const transportControlsLocked = parallaxSinkConnected

  const isPlaying = playbackState === 'playing'
  const isLoadingTrack = playbackState === 'loading'
  const activeRemoteLoadProgress = isLoadingTrack
    && currentTrack
    && remoteLoadProgress
    && remoteLoadProgress.path === currentTrack.path
    ? remoteLoadProgress
    : null
  const loadingPercent = typeof activeRemoteLoadProgress?.percent === 'number'
    ? Math.max(0, Math.min(1, activeRemoteLoadProgress.percent))
    : null
  const loadingLabel = (() => {
    if (!isLoadingTrack || !currentTrack) return null
    if (loadingStatus) return loadingStatus
    if (!activeRemoteLoadProgress) return null
    if (activeRemoteLoadProgress?.stage === 'streaming') {
      const readySeconds = Math.max(0, activeRemoteLoadProgress.bufferedSeconds)
      const readyLabel = formatTime(readySeconds)
      const streamingLabel = currentTrack.sourceType && currentTrack.sourceType !== 'local' ? 'Streaming' : 'Buffering'
      if (loadingPercent !== null) {
        return `${streamingLabel} • ${readyLabel} ready • ${Math.round(loadingPercent * 100)}% downloaded`
      }
      return `${streamingLabel} • ${readyLabel} ready`
    }
    if (loadingPercent !== null) {
      return `Buffering ${Math.round(loadingPercent * 100)}% • ${activeRemoteLoadProgress?.chunkCount ?? 0} chunks`
    }
    if ((activeRemoteLoadProgress?.chunkCount ?? 0) > 0) {
      return `Buffering ${activeRemoteLoadProgress!.chunkCount} chunks`
    }
    return currentTrack.sourceType && currentTrack.sourceType !== 'local'
      ? 'Buffering remote track...'
      : 'Buffering track...'
  })()
  const resolvedChannelCount = currentTrack?.channels ?? null
  const isMultichannel = (resolvedChannelCount ?? 0) > 2
  const currentCodecProfile = currentTrack?.codecProfile?.toLowerCase() ?? ''
  const currentCodec = currentTrack?.codec?.toLowerCase() ?? ''
  const showAtmosBadge = Boolean(
    currentTrack?.isAtmosJoc ||
    currentCodecProfile.includes('atmos') ||
    currentCodecProfile.includes('joc') ||
    currentCodec.includes('atmos') ||
    currentCodec.includes('joc')
  )
  const showEclipsaBadge = Boolean(currentTrack?.isIamf || currentCodec === 'iamf')
  const outputDeviceLabel = (() => {
    return resolveOutputDeviceLabel(selectedOutputDeviceId, availableOutputDevices, {
      defaultRouteFallbackLabel: 'System Default Output',
      selectedFallbackLabel: 'Selected Output'
    }).label
  })()
  const transportInfoLine = resolveTransportInfoLine(
    transportInfoLineMode,
    outputDeviceLabel,
    currentTrack?.album
  )
  const bitPerfectStatusLabel = (() => {
    if (!bitPerfectModeActive || !nativeAudioOutputStatus?.bitPerfectActive) return null

    const backendLabel = (() => {
      switch (nativeAudioCapabilities.activeBackend) {
        case 'coreaudio':
          return 'CoreAudio'
        case 'wasapi-exclusive':
          return 'WASAPI Exclusive'
        case 'alsa-hw':
          return 'ALSA hw'
        default:
          return 'Native Output'
      }
    })()

    const sampleRate = nativeAudioOutputStatus.wireFormat.sampleRate ?? audioEngine.getSampleRate()
    const sampleRateLabel = sampleRate > 0 ? `${(sampleRate / 1000).toFixed(1)} kHz` : 'native rate'
    const exclusivityLabel = nativeAudioOutputStatus.transport ?? 'Native transport'
    return `${backendLabel} • ${sampleRateLabel} • ${exclusivityLabel}`
  })()
  const exclusiveDspStatusLabel = (() => {
    if (!exclusiveDspModeActive || !nativeAudioOutputStatus?.processing.exclusiveActive) return null
    const sampleRate = nativeAudioOutputStatus.processing.targetSampleRate
      ?? nativeAudioOutputStatus.wireFormat.sampleRate
    const rateLabel = sampleRate ? `${(sampleRate / 1000).toFixed(1)} kHz` : 'native rate'
    const resamplerLabel = nativeAudioOutputStatus.processing.resamplingActive ? 'Resampling' : 'Source rate'
    return `${rateLabel} • ${resamplerLabel} • ${nativeAudioOutputStatus.transport ?? 'Native transport'}`
  })()
  const normalizationReadout = (() => {
    if (bitPerfectModeActive) {
      return { value: 'BYP', dim: false, accent: false, off: true }
    }

    const gainMode = audioEngine.getNormalizationMode()
    if (!currentTrack) {
      return { value: '\u2014', dim: true, accent: false, off: false }
    }
    if (!normalizationEnabled) {
      return { value: 'OFF', dim: false, accent: false, off: true }
    }

    const gainDb = audioEngine.getNormalizationGainDb()
    const rounded = Math.round(gainDb * 10) / 10
    const displayDb = Math.abs(rounded) < 0.05 ? 0 : rounded
    const sign = displayDb > 0 ? '+' : ''
    const approxPrefix = audioEngine.isNormalizationApproximate() ? '~' : ''
    return {
      value: `${approxPrefix}${sign}${displayDb.toFixed(1)}dB`,
      dim: false,
      accent: replayGainScanEnabled && gainMode === 'replaygain',
      off: false
    }
  })()

  const transportBarClassName = [
    'transport-bar',
    showPipelineShelf ? 'transport-has-pipeline-open' : '',
    showLyricsShelf ? 'transport-has-lyrics-open' : ''
  ].join(' ').trim()

  return (
    <div
      className={transportBarClassName}
      data-controller-region="true"
      data-controller-region-id="transport"
      data-controller-group="transport-items"
      data-controller-axis="horizontal"
      data-controller-auto-items="true"
    >
      <TransportResizeHandle />
      <button
        className={`pipeline-shelf-toggle${showPipelineShelf ? ' pipeline-shelf-toggle-open' : ''}`}
        onClick={togglePipelineShelf}
        title={showPipelineShelf ? 'Hide audio pipeline' : 'Show audio pipeline'}
        aria-label="Toggle audio pipeline shelf"
      >
        <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
          <path
            d="M1 7l6-5 6 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <AudioPipelineShelf />
      <TransportLyricsShelf />

      {/* Left: Track info */}
      <div className={`transport-info ${isSidebarExpanded ? 'transport-info-aligned' : ''}`.trim()}>
        <div
          className="transport-artwork"
          onClick={() => setFullscreen(true)}
          data-controller-focusable="true"
          tabIndex={-1}
          role="button"
          aria-label="Open fullscreen player"
        >
          {currentTrack?.artworkHash ? (
            <AlbumArtwork hash={currentTrack.artworkHash} alt="Album art" variant="card" />
          ) : currentTrack?.artworkData ? (
            <img src={currentTrack.artworkData} alt="Album art" />
          ) : (
            <div className="artwork-placeholder">&#9835;</div>
          )}
          <div className="transport-artwork-overlay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
            </svg>
          </div>
        </div>
        <div className="transport-text">
          <button
            type="button"
            ref={titleOuterRef}
            className={`now-playing-title now-playing-title-button${titleOverflows ? ' marquee-active' : ''}`}
            onClick={() => {
              void jumpToNowPlaying()
            }}
            disabled={!currentTrack}
            title="Jump to playing (J)"
            aria-label="Jump to playing (J)"
          >
            <span ref={titleInnerRef} className="now-playing-title-inner">
              {currentTrack?.title ?? 'No track playing'}
            </span>
          </button>
          <div className="transport-subline">
            <div className="now-playing-artist">
              {currentTrack?.artist?.trim()
                ? (
                  <ArtistNameLinks
                    artistText={currentTrack.artist}
                    artistNames={currentTrack.artistNames}
                    browseArtistText={currentTrack.albumArtist}
                    browseArtistNames={currentTrack.albumArtistNames}
                    onArtistClick={openArtistInLibrary}
                    className="now-playing-artist-links"
                    linkClassName="artist-name-link-inline"
                  />
                )
                : '\u2014'}
            </div>
            {(showAtmosBadge || showEclipsaBadge || isMultichannel) && (
              <div className="transport-audio-badges">
              {showAtmosBadge && (
                  <span
                    className="transport-audio-badge transport-audio-badge-atmos"
                    title="Atmos metadata detected"
                  >
                    ATM
                  </span>
                )}
                {showEclipsaBadge && (
                  <span
                    className="transport-audio-badge transport-audio-badge-eclipsa"
                    title="Eclipsa Audio (IAMF) source, decoded to 7.1.4"
                  >
                    ECL
                  </span>
                )}
                {isMultichannel && (
                  <span
                    className="transport-audio-badge transport-audio-badge-ch"
                    title={`${resolvedChannelCount} channels`}
                  >
                    <span>{resolvedChannelCount}CH</span>
                  </span>
                )}
              </div>
            )}
          </div>
          {transportInfoLine && (
            transportInfoLine.action === 'open-album' && currentTrack ? (
              <button
                type="button"
                className="transport-output-line transport-output-line-button"
                title={transportInfoLine.title}
                aria-label={transportInfoLine.title}
                onClick={() => {
                  void openAlbumInLibrary(
                    currentTrack.album,
                    currentTrack.artist,
                    currentTrack.albumArtist,
                    currentTrack.albumIdentityKey
                  )
                }}
              >
                {transportInfoLine.prefix && (
                  <span className="transport-output-line-prefix">{transportInfoLine.prefix}</span>
                )}
                <span className="transport-output-line-value">{transportInfoLine.value}</span>
              </button>
            ) : transportInfoLineMode === 'output' ? (
              <button
                type="button"
                className="transport-output-line transport-output-line-button"
                title={`${transportInfoLine.title} (click to change output)`}
                aria-label={`Output device: ${transportInfoLine.value}. Change output device`}
                onClick={() => window.dispatchEvent(new Event(OPEN_OUTPUT_PICKER_EVENT))}
              >
                <span className="transport-output-line-prefix">{transportInfoLine.prefix}</span>
                <span className="transport-output-line-value">{transportInfoLine.value}</span>
              </button>
            ) : (
              <div className="transport-output-line" title={transportInfoLine.title}>
                {transportInfoLine.prefix && (
                  <span className="transport-output-line-prefix">{transportInfoLine.prefix}</span>
                )}
                <span className="transport-output-line-value">{transportInfoLine.value}</span>
              </div>
            )
          )}
          {bitPerfectStatusLabel && (
            <div className="transport-output-line" title={disabledControlMessage}>
              <span className="transport-output-line-prefix">BP</span>
              <span className="transport-output-line-value">{bitPerfectStatusLabel}</span>
            </div>
          )}
          {exclusiveDspStatusLabel && (
            <div className="transport-output-line" title="Verified native exclusive ownership with DSP processing active">
              <span className="transport-output-line-prefix">EX</span>
              <span className="transport-output-line-value">{exclusiveDspStatusLabel}</span>
            </div>
          )}
        </div>
        <button
          className={`transport-fav-btn ${isFavorite ? 'active' : ''}`}
          title={isAssociationTrack
            ? 'Unavailable for files opened from your file explorer'
            : isFavorite
              ? 'Remove from favorites'
              : 'Add to favorites'}
          onClick={() => currentTrack && toggleFavorite(currentTrack.path)}
          disabled={!currentTrack || isAssociationTrack}
        >
          {isFavorite ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          )}
        </button>
      </div>

      {/* Center: Controls + Waveform + Volume — single row */}
      <div className="transport-center">
        <div className="transport-controls">
          <button
            className={`control-btn control-btn-shuffle ${shuffle ? 'active' : ''}`}
            aria-label="Shuffle"
            onClick={toggleShuffle}
            disabled={transportControlsLocked}
            title={shuffle ? 'Shuffle on' : 'Shuffle off'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 3h5v5" />
              <path d="M4 20 21 3" />
              <path d="M21 16v5h-5" />
              <path d="M15 15 21 21" />
              <path d="M4 4 9 9" />
            </svg>
          </button>
          <button
            className="control-btn control-btn-skip"
            aria-label="Previous"
            onClick={playPrevious}
            disabled={transportControlsLocked || resolvedQueueLength === 0}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="5" x2="6" y2="19" />
              <polygon points="18,5 8,12 18,19" />
            </svg>
          </button>
          <button
            className={`control-btn control-btn-play ${isLoadingTrack ? 'is-loading' : ''}`.trim()}
            onClick={togglePlay}
            disabled={transportControlsLocked || !currentTrack || isLoadingTrack}
            aria-label={isLoadingTrack ? 'Loading' : isPlaying ? 'Pause' : 'Play'}
            aria-busy={isLoadingTrack}
          >
            {isPlaying || isLoadingTrack ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>
          <button
            className="control-btn control-btn-skip"
            aria-label="Next"
            onClick={playNext}
            disabled={transportControlsLocked || resolvedQueueLength === 0}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="5" x2="18" y2="19" />
              <polygon points="6,5 16,12 6,19" />
            </svg>
          </button>
          <button
            className={`control-btn control-btn-repeat ${repeat !== 'none' ? 'active' : ''}`}
            aria-label="Repeat"
            onClick={toggleRepeat}
            disabled={transportControlsLocked}
            title={repeat === 'none' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
          >
            {repeat === 'one' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7h13a4 4 0 0 1 4 4v1" />
                <polyline points="17 4 20 7 17 10" />
                <path d="M21 17H8a4 4 0 0 1-4-4v-1" />
                <polyline points="7 20 4 17 7 14" />
                <path d="M12 8v8" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7h13a4 4 0 0 1 4 4v1" />
                <polyline points="17 4 20 7 17 10" />
                <path d="M21 17H8a4 4 0 0 1-4-4v-1" />
                <polyline points="7 20 4 17 7 14" />
              </svg>
            )}
          </button>
          <AudiobookControls />
        </div>

        {/* Waveform with floating time labels */}
        <TransportWaveformSection loadingLabel={loadingLabel} loadingPercent={loadingPercent} />

        {/* Output device + volume */}
        <OutputDevicePicker />
        <VolumeControl className="transport-volume" />
      </div>

      {/* Right: EQ + Queue/Info + File readout */}
      <div className="transport-right">
        <div className="transport-speed">
          <button
            type="button"
            className={`transport-speed-value${playbackRate !== 1 ? ' is-changed' : ''}`}
            onPointerDown={handleSpeedPointerDown}
            onPointerMove={handleSpeedPointerMove}
            onPointerUp={handleSpeedPointerUp}
            onPointerCancel={handleSpeedPointerUp}
            title="Playback speed. Drag left or right to change it finely, click for normal. J / L change it by 10%, Shift+J / Shift+L halve or double it."
          >
            {playbackRate.toFixed(2).replace(/0$/, '')}×
          </button>
          {currentTrackPath && (
            <div className="transport-saved-pitches">
              {(playbackRate !== 1 || pitchShift !== 1 || bypassedPitch) && (
                <button
                  type="button"
                  className={`transport-speed-pitch${bypassedPitch && playbackRate === 1 && pitchShift === 1 ? ' is-on' : ''}`}
                  onClick={() => { if (!noteShuttleBlocked()) toggleOriginalPitch() }}
                  title={bypassedPitch && playbackRate === 1 && pitchShift === 1 ? 'Back to your speed and pitch' : 'Play the original speed and pitch. Press again to bring your setting back.'}
                >
                  Original
                </button>
              )}
              <button
                type="button"
                className="transport-speed-pitch"
                disabled={playbackRate === 1 && pitchShift === 1}
                onClick={() => saveCurrentPitch(currentTrackPath)}
                title="Save the current speed and pitch for this song"
              >
                + Save
              </button>
              <button
                type="button"
                className="transport-speed-pitch"
                onClick={() => useUIStore.getState().setActiveView('pitches')}
                title="See every song that has saved speed/pitch settings"
              >
                All saved
              </button>
              {(savedPitches ?? []).map((preset) => {
                const isCurrent = preset.speed === playbackRate && preset.pitch === pitchShift && preset.pitchLock === pitchLock
                return (
                  <span key={preset.id} className={`transport-saved-pitch${isCurrent ? ' is-on' : ''}`}>
                    <button
                      type="button"
                      className="transport-speed-pitch"
                      onClick={() => { if (!noteShuttleBlocked()) applySavedPitch(preset) }}
                      title="Play with these settings"
                    >
                      {describeSavedPitch(preset)}
                    </button>
                    <button
                      type="button"
                      className="transport-saved-pitch-remove"
                      onClick={() => removeSavedPitch(currentTrackPath, preset.id)}
                      title="Delete this saved setting"
                      aria-label="Delete this saved setting"
                    >
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
          )}
          {shuttleNote && <div className="transport-speed-note" role="status">{shuttleNote}</div>}
          <div className="transport-speed-row">
            <button
              type="button"
              className={`transport-speed-pitch${pitchLock ? '' : ' is-on'}`}
              onClick={() => togglePitchLock()}
              aria-pressed={!pitchLock}
              title={pitchLock ? 'Tape is off: the pitch stays the same when the speed changes. Click to turn tape on (pitch follows speed).' : 'Tape is on: pitch follows speed. Click to turn it off and keep the pitch steady.'}
            >
              Tape
            </button>
            <button
              type="button"
              className={`transport-speed-pitch${pitchShift !== 1 ? ' is-on' : ''}`}
              onPointerDown={handlePitchPointerDown}
              onPointerMove={handlePitchPointerMove}
              onPointerUp={handlePitchPointerUp}
              onPointerCancel={handlePitchPointerUp}
              title="Pitch shift. Drag left or right to change it smoothly (hold Shift for finer), click to clear. [ lowers and ] raises it by 10%."
            >
              Pitch {pitchShift.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}×
            </button>
            <button
              type="button"
              className={`transport-speed-pitch${pitchEngine === 'rubberband' ? ' is-on' : ''}`}
              onClick={cyclePitchEngine}
              title={`Pitch quality: ${PITCH_ENGINES[pitchEngine].label}. Click to switch between Smooth, Rubber Band and Simple. Rubber Band needs the rubberband-web package installed; if it is missing the app uses Smooth.`}
            >
              {({ wsola: 'Smooth', rubberband: 'Rubber Band', simple: 'Simple' } as const)[pitchEngine]}
            </button>
            <button
              type="button"
              className={`transport-speed-pitch${stereoMode !== 'stereo' ? ' is-on' : ''}`}
              onClick={() => cycleStereoMode()}
              title="Listen mode: Stereo (normal), Mid (the centre: vocals, kick), Side (the width: reverb, wide synths), or Left / Right on both ears. Shift+M cycles. The visuals keep showing the full mix."
            >
              {({ stereo: 'Stereo', mid: 'Mid', side: 'Side', left: 'L only', right: 'R only' } as const)[stereoMode]}
            </button>
          </div>
        </div>
        <div className="transport-mini-lyrics-stack">
          <button
            className={`transport-mini-btn transport-mini-btn-split-top ${miniWindowState.isOpen ? 'active' : ''} ${miniWindowState.alwaysOnTop ? 'pinned' : ''}`}
            onClick={() => void (miniWindowState.isOpen
              ? window.electronAPI.miniPlayer.close()
              : window.electronAPI.miniPlayer.open())}
            title={miniWindowState.isOpen ? 'Close mini player' : 'Open mini player'}
            aria-label={miniWindowState.isOpen ? 'Close mini player' : 'Open mini player'}
            aria-pressed={miniWindowState.isOpen}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
              <line x1="7" y1="8.5" x2="17" y2="8.5" />
              <line x1="7" y1="12.5" x2="14" y2="12.5" />
            </svg>
          </button>
          <button
            className={`transport-lyrics-btn transport-bgviz-btn ${milkdropBgOn ? 'active' : ''}`}
            onClick={() => setMilkdropBgOn(!milkdropBgOn)}
            title={milkdropBgOn ? 'Turn off background visual (saves GPU and heat)' : 'Turn on background visual'}
            aria-label={milkdropBgOn ? 'Turn off background visual' : 'Turn on background visual'}
            aria-pressed={milkdropBgOn}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12c2.5-6 5-6 7.5 0s5 6 7.5 0" />
              <path d="M3 18c2.5-4 5-4 7.5 0s5 4 7.5 0" opacity="0.55" />
              {!milkdropBgOn && <line x1="4" y1="4" x2="20" y2="20" />}
            </svg>
          </button>
        </div>

        {/* EQ toggle button with mini curve */}
        <button
          className={`transport-eq-btn ${showEQPopover ? 'active' : ''} ${eqEnabled ? 'enabled' : ''}${eqControlDisabled ? ' disabled' : ''}`}
          onClick={eqControlDisabled ? undefined : (() => setShowEQPopover(!showEQPopover))}
          title={eqControlDisabled ? disabledControlMessage : 'Toggle equalizer'}
          disabled={eqControlDisabled}
        >
          <span className="transport-eq-label">EQ</span>
          <EQResponsePreview className="transport-eq-curve" width={56} height={22} showFill={false} />
        </button>

        {/* File info readout — 2x2 grid */}
        {readoutExpanded ? (
          <div
            className="transport-file-readout"
            role="button"
            tabIndex={0}
            title="Click to shrink"
            onClick={() => toggleReadoutExpanded()}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleReadoutExpanded() } }}
          >
          <div className="readout-cell">
            <span className="readout-label">FMT</span>
            <span className="readout-value">{currentTrack?.format?.toUpperCase() ?? '—'}</span>
          </div>
          <div className="readout-cell">
            <span className="readout-label">BIT</span>
            <span className="readout-value">{currentTrack?.bitDepth ?? '—'}</span>
          </div>
          <div className="readout-cell">
            <span className="readout-label">KHZ</span>
            <span className="readout-value">{currentTrack?.sampleRate ? (currentTrack.sampleRate / 1000).toFixed(1) : '—'}</span>
          </div>
          <div className="readout-cell">
            <span className="readout-label">NORM</span>
            <span
              className={`readout-value${normalizationReadout.dim ? ' readout-value-dim' : ''}${normalizationReadout.accent ? ' readout-value-replaygain' : ''}${normalizationReadout.off ? ' readout-value-off' : ''}`}
            >
              {normalizationReadout.value}
            </span>
          </div>
          </div>
        ) : (
          <button type="button" className="transport-file-readout-compact" title="Click for full file details" onClick={() => toggleReadoutExpanded()}>
            <span>{currentTrack?.format?.toUpperCase() ?? '—'}</span>
            <span className="readout-compact-sep">·</span>
            <span>{currentTrack?.bitDepth ?? '—'}/{currentTrack?.sampleRate ? (currentTrack.sampleRate / 1000).toFixed(1) : '—'}</span>
          </button>
        )}
      </div>

      {/* EQ Popover */}
      {eqPopoverPresence.shouldRender && (
        <EQPopover
          presencePhase={eqPopoverPresence.phase}
          onClose={() => setShowEQPopover(false)}
        />
      )}
    </div>
  )
}
