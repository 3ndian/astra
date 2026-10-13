import { useEffect, useRef, useState } from 'react'
import { DEFAULT_ICON_BACKGROUND, useAppIconStore } from '../../stores/appIconStore'
import { deriveAccentHue, deriveAccentSaturationScale, useThemeStore } from '../../stores/themeStore'
import { renderCustomIconPngDataUrl, sanitizeIconSvg } from '../../utils/customIconSvg'
import { renderAstraLogoPngDataUrl } from '../icons/astraLogoShared'

export default function AppIconSettings() {
  const { svg, fileName, bgColor, colorMode, scale, dynamicDockIcon } = useAppIconStore()
  const { setSvg, clearSvg, setBgColor, resetBgColor, setColorMode, setScale, setDynamicDockIcon } = useAppIconStore.getState()
  const accent = useThemeStore((state) => state.resolvedTokens.accent)
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const mainFill = `hsl(${deriveAccentHue(accent)} ${100 * deriveAccentSaturationScale(accent)}% 50%)`
    const job = svg
      ? renderCustomIconPngDataUrl({
        sanitizedSvg: svg,
        fill: colorMode === 'accent' ? mainFill : null,
        background: bgColor,
        scale,
      }, 128)
      : renderAstraLogoPngDataUrl({
        includeBackground: false,
        backgroundMode: 'squircle',
        backgroundFill: bgColor,
        symbolScale: 0.9,
        mainFill,
        shadowFill: `hsl(${deriveAccentHue(accent)} ${40 * deriveAccentSaturationScale(accent)}% 14%)`,
      }, 128)
    void job.then((url) => { if (!cancelled) setPreview(url) })
    return () => { cancelled = true }
  }, [svg, accent, bgColor, colorMode, scale])

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const text = await file.text()
      const clean = sanitizeIconSvg(text)
      if (!clean) {
        setError('That file could not be used as an icon. Use a plain SVG under 512 KB with drawn shapes (not an embedded picture).')
        return
      }
      setSvg(clean, file.name)
    } catch {
      setError('Could not read that file.')
    }
  }

  return (
    <div className="settings-card">
      <div className="settings-card-label">App Icon</div>
      <div className="settings-grid">
        <div className="settings-field settings-field-inline">
          <span className="settings-field-label">Dock Icon</span>
          <div className="settings-accent-inputs">
            <button
              className={`settings-btn${dynamicDockIcon ? ' settings-btn-primary' : ''}`}
              onClick={() => setDynamicDockIcon(true)}
            >
              Follow Accent
            </button>
            <button
              className={`settings-btn${!dynamicDockIcon ? ' settings-btn-primary' : ''}`}
              onClick={() => setDynamicDockIcon(false)}
            >
              Use Get Info Icon
            </button>
          </div>
        </div>
        {!dynamicDockIcon && (
          <p className="settings-note">
            Astra no longer changes the Dock icon. Quit and reopen Astra so the Dock goes back to the icon set in Finder's Get Info. The options below only affect the preview.
          </p>
        )}
        <div className="settings-field settings-field-inline">
          <span className="settings-field-label">Preview</span>
          {preview && <img src={preview} alt="App icon preview" width={64} height={64} />}
        </div>
        <div className="settings-field settings-field-inline">
          <span className="settings-field-label">{fileName ? `Shape: ${fileName}` : 'Shape: Astra logo'}</span>
          <div className="settings-accent-inputs">
            <button className="settings-btn settings-btn-primary" onClick={() => fileRef.current?.click()}>
              Choose SVG…
            </button>
            {svg && <button className="settings-btn" onClick={clearSvg}>Use Astra Logo</button>}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".svg,image/svg+xml"
            hidden
            onChange={(event) => {
              void handleFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </div>
        {error && <p className="settings-note">{error}</p>}
        <label className="settings-field">
          <span className="settings-field-label">Background Color</span>
          <div className="settings-accent-inputs">
            <input
              className="settings-color settings-color-wide"
              type="color"
              value={bgColor}
              onChange={(event) => setBgColor(event.target.value.toLowerCase())}
            />
            {bgColor !== DEFAULT_ICON_BACKGROUND && (
              <button className="settings-btn" onClick={resetBgColor}>Reset</button>
            )}
          </div>
        </label>
        {svg && (
          <>
            <div className="settings-field settings-field-inline">
              <span className="settings-field-label">Shape Color</span>
              <div className="settings-accent-inputs">
                <button
                  className={`settings-btn${colorMode === 'accent' ? ' settings-btn-primary' : ''}`}
                  onClick={() => setColorMode('accent')}
                >
                  Follow Accent
                </button>
                <button
                  className={`settings-btn${colorMode === 'original' ? ' settings-btn-primary' : ''}`}
                  onClick={() => setColorMode('original')}
                >
                  SVG's Own Colors
                </button>
              </div>
            </div>
            <label className="settings-field">
              <span className="settings-field-label">Shape Size</span>
              <input
                type="range"
                min={0.3}
                max={1}
                step={0.01}
                value={scale}
                onChange={(event) => setScale(Number(event.target.value))}
              />
            </label>
          </>
        )}
      </div>
      <p className="settings-note">
        Changes the Dock icon while Astra is running. The icon shown in Finder and Applications is a fixed file and doesn't change.
      </p>
    </div>
  )
}
