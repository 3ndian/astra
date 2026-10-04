// Butterchurn ships no TypeScript types. Only the calls Astra uses are described here.
declare module 'butterchurn' {
  interface ButterchurnVisualizer {
    connectAudio(node: AudioNode): void
    disconnectAudio?(node: AudioNode): void
    loadPreset(preset: unknown, blendSeconds: number): void | Promise<void>
    setRendererSize(width: number, height: number): void
    render(): void
  }
  interface ButterchurnOptions {
    width: number
    height: number
    pixelRatio?: number
  }
  const butterchurn: {
    createVisualizer(context: AudioContext, canvas: HTMLCanvasElement, options: ButterchurnOptions): ButterchurnVisualizer
  }
  export default butterchurn
  export type { ButterchurnVisualizer }
}

declare module 'butterchurn-presets' {
  const presets: { getPresets(): Record<string, unknown> }
  export default presets
}
