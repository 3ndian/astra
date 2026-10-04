import { app } from 'electron'
import { join } from 'path'
import { readFile, rename, writeFile } from 'fs/promises'
import {
  createDefaultRegistry,
  normalizeRegistry,
  type SectionRegistry
} from '../../shared/sections/sections'

const REGISTRY_FILE_NAME = 'sections.json'

function registryPath(): string {
  return join(app.getPath('userData'), REGISTRY_FILE_NAME)
}

export async function loadSectionRegistry(): Promise<SectionRegistry> {
  try {
    const raw = await readFile(registryPath(), 'utf8')
    return normalizeRegistry(JSON.parse(raw), Date.now())
  } catch {
    // Missing or unreadable: start with just the default Music section.
    return createDefaultRegistry(Date.now())
  }
}

export async function saveSectionRegistry(registry: SectionRegistry): Promise<void> {
  const target = registryPath()
  const temp = `${target}.tmp`
  await writeFile(temp, JSON.stringify(registry, null, 2), 'utf8')
  await rename(temp, target)
}
