import { useEffect, useMemo, useRef, useState } from 'react'
import { audioEngine } from '../../audio/AudioEngine'
import { formatTimestamp } from '../../../shared/audiobook/bookmarks'
import { chapterIndexAt, chapterJumpTarget, formatLeft, progressInfo } from '../../../shared/audiobook/chapters'
import { useAudiobookStore } from '../../stores/audiobookStore'
import { usePlayerStore } from '../../stores/playerStore'

type Tab = 'bookmarks' | 'chapters'

function nowPosition(): number {
  const state = usePlayerStore.getState()
  return Number.isFinite(audioEngine.currentTime) ? audioEngine.currentTime : state.currentTime
}

function jumpTo(seconds: number): void {
  void usePlayerStore.getState().seek(Math.max(0, seconds))
}

/** Progress cue, chapter skip and bookmarks for the Audiobook transport controls. */
export default function AudiobookExtras() {
  const track = usePlayerStore((state) => state.currentTrack)
  const currentTime = usePlayerStore((state) => state.currentTime)
  const duration = usePlayerStore((state) => (state.duration > 0 ? state.duration : state.currentTrack?.duration ?? 0))
  const { trackPath, bookmarks, chapters, error } = useAudiobookStore()
  const load = useAudiobookStore((state) => state.load)
  const add = useAudiobookStore((state) => state.add)
  const setNote = useAudiobookStore((state) => state.setNote)
  const remove = useAudiobookStore((state) => state.remove)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('bookmarks')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const rootRef = useRef<HTMLDivElement | null>(null)

  const path = track?.path ?? null
  const title = track?.title ?? ''
  useEffect(() => {
    void load(path, title)
  }, [path, title, load])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !(event.target instanceof HTMLTextAreaElement)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const ready = !!track && trackPath === path
  const chapterIndex = useMemo(() => (ready ? chapterIndexAt(chapters, currentTime) : -1), [ready, chapters, currentTime])
  const progress = progressInfo(currentTime, duration)
  if (!track) return null

  const cue = progress
    ? `${chapterIndex >= 0 && chapters.length > 1 ? `Ch ${chapterIndex + 1}/${chapters.length} · ` : ''}${progress.percent}% · ${formatLeft(progress.remainingSeconds)}`
    : null
  const cueTitle = chapterIndex >= 0 ? `${chapters[chapterIndex].title}` : undefined

  const addHere = async () => {
    setOpen(true)
    setTab('bookmarks')
    const id = await add(nowPosition())
    if (id) setFocusId(id)
  }

  const skipChapter = (direction: 1 | -1) => {
    const target = chapterJumpTarget(chapters, nowPosition(), direction)
    if (target !== null) jumpTo(target)
  }

  const commitNote = (id: string, original: string) => {
    const draft = drafts[id]
    if (draft === undefined) return
    setDrafts((current) => {
      const { [id]: _removed, ...rest } = current
      return rest
    })
    if (draft.trim() !== original.trim()) void setNote(id, draft)
  }

  return (
    <>
      {chapters.length > 1 && ready && (
        <>
          <button type="button" className="control-btn audiobook-skip-btn" onClick={() => skipChapter(-1)} aria-label="Previous chapter" title="Previous chapter">
            <span aria-hidden="true">&#8249;&#8249;</span>
          </button>
          <button type="button" className="control-btn audiobook-skip-btn" onClick={() => skipChapter(1)} aria-label="Next chapter" title="Next chapter">
            <span aria-hidden="true">&#8250;&#8250;</span>
          </button>
        </>
      )}
      <div className="audiobook-extras" ref={rootRef}>
        <button
          type="button"
          className={`control-btn audiobook-bookmark-btn ${open ? 'active' : ''}`.trim()}
          onClick={() => setOpen((value) => !value)}
          onDoubleClick={() => void addHere()}
          aria-label="Bookmarks and chapters"
          aria-expanded={open}
          title="Bookmarks and chapters (double-click to bookmark this spot)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 3h12v18l-6-4-6 4z" />
          </svg>
          {bookmarks.length > 0 && ready && <span className="audiobook-bookmark-count">{bookmarks.length}</span>}
        </button>
        {cue && <span className="audiobook-cue" title={cueTitle}>{cue}</span>}

        {open && (
          <div className="audiobook-panel" role="dialog" aria-label="Bookmarks and chapters">
            <div className="audiobook-panel-tabs">
              <button type="button" className={tab === 'bookmarks' ? 'active' : ''} onClick={() => setTab('bookmarks')}>
                Bookmarks{ready ? ` (${bookmarks.length})` : ''}
              </button>
              <button type="button" className={tab === 'chapters' ? 'active' : ''} onClick={() => setTab('chapters')} disabled={chapters.length === 0}>
                Chapters{chapters.length ? ` (${chapters.length})` : ''}
              </button>
            </div>

            {tab === 'bookmarks' ? (
              <>
                <button type="button" className="audiobook-panel-add" onClick={() => void addHere()}>
                  + Bookmark at {formatTimestamp(currentTime)}
                </button>
                {error && <div className="audiobook-panel-error" role="alert">{error}</div>}
                <ul className="audiobook-panel-list">
                  {bookmarks.length === 0 && <li className="audiobook-panel-empty">No bookmarks yet. They are saved next to the audio file as a Markdown file.</li>}
                  {bookmarks.map((bookmark) => (
                    <li key={bookmark.id} className="audiobook-panel-item">
                      <button type="button" className="audiobook-panel-time" onClick={() => jumpTo(bookmark.position)} title="Jump here">
                        {formatTimestamp(bookmark.position)}
                      </button>
                      <textarea
                        className="audiobook-panel-note"
                        rows={bookmark.note.includes('\n') ? 3 : 1}
                        placeholder="Add a note"
                        value={drafts[bookmark.id] ?? bookmark.note}
                        autoFocus={focusId === bookmark.id}
                        onFocus={() => setFocusId(null)}
                        onChange={(event) => setDrafts((current) => ({ ...current, [bookmark.id]: event.target.value }))}
                        onBlur={() => commitNote(bookmark.id, bookmark.note)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault()
                            ;(event.target as HTMLTextAreaElement).blur()
                          }
                          event.stopPropagation()
                        }}
                      />
                      <button type="button" className="audiobook-panel-delete" onClick={() => void remove(bookmark.id)} aria-label="Delete bookmark" title="Delete">
                        &times;
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <ul className="audiobook-panel-list">
                {chapters.map((chapter, index) => (
                  <li key={`${chapter.start}-${index}`}>
                    <button type="button" className={`audiobook-panel-chapter ${index === chapterIndex ? 'active' : ''}`.trim()} onClick={() => jumpTo(chapter.start)}>
                      <span className="audiobook-panel-time">{formatTimestamp(chapter.start)}</span>
                      <span className="audiobook-panel-chapter-title">{chapter.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </>
  )
}
