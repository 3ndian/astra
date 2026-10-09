import { useTrackClickModeStore } from '../../stores/trackClickModeStore'

/** Settings card: what a click on a track row does. */
export default function TrackClickSettings() {
  const mode = useTrackClickModeStore((state) => state.mode)
  const setMode = useTrackClickModeStore((state) => state.setMode)
  return (
    <div className="settings-card">
      <div className="settings-card-label">Track list clicks</div>
      <p className="settings-hint">
        Precise: click a song title, or the play button that appears on its thumbnail, to play it. Click an album or
        artist to open it. Double-click empty space on a row to play. Row (default): a click anywhere on the row plays.
      </p>
      <div className="settings-grid">
        <label className="settings-field">
          <span className="settings-field-label">Clicking a track</span>
          <select value={mode} onChange={(event) => setMode(event.target.value === 'row' ? 'row' : 'precise')}>
            <option value="row">Anywhere on the row (default)</option>
            <option value="precise">Precise (title, thumbnail, double-click)</option>
          </select>
        </label>
      </div>
    </div>
  )
}
