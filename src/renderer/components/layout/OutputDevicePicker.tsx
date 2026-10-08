import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveOutputDeviceLabel, useAudioSettingsStore } from '../../stores/audioSettingsStore'
import { isDeviceSelected } from '../../../shared/audio/outputFollow'

export const OPEN_OUTPUT_PICKER_EVENT = 'astra:open-output-picker'

/** Speaker button in the transport bar. Click it (or the OUT line) to switch the output device. */
export default function OutputDevicePicker(): React.ReactElement {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const devices = useAudioSettingsStore((s) => s.availableDevices)
  const selectedDeviceId = useAudioSettingsStore((s) => s.selectedDeviceId)
  const selectDevice = useAudioSettingsStore((s) => s.selectDevice)
  const refreshDevices = useAudioSettingsStore((s) => s.refreshDevices)

  const current = resolveOutputDeviceLabel(selectedDeviceId, devices, {
    defaultRouteFallbackLabel: 'System Default Output',
    selectedFallbackLabel: 'Selected Output'
  }).label

  const openPicker = useCallback(() => {
    void refreshDevices()
    setOpen(true)
  }, [refreshDevices])

  useEffect(() => {
    const onOpenRequest = () => openPicker()
    window.addEventListener(OPEN_OUTPUT_PICKER_EVENT, onOpenRequest)
    return () => window.removeEventListener(OPEN_OUTPUT_PICKER_EVENT, onOpenRequest)
  }, [openPicker])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  return (
    <div className="output-picker" ref={rootRef}>
      <button
        type="button"
        className={`transport-mini-btn output-picker-btn${open ? ' active' : ''}`}
        onClick={() => (open ? setOpen(false) : openPicker())}
        title={`Output: ${current}`}
        aria-label={`Output device: ${current}. Change output device`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 10v4h3.5L12 18V6L7.5 10H4z" />
          <path d="M15.5 9a4 4 0 0 1 0 6" />
          <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
        </svg>
      </button>
      {open && (
        <div className="output-picker-menu" role="menu" aria-label="Output devices">
          <div className="output-picker-title">Play on</div>
          {devices.length === 0 && <div className="output-picker-empty">No output devices detected</div>}
          {devices.map((device) => {
            const selected = isDeviceSelected(device, selectedDeviceId)
            return (
              <button
                key={device.deviceId || device.label}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`output-picker-item${selected ? ' is-selected' : ''}`}
                onClick={() => {
                  void selectDevice(device.deviceId)
                  setOpen(false)
                }}
              >
                <span className="output-picker-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                <span className="output-picker-label">{device.label || device.deviceId || 'Unknown device'}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
