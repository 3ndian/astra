import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_SECTION_ID, type SectionConfig, type SectionFlagKey, type SectionKind } from '../../../shared/sections/sections'
import {
  MAX_PINNED_SECTIONS,
  resolvePinned,
  sectionColor,
  togglePinned,
  visibleRailIds
} from '../../../shared/sections/sectionStyle'
import { useUIStore } from '../../stores/uiStore'
import { resetLibraryToTracks } from '../../utils/resetLibraryToTracks'
import { selectActiveSection, useSectionsStore } from '../../stores/sectionsStore'

const PINNED_STORAGE_KEY = 'astra-pinned-sections-v1'

function readStoredPins(): unknown {
  try {
    const raw = window.localStorage.getItem(PINNED_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function SectionIcon({ section }: { section: SectionConfig }) {
  if (section.kind === 'music') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z" />
      </svg>
    )
  }
  if (section.kind === 'audiobook') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm1 2v14h11V5H6zm2 3h7v2H8V8z" />
      </svg>
    )
  }
  return <span className="section-rail-letters">{sectionBadge(section.name)}</span>
}

const FLAG_LABELS: { key: SectionFlagKey; label: string }[] = [
  { key: 'scrobble', label: 'Scrobble to Last.fm' },
  { key: 'discordPresence', label: 'Show on Discord' },
  { key: 'listeningStats', label: 'Count in listening stats' }
]

function sectionBadge(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
  return (letters || name.slice(0, 1) || '?').slice(0, 2).toUpperCase()
}

/**
 * Switches between library sections (Music, Audiobooks, custom ones). Sections are fully
 * separate libraries: switching stops playback and swaps the whole library.
 */
