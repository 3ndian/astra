import { execFile } from 'node:child_process'
import type { SpotifyCommand, SpotifyStatus } from '../../types/spotify'
import {
  SPOTIFY_STATUS_SCRIPT,
  emptySpotifyStatus,
  parseSpotifyStatusOutput,
  scriptForCommand
} from '../../shared/spotify/spotifyStatus'

// Controls the Spotify DESKTOP app through its AppleScript interface (macOS). Nothing here talks
// to Spotify's web API, so no login or developer account is involved, and Astra never touches
// Spotify's audio. Linux (MPRIS) is a later addition.

const OSASCRIPT_TIMEOUT_MS = 4000
const ARTWORK_CACHE_LIMIT = 24
const ARTWORK_MAX_BYTES = 2_000_000

function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: OSASCRIPT_TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || error.message || '').trim()
        reject(new Error(detail || 'osascript failed'))
        return
      }
      resolve(String(stdout))
    })
  })
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  // -1743 = the user denied (or has not yet granted) Automation permission for Spotify.
  if (message.includes('-1743') || /not authori[sz]ed/i.test(message)) {
    return 'Astra is not allowed to control Spotify. Enable it in System Settings > Privacy & Security > Automation.'
  }
  return message.split('\n')[0].slice(0, 200)
}

export interface SpotifyBridgeOptions {
  /** Called with every status read from Spotify (used by the listen-history recorder). */
  onStatus?: (status: SpotifyStatus) => void
}

export class SpotifyBridge {
  private readonly onStatus: ((status: SpotifyStatus) => void) | undefined
  private readonly artworkCache = new Map<string, string>()
  private statusInFlight: Promise<SpotifyStatus> | null = null

  constructor(options: SpotifyBridgeOptions = {}) {
    this.onStatus = options.onStatus
  }

  isSupported(): boolean {
    return process.platform === 'darwin'
  }

  getStatus(): Promise<SpotifyStatus> {
    if (!this.isSupported()) {
      return Promise.resolve(emptySpotifyStatus('unsupported', 'Spotify control is available on macOS for now.'))
    }
    // Several windows asking at once share one osascript call.
    if (!this.statusInFlight) {
      this.statusInFlight = this.readStatus().finally(() => {
        this.statusInFlight = null
      })
    }
    return this.statusInFlight
  }

  async sendCommand(command: SpotifyCommand): Promise<SpotifyStatus> {
    if (!this.isSupported()) return this.getStatus()
    const script = scriptForCommand(command)
    if (script) {
      try {
        await runAppleScript(script)
      } catch (error) {
        return emptySpotifyStatus('error', friendlyError(error))
      }
    }
    return this.getStatus()
  }

  private async readStatus(): Promise<SpotifyStatus> {
    let status: SpotifyStatus
    try {
      status = parseSpotifyStatusOutput(await runAppleScript(SPOTIFY_STATUS_SCRIPT))
    } catch (error) {
      return emptySpotifyStatus('error', friendlyError(error))
    }
    const url = status.track?.artworkUrl
    if (url) status.artworkDataUrl = await this.loadArtwork(url)
    try {
      this.onStatus?.(status)
    } catch (error) {
      console.warn('[spotify] status observer failed', error)
    }
    return status
  }

  /** Fetches a Spotify cover (https://*.scdn.co only) as a data: URL; null when refused or unavailable. */
  fetchArtwork(url: string): Promise<string | null> {
    return this.loadArtwork(url)
  }

  private async loadArtwork(url: string): Promise<string | null> {
    const cached = this.artworkCache.get(url)
    if (cached) return cached
    // Only fetch Spotify's own image host, whatever the app reports.
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return null
    }
    if (parsed.protocol !== 'https:' || !/(^|\.)scdn\.co$/i.test(parsed.hostname)) return null

    try {
      const response = await fetch(url)
      if (!response.ok) return null
      const type = response.headers.get('content-type') ?? 'image/jpeg'
      if (!type.startsWith('image/')) return null
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length === 0 || bytes.length > ARTWORK_MAX_BYTES) return null
      const dataUrl = `data:${type};base64,${bytes.toString('base64')}`
      if (this.artworkCache.size >= ARTWORK_CACHE_LIMIT) {
        const oldest = this.artworkCache.keys().next().value
        if (oldest !== undefined) this.artworkCache.delete(oldest)
      }
      this.artworkCache.set(url, dataUrl)
      return dataUrl
    } catch {
      return null
    }
  }
}
