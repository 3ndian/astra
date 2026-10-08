// Controlled database/fixture setup and a counterbalanced matrix for the real UI harness.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync, execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const completedMigrations = ['file_created_at_backfill_v1_done', 'audio_metadata_backfill_v2_done', 'artist_credits_backfill_v1_done', 'genre_metadata_backfill_v1_done', 'replaygain_backfill_v3_done']

function cases() {
  const primary = []
  for (const size of [12, 1000, 50000]) {
    for (const position of ['first', 'middle', 'last']) primary.push({ route: 'row', position, size })
    primary.push({ route: size === 12 ? 'album' : 'artist', position: 'first', size })
    primary.push({ route: 'home', position: 'first', size })
  }
  const variants = []
  for (const variant of ['shuffle', 'panel', 'metadata']) {
    for (const route of ['row', 'artist', 'home']) variants.push({ route, position: 'first', size: 50000, variant })
  }
  variants.push({ route: 'row', position: 'first', size: 12, librarySize: 50000, variant: 'fixed-library' })
  return [...primary, ...variants].flatMap((item) => [true, false].map((controlled) => {
    const result = { variant: 'primary', ...item, controlled }
    return { ...result, name: `${result.route}-${result.position}-${result.size}-${result.variant}-${controlled ? 'controlled' : 'real'}` }
  }))
}

