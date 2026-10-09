import { app, screen } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { normalizeSpotifyPopoutPrefs, type SpotifyPopoutPrefs } from '../../types/spotifyPopout'

function prefsPath(): string {
  return join(app.getPath('userData'), 'spotify-popout-window.json')
}

function workAreas() {
  return screen.getAllDisplays().map((d) => ({ x: d.workArea.x, y: d.workArea.y, width: d.workArea.width, height: d.workArea.height }))
}

export async function loadSpotifyPopoutPrefs(): Promise<SpotifyPopoutPrefs> {
  try {
    return normalizeSpotifyPopoutPrefs(JSON.parse(await readFile(prefsPath(), 'utf-8')), workAreas())
  } catch {
    return normalizeSpotifyPopoutPrefs(null, workAreas())
  }
}

export async function saveSpotifyPopoutPrefs(prefs: SpotifyPopoutPrefs): Promise<void> {
  await writeFile(prefsPath(), JSON.stringify(normalizeSpotifyPopoutPrefs(prefs, workAreas()), null, 2), 'utf-8')
}
