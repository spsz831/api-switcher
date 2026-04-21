import { collectIssueMessages } from '../domain/masking'
import { buildReferenceGovernanceFailureDetails } from '../domain/secret-inspection'
import { evaluateRisk } from '../domain/risk-engine'
import { AdapterNotRegisteredError, AdapterRegistry } from '../registry/adapter-registry'
import type { CurrentProfileResult, PreviewResult, ValidationResult } from '../types/adapter'
import type {
  CommandResult,
  ConfirmationRequiredDetails,
  ImportObservation,
  ImportApplyCommandOutput,
  ImportApplyNotReadyDetails,
  ValidationFailureDetails,
} from '../types/command'
import type { ScopeAvailability } from '../types/capabilities'
import {
  assertTargetScope,
  buildSnapshotScopePolicy,
  getScopeCapabilityMatrix,
  InvalidScopeError,
  resolveTargetScope,
} from './scope-options'
import { ImportFidelityService } from './import-fidelity.service'
import { buildSinglePlatformStats } from './single-platform-summary'
import {
  type ImportedProfileSource,
  ImportSourceError,
  ImportSourceService,
} from './import-source.service'
import { buildPlatformSummary } from './platform-summary'
import { SnapshotService } from './snapshot.service'

function findImportedProfile(
  items: ImportedProfileSource[],
  profileId: string,
): ImportedProfileSource | undefined {
  return items.find((item) => item.profile.id === profileId)
}

function findScopeAvailability(
  scopeAvailability: ScopeAvailability[] | undefined,
  scope: string | undefined,
): ScopeAvailability | undefined {
  if (!scope) {
    return undefined
  }

  return scopeAvailability?.find((item) => item.scope === scope)
}

function mergeWarnings(...groups: Array<string[] | undefined>): string[] {
  return Array.from(new Set(groups.flatMap((group) => group ?? [])))
}

function buildSummary(
  sourceWarnings: string[],
  validation: ValidationResult,
  preview: PreviewResult,
  applyResult: { warnings?: ValidationResult['warnings']; limitations?: ValidationResult['limitations'] },
  snapshotWarnings: string[],
  snapshotLimitations: string[],
) {
  const warnings = Array.from(new Set([
    ...sourceWarnings,
    ...collectIssueMessages(validation.warnings),
    ...collectIssueMessages(preview.warnings),
    ...collectIssueMessages(applyResult.warnings),
    ...snapshotWarnings,
  ]))
  const limitations = Array.from(new Set([
    ...collectIssueMessages(validation.limitations),
    ...collectIssueMessages(preview.limitations),
    ...collectIssueMessages(applyResult.limitations),
    ...snapshotLimitations,
  ]))

  return {
    platformStats: buildSinglePlatformStats({
      platform: preview.platform,
      profileId: preview.profileId,
      targetScope: preview.targetFiles.find((item) => item.scope)?.scope,
      warningCount: warnings.length,
      limitationCount: limitations.length,
      changedFileCount: preview.diffSummary.filter((item) => item.hasChanges).length,
      backupCreated: preview.backupPlanned,
      noChanges: preview.noChanges,
    }),
    warnings,
    limitations,
  }
}

function collectValidationWarnings(validation: ValidationResult): string[] {
  return Array.from(new Set([
    ...collectIssueMessages(validation.warnings),
    ...(validation.effectiveConfig?.overrides.map((override) => override.message) ?? []),
  ]))
}

function supportsImportApply(platform: ImportedProfileSource['profile']['platform']): boolean {
  return platform === 'gemini' || platform === 'codex' || platform === 'claude'
}

function needsScopeAvailabilityGate(
  platform: ImportedProfileSource['profile']['platform'],
  scope: string | undefined,
): boolean {
  return platform === 'gemini' && scope === 'project'
}

export class ImportApplyService {
  constructor(
    private readonly importSourceService = new ImportSourceService(),
    private readonly fidelityService = new ImportFidelityService(),
    private readonly registry = new AdapterRegistry(),
    private readonly snapshotService = new SnapshotService(),
  ) {}