function seedDatabase(profile, config) {
  const librarySize = config.librarySize ?? config.size
  console.log(`Seeding ${librarySize * 2} tracks`)
  const db = new (require('better-sqlite3'))(path.join(profile, 'library.db'))
  const stat = fs.statSync(config.path)
  const insertTrack = db.prepare(`INSERT INTO tracks (path, title, artist, artist_names_json, album, album_artist, album_artist_names_json,
    duration, track_number, track_total, disc_number, disc_total, genre, genre_names_json, format, sample_rate, bit_depth, channels, added_at, modified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 180, ?, ?, 1, 1, ?, ?, 'flac', 48000, 16, 2, ?, ?)`)
  const insertLoudness = db.prepare(`INSERT INTO track_loudness (track_path, loudness_lufs, peak_linear, method, file_size, file_mtime_ms, analyzed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
  const insertEntry = db.prepare('INSERT INTO playlist_tracks (playlist_id, track_path, position, added_at) VALUES (?, ?, ?, ?)')
  const loudness = JSON.parse(fs.readFileSync(config.loudnessPath, 'utf8'))
  const now = Date.now()
  db.transaction(() => {
    // These records model an already-scanned library. Fresh-profile migrations
    // must not re-scan 100,000 fixture links or invalidate the snapshot per file.
    for (const key of completedMigrations) {
      db.prepare("INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES (?, '1', ?)").run(key, now)
    }
    for (const [group, playlistId] of [['A', 1], ['B', 2]]) {
      db.prepare('INSERT INTO playlists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(playlistId, `Benchmark Playlist ${group}`, now, now)
      const artist = `Benchmark Artist ${group}`
      for (let i = 0; i < librarySize; i++) {
        const trackPath = path.join(config.fixtures, group, `${String(i).padStart(6, '0')}.flac`)
        const album = `Benchmark Album ${group}` + (librarySize > 12 ? ` ${String(Math.floor(i / 12)).padStart(6, '0')}` : '')
        const genre = `Benchmark Genre ${group}`
        insertTrack.run(trackPath, `Track ${String(i).padStart(6, '0')}`, artist, JSON.stringify([artist]), album, artist, JSON.stringify([artist]), i % 12 + 1, Math.min(12, librarySize - Math.floor(i / 12) * 12), genre, JSON.stringify([genre]), now, now)
        insertEntry.run(playlistId, trackPath, i, now)
        insertLoudness.run(trackPath, loudness.loudnessLufs, loudness.peakLinear, 'ebur128', stat.size, Math.round(stat.mtimeMs), now)
      }
    }
    db.prepare(`UPDATE tracks SET codec = 'flac', is_atmos_joc = 0, is_iamf = 0,
      file_created_at = ?, file_created_at_scanned = 1, replaygain_track_gain_scanned = 1,
      replaygain_album_gain_scanned = 1`).run(Math.round(stat.birthtimeMs))
  })()
  db.close()
  console.log('Fixture database seeded')
}

function run(output, launch) {
  fs.mkdirSync(output, { recursive: true })
  const fixtures = path.join(output, 'fixtures')
  fs.mkdirSync(fixtures, { recursive: true })
  const fixturePath = path.join(fixtures, 'stereo.flac')
  if (!fs.existsSync(fixturePath)) {
    execFileSync(require('ffmpeg-static'), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=180', '-ac', '2', '-sample_fmt', 's16', '-c:a', 'flac', fixturePath])
  }
  const loudnessPath = path.join(fixtures, 'loudness.json')
  if (!fs.existsSync(loudnessPath)) {
    const analysis = spawnSync(require('ffmpeg-static'), ['-hide_banner', '-i', fixturePath, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' })
    if (analysis.status !== 0) throw new Error(analysis.stderr)
    const parsed = JSON.parse(analysis.stderr.slice(analysis.stderr.lastIndexOf('{')))
    fs.writeFileSync(loudnessPath, JSON.stringify({ loudnessLufs: Number(parsed.input_i), peakLinear: 10 ** (Number(parsed.input_tp) / 20) }))
  }
  const selected = cases().filter((item) => !process.env.ASTRA_PLAY_BENCH_CASE || new RegExp(process.env.ASTRA_PLAY_BENCH_CASE).test(item.name))
  if (!selected.length) throw new Error('No benchmark cases selected')
  for (const group of ['A', 'B']) {
    const directory = path.join(fixtures, group)
    fs.mkdirSync(directory, { recursive: true })
    for (let i = 0; i < Math.max(...selected.map((item) => item.librarySize ?? item.size)); i++) {
      const link = path.join(directory, `${String(i).padStart(6, '0')}.flac`)
      if (!fs.existsSync(link)) fs.symlinkSync(fixturePath, link)
    }
  }
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const sourceDiff = execFileSync('git', ['diff', '--', 'src'], { encoding: 'utf8' })
  const files = fs.readdirSync(__dirname).filter((name) => /^click-to-play\./.test(name)).sort()
  const harnessHashes = Object.fromEntries(files.map((name) => [name, createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex')]))
  const buildHashes = {}
  const scanBuild = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name)
      if (item.isDirectory()) scanBuild(file)
      else if (/\.(js|html|css)$/.test(item.name)) buildHashes[path.relative(path.resolve('.astra-playback-benchmark/ui'), file)] = createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    }
  }
  scanBuild(path.resolve('.astra-playback-benchmark/ui'))
  const harnessHash = createHash('sha256').update(JSON.stringify({ harnessHashes, buildHashes })).digest('hex')
  const repetitions = Number(process.env.ASTRA_PLAY_BENCH_RUNS ?? 5)
  const warmClicks = Number(process.env.ASTRA_PLAY_BENCH_WARM ?? 10)
  if (!Number.isInteger(repetitions) || repetitions < 1 || !Number.isInteger(warmClicks) || warmClicks < 0) throw new Error('Runs must be positive and warm clicks nonnegative integers')
  const manifestPath = path.join(output, 'manifest.json')
  const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath)) : null
  if (previous && (previous.harnessHash !== harnessHash || previous.repetitions !== repetitions || previous.warmClicks !== warmClicks || JSON.stringify(previous.cases) !== JSON.stringify(selected))) {
    throw new Error('Benchmark build or matrix changed; use a new results directory to avoid mixing experiments')
  }
  fs.writeFileSync(manifestPath, JSON.stringify({ revision, sourceDiff, harnessHash, harnessHashes, buildHashes, repetitions, warmClicks, cases: selected, startedAt: previous?.startedAt ?? new Date().toISOString() }, null, 2))
  let failures = 0
  for (let run = 0; run < repetitions; run++) {
    // Rotate and reverse between fresh-process rounds, rather than running all
    // sizes/modes in one fixed order. Pair controlled/real cases locally.
    const offset = (run * 10) % selected.length
    const ordered = [...selected.slice(offset), ...selected.slice(0, offset)]
    if (run % 2) ordered.reverse()
    for (const item of ordered) {
      if (fs.existsSync(path.join(output, 'STOP'))) return
      const resultPath = path.join(output, `${item.name}-${run}.result.json`)
      if (fs.existsSync(resultPath)) {
        const existing = JSON.parse(fs.readFileSync(resultPath))
        if (existing.config.harnessHash && existing.config.harnessHash !== harnessHash) throw new Error('Harness changed; use a new results directory to avoid mixing builds')
        if (!existing.failure && existing.config.harnessHash === harnessHash && existing.config.warmClicks === warmClicks) continue
      }
      const config = { ...item, ui: true, debugSetup: process.env.ASTRA_PLAY_BENCH_DEBUG === '1', profileClick: process.env.ASTRA_PLAY_BENCH_PROFILE === '1', build: 'ui', path: fixturePath, fixtures, loudnessPath, warmClicks, run, revision, harnessHash, output: resultPath }
      const configPath = resultPath.replace('.result.json', '.json')
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
      try { launch(configPath) } catch (error) {
        failures++
        const result = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath)) : { config, samples: [] }
        result.processFailure = String(error)
        result.failure ??= String(error)
        fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
        console.error(String(error))
      }
      console.log(`${item.name} round ${run + 1}/${repetitions}`)
    }
  }
  if (failures) process.exitCode = 1
}

module.exports = { run, seedDatabase, cases, completedMigrations }
