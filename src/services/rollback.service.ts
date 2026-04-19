import { collectIssueMessages } from '../domain/masking'
import { AdapterNotRegisteredError, AdapterRegistry } from '../registry/adapter-registry'
import { SnapshotStore } from '../stores/snapshot.store'
import { StateStore } from '../stores/state.store'
import type { ScopeAvailability } from '../types/capabilities'
import type { CommandResult, RollbackCommandOutput, RollbackErrorDetails } from '../types/command'
import type { PlatformName } from '../types/platform'
import { buildPlatformSummary } from './platform-summary'
import { buildSinglePlatformStats } from './single-platform-summary'
import {
  assertTargetScope,
  buildSnapshotScopePolicy,
  getScopeCapabilityMatrix,
  InvalidScopeError,
  resolveTargetScope,
} from './scope-options'

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

function findScopeAvailability(scopeAvailability: ScopeAvailability[] | undefined, scope: string | undefined): ScopeAvailability | undefined {
  if (!scope) {
    return undefined
  }

  return scopeAvailability?.find((item) => item.scope === scope)
}

export class RollbackService {
  constructor(
    private readonly registry = new AdapterRegistry(),
    private readonly snapshotStore = new SnapshotStore(),
    private readonly stateStore = new StateStore(),
  ) {}

  async rollback(backupId?: string, options: { scope?: string } = {}): Promise<CommandResult<RollbackCommandOutput>> {
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
      assertTargetScope(platform, options.scope)
      const snapshot = await this.snapshotStore.readManifest(platform, targetBackupId)
      const adapter = this.registry.get(platform)
      const resolvedScope = resolveTargetScope(platform, options.scope)
      const scopeCapabilities = getScopeCapabilityMatrix(platform)
      const scopeAvailability = platform === 'gemini' && resolvedScope === 'project'
        ? (await adapter.detectCurrent())?.scopeAvailability
        : undefined
      const targetScopeAvailability = findScopeAvailability(scopeAvailability, resolvedScope)

      if (platform === 'gemini' && resolvedScope === 'project' && targetScopeAvailability?.status !== 'available') {
        return {
          ok: false,
          action: 'rollback',
          error: {
            code: 'ROLLBACK_FAILED',
            message: targetScopeAvailability?.reason ?? '目标作用域不可用。',
            details: {
              scopePolicy: buildSnapshotScopePolicy(platform, {
                requestedScope: options.scope,
                resolvedScope,
              }),
              scopeCapabilities,
              scopeAvailability,
            } satisfies RollbackErrorDetails,
          },
        }
      }

      const result = await adapter.rollback(targetBackupId, { backupId: targetBackupId, targetScope: resolvedScope })

      if (!result.ok) {
        const isScopeMismatch = result.warnings?.some((item) => item.code === 'rollback-scope-mismatch')
        const details: RollbackErrorDetails = {
          rollback: result,
          scopePolicy: snapshot.manifest.scopePolicy ?? buildSnapshotScopePolicy(platform, {
            requestedScope: options.scope,
            resolvedScope,
          }),
          scopeCapabilities,
          scopeAvailability,
        }
        return {
          ok: false,
          action: 'rollback',
          warnings: collectIssueMessages(result.warnings),
          limitations: collectIssueMessages(result.limitations),
          error: {
            code: isScopeMismatch ? 'ROLLBACK_SCOPE_MISMATCH' : 'ROLLBACK_FAILED',
            message: isScopeMismatch ? collectIssueMessages(result.warnings)[0] ?? '回滚 scope 不匹配。' : '回滚失败',
            details,
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
          platformSummary: buildPlatformSummary(platform, {
            currentScope: resolvedScope,
            composedFiles: result.restoredFiles,
            listMode: true,
          }),
          rollback: result,
          scopePolicy: snapshot.manifest.scopePolicy,
          scopeCapabilities,
          scopeAvailability,
          summary: {
            platformStats: buildSinglePlatformStats({
              platform,
              targetScope: resolvedScope,
              warningCount: warnings.length,
              limitationCount: limitations.length,
              restoredFileCount: result.restoredFiles.length,
              noChanges: result.restoredFiles.length === 0,
              platformSummary: buildPlatformSummary(platform, {
                currentScope: resolvedScope,
                composedFiles: result.restoredFiles,
                listMode: true,
              }),
            }),
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
          code: error instanceof InvalidBackupIdError
            ? 'INVALID_BACKUP_ID'
            : error instanceof AdapterNotRegisteredError
              ? 'ADAPTER_NOT_REGISTERED'
              : error instanceof InvalidScopeError
                ? 'INVALID_SCOPE'
              : 'ROLLBACK_FAILED',
          message: error instanceof Error ? error.message : 'rollback 执行失败',
        },
      }
    }
  }
}
