// Pure helpers for Milkdrop (Butterchurn) presets: validating imported files and
// stepping through the preset list. No Electron or DOM here so it can be unit tested.

export interface ParsedPreset {
  name: string
  preset: Record<string, unknown>
}

export type PresetFileResult =
  | { ok: true; presets: ParsedPreset[] }
  | { ok: false; reason: 'milk-unsupported' | 'invalid-json' | 'not-a-preset' }

/** A Butterchurn preset is a JSON object with a `baseVals` object. */
export function looksLikePreset(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const baseVals = (value as Record<string, unknown>).baseVals
  return !!baseVals && typeof baseVals === 'object' && !Array.isArray(baseVals)
}

export function presetNameFromFile(fileName: string): string {
  return fileName.replace(/\.(json|milk)$/i, '').trim() || 'Untitled preset'
}

/** Safe file name for storing an imported preset on disk. */
export function sanitizePresetFileName(name: string): string {
  const cleaned = name.replace(/\.(json|milk)$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)
  return (cleaned || 'preset') + '.json'
}

/**
 * Accepts either one Butterchurn preset JSON or a pack (an object of name -> preset).
 * Raw `.milk` files need converting to Butterchurn JSON first, so they are rejected
 * with a clear reason rather than silently failing to render.
 */
export function parsePresetFile(fileName: string, text: string): PresetFileResult {
  if (/\.milk$/i.test(fileName)) return { ok: false, reason: 'milk-unsupported' }

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }

  if (looksLikePreset(data)) {
    return { ok: true, presets: [{ name: presetNameFromFile(fileName), preset: data }] }
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const presets: ParsedPreset[] = []
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (looksLikePreset(value)) presets.push({ name: key, preset: value })
    }
    if (presets.length > 0) return { ok: true, presets }
  }

  return { ok: false, reason: 'not-a-preset' }
}

export const REASON_TEXT: Record<string, string> = {
  'milk-unsupported': 'Raw .milk files must be converted to Butterchurn .json first',
  'invalid-json': 'Not valid JSON',
  'not-a-preset': 'No Butterchurn preset found in this file'
}

// ---- Stepping through the list ----

export type CycleMode = 'next' | 'previous' | 'random'

/** Picks the next preset index. `random` avoids repeating the current one. */
export function stepIndex(count: number, current: number, mode: CycleMode, rand: () => number = Math.random): number {
  if (count <= 0) return -1
  if (count === 1) return 0
  if (mode === 'next') return (current + 1 + count) % count
  if (mode === 'previous') return (current - 1 + count) % count
  let pick = Math.floor(rand() * (count - 1))
  if (pick >= current) pick += 1
  return Math.min(pick, count - 1)
}

export function sortPresetNames(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

export const AUTO_CYCLE_CHOICES = [0, 15, 30, 60, 120] as const
export const BLEND_CHOICES = [0, 1.5, 3, 5.7] as const
