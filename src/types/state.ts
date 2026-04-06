import type { PlatformName } from './platform'

export interface LastSwitchRecord {
  platform: PlatformName
  profileId: string
  backupId: string
  time: string
  status: 'success' | 'failed' | 'rolled-back'
  warnings?: string[]
  limitations?: string[]
}

export interface SnapshotIndexRecord {
  backupId: string
  platform: PlatformName
  profileId?: string
  createdAt: string
  targetFiles: string[]
  status: 'available' | 'stale' | 'deleted'
  warnings?: string[]
  limitations?: string[]
}

export interface StateFile {
  current: Partial<Record<PlatformName, string>>
  lastSwitch?: LastSwitchRecord
  snapshots: SnapshotIndexRecord[]
}

export interface StateWriteContext {
  warnings?: string[]
  limitations?: string[]
}
