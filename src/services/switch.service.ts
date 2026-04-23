import { collectIssueMessages, collectUniqueIssueMessages, mergeUniqueMessages } from '../domain/masking'
import {
  buildReferenceGovernanceFailureDetails,
} from '../domain/secret-inspection'
import { evaluateRisk } from '../domain/risk-engine'
import type { ValidationResult } from '../types/adapter'
import { AdapterNotRegisteredError, AdapterRegistry } from '../registry/adapter-registry'
import { StateStore } from '../stores/state.store'
import type { ScopeAvailability } from '../types/capabilities'
import type { CommandResult, ConfirmationRequiredDetails, UseCommandOutput, ValidationFailureDetails } from '../types/command'
import { ProfileNotFoundError, ProfileService } from './profile.service'
import { buildPlatformSummary } from './platform-summary'
import { assertTargetScope, buildSnapshotScopePolicy, getScopeCapabilityMatrix, InvalidScopeError, resolveTargetScope } from './scope-options'
import { buildSingleProfileCommandSummary } from './single-profile-command-summary'
import { SnapshotService } from './snapshot.service'

function collectValidationWarnings(validation: ValidationResult): string[] {
  return mergeUniqueMessages(
    collectIssueMessages(validation.warnings),
    validation.effectiveConfig?.overrides.map((override) => override.message),
  )
}

function findScopeAvailability(scopeAvailability: ScopeAvailability[] | undefined, scope: string | undefined): ScopeAvailability | undefined {
  if (!scope) {
    return undefined
  }

  return scopeAvailability?.find((item) => item.scope === scope)
}

export class SwitchService {
  constructor(
    private readonly profileService = new ProfileService(),
    private readonly registry = new AdapterRegistry(),
    private readonly snapshotService = new SnapshotService(),
    private readonly stateStore = new StateStore(),
  ) {}

