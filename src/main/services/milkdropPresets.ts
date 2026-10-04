import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises'
import { parsePresetFile, REASON_TEXT, sanitizePresetFileName, type ParsedPreset } from '../../shared/milkdrop/presets'

// User-imported Milkdrop (Butterchurn) presets live as one .json per preset in
// <userData>/milkdrop-presets. The bundled pack comes from the butterchurn-presets package.

export interface StoredMilkdropPreset extends ParsedPreset {
  fileName: string
}

function presetsDir(): string {
  return join(app.getPath('userData'), 'milkdrop-presets')
}

async function listStored(): Promise<StoredMilkdropPreset[]> {
  let files: string[] = []
  try {
    files = await readdir(presetsDir())
  } catch {
    return []
  }
  const out: StoredMilkdropPreset[] = []
  for (const fileName of files) {
    if (!/\.json$/i.test(fileName)) continue
    try {
      const parsed = parsePresetFile(fileName, await readFile(join(presetsDir(), fileName), 'utf-8'))
      if (parsed.ok) out.push({ ...parsed.presets[0], fileName })
    } catch {
      // skip unreadable files
    }
  }
  return out
}

export function registerMilkdropIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('milkdrop:list', async () => listStored())

  ipcMain.handle('milkdrop:import', async () => {
    const win = getWindow()
    const options = {
      title: 'Import Milkdrop presets',
      properties: ['openFile' as const, 'multiSelections' as const],
      filters: [{ name: 'Butterchurn presets', extensions: ['json', 'milk'] }]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled) return { imported: 0, rejected: [] as { file: string; reason: string }[] }

    await mkdir(presetsDir(), { recursive: true })
    let imported = 0
    const rejected: { file: string; reason: string }[] = []
    for (const filePath of result.filePaths) {
      const fileName = filePath.split(/[\\/]/).pop() ?? filePath
      try {
        const parsed = parsePresetFile(fileName, await readFile(filePath, 'utf-8'))
        if (!parsed.ok) {
          rejected.push({ file: fileName, reason: REASON_TEXT[parsed.reason] ?? 'Unsupported file' })
          continue
        }
        for (const preset of parsed.presets) {
          await writeFile(join(presetsDir(), sanitizePresetFileName(preset.name)), JSON.stringify(preset.preset), 'utf-8')
          imported += 1
        }
      } catch {
        rejected.push({ file: fileName, reason: 'Could not read file' })
      }
    }
    return { imported, rejected }
  })

  ipcMain.handle('milkdrop:remove', async (_event, rawFileName: unknown) => {
    if (typeof rawFileName !== 'string' || rawFileName !== sanitizePresetFileName(rawFileName)) return false
    try {
      await unlink(join(presetsDir(), rawFileName))
      return true
    } catch {
      return false
    }
  })
}
