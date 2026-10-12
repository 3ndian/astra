// The Rubber Band pitch engine. Kept in its own file so the app still runs if the package is not installed:
// AudioEngine loads this file on demand and falls back to the Smooth engine when that fails.
//
// Setup (once):
//   npm install rubberband-web
//   cp node_modules/rubberband-web/public/rubberband-processor.js src/renderer/public/
// Rubber Band is GPL licensed.
// @ts-ignore - the package may or may not ship type declarations
import { createRubberBandRealtimeNode } from 'rubberband-web'

export interface RubberBandPitchNode extends AudioWorkletNode {
  setPitch: (ratio: number) => void
  setTempo: (ratio: number) => void
  setHighQuality: (on: boolean) => void
}

export async function createRubberBandPitchNode(ctx: AudioContext, processorUrl: string): Promise<RubberBandPitchNode> {
  const node = (await createRubberBandRealtimeNode(ctx, processorUrl)) as RubberBandPitchNode
  // The speed itself is already done by the player; this stage only moves the pitch.
  node.setTempo(1)
  node.setHighQuality(true)
  try {
    node.channelCount = 2
    node.channelCountMode = 'explicit'
  } catch {
    // Keep whatever the package set up.
  }
  return node
}
