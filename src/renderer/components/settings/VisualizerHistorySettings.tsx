import { useState } from 'react'
import { getKeepHistoryAcrossTracks, setKeepHistoryAcrossTracks } from '../../audio/visualizers/historySetting'

/** Settings card: what the scrolling visualizers do between songs. */
export default function VisualizerHistorySettings() {
  const [keep, setKeep] = useState(getKeepHistoryAcrossTracks)
  return (
    <div className="settings-card">
      <div className="settings-card-label">Visualizer history</div>
      <p className="settings-hint">
        Pausing always freezes the spectrogram, waveform, vectorscope and spectrum where they are, and playing carries on
        from there. With this on, the spectrogram and waveform also keep their picture when the next song starts, with a
        thin divider in the spectrogram where one ends and the next begins. Off clears them for every new song.
      </p>
      <div className="settings-grid">
        <label className="settings-field settings-field-inline">
          <span className="settings-field-label">Keep history across songs</span>
          <input
            type="checkbox"
            checked={keep}
            onChange={(event) => {
              setKeep(event.target.checked)
              setKeepHistoryAcrossTracks(event.target.checked)
            }}
          />
        </label>
      </div>
    </div>
  )
}
