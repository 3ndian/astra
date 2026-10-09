import { isWantedMatch } from '../../shared/wanted/wantedMatch'

// Spotify does not tell us when an album came out, so the year is looked up once per album from
// Apple's public search (no account needed) and remembered. Best effort: it may be a reissue's
// year, and obscure albums may not be found.

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search'

interface ItunesAlbum {
  collectionName?: string
  artistName?: string
  releaseDate?: string
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>

/** Resolves to the year, null when no matching album exists, and throws when the lookup itself fails. */
export async function lookupAlbumYear(artist: string, album: string, fetchImpl: FetchLike): Promise<number | null> {
  const url = `${ITUNES_SEARCH_URL}?${new URLSearchParams({ term: `${artist} ${album}`, entity: 'album', limit: '10' })}`
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error('album year lookup failed')
  const body = (await response.json()) as { results?: ItunesAlbum[] }
  let best: number | null = null
  for (const result of body.results ?? []) {
    if (!result.collectionName || !result.artistName || !result.releaseDate) continue
    if (!isWantedMatch({ title: album, artist }, { title: result.collectionName, artist: result.artistName })) continue
    const year = Number(result.releaseDate.slice(0, 4))
    if (!Number.isInteger(year) || year < 1900 || year > 2100) continue
    // Several editions can match; the earliest is the original release.
    if (best === null || year < best) best = year
  }
  return best
}
