import { QUALITY_CHOICES } from '../../../shared/milkdrop/quality'
import { useMilkdropBackgroundStore, type BackgroundFps } from '../../stores/milkdropBackgroundStore'

const FPS_CHOICES: BackgroundFps[] = [15, 24, 30]

/** Settings card: Milkdrop drawn behind the whole app. */
export default function BackgroundVisualSettings() {
  const { enabled, panelOpacity, quality, fps, setEnabled, setPanelOpacity, setQuality, setFps } = useMilkdropBackgroundStore()
  return (
    <div className="settings-card">
      <div className="settings-card-label">Visual background</div>
      <p className="settings-hint">
        Draws the Milkdrop visual behind the whole app, with the panels turned see-through so text stays readable.
        Uses the preset, favourites and auto-cycle you set in the fullscreen player. It replaces smoky glass while on.
      </p>
      <div className="settings-grid">
        <label className="settings-field settings-field-inline">
          <span className="settings-field-label">Milkdrop background</span>
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        </label>
        {enabled && (
          <>
            <label className="settings-field custom-theme-slider">
              <span className="settings-field-label">
                Panel opacity
                <span className="custom-theme-slider-value">{panelOpacity}</span>
              </span>
              <input type="range" min={30} max={95} value={panelOpacity} onChange={(event) => setPanelOpacity(Number(event.target.value))} />
              <span className="settings-hint">Higher is easier to read, lower shows more of the visual.</span>
            </label>
            <label className="settings-field">
              <span className="settings-field-label">Quality</span>
              <select value={quality} onChange={(event) => setQuality(event.target.value as typeof quality)}>
                {QUALITY_CHOICES.map((choice) => (
                  <option key={choice.id} value={choice.id}>{choice.label}</option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              <span className="settings-field-label">Frame rate</span>
              <select value={fps} onChange={(event) => setFps(Number(event.target.value) as BackgroundFps)}>
                {FPS_CHOICES.map((value) => (
                  <option key={value} value={value}>{value} fps</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
    </div>
  )
}
