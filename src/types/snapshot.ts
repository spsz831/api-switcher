import type { ManagedBoundary, SecretReference } from './adapter'
import type { PlatformName } from './platform'

export interface SnapshotScopePolicy {
  requestedScope?: string
  resolvedScope?: string
  defaultScope?: string
  explicitScope: boolean
  highRisk: boolean
  riskWarning?: string
  rollbackScopeMatchRequired: boolean
}

export interface SnapshotTargetFile {
  originalPath: string
  existsBeforeBackup: boolean
  checksum?: string
  storedFileName: string
  scope?: string
  role?: string
  managedKeys?: string[]
}

export interface SnapshotProvenance {
  origin: 'import-apply'
  sourceFile: string
  importedProfileId: string
}

export interface SnapshotManifest {
  backupId: string
  platform: PlatformName
  profileId?: string
  previousProfileId?: string
  createdAt: string
  reason: 'use' | 'rollback-before-apply' | 'manual'
  provenance?: SnapshotProvenance
  targetFiles: SnapshotTargetFile[]
  scopePolicy?: SnapshotScopePolicy
  managedBoundaries?: ManagedBoundary[]
  secretReferences?: SecretReference[]
  warnings?: string[]
  limitations?: string[]
}

export interface SnapshotRecord {
  manifest: SnapshotManifest
  directoryPath: string
}
