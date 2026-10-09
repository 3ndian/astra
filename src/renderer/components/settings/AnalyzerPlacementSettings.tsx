import { useAnalyzerPlacementStore, type AnalyzerPlacement } from '../../stores/analyzerPlacementStore'

/** Settings card: where the visualizer rack sits. */
export default function AnalyzerPlacementSettings() {
  const placement = useAnalyzerPlacementStore((state) => state.placement)
  const setPlacement = useAnalyzerPlacementStore((state) => state.setPlacement)
  return (
    <div className="settings-card">
      <div className="settings-card-label">Visualizer position</div>
      <p className="settings-hint">
        Put the visualizer bar under the title bar (the default) or below the player bar at the bottom of the window.
      </p>
      <div className="settings-grid">
        <label className="settings-field">
          <span className="settings-field-label">Position</span>
          <select value={placement} onChange={(event) => setPlacement(event.target.value === 'bottom' ? 'bottom' : ('top' as AnalyzerPlacement))}>
            <option value="top">Top, under the title bar</option>
            <option value="bottom">Bottom, below the player bar</option>
          </select>
        </label>
      </div>
    </div>
  )
}
