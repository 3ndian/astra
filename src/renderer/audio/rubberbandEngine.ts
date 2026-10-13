// The Rubber Band pitch engine. Kept in its own file so the app still runs if the package is not installed:
// AudioEngine loads this file on demand and falls back to the Smooth engine when that fails.
//
// Setup (once):
//   npm install rubberband-web
//   cp node_modules/rubberband-web/public/rubberband-processor.js src/renderer/public/
// Rubber Band is GPL licensed.

export interface RubberBandPitchNode extends AudioWorkletNode {
  setPitch: (ratio: number) => void
  setTempo?: (ratio: number) => void
  setHighQuality?: (on: boolean) => void
}

type NodeFactory = (ctx: AudioContext, processorUrl: string) => Promise<RubberBandPitchNode>

// Releases of the package have used different names for the same helper, so look for whichever one is there.
const FACTORY_NAMES = ['createRubberBandRealtimeNode', 'createRubberBandNode', 'createRealtimeNode', 'createNode']

function findFactory(moduleExports: Record<string, unknown>): NodeFactory | null {
  const candidates: unknown[] = [
    ...FACTORY_NAMES.map((name) => moduleExports[name]),
    (moduleExports.default as Record<string, unknown> | undefined)?.[FACTORY_NAMES[0]],
    (moduleExports.default as Record<string, unknown> | undefined)?.[FACTORY_NAMES[1]]
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'function') return candidate as NodeFactory
  }
  const loose = Object.keys(moduleExports).find((key) => /^create.*Node$/i.test(key) && typeof moduleExports[key] === 'function')
  return loose ? (moduleExports[loose] as NodeFactory) : null
}

export async function createRubberBandPitchNode(ctx: AudioContext, processorUrl: string): Promise<RubberBandPitchNode> {
  // Loaded by name at run time, so the build works whatever the package version exports.
  // @ts-ignore - the package may or may not ship type declarations
  const moduleExports = (await import('rubberband-web')) as unknown as Record<string, unknown>
  const factory = findFactory(moduleExports)
  if (!factory) {
    const names = Object.keys(moduleExports).join(', ') || '(nothing)'
    throw new Error(`rubberband-web has no node factory I recognise. It exports: ${names}`)
  }
  const node = await factory(ctx, processorUrl)
  if (typeof node.setPitch !== 'function') {
    throw new Error('rubberband-web node has no setPitch method')
  }
  // The speed itself is already done by the player; this stage only moves the pitch.
  try { node.setTempo?.(1) } catch { /* optional */ }
  try { node.setHighQuality?.(true) } catch { /* optional */ }
  try {
    node.channelCount = 2
    node.channelCountMode = 'explicit'
  } catch {
    // Keep whatever the package set up.
  }
  return node
}
