#!/usr/bin/env node
//
// Reads a Last.fm scrobble CSV (uts, utc_time, artist, artist_mbid, album, album_mbid, track,
// track_mbid) and writes:
//   * a printed summary: total plays, first/last date, plays per year, busiest days, top artists
//   * <out>-per-day.csv  (date,plays)     -- ready to plot
//   * <out>-per-month.csv (month,plays)
//
//   node scripts/tools/scrobble-summary.mjs scrobbles.csv scrobble-stats
//
// Dates are in UTC (that is what Last.fm's `uts` means).

import { readFileSync, writeFileSync } from 'node:fs'
import { scrobblesFromCsv } from './lastfm-to-astra.mjs'

const [inputPath, outPrefix = 'scrobble-stats'] = process.argv.slice(2)
if (!inputPath) {
  console.error('usage: node scrobble-summary.mjs <scrobbles.csv> [output-prefix]')
  process.exit(1)
}

const rows = scrobblesFromCsv(readFileSync(inputPath, 'utf-8'))
  .filter((row) => Number.isFinite(row.uts) && row.uts > 0)
  .sort((a, b) => a.uts - b.uts)

if (rows.length === 0) {
  console.error('No scrobbles with a usable uts timestamp were found.')
  process.exit(1)
}

const perDay = new Map()
const perMonth = new Map()
const perYear = new Map()
const perArtist = new Map()
for (const row of rows) {
  const iso = new Date(row.uts * 1000).toISOString()
  const day = iso.slice(0, 10)
  perDay.set(day, (perDay.get(day) ?? 0) + 1)
  perMonth.set(day.slice(0, 7), (perMonth.get(day.slice(0, 7)) ?? 0) + 1)
  perYear.set(day.slice(0, 4), (perYear.get(day.slice(0, 4)) ?? 0) + 1)
  perArtist.set(row.artist, (perArtist.get(row.artist) ?? 0) + 1)
}

const first = new Date(rows[0].uts * 1000).toISOString().slice(0, 10)
const last = new Date(rows[rows.length - 1].uts * 1000).toISOString().slice(0, 10)
console.log(`${rows.length.toLocaleString()} plays, ${first} to ${last}, ${perDay.size.toLocaleString()} active days`)
console.log('\nPlays per year:')
for (const [year, count] of [...perYear].sort()) console.log(`  ${year}  ${count.toLocaleString()}`)
console.log('\nBusiest days:')
for (const [day, count] of [...perDay].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`  ${day}  ${count.toLocaleString()}`)
console.log('\nTop artists:')
for (const [artist, count] of [...perArtist].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${count.toLocaleString().padStart(7)}  ${artist}`)

const csv = (header, map) => `${header}\n${[...map].sort().map(([k, v]) => `${k},${v}`).join('\n')}\n`
writeFileSync(`${outPrefix}-per-day.csv`, csv('date,plays', perDay))
writeFileSync(`${outPrefix}-per-month.csv`, csv('month,plays', perMonth))
console.log(`\nWrote ${outPrefix}-per-day.csv and ${outPrefix}-per-month.csv`)
