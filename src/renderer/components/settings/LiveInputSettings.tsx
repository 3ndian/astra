import { useEffect } from 'react'
import { useLiveInputStore } from '../../stores/liveInputStore'

/** Settings card: show a microphone, or the sound your Mac is playing (through BlackHole), in the visualizers. */
export default function LiveInputSettings() {
  const active = useLiveInputStore((s) => s.active)
  const busy = useLiveInputStore((s) => s.busy)
  const label = useLiveInputStore((s) => s.label)
  const error = useLiveInputStore((s) => s.error)
  const devices = useLiveInputStore((s) => s.devices)
  const deviceId = useLiveInputStore((s) => s.deviceId)
  const refreshDevices = useLiveInputStore((s) => s.refreshDevices)
  const setDeviceId = useLiveInputStore((s) => s.setDeviceId)
  const toggle = useLiveInputStore((s) => s.toggle)

  useEffect(() => {
    void refreshDevices()
    const media = navigator.mediaDevices
    media?.addEventListener?.('devicechange', refreshDevices)
    return () => media?.removeEventListener?.('devicechange', refreshDevices)
  }, [refreshDevices])

  return (
    <div className="settings-card">
      <div className="settings-card-label">Live input</div>
      <p className="settings-hint">
        Show a microphone or the sound your Mac is playing in the visualizers. To see a video&rsquo;s audio, make a Multi-Output
        Device (your speakers + BlackHole) in Audio MIDI Setup, play the video through it, and pick BlackHole here.
        The input is only analysed, never played back. Playing a song switches it off. Shift+I turns it on and off.
      </p>
      <div className="settings-grid" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={deviceId}
          onChange={(event) => setDeviceId(event.target.value)}
          aria-label="Input device"
        >
          <option value="">System default input</option>
          {devices.map((device) => (
            <option key={device.id} value={device.id}>{device.label}</option>
          ))}
        </select>
        <button type="button" onClick={() => void toggle()} disabled={busy}>
          {active ? 'Stop' : 'Start'}
        </button>
        {active && <span>Showing: {label}</span>}
      </div>
      {error && <p className="settings-hint" role="alert">{error}</p>}
    </div>
  )
}