  async apply(
    filePath: string,
    options: { profile: string; force?: boolean; scope?: string },
  ): Promise<CommandResult<ImportApplyCommandOutput>> {
    try {
      const source = await this.importSourceService.load(filePath)
      const sourceWarnings = source.sourceCompatibility.warnings
      const importedSource = findImportedProfile(source.profiles, options.profile)

      if (!importedSource) {
        return {
          ok: false,
          action: 'import-apply',
          warnings: sourceWarnings,
          error: {
            code: 'IMPORT_PROFILE_NOT_FOUND',
            message: `导入文件中未找到配置档：${options.profile}`,
            details: {
              sourceFile: source.sourceFile,
              profileId: options.profile,
            },
          },
        }
      }

      if (!supportsImportApply(importedSource.profile.platform)) {
        return {
          ok: false,
          action: 'import-apply',
          warnings: sourceWarnings,
          error: {
            code: 'IMPORT_PLATFORM_NOT_SUPPORTED',
            message: '当前仅支持导入应用 Gemini、Codex 或 Claude profile。',
          },
        }
      }

      assertTargetScope(importedSource.profile.platform, options.scope)
      const adapter = this.registry.get(importedSource.profile.platform)
      const appliedScope = resolveTargetScope(importedSource.profile.platform, options.scope)
      const detection = await adapter.detectCurrent([importedSource.profile])
      const previewItem = this.buildPreviewItem(importedSource, detection, appliedScope, Boolean(options.scope))

      if (!previewItem.previewDecision.canProceedToApplyDesign) {
        const details: ImportApplyNotReadyDetails = {
          sourceFile: source.sourceFile,
          profileId: importedSource.profile.id,
          previewDecision: previewItem.previewDecision,
          fidelity: previewItem.fidelity,
          localObservation: previewItem.localObservation,
          exportedObservation: previewItem.exportedObservation,
        }

        return {
          ok: false,
          action: 'import-apply',
          warnings: sourceWarnings,
          error: {
            code: 'IMPORT_APPLY_NOT_READY',
            message: '当前 import preview 结果不允许进入 apply。',
            details,
          },
        }
      }

      const scopeCapabilities = getScopeCapabilityMatrix(importedSource.profile.platform)
      const scopeAvailability = needsScopeAvailabilityGate(importedSource.profile.platform, appliedScope)
        ? detection?.scopeAvailability
        : undefined
      const targetScopeAvailability = findScopeAvailability(scopeAvailability, appliedScope)

      if (needsScopeAvailabilityGate(importedSource.profile.platform, appliedScope)
        && targetScopeAvailability?.status !== 'available') {
        return {
          ok: false,
          action: 'import-apply',
          warnings: sourceWarnings,
          error: {
            code: 'IMPORT_SCOPE_UNAVAILABLE',
            message: targetScopeAvailability?.reason ?? '目标作用域不可用。',
            details: {
              requestedScope: options.scope,
              resolvedScope: appliedScope,
              scopePolicy: buildSnapshotScopePolicy(importedSource.profile.platform, {
                requestedScope: options.scope,
                resolvedScope: appliedScope,
              }),
              scopeCapabilities,
              scopeAvailability,
            },
          },
        }
      }

      const validation = await adapter.validate(importedSource.profile, { targetScope: appliedScope })
      if (!validation.ok) {
        const referenceGovernance = buildReferenceGovernanceFailureDetails(importedSource.profile, validation)
        const details: ValidationFailureDetails = {
          ...validation,
          ...(referenceGovernance ? { referenceGovernance } : {}),
        }

        return {
          ok: false,
          action: 'import-apply',
          warnings: mergeWarnings(sourceWarnings, collectValidationWarnings(validation)),
          limitations: collectIssueMessages(validation.limitations),
          error: {
            code: 'VALIDATION_FAILED',
            message: '配置校验失败',
            details,
          },
        }
      }

      const preview = await adapter.preview(importedSource.profile, { targetScope: appliedScope })
      const decision = evaluateRisk(preview, validation, { force: options.force })
      const localConfirmationReasons = importedSource.profile.platform === 'claude' && appliedScope === 'local' && !options.force
        ? [
            'Claude local scope 高于 project 与 user；同名字段写入后会直接成为当前项目的最终生效值。',
          ]
        : []
      const localConfirmationLimitations = importedSource.profile.platform === 'claude' && appliedScope === 'local' && !options.force
        ? [
            '如果你只是想共享项目级配置，优先使用 project scope，而不是 local scope。',
          ]
        : []
      const confirmationAllowed = decision.allowed && localConfirmationReasons.length === 0

      if (!confirmationAllowed) {
        const referenceGovernance = buildReferenceGovernanceFailureDetails(importedSource.profile, validation)
        const details: ConfirmationRequiredDetails = {
          risk: {
            allowed: false,
            riskLevel: decision.riskLevel,
            reasons: Array.from(new Set([
              ...decision.reasons,
              ...localConfirmationReasons,
            ])),
            limitations: Array.from(new Set([
              ...decision.limitations,
              ...localConfirmationLimitations,
            ])),
          },
          scopePolicy: buildSnapshotScopePolicy(importedSource.profile.platform, {
            requestedScope: options.scope,
            resolvedScope: appliedScope,
          }),
          scopeCapabilities,
          scopeAvailability,
          ...(referenceGovernance ? { referenceGovernance } : {}),
        }

        return {
          ok: false,
          action: 'import-apply',
          warnings: mergeWarnings(sourceWarnings, details.risk.reasons),
          limitations: details.risk.limitations,
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message: '当前导入应用需要确认或 --force。',
            details,
          },
        }
      }

      const backup = await this.snapshotService.createBeforeApply(adapter, importedSource.profile, {
        preview,
        validation,
        requestedScope: options.scope,
        provenance: {
          origin: 'import-apply',
          sourceFile: source.sourceFile,
          importedProfileId: importedSource.profile.id,
        },
      })
      const applyResult = await adapter.apply(importedSource.profile, {
        backupId: backup.backupId,
        targetScope: appliedScope,
      })

      if (!applyResult.ok) {
        return {
          ok: false,
          action: 'import-apply',
          warnings: mergeWarnings(sourceWarnings, collectIssueMessages(applyResult.warnings)),
          limitations: collectIssueMessages(applyResult.limitations),
          error: {
            code: 'IMPORT_APPLY_FAILED',
            message: '导入配置写入失败',
            details: applyResult,
          },
        }
      }

      const summary = buildSummary(
        sourceWarnings,
        validation,
        preview,
        applyResult,
        backup.warnings,
        backup.limitations,
      )

      return {
        ok: true,
        action: 'import-apply',
        data: {
          sourceFile: source.sourceFile,
          importedProfile: importedSource.profile,
          appliedScope,
          platformSummary: buildPlatformSummary(importedSource.profile.platform, {
            listMode: true,
            composedFiles: preview.targetFiles.map((item) => item.path),
          }),
          scopePolicy: buildSnapshotScopePolicy(importedSource.profile.platform, {
            requestedScope: options.scope,
            resolvedScope: appliedScope,
          })!,
          scopeCapabilities,
          scopeAvailability,
          validation,
          preview,
          risk: {
            allowed: true,
            riskLevel: preview.riskLevel,
            reasons: summary.warnings,
            limitations: summary.limitations,
          },
          backupId: backup.backupId,
          changedFiles: applyResult.changedFiles,
          noChanges: applyResult.noChanges,
          summary: {
            ...summary,
            platformStats: buildSinglePlatformStats({
              platform: importedSource.profile.platform,
              profileId: importedSource.profile.id,
              targetScope: appliedScope,
              warningCount: summary.warnings.length,
              limitationCount: summary.limitations.length,
              changedFileCount: applyResult.changedFiles.length,
              backupCreated: true,
              noChanges: applyResult.noChanges,
              platformSummary: buildPlatformSummary(importedSource.profile.platform, {
                currentScope: appliedScope,
                composedFiles: preview.targetFiles.map((item) => item.path),
                listMode: true,
              }),
            }),
          },
        },
        warnings: summary.warnings,
        limitations: summary.limitations,
      }
    } catch (error) {
      return {
        ok: false,
        action: 'import-apply',
        error: {
          code: error instanceof ImportSourceError
            ? error.code
            : error instanceof AdapterNotRegisteredError
              ? 'ADAPTER_NOT_REGISTERED'
              : error instanceof InvalidScopeError
                ? 'INVALID_SCOPE'
                : 'IMPORT_APPLY_FAILED',
          message: error instanceof Error ? error.message : 'import apply 执行失败',
        },
      }
    }
  }

  private buildPreviewItem(
    importedSource: ImportedProfileSource,
    detection: CurrentProfileResult | null,
    appliedScope: string | undefined,
    explicitScope: boolean,
  ) {
    const exportedObservationBase = importedSource.exportedObservation
      ?? (importedSource.profile.platform === 'codex' || importedSource.profile.platform === 'claude' ? {} : undefined)
    const exportedObservation: ImportObservation | undefined = exportedObservationBase
      ? {
          ...exportedObservationBase,
          defaultWriteScope: explicitScope
            ? appliedScope
            : exportedObservationBase.defaultWriteScope,
        }
      : undefined
    const localObservation: ImportObservation = {
      defaultWriteScope: explicitScope
        ? appliedScope
        : resolveTargetScope(importedSource.profile.platform),
      scopeCapabilities: getScopeCapabilityMatrix(importedSource.profile.platform),
      scopeAvailability: detection?.scopeAvailability,
    }
    const { fidelity, previewDecision } = this.fidelityService.evaluate({
      platform: importedSource.profile.platform,
      exportedObservation,
      localObservation,
    })

    return {
      profile: importedSource.profile,
      platform: importedSource.profile.platform,
      exportedObservation,
      localObservation,
      fidelity,
      previewDecision,
    }
  }
}
