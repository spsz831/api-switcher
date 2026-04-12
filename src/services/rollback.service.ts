import { collectIssueMessages } from '../domain/masking'
import { AdapterRegistry } from '../registry/adapter-registry'
import { SnapshotStore } from '../stores/snapshot.store'
import { StateStore } from '../stores/state.store'
import type { CommandResult, RollbackCommandOutput } from '../types/command'
import type { PlatformName } from '../types/platform'

class InvalidBackupIdError extends Error {
  constructor(backupId: string) {
    super(`无法从 backupId 推断平台：${backupId}`)
    this.name = 'InvalidBackupIdError'
  }
}

function parsePlatformFromBackupId(backupId: string): PlatformName {
  const matched = backupId.match(/^snapshot-(claude|codex|gemini)-/)
  if (!matched) {
    throw new InvalidBackupIdError(backupId)
  }

  return matched[1] as PlatformName
}

export class RollbackService {
  constructor(
    private readonly registry = new AdapterRegistry(),
    private readonly snapshotStore = new SnapshotStore(),
    private readonly stateStore = new StateStore(),
  ) {}

  async rollback(backupId?: string): Promise<CommandResult<RollbackCommandOutput>> {
    try {
      const state = await this.stateStore.read()
      const targetBackupId = backupId || state.lastSwitch?.backupId
      if (!targetBackupId) {
        return {
          ok: false,
          action: 'rollback',
          error: {
            code: 'BACKUP_NOT_FOUND',
            message: '没有可回滚的快照。',
          },
        }
      }

      const platform = parsePlatformFromBackupId(targetBackupId)
      const snapshot = await this.snapshotStore.readManifest(platform, targetBackupId)
      const adapter = this.registry.get(platform)
      const result = await adapter.rollback(targetBackupId, { backupId: targetBackupId })

      if (!result.ok) {
        return {
          ok: false,
          action: 'rollback',
          warnings: collectIssueMessages(result.warnings),
          limitations: collectIssueMessages(result.limitations),
          error: {
            code: 'ROLLBACK_FAILED',
            message: '回滚失败',
            details: result,
          },
        }
      }

      const warnings = Array.from(new Set([
        ...(snapshot.manifest.warnings ?? []),
        ...collectIssueMessages(result.warnings),
      ]))
      const limitations = Array.from(new Set([
        ...(snapshot.manifest.limitations ?? []),
        ...collectIssueMessages(result.limitations),
      ]))

      if (snapshot.manifest.previousProfileId) {
        await this.stateStore.markCurrent(platform, snapshot.manifest.previousProfileId, targetBackupId, 'rolled-back', {
          warnings,
          limitations,
        })
      } else {
        await this.stateStore.clearCurrent(platform, targetBackupId, 'rolled-back', {
          warnings,
          limitations,
        })
      }

      return {
        ok: true,
        action: 'rollback',
        data: {
          backupId: targetBackupId,
          restoredFiles: result.restoredFiles,
          rollback: result,
          summary: {
            warnings,
            limitations,
          },
        },
        warnings,
        limitations,
      }
    } catch (error) {
      return {
        ok: false,
        action: 'rollback',
        error: {
          code: error instanceof InvalidBackupIdError ? 'INVALID_BACKUP_ID' : 'ROLLBACK_FAILED',
          message: error instanceof Error ? error.message : 'rollback 执行失败',
        },
      }
    }
  }
}
