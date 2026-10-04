import { app, screen } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { parseScopeWindowPrefs, type Rect, type ScopeWindowPrefs } from '../../shared/scopePopout/windowBounds'

const PREFS_FILE_NAME = 'scope-popout-windows.json'

function prefsPath(): string {
  return join(app.getPath('userData'), PREFS_FILE_NAME)
}

export function getDisplayWorkAreas(): Rect[] {
  return screen.getAllDisplays().map((display) => ({
    x: display.workArea.x,
    y: display.workArea.y,
    width: display.workArea.width,
    height: display.workArea.height
  }))
}

export async function loadScopeWindowPrefs(): Promise<ScopeWindowPrefs> {
  try {
    return parseScopeWindowPrefs(await readFile(prefsPath(), 'utf-8'))
  } catch {
    return {}
  }
}

export async function saveScopeWindowPrefs(prefs: ScopeWindowPrefs): Promise<void> {
  await writeFile(prefsPath(), JSON.stringify(prefs, null, 2), 'utf-8')
}
