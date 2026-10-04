#!/usr/bin/env node
//
// Last.fm scrobbles -> Astra listening import file. Accepts JSON (array of scrobbles) or CSV.
//
//   node scripts/tools/lastfm-to-astra.mjs scrobbles.csv astra-lastfm.json
//
// CSV: either a header row (uts, artist, album, track/name/title columns, in any order) or
// the headerless layout used by common exporters: uts, utc_time, artist, artist_mbid, album,
// album_mbid, track. `uts` is Last.fm's timestamp in SECONDS.
//
// Re-running it on a newer export and importing the result again is safe: every listen has a
// stable key (lastfm-<uts>), so Astra merges instead of doubling.
//
// Import the result from Settings -> Info -> Imported Listening Data (removable per source).
// Back up library.db first.

import { readFileSync, writeFileSync } from 'node:fs'

// Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, newlines inside quotes).
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1 }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(field); field = ''
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some((cell) => cell !== '')) rows.push(row)
  return rows
}

export function scrobblesFromCsv(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''))
  if (rows.length === 0) return []
  const first = rows[0]
  const headerless = /^\d+$/.test((first[0] ?? '').trim())
  let col = { uts: 0, artist: 2, album: 4, track: 6 }
  let data = rows
  if (!headerless) {
    const names = first.map((cell) => cell.trim().toLowerCase())
    const find = (...keys) => names.findIndex((name) => keys.includes(name))
    col = {
      uts: find('uts', 'timestamp', 'date'),
      artist: find('artist'),
      album: find('album'),
      track: find('track', 'name', 'title')
    }
    if (col.uts < 0 || col.artist < 0 || col.track < 0) {
      throw new Error('CSV needs uts, artist and track columns (header row not recognised)')
    }
    data = rows.slice(1)
  }
  return data.map((r) => ({
    uts: Number(r[col.uts]),
    artist: r[col.artist] ?? '',
    album: col.album >= 0 ? (r[col.album] ?? '') : '',
    track: r[col.track] ?? ''
  }))
}


// Last.fm scrobbles at half the track or 4 minutes, whichever comes first, and never records
// how long you actually listened. Duration is an estimate; see the clamp below.
const ASSUMED_TRACK_SECONDS = 210
const EARLIEST_PLAUSIBLE_MS = 946684800000

const norm = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
const IDENTITY_SEPARATOR = ''

function convert(scrobbles) {
  const trackIndexByKey = new Map()
  const tracks = []
  const indexOf = (title, artist, album) => {
    const key = [title, artist, album].join(IDENTITY_SEPARATOR).toLowerCase()
    const existing = trackIndexByKey.get(key)
    if (existing !== undefined) return existing
    const index = tracks.length
    tracks.push([title, artist, album, ''])
    trackIndexByKey.set(key, index)
    return index
  }

  // Oldest first, so each scrobble can see the one that follows it.
  const rows = scrobbles
    .map((raw) => ({
      title: norm(raw.track ?? raw.name ?? raw.title),
      artist: norm(raw.artist),
      album: norm(raw.album),
      uts: Number(raw.uts ?? raw.timestamp ?? raw.date),
      duration: Number(raw.durationSeconds) > 0 ? Number(raw.durationSeconds) : ASSUMED_TRACK_SECONDS
    }))
    .filter((row) => row.title && row.artist && Number.isFinite(row.uts) && row.uts > 0)
    .sort((a, b) => a.uts - b.uts)

  const events = []
  const playCounts = new Map()
  const lastPlayed = new Map()

  rows.forEach((row, i) => {
    // Last.fm is in SECONDS, Astra in MILLISECONDS. Astra rejects a file that is entirely in
    // seconds, but checking here catches a mixed-unit source with a useful message.
    const startedAt = Math.round(row.uts * 1000)
    if (startedAt < EARLIEST_PLAUSIBLE_MS || startedAt > Date.now() + 86400000) {
      throw new Error(`implausible timestamp for "${row.title}": ${new Date(startedAt).toISOString()}`)
    }

    // Cap the guessed duration at the gap to the next scrobble. One person cannot play two
    // things at once, so an overlap would only ever be evidence that the guess ran long --
    // and Astra would then report more listening time than actually elapsed.
    const next = rows[i + 1]
    const gapSeconds = next ? next.uts - row.uts : Number.POSITIVE_INFINITY
    const listenedSeconds = Math.max(1, Math.min(row.duration, gapSeconds))

    const trackIndex = indexOf(row.title, row.artist, row.album)
    // Stable across runs because it is derived from the data, never a counter or a random
    // value. This is what makes re-importing merge instead of duplicate.
    const playKey = `lastfm-${row.uts}`

    events.push([trackIndex, playKey, startedAt, startedAt + listenedSeconds * 1000, listenedSeconds, true])
    playCounts.set(trackIndex, (playCounts.get(trackIndex) ?? 0) + 1)
    lastPlayed.set(trackIndex, Math.max(lastPlayed.get(trackIndex) ?? 0, startedAt))
  })

  return {
    kind: 'astra-listening-import',
    formatVersion: 1,
    // Names the service, not this tool -- it is the key the import is removed by.
    source: 'lastfm',
    generator: 'lastfm-to-astra 1.0',
    generatedAt: new Date().toISOString(),
    tracks,
    plays: [...playCounts.entries()].map(([index, count]) => [index, count, lastPlayed.get(index) ?? null]),
    events
  }
}

function main() {
  const [inputPath, outputPath = 'astra-lastfm.json'] = process.argv.slice(2)
  if (!inputPath) {
    console.error('usage: node lastfm-to-astra.mjs <scrobbles.csv|json> [output.json]')
    process.exit(1)
  }
  const text = readFileSync(inputPath, 'utf-8')
  const scrobbles = inputPath.toLowerCase().endsWith('.json') ? JSON.parse(text) : scrobblesFromCsv(text)
  const file = convert(scrobbles)
  writeFileSync(outputPath, JSON.stringify(file), 'utf-8')
  console.log(`${file.events.length} listens, ${file.tracks.length} tracks -> ${outputPath}`)
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main()

export { convert }
