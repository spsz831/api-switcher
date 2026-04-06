import type { ManagedBoundary, SecretReference } from './adapter'
import type { PlatformName } from './platform'

export interface SnapshotTargetFile {
  originalPath: string
  existsBeforeBackup: boolean
  checksum?: string
  storedFileName: string
  scope?: string
  role?: string
  managedKeys?: string[]
}

export interface SnapshotManifest {
  backupId: string
  platform: PlatformName
  profileId?: string
  previousProfileId?: string
  createdAt: string
  reason: 'use' | 'rollback-before-apply' | 'manual'
  targetFiles: SnapshotTargetFile[]
  managedBoundaries?: ManagedBoundary[]
  secretReferences?: SecretReference[]
  warnings?: string[]
  limitations?: string[]
}

export interface SnapshotRecord {
  manifest: SnapshotManifest
  directoryPath: string
}
