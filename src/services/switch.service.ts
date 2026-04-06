import { collectIssueMessages } from '../domain/masking'
import { evaluateRisk } from '../domain/risk-engine'
import { AdapterRegistry } from '../registry/adapter-registry'
import { StateStore } from '../stores/state.store'
import type { CommandResult, UseCommandOutput } from '../types/command'
import { ProfileService } from './profile.service'
import { SnapshotService } from './snapshot.service'

export class SwitchService {
  constructor(
    private readonly profileService = new ProfileService(),
    private readonly registry = new AdapterRegistry(),
    private readonly snapshotService = new SnapshotService(),
    private readonly stateStore = new StateStore(),
  ) {}

  async use(selector: string, options: { force?: boolean; dryRun?: boolean } = {}): Promise<CommandResult<UseCommandOutput>> {
    try {
      const profile = await this.profileService.resolve(selector)
      const adapter = this.registry.get(profile.platform)
      const validation = await adapter.validate(profile)

      if (!validation.ok) {
        return {
          ok: false,
          action: 'use',
          limitations: collectIssueMessages(validation.limitations),
          error: {
            code: 'VALIDATION_FAILED',
            message: '配置校验失败',
            details: validation,
          },
        }
      }

      const preview = await adapter.preview(profile)
      const decision = evaluateRisk(preview, validation, { force: options.force })
      if (!decision.allowed) {
        return {
          ok: false,
          action: 'use',
          warnings: decision.reasons,
          limitations: decision.limitations,
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message: '当前切换需要确认或 --force。',
            details: decision,
          },
        }
      }

      if (options.dryRun) {
        return {
          ok: true,
          action: 'use',
          data: {
            profile,
            validation,
            preview,
            changedFiles: preview.diffSummary.flatMap((item) => (item.hasChanges ? [item.path] : [])),
            noChanges: Boolean(preview.noChanges),
          },
          warnings: decision.reasons,
          limitations: decision.limitations,
        }
      }

      if (preview.noChanges) {
        return {
          ok: true,
          action: 'use',
          data: {
            profile,
            validation,
            preview,
            changedFiles: [],
            noChanges: true,
          },
          warnings: decision.reasons,
          limitations: decision.limitations,
        }
      }

      const backup = await this.snapshotService.createBeforeApply(adapter, profile, { preview, validation })
      const applyResult = await adapter.apply(profile, { backupId: backup.backupId })
      if (!applyResult.ok) {
        return {
          ok: false,
          action: 'use',
          warnings: collectIssueMessages(applyResult.warnings),
          limitations: collectIssueMessages(applyResult.limitations),
          error: {
            code: 'APPLY_FAILED',
            message: '配置写入失败',
            details: applyResult,
          },
        }
      }

      const warnings = Array.from(new Set([
        ...decision.reasons,
        ...collectIssueMessages(applyResult.warnings),
        ...backup.warnings,
      ]))
      const limitations = Array.from(new Set([
        ...decision.limitations,
        ...collectIssueMessages(applyResult.limitations),
        ...backup.limitations,
      ]))

      await this.stateStore.markCurrent(profile.platform, profile.id, backup.backupId, 'success', {
        warnings,
        limitations,
      })

      return {
        ok: true,
        action: 'use',
        data: {
          profile,
          backupId: backup.backupId,
          validation,
          preview,
          changedFiles: applyResult.changedFiles,
          noChanges: applyResult.noChanges,
        },
        warnings,
        limitations,
      }
    } catch (error) {
      return {
        ok: false,
        action: 'use',
        error: {
          code: 'USE_FAILED',
          message: error instanceof Error ? error.message : 'use 执行失败',
        },
      }
    }
  }
}
