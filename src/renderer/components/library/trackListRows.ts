export interface TrackListDiscTrackLike {
  disc_number: number | null | undefined
}

export type TrackListVirtualRow =
  | { kind: 'disc-header'; discNumber: number }
  | { kind: 'track'; trackIndex: number }
  | { kind: 'placeholder-header'; count: number }
  | { kind: 'placeholder'; placeholderIndex: number }

function normalizeDiscNumber(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 1
  return Math.trunc(value)
}

function shouldShowDiscHeaders(tracks: readonly TrackListDiscTrackLike[]): boolean {
  const distinctDiscNumbers = new Set<number>()
  for (const track of tracks) {
    distinctDiscNumbers.add(normalizeDiscNumber(track.disc_number))
    if (distinctDiscNumbers.size >= 2) return true
  }
  return false
}

/** Appends the greyed "Not downloaded" group (header + one row each) after the real tracks. */
export function buildTrackListRows(
  tracks: readonly TrackListDiscTrackLike[],
  showDiscHeaders: boolean,
  placeholderCount = 0
): TrackListVirtualRow[] {
  const rows = buildTrackRows(tracks, showDiscHeaders)
  if (placeholderCount > 0) {
    rows.push({ kind: 'placeholder-header', count: placeholderCount })
    for (let placeholderIndex = 0; placeholderIndex < placeholderCount; placeholderIndex += 1) {
      rows.push({ kind: 'placeholder', placeholderIndex })
    }
  }
  return rows
}

function buildTrackRows(
  tracks: readonly TrackListDiscTrackLike[],
  showDiscHeaders: boolean
): TrackListVirtualRow[] {
  if (!showDiscHeaders || !shouldShowDiscHeaders(tracks)) {
    return tracks.map((_, trackIndex) => ({ kind: 'track', trackIndex }))
  }

  const rows: TrackListVirtualRow[] = []
  let previousDiscNumber: number | null = null

  tracks.forEach((track, trackIndex) => {
    const discNumber = normalizeDiscNumber(track.disc_number)
    if (discNumber !== previousDiscNumber) {
      rows.push({ kind: 'disc-header', discNumber })
      previousDiscNumber = discNumber
    }
    rows.push({ kind: 'track', trackIndex })
  })

  return rows
}