export default function SectionSwitcher() {
  const registry = useSectionsStore((state) => state.registry)
  const activeSection = useSectionsStore(selectActiveSection)
  const isSwitching = useSectionsStore((state) => state.isSwitching)
  const errorMessage = useSectionsStore((state) => state.errorMessage)
  const switchSection = useSectionsStore((state) => state.switchSection)
  const createSection = useSectionsStore((state) => state.createSection)
  const renameSection = useSectionsStore((state) => state.renameSection)
  const setSectionFlag = useSectionsStore((state) => state.setSectionFlag)
  const deleteSection = useSectionsStore((state) => state.deleteSection)
  const setSectionColorChoice = useSectionsStore((state) => state.setSectionColor)

  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)
  const [managedId, setManagedId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<SectionKind>('custom')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [storedPins, setStoredPins] = useState<unknown>(readStoredPins)
  const [pinHint, setPinHint] = useState('')

  const close = useCallback(() => {
    setOpen(false)
    setManagedId(null)
    setConfirmDeleteId(null)
  }, [])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (popoverRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      close()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, close])

  if (!registry || !activeSection) return null

  const toggleOpen = () => {
    if (open) {
      close()
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setAnchor({ left: rect.right + 8, top: rect.top })
    setOpen(true)
  }

  const handleSwitch = async (section: SectionConfig) => {
    if (section.id === activeSection.id) {
      // Tapping the section you are already in returns to its Tracks landing view.
      if (useUIStore.getState().activeView !== 'library') useUIStore.getState().setActiveView('library')
      resetLibraryToTracks()
      close()
      return
    }
    const switched = await switchSection(section.id)
    if (switched) close()
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    const created = await createSection(newName, newKind)
    if (created) {
      setNewName('')
      setNewKind('custom')
    }
  }

  const pinned = resolvePinned(registry.sections, storedPins)
  const railIds = visibleRailIds(registry.sections, pinned, activeSection.id)

  const handleTogglePin = (id: string) => {
    const result = togglePinned(pinned, id)
    if (!result.changed) {
      setPinHint(
        pinned.includes(id)
          ? 'Keep at least one section pinned.'
          : `You can pin up to ${MAX_PINNED_SECTIONS}. Unpin one first.`
      )
      return
    }
    setPinHint('')
    setStoredPins(result.pinned)
    try {
      window.localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(result.pinned))
    } catch {
      // not persisted; applies for this session
    }
  }

  const managed = managedId ? registry.sections.find((section) => section.id === managedId) ?? null : null

  const popover =
    open && anchor
      ? createPortal(
          <div
            ref={popoverRef}
            className="section-switcher-popover"
            style={{ left: anchor.left, top: anchor.top }}
            role="dialog"
            aria-label="Library sections"
          >
            <div className="section-switcher-title">Sections</div>
            <p className="section-switcher-hint">
              Each section is its own library. Nothing mixes between them, and switching stops playback.
              Pin up to {MAX_PINNED_SECTIONS} to keep them in the sidebar.
            </p>

            {pinHint && <div className="section-switcher-hint" role="status">{pinHint}</div>}
            <ul className="section-switcher-list">
              {registry.sections.map((section) => (
                <li key={section.id} className="section-switcher-row">
                  <button
                    type="button"
                    className={`section-switcher-item ${section.id === activeSection.id ? 'active' : ''}`}
                    disabled={isSwitching}
                    onClick={() => void handleSwitch(section)}
                    aria-current={section.id === activeSection.id ? 'true' : undefined}
                  >
                    <span className="section-switcher-badge" style={{ ['--section-color' as string]: sectionColor(section) }}>{sectionBadge(section.name)}</span>
                    <span className="section-switcher-name">{section.name}</span>
                    {section.id === activeSection.id && <span className="section-switcher-active-tag">Active</span>}
                  </button>
                  <button
                    type="button"
                    className={`section-switcher-pin ${pinned.includes(section.id) ? 'pinned' : ''}`}
                    aria-label={pinned.includes(section.id) ? `Unpin ${section.name} from the sidebar` : `Pin ${section.name} to the sidebar`}
                    aria-pressed={pinned.includes(section.id)}
                    onClick={() => handleTogglePin(section.id)}
                  >
                    {pinned.includes(section.id) ? 'Pinned' : 'Pin'}
                  </button>
                  <button
                    type="button"
                    className="section-switcher-manage"
                    aria-label={`Settings for ${section.name}`}
                    aria-expanded={managedId === section.id}
                    onClick={() => {
                      setConfirmDeleteId(null)
                      if (managedId === section.id) {
                        setManagedId(null)
                      } else {
                        setManagedId(section.id)
                        setRenameDraft(section.name)
                      }
                    }}
                  >
                    ⋯
                  </button>
                </li>
              ))}
            </ul>

            {managed && (
              <div className="section-switcher-manage-panel">
                <form
                  className="section-switcher-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void renameSection(managed.id, renameDraft)
                  }}
                >
                  <input
                    value={renameDraft}
                    maxLength={40}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    aria-label="Section name"
                  />
                  <button type="submit" disabled={!renameDraft.trim() || renameDraft.trim() === managed.name}>
                    Rename
                  </button>
                </form>
                <div className="section-switcher-color-row">
                  <span>Icon colour</span>
                  <input
                    type="color"
                    className="settings-color"
                    value={sectionColor(managed)}
                    onChange={(event) => void setSectionColorChoice(managed.id, event.target.value)}
                    aria-label={`Colour for ${managed.name}`}
                  />
                  {managed.color ? (
                    <button type="button" onClick={() => void setSectionColorChoice(managed.id, null)}>Automatic</button>
                  ) : (
                    <span className="section-switcher-color-auto">Automatic</span>
                  )}
                </div>
                {FLAG_LABELS.map(({ key, label }) => (
                  <label key={key} className="section-switcher-flag">
                    <input
                      type="checkbox"
                      checked={managed[key]}
                      onChange={(event) => void setSectionFlag(managed.id, key, event.target.checked)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
                {managed.id !== DEFAULT_SECTION_ID && managed.id !== activeSection.id && (
                  confirmDeleteId === managed.id ? (
                    <div className="section-switcher-confirm">
                      <span>Delete this section and its library data? Your audio files are not touched.</span>
                      <button
                        type="button"
                        className="danger"
                        onClick={async () => {
                          const deleted = await deleteSection(managed.id)
                          if (deleted) {
                            setManagedId(null)
                            setConfirmDeleteId(null)
                          }
                        }}
                      >
                        Delete
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" className="section-switcher-delete" onClick={() => setConfirmDeleteId(managed.id)}>
                      Delete section…
                    </button>
                  )
                )}
                {managed.id === activeSection.id && managed.id !== DEFAULT_SECTION_ID && (
                  <div className="section-switcher-hint">Switch to another section to delete this one.</div>
                )}
              </div>
            )}

            <form className="section-switcher-new" onSubmit={handleCreate}>
              <div className="section-switcher-new-title">New section</div>
              <input
                value={newName}
                maxLength={40}
                placeholder="Section name"
                onChange={(event) => setNewName(event.target.value)}
                aria-label="New section name"
              />
              <select
                value={newKind}
                onChange={(event) => setNewKind(event.target.value as SectionKind)}
                aria-label="New section type"
              >
                <option value="custom">Music-style section</option>
                <option value="audiobook">Audiobooks (no scrobbling or Discord)</option>
              </select>
              <button type="submit" disabled={!newName.trim()}>Create</button>
            </form>

            {errorMessage && <div className="section-switcher-error" role="alert">{errorMessage}</div>}
          </div>,
          document.body
        )
      : null

  const railSections = railIds
    .map((id) => registry.sections.find((section) => section.id === id))
    .filter((section): section is SectionConfig => !!section)

  return (
    <div className="section-rail">
      <button
        ref={buttonRef}
        type="button"
        className={`sidebar-icon-btn section-rail-more ${open ? 'active' : ''}`}
        onClick={toggleOpen}
        aria-label="All sections"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-sidebar-tooltip="All sections"
        disabled={isSwitching}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
        </svg>
        <span className="sidebar-nav-label">All sections</span>
      </button>
      {railSections.map((section) => {
        const isActive = section.id === activeSection.id
        return (
          <button
            key={section.id}
            type="button"
            className={`sidebar-icon-btn section-rail-btn ${isActive ? 'active' : ''}`}
            style={{ ['--section-color' as string]: sectionColor(section) }}
            onClick={() => void handleSwitch(section)}
            aria-label={`Section: ${section.name}`}
            aria-current={isActive ? 'true' : undefined}
            data-sidebar-tooltip={section.name}
            disabled={isSwitching}
          >
            <SectionIcon section={section} />
            <span className="sidebar-nav-label">{section.name}</span>
          </button>
        )
      })}
      {popover}
    </div>
  )
}