  async use(selector: string, options: { force?: boolean; dryRun?: boolean; scope?: string } = {}): Promise<CommandResult<UseCommandOutput>> {
    try {
      const profile = await this.profileService.resolve(selector)
      assertTargetScope(profile.platform, options.scope)
      const adapter = this.registry.get(profile.platform)
      const scopeCapabilities = getScopeCapabilityMatrix(profile.platform)
      const resolvedScope = resolveTargetScope(profile.platform, options.scope)
      const scopeAvailability = profile.platform === 'gemini' && resolvedScope === 'project'
        ? (await adapter.detectCurrent([profile]))?.scopeAvailability
        : undefined
      const targetScopeAvailability = findScopeAvailability(scopeAvailability, resolvedScope)

      if (profile.platform === 'gemini' && resolvedScope === 'project' && targetScopeAvailability?.status !== 'available') {
        return {
          ok: false,
          action: 'use',
          error: {
            code: 'USE_FAILED',
            message: targetScopeAvailability?.reason ?? '目标作用域不可用。',
            details: {
              requestedScope: options.scope,
              resolvedScope,
              scopePolicy: buildSnapshotScopePolicy(profile.platform, {
                requestedScope: options.scope,
                resolvedScope,
              }),
              scopeCapabilities,
              scopeAvailability,
            },
          },
        }
      }

      const validation = await adapter.validate(profile, { targetScope: resolvedScope })

      if (!validation.ok) {
        const referenceGovernance = buildReferenceGovernanceFailureDetails(profile, validation)
        const details: ValidationFailureDetails = {
          ...validation,
          ...(referenceGovernance ? { referenceGovernance } : {}),
        }

        return {
          ok: false,
          action: 'use',
          warnings: collectValidationWarnings(validation),
          limitations: collectUniqueIssueMessages(validation.limitations),
          error: {
            code: 'VALIDATION_FAILED',
            message: '配置校验失败',
            details,
          },
        }
      }

      const preview = await adapter.preview(profile, { targetScope: resolvedScope })
      const decision = evaluateRisk(preview, validation, { force: options.force })
      const risk = {
        allowed: decision.allowed,
        riskLevel: decision.riskLevel,
        reasons: Array.from(new Set(decision.reasons)),
        limitations: Array.from(new Set(decision.limitations)),
      }
      const summary = buildSingleProfileCommandSummary({
        platform: profile.platform,
        profileId: profile.id,
        profile,
        targetScope: resolvedScope,
        warningCount: risk.reasons.length,
        limitationCount: risk.limitations.length,
        changedFileCount: preview.diffSummary.filter((item) => item.hasChanges).length,
        backupCreated: preview.backupPlanned,
        noChanges: preview.noChanges,
        platformSummary: buildPlatformSummary(profile.platform, {
          currentScope: resolvedScope,
          composedFiles: preview.targetFiles.map((item) => item.path),
          listMode: true,
        }),
        warnings: risk.reasons,
        limitations: risk.limitations,
      })
      if (!decision.allowed) {
        const referenceGovernance = buildReferenceGovernanceFailureDetails(profile, validation)
        const details: ConfirmationRequiredDetails = {
          risk,
          scopePolicy: buildSnapshotScopePolicy(profile.platform, {
            requestedScope: options.scope,
            resolvedScope,
          }),
          scopeCapabilities,
          scopeAvailability,
          ...(referenceGovernance ? { referenceGovernance } : {}),
        }
        return {
          ok: false,
          action: 'use',
          warnings: summary.warnings,
          limitations: summary.limitations,
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message: '当前切换需要确认或 --force。',
            details,
          },
        }
      }

      if (options.dryRun) {
        const dryRunSummary = buildSingleProfileCommandSummary({
          platform: profile.platform,
          profileId: profile.id,
          profile,
          targetScope: resolvedScope,
          warningCount: risk.reasons.length,
          limitationCount: risk.limitations.length,
          changedFileCount: 0,
          backupCreated: false,
          noChanges: true,
          platformSummary: buildPlatformSummary(profile.platform, {
            currentScope: resolvedScope,
            composedFiles: preview.targetFiles.map((item) => item.path),
            listMode: true,
          }),
          warnings: risk.reasons,
          limitations: risk.limitations,
        })

        return {
          ok: true,
          action: 'use',
          data: {
            profile,
            dryRun: true,
            platformSummary: buildPlatformSummary(profile.platform, {
              currentScope: resolvedScope,
              composedFiles: preview.targetFiles.map((item) => item.path),
              listMode: true,
            }),
            validation,
            preview,
            risk,
            summary: dryRunSummary,
            changedFiles: [],
            noChanges: true,
            scopeCapabilities,
            scopeAvailability,
          },
          warnings: dryRunSummary.warnings,
          limitations: dryRunSummary.limitations,
        }
      }

      if (preview.noChanges) {
        return {
          ok: true,
          action: 'use',
          data: {
            profile,
            platformSummary: buildPlatformSummary(profile.platform, {
              currentScope: resolvedScope,
              composedFiles: preview.targetFiles.map((item) => item.path),
              listMode: true,
            }),
            validation,
            preview,
            risk,
            summary,
            changedFiles: [],
            noChanges: true,
            scopeCapabilities,
            scopeAvailability,
          },
          warnings: summary.warnings,
          limitations: summary.limitations,
        }
      }

      const backup = await this.snapshotService.createBeforeApply(adapter, profile, {
        preview,
        validation,
        requestedScope: options.scope,
      })
      const applyResult = await adapter.apply(profile, { backupId: backup.backupId, targetScope: resolvedScope })
      if (!applyResult.ok) {
        return {
          ok: false,
          action: 'use',
          warnings: collectUniqueIssueMessages(applyResult.warnings),
          limitations: collectUniqueIssueMessages(applyResult.limitations),
          error: {
            code: 'APPLY_FAILED',
            message: '配置写入失败',
            details: applyResult,
          },
        }
      }

      const warnings = mergeUniqueMessages(
        risk.reasons,
        collectIssueMessages(applyResult.warnings),
        backup.warnings,
      )
      const limitations = mergeUniqueMessages(
        risk.limitations,
        collectIssueMessages(applyResult.limitations),
        backup.limitations,
      )

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
          platformSummary: buildPlatformSummary(profile.platform, {
            currentScope: resolvedScope,
            composedFiles: preview.targetFiles.map((item) => item.path),
            listMode: true,
          }),
          validation,
          preview,
          risk: {
            ...risk,
            reasons: warnings,
            limitations,
          },
          summary: buildSingleProfileCommandSummary({
            platform: profile.platform,
            profileId: profile.id,
            profile,
            targetScope: resolvedScope,
            warningCount: warnings.length,
            limitationCount: limitations.length,
            changedFileCount: applyResult.changedFiles.length,
            backupCreated: true,
            noChanges: applyResult.noChanges,
            platformSummary: buildPlatformSummary(profile.platform, {
              currentScope: resolvedScope,
              composedFiles: preview.targetFiles.map((item) => item.path),
              listMode: true,
            }),
            warnings,
            limitations,
          }),
          changedFiles: applyResult.changedFiles,
          noChanges: applyResult.noChanges,
          scopeCapabilities,
          scopeAvailability,
        },
        warnings,
        limitations,
      }
    } catch (error) {
      return {
        ok: false,
        action: 'use',
        error: {
          code: error instanceof ProfileNotFoundError
            ? 'PROFILE_NOT_FOUND'
            : error instanceof AdapterNotRegisteredError
              ? 'ADAPTER_NOT_REGISTERED'
              : error instanceof InvalidScopeError
                ? 'INVALID_SCOPE'
              : 'USE_FAILED',
          message: error instanceof Error ? error.message : 'use 执行失败',
        },
      }
    }
  }
}
