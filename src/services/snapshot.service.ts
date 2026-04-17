import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { collectIssueMessages, collectManagedBoundaryNotes } from '../domain/masking'
import { buildSnapshotScopePolicy } from './scope-options'
import { readTextFile } from '../utils/file-system'
import { SnapshotStore } from '../stores/snapshot.store'
import { StateStore } from '../stores/state.store'
import type { PlatformAdapter, PreviewResult, ValidationResult } from '../types/adapter'
import type { Profile } from '../types/profile'
import type { SnapshotManifest, SnapshotProvenance } from '../types/snapshot'

function createBackupId(platform: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  return `snapshot-${platform}-${timestamp}-${randomUUID().slice(0, 6)}`
}

function encodeFileName(filePath: string): string {
  return Buffer.from(filePath).toString('base64url')
}

function checksum(content: string | null): string | undefined {
  if (content === null) {
    return undefined
  }

  return createHash('sha256').update(content).digest('hex')
}

export class SnapshotService {
  constructor(
    private readonly snapshotStore = new SnapshotStore(),
    private readonly stateStore = new StateStore(),
  ) {}

  async createBeforeApply(
    adapter: PlatformAdapter,
    profile: Profile,
    input: {
      preview: PreviewResult
      validation: ValidationResult
      requestedScope?: string
      provenance?: SnapshotProvenance
    },
  ) {
    const targetFiles = input.preview.targetFiles.length > 0 ? input.preview.targetFiles : await adapter.listTargets()
    const resolvedScope = targetFiles.find((item) => item.scope)?.scope
    const currentState = await this.stateStore.read()
    const backupId = createBackupId(profile.platform)
    const manifest: SnapshotManifest = {
      backupId,
      platform: profile.platform,
      profileId: profile.id,
      previousProfileId: currentState.current[profile.platform],
      createdAt: new Date().toISOString(),
      reason: 'use',
      provenance: input.provenance,
      targetFiles: [],
      scopePolicy: buildSnapshotScopePolicy(profile.platform, {
        requestedScope: input.requestedScope,
        resolvedScope,
      }),
      managedBoundaries: input.preview.managedBoundaries ?? input.validation.managedBoundaries,
      secretReferences: input.preview.secretReferences ?? input.validation.secretReferences,
      warnings: [
        ...collectIssueMessages(input.validation.warnings),
        ...collectIssueMessages(input.preview.warnings),
        ...collectManagedBoundaryNotes(input.preview.managedBoundaries),
      ],
      limitations: [
        ...collectIssueMessages(input.validation.limitations),
        ...collectIssueMessages(input.preview.limitations),
      ],
    }

    for (const targetFile of targetFiles) {
      const content = await readTextFile(targetFile.path)
      const storedFileName = encodeFileName(targetFile.path)
      manifest.targetFiles.push({
        originalPath: targetFile.path,
        existsBeforeBackup: content !== null,
        checksum: checksum(content),
        storedFileName,
        scope: targetFile.scope,
        role: targetFile.role,
        managedKeys: targetFile.managedKeys,
      })
      await this.snapshotStore.writeSnapshotFile(profile.platform, backupId, storedFileName, content ?? '')
    }

    await this.snapshotStore.writeManifest(profile.platform, backupId, manifest)
    await this.stateStore.addSnapshotIndex({
      backupId,
      platform: profile.platform,
      profileId: profile.id,
      createdAt: manifest.createdAt,
      targetFiles: manifest.targetFiles.map((item) => item.originalPath),
      status: 'available',
      warnings: manifest.warnings,
      limitations: manifest.limitations,
    })

    return {
      backupId,
      manifestPath: path.join('backups', profile.platform, backupId, 'manifest.json'),
      targetFiles: manifest.targetFiles.map((item) => item.originalPath),
      warnings: manifest.warnings ?? [],
      limitations: manifest.limitations ?? [],
    }
  }
}
