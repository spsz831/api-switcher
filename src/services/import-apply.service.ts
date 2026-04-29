import { collectIssueMessages, collectUniqueIssueMessages, mergeUniqueMessages } from '../domain/masking'
import { materializeReferenceProfile } from '../domain/materialize-reference-profile'
import {
  buildProfileReferenceSummary,
  buildReferenceGovernanceFailureDetails,
} from '../domain/secret-inspection'
import { planReferenceWrite } from '../domain/reference-write-governance'
import { defaultSecretReferenceResolver } from '../domain/secret-reference-resolver'
import { evaluateRisk } from '../domain/risk-engine'
import { AdapterNotRegisteredError, AdapterRegistry } from '../registry/adapter-registry'
import type { CurrentProfileResult, PreviewResult, ValidationResult } from '../types/adapter'
import type {
  CommandResult,
  ImportApplyBatchCommandOutput,
  ConfirmationRequiredDetails,
  ImportObservation,
  ImportApplyCommandOutput,
  ImportApplyNotReadyDetails,
  ImportApplyRedactedSecretDetails,
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
import { buildSingleProfileCommandSummary } from './single-profile-command-summary'
import {
  type ImportedProfileSource,
  ImportSourceError,
  ImportSourceService,
} from './import-source.service'
import { buildPlatformSummary } from './platform-summary'
import { SnapshotService } from './snapshot.service'
import type { ExecutabilityStats, ReferenceWriteDecision, SecretReferenceStats } from '../types/command'
import { getRealUserTargetGuardMessages } from '../utils/real-user-target-guard'

function findImportedProfile(
  items: ImportedProfileSource[],
  profileId: string,
): ImportedProfileSource | undefined {
  return items.find((item) => item.profile.id === profileId)
}

function findImportedProfiles(
  items: ImportedProfileSource[],
  profileIds: string[],
): ImportedProfileSource[] {
  return profileIds.flatMap((profileId) => {
    const matched = findImportedProfile(items, profileId)
    return matched ? [matched] : []
  })
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

function buildSummary(
  sourceWarnings: string[],
  validation: ValidationResult,
  preview: PreviewResult,
  applyResult: { warnings?: ValidationResult['warnings']; limitations?: ValidationResult['limitations'] },
  snapshotWarnings: string[],
  snapshotLimitations: string[],
) {
  const warnings = mergeUniqueMessages(
    sourceWarnings,
    collectIssueMessages(validation.warnings),
    collectIssueMessages(preview.warnings),
    collectIssueMessages(applyResult.warnings),
    snapshotWarnings,
  )
  const limitations = mergeUniqueMessages(
    collectIssueMessages(validation.limitations),
    collectIssueMessages(preview.limitations),
    collectIssueMessages(applyResult.limitations),
    snapshotLimitations,
  )

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

type ReferenceDecisionLike = ReferenceWriteDecision | { decisionCode: string } | undefined

function getReferenceDecisionCode(referenceDecision: ReferenceDecisionLike): string | undefined {
  if (!referenceDecision || typeof referenceDecision !== 'object') {
    return undefined
  }

  if ('writeDecision' in referenceDecision && typeof referenceDecision.writeDecision === 'string') {
    return referenceDecision.writeDecision
  }

  if ('decisionCode' in referenceDecision && typeof referenceDecision.decisionCode === 'string') {
    return referenceDecision.decisionCode
  }

  return undefined
}

function buildImportApplySummaryOverrides(
  referenceDecision: ReferenceDecisionLike,
): Pick<{ referenceStats?: SecretReferenceStats; executabilityStats?: ExecutabilityStats }, 'referenceStats' | 'executabilityStats'> | undefined {
  const decisionCode = getReferenceDecisionCode(referenceDecision)

  if (!decisionCode || decisionCode !== 'inline-fallback-write') {
    return undefined
  }

  return {
    referenceStats: {
      profileCount: 1,
      referenceProfileCount: 1,
      resolvedReferenceProfileCount: 1,
      missingReferenceProfileCount: 0,
      unsupportedReferenceProfileCount: 0,
      inlineProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      hasReferenceProfiles: true,
      hasResolvedReferenceProfiles: true,
      hasMissingReferenceProfiles: false,
      hasUnsupportedReferenceProfiles: false,
      hasInlineProfiles: false,
      hasWriteUnsupportedProfiles: false,
    },
    executabilityStats: {
      profileCount: 1,
      inlineReadyProfileCount: 0,
      referenceReadyProfileCount: 1,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: false,
      hasReferenceReadyProfiles: true,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: false,
      hasSourceRedactedProfiles: false,
    },
  }
}

function applyImportApplySummaryOverrides(
  summary: ReturnType<typeof buildSingleProfileCommandSummary>,
  referenceDecision: ReferenceDecisionLike,
) {
  const overrides = buildImportApplySummaryOverrides(referenceDecision)
  if (!overrides) {
    return summary
  }

  return {
    ...summary,
    ...(overrides.referenceStats ? { referenceStats: overrides.referenceStats } : {}),
    ...(overrides.executabilityStats ? { executabilityStats: overrides.executabilityStats } : {}),
  }
}

function collectValidationWarnings(validation: ValidationResult): string[] {
  return mergeUniqueMessages(
    collectIssueMessages(validation.warnings),
    validation.effectiveConfig?.overrides.map((override) => override.message),
  )
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
    options: { profile: string; force?: boolean; scope?: string; dryRun?: boolean },
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

      if ((importedSource.redactedInlineSecretFields?.length ?? 0) > 0) {
        const details: ImportApplyRedactedSecretDetails = {
          sourceFile: source.sourceFile,
          profileId: importedSource.profile.id,
          redactedInlineSecretFields: importedSource.redactedInlineSecretFields!,
        }

        return {
          ok: false,
          action: 'import-apply',
          warnings: sourceWarnings,
          error: {
            code: 'IMPORT_SOURCE_REDACTED_INLINE_SECRETS',
            message: '导入文件中的 inline secret 已被 redacted；当前不能直接进入 import apply。',
            details,
          },
        }
      }

      assertTargetScope(importedSource.profile.platform, options.scope)
      const adapter = this.registry.get(importedSource.profile.platform)
      const appliedScope = resolveTargetScope(importedSource.profile.platform, options.scope)
      const detection = await adapter.detectCurrent([importedSource.profile])
      const previewItem = this.buildPreviewItem(importedSource, detection, appliedScope, Boolean(options.scope))
      const profileReferenceSummary = buildProfileReferenceSummary(importedSource.profile, defaultSecretReferenceResolver)
      const primaryReference = profileReferenceSummary?.referenceDetails?.find((item) =>
        item.code === 'REFERENCE_ENV_RESOLVED'
        || item.code === 'REFERENCE_ENV_UNRESOLVED'
        || item.code === 'REFERENCE_SCHEME_UNSUPPORTED')
      const referenceDecision = primaryReference
        ? planReferenceWrite({
            profile: importedSource.profile,
            resolution: {
              reference: primaryReference.reference ?? '',
              status: primaryReference.code === 'REFERENCE_ENV_RESOLVED'
                ? 'resolved'
                : primaryReference.code === 'REFERENCE_ENV_UNRESOLVED'
                  ? 'unresolved'
                  : 'unsupported-scheme',
              scheme: primaryReference.scheme,
            },
          })
        : undefined

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

      if (referenceDecision?.blocking) {
        return {
          ok: false,
          action: 'import-apply',
          warnings: sourceWarnings,
          error: {
            code: 'IMPORT_APPLY_FAILED',
            message: '当前 secret reference 无法进入 import apply 写入流程。',
            details: {
              scopePolicy: buildSnapshotScopePolicy(importedSource.profile.platform, {
                requestedScope: options.scope,
                resolvedScope: appliedScope,
              }),
              scopeCapabilities: getScopeCapabilityMatrix(importedSource.profile.platform),
              scopeAvailability: detection?.scopeAvailability,
              referenceGovernance: buildReferenceGovernanceFailureDetails(importedSource.profile, {
                errors: [],
                warnings: [],
                limitations: [],
              }, defaultSecretReferenceResolver),
              referenceDecision: {
                writeDecision: referenceDecision.decisionCode,
                writeStrategy: referenceDecision.writeStrategy,
                requiresForce: referenceDecision.requiresForce,
                blocking: referenceDecision.blocking,
                reasonCodes: referenceDecision.reasonCodes,
              },
            },
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

      const materializedProfile = materializeReferenceProfile(importedSource.profile, defaultSecretReferenceResolver).profile
      const validation = await adapter.validate(materializedProfile, { targetScope: appliedScope })
      if (!validation.ok) {
        const referenceGovernance = buildReferenceGovernanceFailureDetails(importedSource.profile, validation)
        const details: ValidationFailureDetails = {
          ...validation,
          ...(referenceGovernance ? { referenceGovernance } : {}),
        }

        return {
          ok: false,
          action: 'import-apply',
          warnings: mergeUniqueMessages(sourceWarnings, collectValidationWarnings(validation)),
          limitations: collectUniqueIssueMessages(validation.limitations),
          error: {
            code: 'VALIDATION_FAILED',
            message: '配置校验失败',
            details,
          },
        }
      }

      const preview = await adapter.preview(materializedProfile, { targetScope: appliedScope })
      const decision = evaluateRisk(preview, validation, { force: options.force })
      const realUserTargetGuard = getRealUserTargetGuardMessages(preview)
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
      const requiresReferenceForce = referenceDecision?.decisionCode === 'inline-fallback-write' && !options.force
      const requiresRealUserTargetConfirmation = Boolean(realUserTargetGuard.warning) && !options.force
      const confirmationAllowed = decision.allowed
        && localConfirmationReasons.length === 0
        && !requiresRealUserTargetConfirmation
        && !requiresReferenceForce

      if (!confirmationAllowed) {
        const referenceGovernance = buildReferenceGovernanceFailureDetails(importedSource.profile, validation)
        const details: ConfirmationRequiredDetails = {
          risk: {
            allowed: false,
            riskLevel: decision.riskLevel,
            reasons: mergeUniqueMessages(
              decision.reasons,
              localConfirmationReasons,
              realUserTargetGuard.warning ? [realUserTargetGuard.warning] : [],
            ),
            limitations: mergeUniqueMessages(
              decision.limitations,
              referenceDecision?.decisionCode === 'inline-fallback-write'
                ? ['如继续执行，将以明文写入目标配置文件。']
                : [],
              localConfirmationLimitations,
              realUserTargetGuard.limitation ? [realUserTargetGuard.limitation] : [],
            ),
          },
          scopePolicy: buildSnapshotScopePolicy(importedSource.profile.platform, {
            requestedScope: options.scope,
            resolvedScope: appliedScope,
          }),
          scopeCapabilities,
          scopeAvailability,
          referenceDecision: referenceDecision
            ? {
                writeDecision: referenceDecision.decisionCode,
                writeStrategy: referenceDecision.writeStrategy,
                requiresForce: referenceDecision.requiresForce,
                blocking: referenceDecision.blocking,
                reasonCodes: referenceDecision.reasonCodes,
              }
            : undefined,
          ...(referenceGovernance ? { referenceGovernance } : {}),
        }

        return {
          ok: false,
          action: 'import-apply',
          warnings: mergeUniqueMessages(sourceWarnings, details.risk.reasons),
          limitations: details.risk.limitations,
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message: '当前导入应用需要确认或 --force。',
            details,
          },
        }
      }

      if (options.dryRun) {
        const dryRunSummary = applyImportApplySummaryOverrides(buildSingleProfileCommandSummary({
          platform: importedSource.profile.platform,
          profileId: importedSource.profile.id,
          profile: importedSource.profile,
          targetScope: appliedScope,
          warningCount: decision.reasons.length,
          limitationCount: decision.limitations.length,
          changedFileCount: 0,
          backupCreated: false,
          noChanges: true,
          platformSummary: buildPlatformSummary(importedSource.profile.platform, {
            currentScope: appliedScope,
            composedFiles: preview.targetFiles.map((item) => item.path),
            listMode: true,
          }),
            warnings: mergeUniqueMessages(sourceWarnings, decision.reasons),
            limitations: decision.limitations,
        }), referenceDecision)

        return {
          ok: true,
          action: 'import-apply',
          data: {
            sourceFile: source.sourceFile,
            importedProfile: importedSource.profile,
            appliedScope,
            dryRun: true,
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
              reasons: dryRunSummary.warnings,
              limitations: dryRunSummary.limitations,
            },
            referenceDecision: referenceDecision
              ? {
                  writeDecision: referenceDecision.decisionCode,
                  writeStrategy: referenceDecision.writeStrategy,
                  requiresForce: referenceDecision.requiresForce,
                  blocking: referenceDecision.blocking,
                  reasonCodes: referenceDecision.reasonCodes,
                }
              : undefined,
            changedFiles: [],
            noChanges: true,
            summary: dryRunSummary,
          },
          warnings: dryRunSummary.warnings,
          limitations: dryRunSummary.limitations,
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
      const applyResult = await adapter.apply(materializedProfile, {
        backupId: backup.backupId,
        targetScope: appliedScope,
      })

      if (!applyResult.ok) {
        return {
          ok: false,
          action: 'import-apply',
          warnings: mergeUniqueMessages(sourceWarnings, collectIssueMessages(applyResult.warnings)),
          limitations: collectUniqueIssueMessages(applyResult.limitations),
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
      const commandSummary = applyImportApplySummaryOverrides(buildSingleProfileCommandSummary({
        platform: importedSource.profile.platform,
        profileId: importedSource.profile.id,
        profile: importedSource.profile,
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
        warnings: summary.warnings,
        limitations: summary.limitations,
      }), referenceDecision)

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
          referenceDecision: referenceDecision
            ? {
                writeDecision: referenceDecision.decisionCode,
                writeStrategy: referenceDecision.writeStrategy,
                requiresForce: referenceDecision.requiresForce,
                blocking: referenceDecision.blocking,
                reasonCodes: referenceDecision.reasonCodes,
              }
            : undefined,
          backupId: backup.backupId,
          changedFiles: applyResult.changedFiles,
          noChanges: applyResult.noChanges,
          summary: commandSummary,
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

  async applyMany(
    filePath: string,
    options: { profiles: string[]; force?: boolean; scope?: string; dryRun?: boolean },
  ): Promise<CommandResult<ImportApplyBatchCommandOutput>> {
    try {
      const source = await this.importSourceService.load(filePath)
      const sourceWarnings = source.sourceCompatibility.warnings
      const importedProfiles = findImportedProfiles(source.profiles, options.profiles)

      if (importedProfiles.length !== options.profiles.length) {
        const missingProfileId = options.profiles.find((profileId) =>
          !importedProfiles.some((item) => item.profile.id === profileId))

        return {
          ok: false,
          action: 'import-apply',
          warnings: sourceWarnings,
          error: {
            code: 'IMPORT_PROFILE_NOT_FOUND',
            message: `导入文件中未找到配置档：${missingProfileId}`,
            details: {
              sourceFile: source.sourceFile,
              profileId: missingProfileId,
            },
          },
        }
      }

      const platforms = Array.from(new Set(importedProfiles.map((item) => item.profile.platform)))
      if (platforms.length > 1) {
        return {
          ok: false,
          action: 'import-apply',
          warnings: sourceWarnings,
          error: {
            code: 'IMPORT_APPLY_BATCH_PLATFORM_MISMATCH',
            message: '批量 import apply 第一版只支持同平台 profiles。',
            details: {
              sourceFile: source.sourceFile,
              profileIds: options.profiles,
              platforms,
            },
          },
        }
      }

      const results: ImportApplyBatchCommandOutput['results'] = []
      for (const profileId of options.profiles) {
        const result = await this.apply(filePath, {
          profile: profileId,
          force: options.force,
          scope: options.scope,
          dryRun: options.dryRun,
        })

        if (result.ok) {
          results.push({
            profileId,
            platform: importedProfiles.find((item) => item.profile.id === profileId)?.profile.platform,
            appliedScope: result.data?.appliedScope,
            ok: true,
            noChanges: result.data?.noChanges,
            backupId: result.data?.backupId,
            changedFiles: result.data?.changedFiles,
          })
          continue
        }

        results.push({
          profileId,
          platform: importedProfiles.find((item) => item.profile.id === profileId)?.profile.platform,
          ok: false,
          failureCategory: this.getBatchFailureCategory(result.error?.code),
          reasonCodes: this.getBatchFailureReasonCodes(result.error),
          error: result.error,
        })
      }

      const failedCount = results.filter((item) => !item.ok).length
      const appliedCount = results.length - failedCount

      if (failedCount > 0) {
        return {
          ok: false,
          action: 'import-apply',
          warnings: sourceWarnings,
          error: {
            code: 'IMPORT_APPLY_BATCH_PARTIAL_FAILURE',
            message: '批量 import apply 未全部成功。',
            details: {
              sourceFile: source.sourceFile,
              results,
              summary: {
                totalProfiles: results.length,
                appliedCount,
                failedCount,
              },
            },
          },
        }
      }

      return {
        ok: true,
        action: 'import-apply',
        data: {
          sourceFile: source.sourceFile,
          results,
          summary: {
            totalProfiles: results.length,
            appliedCount,
            failedCount,
          },
        },
        warnings: sourceWarnings,
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

  private getBatchFailureCategory(code: string | undefined): string | undefined {
    if (!code) {
      return undefined
    }

    switch (code) {
      case 'IMPORT_SOURCE_NOT_FOUND':
      case 'IMPORT_SOURCE_INVALID':
      case 'IMPORT_UNSUPPORTED_SCHEMA':
      case 'IMPORT_PROFILE_NOT_FOUND':
      case 'IMPORT_SOURCE_REDACTED_INLINE_SECRETS':
        return 'source'
      case 'INVALID_SCOPE':
        return 'input'
      case 'IMPORT_SCOPE_UNAVAILABLE':
        return 'scope'
      case 'IMPORT_APPLY_NOT_READY':
      case 'PROFILE_NOT_FOUND':
        return 'state'
      case 'CONFIRMATION_REQUIRED':
        return 'confirmation'
      case 'IMPORT_PLATFORM_NOT_SUPPORTED':
      case 'ADAPTER_NOT_REGISTERED':
      case 'IMPORT_APPLY_BATCH_PLATFORM_MISMATCH':
        return 'platform'
      case 'VALIDATION_FAILED':
      case 'IMPORT_APPLY_FAILED':
      case 'USE_FAILED':
      case 'ROLLBACK_FAILED':
        return 'runtime'
      default:
        return 'runtime'
    }
  }

  private getBatchFailureReasonCodes(error: CommandResult['error']): string[] | undefined {
    const details = error?.details
    if (!details || typeof details !== 'object') {
      return undefined
    }

    const failureDetails = details as {
      previewDecision?: { reasonCodes?: string[] }
      referenceGovernance?: { reasonCodes?: string[] }
      errors?: Array<{ code?: string }>
    }

    if (Array.isArray(failureDetails.previewDecision?.reasonCodes) && failureDetails.previewDecision.reasonCodes.length > 0) {
      return failureDetails.previewDecision.reasonCodes
    }

    if (Array.isArray(failureDetails.referenceGovernance?.reasonCodes) && failureDetails.referenceGovernance.reasonCodes.length > 0) {
      return failureDetails.referenceGovernance.reasonCodes
    }

    if (Array.isArray(failureDetails.errors) && failureDetails.errors.length > 0) {
      const codes = failureDetails.errors
        .map((item) => item.code)
        .filter((code): code is string => typeof code === 'string' && code.length > 0)
      return codes.length > 0 ? codes : undefined
    }

    return undefined
  }
}
