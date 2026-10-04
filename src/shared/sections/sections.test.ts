import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_SECTION_ID,
  addSection,
  createDefaultRegistry,
  normalizeRegistry,
  removeSection,
  renameSection,
  sectionDataSubdir,
  setActiveSection,
  slugifySectionName,
  updateSectionFlag,
  type SectionResult
} from './sections.ts'

// Narrows a SectionResult to its success branch (throws with the error otherwise).
function ok(result: SectionResult): Extract<SectionResult, { ok: true }> {
  if (!result.ok) throw new Error(result.error)
  return result
}

const NOW = 1_700_000_000_000

test('default registry has only the Music section, active', () => {
  const registry = createDefaultRegistry(NOW)
  assert.equal(registry.activeId, DEFAULT_SECTION_ID)
  assert.deepEqual(registry.sections.map((s) => s.id), ['music'])
})

test('audiobook sections default to no scrobble/discord/stats; custom sections default on', () => {
  let result = ok(addSection(createDefaultRegistry(NOW), { name: 'Audiobooks', kind: 'audiobook' }, NOW))
  assert.equal(result.section.scrobble, false)
  assert.equal(result.section.discordPresence, false)
  assert.equal(result.section.listeningStats, false)
  result = ok(addSection(result.registry, { name: 'Video Game Music' }, NOW))
  assert.equal(result.section.kind, 'custom')
  assert.equal(result.section.scrobble, true)
})

test('names are trimmed, deduplicated case-insensitively, and required', () => {
  const base = createDefaultRegistry(NOW)
  assert.equal(addSection(base, { name: '   ' }, NOW).ok, false)
  assert.equal(addSection(base, { name: 'music' }, NOW).ok, false)
  const added = ok(addSection(base, { name: '  Game   OST  ' }, NOW))
  assert.equal(added.section.name, 'Game OST')
  assert.equal(addSection(added.registry, { name: 'game ost' }, NOW).ok, false)
})

test('slugs are filesystem-safe and unique', () => {
  assert.equal(slugifySectionName('Video Game Music!', []), 'video-game-music')
  assert.equal(slugifySectionName('Café ☕', []), 'cafe')
  assert.equal(slugifySectionName('!!!', []), 'section')
  assert.equal(slugifySectionName('Music', ['music']), 'music-2')
  assert.equal(slugifySectionName('../../etc', []), 'etc')
})

test('cannot remove the default section; removing the active one falls back to Music', () => {
  assert.equal(removeSection(createDefaultRegistry(NOW), DEFAULT_SECTION_ID).ok, false)
  const added = ok(addSection(createDefaultRegistry(NOW), { name: 'Books', kind: 'audiobook' }, NOW))
  const active = ok(setActiveSection(added.registry, added.section.id))
  const removed = ok(removeSection(active.registry, added.section.id))
  assert.equal(removed.registry.activeId, DEFAULT_SECTION_ID)
  assert.equal(removed.registry.sections.length, 1)
})

test('rename and flag updates only touch the target section', () => {
  const added = ok(addSection(createDefaultRegistry(NOW), { name: 'Books', kind: 'audiobook' }, NOW))
  const renamed = ok(renameSection(added.registry, added.section.id, 'Audio Books'))
  assert.equal(renamed.section.id, added.section.id)
  assert.equal(renameSection(renamed.registry, added.section.id, 'Music').ok, false)
  const flagged = ok(updateSectionFlag(renamed.registry, added.section.id, 'scrobble', true))
  assert.equal(flagged.registry.sections.find((s) => s.id === 'music')?.scrobble, true)
  assert.equal(flagged.registry.sections.find((s) => s.id === added.section.id)?.scrobble, true)
})

test('normalizeRegistry repairs corrupt data', () => {
  assert.deepEqual(normalizeRegistry(null, NOW), createDefaultRegistry(NOW))
  const repaired = normalizeRegistry(
    {
      activeId: 'ghost',
      sections: [
        { id: 'books', name: 'Books', kind: 'audiobook' },
        { id: 'books', name: 'Dupe', kind: 'custom' },
        { id: '../evil', name: 'Evil' },
        { id: 'noname', name: '' },
        'junk'
      ]
    },
    NOW
  )
  assert.deepEqual(repaired.sections.map((s) => s.id), ['music', 'books'])
  assert.equal(repaired.activeId, DEFAULT_SECTION_ID)
  assert.equal(repaired.sections[1].scrobble, false)
})

test('data dirs: default keeps legacy root, others are namespaced, bad ids throw', () => {
  assert.deepEqual(sectionDataSubdir(DEFAULT_SECTION_ID), [])
  assert.deepEqual(sectionDataSubdir('books'), ['sections', 'books'])
  assert.throws(() => sectionDataSubdir('../x'))
})
