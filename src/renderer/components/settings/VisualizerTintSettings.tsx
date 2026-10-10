import { useAlbumPaletteStore } from '../../stores/albumPaletteStore'
import { useVisualizerTintStore, type VisualizerTintMode } from '../../stores/visualizerTintStore'
import SettingsSegmentedControl from './SettingsSegmentedControl'

const OPTIONS: { value: VisualizerTintMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'tint', label: 'Tint' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'map', label: 'Gradient map' }
]

const HINTS: Record<VisualizerTintMode, string> = {
  off: 'The visualizers keep their own colours.',
  tint: 'One wash of the cover’s main colour over the whole row.',
  gradient: 'The cover’s colours laid across the row, from low notes on the left to high notes on the right.',
  map: 'Remaps the picture: dark parts take the cover’s darkest colour, bright parts its lightest. Most striking, but it uses the most GPU.'
}

/** Settings card: colour the visualizer row with the playing album's colours. */
export default function VisualizerTintSettings() {
  const { mode, strength, setMode, setStrength } = useVisualizerTintStore()
  const hasPalette = useAlbumPaletteStore((state) => state.palette.length > 0)
  return (
    <div className="settings-card">
      <div className="settings-card-label">Visualizer colour from the album</div>
      <div className="settings-grid">
        <div className="settings-field">
          <span className="settings-field-label">Style</span>
          <SettingsSegmentedControl ariaLabel="Visualizer album colour style" fullWidth options={OPTIONS} value={mode} onChange={setMode} />
          <span className="settings-hint">{HINTS[mode]}</span>
        </div>
        {mode !== 'off' && !hasPalette && (
          <div className="settings-field">
            <span className="settings-hint">No album colours yet. Play a song with cover art and the tint appears.</span>
          </div>
        )}
        {mode !== 'off' && (
          <label className="settings-field custom-theme-slider">
            <span className="settings-field-label">
              Strength
              <span className="custom-theme-slider-value">{strength}</span>
            </span>
            <input type="range" min={10} max={100} value={strength} onChange={(event) => setStrength(Number(event.target.value))} />
          </label>
        )}
      </div>
    </div>
  )
}
