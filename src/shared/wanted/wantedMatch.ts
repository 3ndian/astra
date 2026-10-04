// Decides whether a newly imported local file is the song a "Not downloaded" placeholder was
// waiting for. Deliberately conservative: title AND artist must agree after tidying up the usual
// store/streaming noise (remaster tags, "feat." credits, punctuation, accents). The album is
// ignored on purpose, because the purchased copy is often a different edition (deluxe, remaster).
// Pure, so it can be tested.

export interface TrackIdentity {
  title: string
  artist: string
  album?: string
}

const NOISE_IN_BRACKETS = /[([]\s*(?:feat\.?|ft\.?|featuring|with)\s[^)\]]*[)\]]/gi
const EDITION_TAGS = /[([]\s*(?:\d{4}\s+)?(?:remaster(?:ed)?|digital remaster|explicit|clean|deluxe(?: edition)?|bonus track|mono|stereo)(?:\s+\d{4}|\s+version)?\s*[)\]]/gi
const DASH_EDITION = /\s[-–—]\s(?:\d{4}\s+)?(?:remaster(?:ed)?(?:\s+\d{4})?|digital remaster(?:ed)?|mono(?: version)?|stereo(?: version)?)\s*$/i

export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(NOISE_IN_BRACKETS, ' ')
    .replace(EDITION_TAGS, ' ')
    .replace(DASH_EDITION, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function artistTokens(artist: string): Set<string> {
  const stripped = artist
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+(?:feat\.?|ft\.?|featuring|with|and|x)\s+/g, ';')
    .replace(/\s*&\s*/g, ';')
    .replace(/\s*[,/]\s*/g, ';')
  const tokens = new Set<string>()
  for (const part of stripped.split(';')) {
    const cleaned = part.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    if (cleaned) tokens.add(cleaned)
  }
  return tokens
}

export function isWantedMatch(wanted: TrackIdentity, candidate: TrackIdentity): boolean {
  const wantedTitle = normalizeForMatch(wanted.title)
  if (!wantedTitle || wantedTitle !== normalizeForMatch(candidate.title)) return false
  const wantedArtists = artistTokens(wanted.artist)
  if (wantedArtists.size === 0) return false
  for (const token of artistTokens(candidate.artist)) {
    if (wantedArtists.has(token)) return true
  }
  return false
}
