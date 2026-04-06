import fs from 'node:fs/promises'
import path from 'node:path'
import { atomicWrite } from '../utils/atomic-write'
import { ensureDir, pathExists, readJsonFile } from '../utils/file-system'
import { getSnapshotDir } from '../utils/runtime-paths'
import type { PlatformName } from '../types/platform'
import type { SnapshotManifest, SnapshotRecord } from '../types/snapshot'

export class SnapshotStore {
  async writeManifest(platform: PlatformName, backupId: string, manifest: SnapshotManifest): Promise<string> {
    const dir = getSnapshotDir(platform, backupId)
    await ensureDir(path.join(dir, 'files'))
    await atomicWrite(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
    return dir
  }

  async readManifest(platform: PlatformName, backupId: string): Promise<SnapshotRecord> {
    const dir = getSnapshotDir(platform, backupId)
    const manifest = await readJsonFile<SnapshotManifest>(path.join(dir, 'manifest.json'), null as never)
    return {
      manifest,
      directoryPath: dir,
    }
  }

  async writeSnapshotFile(platform: PlatformName, backupId: string, fileName: string, content: string): Promise<void> {
    const filePath = path.join(getSnapshotDir(platform, backupId), 'files', fileName)
    await ensureDir(path.dirname(filePath))
    await fs.writeFile(filePath, content, 'utf8')
  }

  async readSnapshotFile(platform: PlatformName, backupId: string, fileName: string): Promise<string | null> {
    const filePath = path.join(getSnapshotDir(platform, backupId), 'files', fileName)
    if (!(await pathExists(filePath))) {
      return null
    }

    return fs.readFile(filePath, 'utf8')
  }
}
