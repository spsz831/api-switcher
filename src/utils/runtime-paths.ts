import os from 'node:os'
import path from 'node:path'
import type { PlatformName } from '../types/platform'

export interface RuntimePaths {
  rootDir: string
  profilesFile: string
  stateFile: string
  backupsDir: string
  logsDir: string
}

export function resolveRuntimeRoot(): string {
  return process.env.API_SWITCHER_RUNTIME_DIR || path.join(os.homedir(), '.api-switcher')
}

export function getRuntimePaths(): RuntimePaths {
  const rootDir = resolveRuntimeRoot()

  return {
    rootDir,
    profilesFile: path.join(rootDir, 'profiles.json'),
    stateFile: path.join(rootDir, 'state.json'),
    backupsDir: path.join(rootDir, 'backups'),
    logsDir: path.join(rootDir, 'logs'),
  }
}

export function getPlatformBackupsDir(platform: PlatformName): string {
  return path.join(getRuntimePaths().backupsDir, platform)
}

export function getSnapshotDir(platform: PlatformName, backupId: string): string {
  return path.join(getPlatformBackupsDir(platform), backupId)
}
