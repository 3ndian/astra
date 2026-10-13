import { useState } from 'react'
import { isInstantAccent, setInstantAccent } from '../../utils/accentMotion'

export default function InstantAccentToggle() {
  const [instant, setInstant] = useState(isInstantAccent)
  const choose = (value: boolean): void => { setInstantAccent(value); setInstant(value) }
  return (
    <div className="settings-field settings-field-inline">
      <span
        className="settings-field-label"
        title="Fading the accent colour repaints the whole window many times in a fraction of a second, which can flicker and warm the computer."
      >
        Accent Change
      </span>
      <div className="settings-accent-inputs">
        <button className={`settings-btn${instant ? ' settings-btn-primary' : ''}`} onClick={() => choose(true)}>Instant</button>
        <button className={`settings-btn${!instant ? ' settings-btn-primary' : ''}`} onClick={() => choose(false)}>Fade</button>
      </div>
    </div>
  )
}
