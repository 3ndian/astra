import { QUALITY_CHOICES } from '../../../shared/milkdrop/quality'
import SettingsSegmentedControl from './SettingsSegmentedControl'
import { useAlbumPaletteStore } from '../../stores/albumPaletteStore'
import { useMilkdropBackgroundStore, type BackgroundFps } from '../../stores/milkdropBackgroundStore'

const FPS_CHOICES: BackgroundFps[] = [15, 24, 30]

/** Settings card: Milkdrop drawn behind the whole app. */
export default function BackgroundVisualSettings() {
  const { enabled, panelOpacity, quality, fps, visualOpacity, blur, tintMode, tintStrength, setTintMode, setTintStrength, setEnabled, setPanelOpacity, setQuality, setFps, setVisualOpacity, setBlur } = useMilkdropBackgroundStore()
  const hasPalette = useAlbumPaletteStore((state) => state.palette.length > 0)
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
            <label className="settings-field custom-theme-slider">
              <span className="settings-field-label">
                Visual opacity
                <span className="custom-theme-slider-value">{visualOpacity}</span>
              </span>
              <input type="range" min={20} max={100} value={visualOpacity} onChange={(event) => setVisualOpacity(Number(event.target.value))} />
              <span className="settings-hint">Fades the visual itself toward the plain background. Free: costs no extra GPU.</span>
            </label>
            <label className="settings-field custom-theme-slider">
              <span className="settings-field-label">
                Blur
                <span className="custom-theme-slider-value">{blur === 0 ? 'Off' : `${blur}px`}</span>
              </span>
              <input type="range" min={0} max={24} step={2} value={blur} onChange={(event) => setBlur(Number(event.target.value))} />
              <span className="settings-hint">Softens the visual. It is the one costly option here: it makes the GPU blur the whole window every frame. Keep Quality on Low and the frame rate at 24 or below if your Mac runs warm.</span>
            </label>
            <div className="settings-field">
              <span className="settings-field-label">Album colours over the visual</span>
              <SettingsSegmentedControl
                ariaLabel="Album colours over the Milkdrop background"
                fullWidth
                options={[
                  { value: 'off', label: 'Off' },
                  { value: 'tint', label: 'Tint' },
                  { value: 'gradient', label: 'Gradient' },
                  { value: 'map', label: 'Gradient map' }
                ] as const}
                value={tintMode}
                onChange={setTintMode}
              />
              <span className="settings-hint">
                Tint washes the visual with the cover&apos;s main colour. Gradient lays the cover&apos;s colours across it.
                Gradient map recolours it from dark to light using the cover&apos;s colours (uses more GPU).
              </span>
            </div>
            {tintMode !== 'off' && !hasPalette && (
              <div className="settings-field">
                <span className="settings-hint">No album colours yet. Play a song with cover art and the colours appear.</span>
              </div>
            )}
            {tintMode !== 'off' && (
              <label className="settings-field custom-theme-slider">
                <span className="settings-field-label">
                  Colour strength
                  <span className="custom-theme-slider-value">{tintStrength}</span>
                </span>
                <input type="range" min={10} max={100} value={tintStrength} onChange={(event) => setTintStrength(Number(event.target.value))} />
              </label>
            )}
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
