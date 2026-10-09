import { useAlbumTintStore } from '../../stores/albumTintStore'

/** Settings card: wash the app with the playing album's colours. */
export default function AlbumTintSettings() {
  const { enabled, strength, setEnabled, setStrength } = useAlbumTintStore()
  return (
    <div className="settings-card">
      <div className="settings-card-label">Album colour tint</div>
      <p className="settings-hint">
        Washes the track list and the rest of the main area with the playing album's colours: the main colour in the
        top left, a second colour in the bottom right and a third in the bottom left. It fades between songs and works
        with any theme.
      </p>
      <div className="settings-grid">
        <label className="settings-field settings-field-inline">
          <span className="settings-field-label">Tint with album colours</span>
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        </label>
        {enabled && (
          <label className="settings-field custom-theme-slider">
            <span className="settings-field-label">
              Strength
              <span className="custom-theme-slider-value">{strength}</span>
            </span>
            <input type="range" min={5} max={100} value={strength} onChange={(event) => setStrength(Number(event.target.value))} />
          </label>
        )}
      </div>
    </div>
  )
}
