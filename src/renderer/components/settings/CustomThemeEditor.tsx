import { useMemo, useState } from 'react'
import { useThemeStore } from '../../stores/themeStore'
import {
  CUSTOM_COLOR_KEYS,
  CUSTOM_COLOR_LABELS,
  deriveCustomTokens,
  findContrastWarnings,
  normalizeHex,
  previewHexes,
  type CustomTheme
} from '../../../shared/theme/customTheme'

interface SliderRowProps {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  trackClassName?: string
}

function SliderRow({ label, hint, value, min, max, onChange, trackClassName }: SliderRowProps) {
  return (
    <label className="settings-field custom-theme-slider">
      <span className="settings-field-label">
        {label}
        <span className="custom-theme-slider-value">{Math.round(value)}</span>
      </span>
      <input
        className={trackClassName}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
      />
      {hint && <span className="custom-theme-hint">{hint}</span>}
    </label>
  )
}

export default function CustomThemeEditor() {
  const customTheme = useThemeStore((state) => state.customTheme)
  const savedThemes = useThemeStore((state) => state.savedCustomThemes)
  const accentSource = useThemeStore((state) => state.accentSource)
  const startCustomTheme = useThemeStore((state) => state.startCustomTheme)
  const newCustomTheme = useThemeStore((state) => state.newCustomTheme)
  const updateCustomTheme = useThemeStore((state) => state.updateCustomTheme)
  const setOverride = useThemeStore((state) => state.setCustomThemeOverride)
  const resetOverrides = useThemeStore((state) => state.resetCustomThemeOverrides)
  const exitCustomTheme = useThemeStore((state) => state.exitCustomTheme)
  const saveCustomTheme = useThemeStore((state) => state.saveCustomTheme)
  const deleteSaved = useThemeStore((state) => state.deleteSavedCustomTheme)
  const [accentDraft, setAccentDraft] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)

  const tokens = useMemo(() => (customTheme ? deriveCustomTokens(customTheme) : null), [customTheme])
  const previews = useMemo(() => (tokens ? previewHexes(tokens) : null), [tokens])
  const warnings = useMemo(() => (tokens ? findContrastWarnings(tokens) : []), [tokens])

  const savedVersion = customTheme ? savedThemes.find((theme) => theme.id === customTheme.id) : undefined
  const isSaved = Boolean(savedVersion)
  const hasUnsavedChanges = customTheme
    ? !savedVersion || JSON.stringify({ ...savedVersion }) !== JSON.stringify({ ...customTheme })
    : false
  const hasOverrides = customTheme ? Object.keys(customTheme.overrides).length > 0 : false
  const patch = (changes: Partial<Omit<CustomTheme, 'id' | 'overrides'>>) => updateCustomTheme(changes)

  return (
    <div className="settings-card custom-theme-card">
      <div className="settings-card-label">Custom theme</div>

      {!customTheme || !tokens || !previews ? (
        <div className="custom-theme-intro">
          <p>
            Pick one colour and Astra works out the backgrounds, borders and text from it. Every step of that
            can be tuned, and any single colour can be set by hand.
          </p>
          <button type="button" className="settings-btn settings-btn-primary" onClick={startCustomTheme}>
            Create custom theme
          </button>
        </div>
      ) : (
        <div className="custom-theme-editor">
          <div className="settings-grid">
            <label className="settings-field">
              <span className="settings-field-label">Theme name</span>
              <input
                className="settings-select"
                type="text"
                value={customTheme.name}
                maxLength={40}
                onChange={(event) => patch({ name: event.target.value })}
                spellCheck={false}
              />
            </label>

            <label className="settings-field">
              <span className="settings-field-label">Accent colour</span>
              <div className="settings-accent-inputs">
                <input
                  className="settings-color settings-color-wide"
                  type="color"
                  value={customTheme.accent}
                  onChange={(event) => {
                    setAccentDraft(null)
                    patch({ accent: event.target.value.toLowerCase() })
                  }}
                />
                <input
                  className="settings-select settings-accent-hex-input"
                  type="text"
                  value={accentDraft ?? customTheme.accent}
                  onChange={(event) => {
                    setAccentDraft(event.target.value)
                    const hex = normalizeHex(event.target.value)
                    if (hex) patch({ accent: hex })
                  }}
                  onBlur={() => setAccentDraft(null)}
                  spellCheck={false}
                />
              </div>
            </label>
          </div>

          <div className="custom-theme-palette" aria-label="Derived palette">
            {CUSTOM_COLOR_KEYS.map((key) => (
              <span key={key} className="custom-theme-palette-chip" title={CUSTOM_COLOR_LABELS[key]} style={{ background: previews[key] }} />
            ))}
            <span className="custom-theme-palette-chip" title="Accent" style={{ background: customTheme.accent }} />
          </div>

          <label className="settings-field settings-field-inline custom-theme-check">
            <span className="settings-field-label">Backgrounds follow the accent</span>
            <input
              type="checkbox"
              checked={customTheme.followAccent}
              onChange={(event) => patch({ followAccent: event.target.checked })}
            />
          </label>

          {customTheme.followAccent ? (
            <SliderRow
              label="Hue shift"
              hint="Rotate the background colour away from the accent."
              value={customTheme.hueShift}
              min={-180}
              max={180}
              onChange={(value) => patch({ hueShift: value })}
            />
          ) : (
            <SliderRow
              label="Background hue"
              value={customTheme.surfaceHue}
              min={0}
              max={360}
              trackClassName="custom-theme-hue-track"
              onChange={(value) => patch({ surfaceHue: value })}
            />
          )}

          {customTheme.followAccent && accentSource === 'cover-art' && (
            <label className="settings-field settings-field-inline custom-theme-check">
              <span className="settings-field-label">Backgrounds also follow the album colour</span>
              <input
                type="checkbox"
                checked={customTheme.followCoverArt}
                onChange={(event) => patch({ followCoverArt: event.target.checked })}
              />
            </label>
          )}

          <SliderRow
            label="Tint strength"
            hint="0 is neutral grey, 100 is strongly coloured."
            value={customTheme.tintStrength}
            min={0}
            max={100}
            onChange={(value) => patch({ tintStrength: value })}
          />
          <SliderRow
            label="Background lightness"
            hint="0 is near black."
            value={customTheme.depth}
            min={0}
            max={100}
            onChange={(value) => patch({ depth: value })}
          />
          <label className="settings-field settings-field-inline custom-theme-check">
            <span className="settings-field-label">Smoky glass: blurred album cover behind the app</span>
            <input
              type="checkbox"
              checked={customTheme.smokyGlass}
              onChange={(event) => patch({ smokyGlass: event.target.checked })}
            />
          </label>
          {customTheme.smokyGlass && (
            <>
              <SliderRow
                label="Glass blur"
                hint="Higher is smokier, lower shows more of the cover."
                value={customTheme.glassBlur}
                min={10}
                max={120}
                onChange={(value) => patch({ glassBlur: value })}
              />
              <SliderRow
                label="Panel opacity"
                hint="Lower lets more cover show through the panels. Text stays readable."
                value={customTheme.glassPanelOpacity}
                min={30}
                max={95}
                onChange={(value) => patch({ glassPanelOpacity: value })}
              />
            </>
          )}
          <SliderRow
            label="Text contrast"
            hint="Softer or stronger text. Text never goes below a readable level."
            value={customTheme.textContrast}
            min={0}
            max={100}
            onChange={(value) => patch({ textContrast: value })}
          />

          <details className="custom-theme-individual">
            <summary>Edit colours individually{hasOverrides ? ' (some edited)' : ''}</summary>
            <div className="custom-theme-individual-list">
              {CUSTOM_COLOR_KEYS.map((key) => {
                const edited = customTheme.overrides[key] !== undefined
                return (
                  <div key={key} className="custom-theme-individual-row">
                    <span className="custom-theme-individual-label">{CUSTOM_COLOR_LABELS[key]}</span>
                    <input
                      className="settings-color"
                      type="color"
                      value={previews[key]}
                      onChange={(event) => setOverride(key, event.target.value)}
                      aria-label={CUSTOM_COLOR_LABELS[key]}
                    />
                    {edited ? (
                      <button type="button" className="settings-btn" onClick={() => setOverride(key, null)}>
                        Back to automatic
                      </button>
                    ) : (
                      <span className="settings-chip">Automatic</span>
                    )}
                  </div>
                )
              })}
              {hasOverrides && (
                <button type="button" className="settings-btn" onClick={resetOverrides}>
                  Reset all colours to automatic
                </button>
              )}
            </div>
          </details>

          {warnings.length > 0 && (
            <div className="custom-theme-warning" role="status">
              Hard to read: {warnings.map((warning) => `${warning.label} (${warning.ratio}:1)`).join(', ')}.
              Pick a lighter text colour or a darker background.
            </div>
          )}

          <div className="custom-theme-actions">
            <button
              type="button"
              className="settings-btn settings-btn-primary"
              disabled={isSaved && !hasUnsavedChanges}
              onClick={() => saveCustomTheme(customTheme.name)}
            >
              {isSaved ? (hasUnsavedChanges ? 'Save changes' : 'Saved') : 'Save theme'}
            </button>
            {isSaved && (
              <button type="button" className="settings-btn" onClick={() => saveCustomTheme(customTheme.name, true)}>
                Save as new theme
              </button>
            )}
            {confirmNew ? (
              <>
                <button
                  type="button"
                  className="settings-btn"
                  onClick={() => {
                    newCustomTheme()
                    setConfirmNew(false)
                  }}
                >
                  Discard unsaved and start new
                </button>
                <button type="button" className="settings-btn" onClick={() => setConfirmNew(false)}>Cancel</button>
              </>
            ) : (
              <button
                type="button"
                className="settings-btn"
                onClick={() => (hasUnsavedChanges ? setConfirmNew(true) : newCustomTheme())}
              >
                New custom theme
              </button>
            )}
            {isSaved && (confirmDelete ? (
              <>
                <button
                  type="button"
                  className="settings-btn"
                  onClick={() => {
                    deleteSaved(customTheme.id)
                    setConfirmDelete(false)
                  }}
                >
                  Delete it
                </button>
                <button type="button" className="settings-btn" onClick={() => setConfirmDelete(false)}>Keep</button>
              </>
            ) : (
              <button type="button" className="settings-btn" onClick={() => setConfirmDelete(true)}>Delete saved theme</button>
            ))}
            <button type="button" className="settings-btn" onClick={exitCustomTheme}>Back to presets</button>
          </div>
        </div>
      )}
    </div>
  )
}
