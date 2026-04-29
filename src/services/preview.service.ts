import { evaluateRisk } from '../domain/risk-engine'
import { materializeReferenceProfile } from '../domain/materialize-reference-profile'
import { planReferenceWrite } from '../domain/reference-write-governance'
import { buildReferenceGovernanceFailureDetails, buildProfileReferenceSummary, withProfileSecretReferenceContract } from '../domain/secret-inspection'
import { defaultSecretReferenceResolver } from '../domain/secret-reference-resolver'
import { AdapterNotRegisteredError, AdapterRegistry } from '../registry/adapter-registry'
import { ProfileNotFoundError, ProfileService } from './profile.service'
import type { ScopeAvailability } from '../types/capabilities'
import type { CommandResult, ConfirmationRequiredDetails, PreviewCommandOutput, ReferenceReadiness, ReferenceWriteDecision } from '../types/command'
import { assertTargetScope, buildSnapshotScopePolicy, getScopeCapabilityMatrix, InvalidScopeError, resolveTargetScope } from './scope-options'
import { buildPlatformSummary } from './platform-summary'
import { buildSingleProfileCommandSummary } from './single-profile-command-summary'

function findScopeAvailability(scopeAvailability: ScopeAvailability[] | undefined, scope: string | undefined): ScopeAvailability | undefined {
  if (!scope) {
    return undefined
  }

  return scopeAvailability?.find((item) => item.scope === scope)
}

function toReferenceWriteDecision(referenceDecision: {
  decisionCode: 'native-reference-write' | 'inline-fallback-write' | 'reference-blocked'
  writeStrategy: 'native-reference-supported' | 'inline-fallback-only' | 'blocked'
  requiresForce: boolean
  blocking: boolean
  reasonCodes: Array<
    | 'REFERENCE_NATIVE_WRITE_SUPPORTED'
    | 'REFERENCE_INLINE_FALLBACK_REQUIRED'
    | 'REFERENCE_ENV_UNRESOLVED'
    | 'REFERENCE_SCHEME_UNSUPPORTED'
  >
} | undefined): ReferenceWriteDecision | undefined {
  if (!referenceDecision) {
    return undefined
  }

  return {
    writeDecision: referenceDecision.decisionCode,
    writeStrategy: referenceDecision.writeStrategy,
    requiresForce: referenceDecision.requiresForce,
    blocking: referenceDecision.blocking,
    reasonCodes: referenceDecision.reasonCodes,
  }
}

function buildReferenceReadiness(referenceDecision: ReferenceWriteDecision | undefined): ReferenceReadiness | undefined {
  if (!referenceDecision) {
    return undefined
  }

  switch (referenceDecision.writeDecision) {
    case 'native-reference-write':
      return {
        level: 'native-ready',
        primaryReason: 'REFERENCE_NATIVE_WRITE_SUPPORTED',
        canProceedToUse: true,
        requiresForce: false,
        nextAction: 'proceed',
        summary: '当前 reference 可按平台原生形态继续进入 use。',
      }
    case 'inline-fallback-write':
      return {
        level: 'fallback-ready',
        primaryReason: 'REFERENCE_INLINE_FALLBACK_REQUIRED',
        canProceedToUse: true,
        requiresForce: true,
        nextAction: 'confirm-before-write',
        summary: '当前 reference 仅支持明文 fallback 写入；继续前需要显式确认。',
      }
    case 'reference-blocked':
      return {
        level: 'blocked',
        primaryReason: referenceDecision.reasonCodes.includes('REFERENCE_ENV_UNRESOLVED')
          ? 'REFERENCE_ENV_UNRESOLVED'
          : 'REFERENCE_SCHEME_UNSUPPORTED',
        canProceedToUse: false,
        requiresForce: false,
        nextAction: 'fix-reference-before-write',
        summary: referenceDecision.reasonCodes.includes('REFERENCE_ENV_UNRESOLVED')
          ? '当前 reference 尚未解析，进入 use 前需要先修复引用。'
          : '当前 reference 暂不受支持，进入 use 前需要先修复引用。',
      }
  }
}

export class PreviewService {
  constructor(
    private readonly profileService = new ProfileService(),
    private readonly registry = new AdapterRegistry(),
  ) {}

  async preview(selector: string, options: { scope?: string } = {}): Promise<CommandResult<PreviewCommandOutput>> {
    try {
      const profile = await this.profileService.resolve(selector)
      assertTargetScope(profile.platform, options.scope)
      const adapter = this.registry.get(profile.platform)
      const resolvedScope = resolveTargetScope(profile.platform, options.scope)
      const scopeCapabilities = getScopeCapabilityMatrix(profile.platform)
      const scopeAvailability = profile.platform === 'gemini' && resolvedScope === 'project'
        ? (await adapter.detectCurrent([profile]))?.scopeAvailability
        : undefined
      const targetScopeAvailability = findScopeAvailability(scopeAvailability, resolvedScope)

      if (profile.platform === 'gemini' && resolvedScope === 'project' && targetScopeAvailability?.status !== 'available') {
        return {
          ok: false,
          action: 'preview',
          error: {
            code: 'PREVIEW_FAILED',
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

      const materializedProfile = materializeReferenceProfile(profile, defaultSecretReferenceResolver).profile
      const validation = withProfileSecretReferenceContract(
        await adapter.validate(materializedProfile, { targetScope: resolvedScope }),
        profile,
      )
      const profileReferenceSummary = buildProfileReferenceSummary(profile, defaultSecretReferenceResolver)
      const primaryReference = profileReferenceSummary?.referenceDetails?.find((item) =>
        item.code === 'REFERENCE_ENV_RESOLVED'
        || item.code === 'REFERENCE_ENV_UNRESOLVED'
        || item.code === 'REFERENCE_SCHEME_UNSUPPORTED')
      const referenceDecision = primaryReference
        ? planReferenceWrite({
            profile,
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
      const publicReferenceDecision = toReferenceWriteDecision(referenceDecision)
      const referenceReadiness = buildReferenceReadiness(publicReferenceDecision)
      const referenceGovernance = buildReferenceGovernanceFailureDetails(profile, validation, defaultSecretReferenceResolver)

      const preview = await adapter.preview(materializedProfile, { targetScope: resolvedScope })
      const decision = evaluateRisk(preview, validation)
      const risk = {
        allowed: referenceDecision?.blocking ? false : decision.allowed,
        riskLevel: decision.riskLevel,
        reasons: Array.from(new Set([
          ...decision.reasons,
          ...(referenceDecision?.blocking ? ['当前 reference 已被治理策略阻断，preview 仅提供只读观测结果。'] : []),
        ])),
        limitations: Array.from(new Set([
          ...decision.limitations,
          ...(referenceDecision?.decisionCode === 'reference-blocked'
            ? ['当前 secret reference 仍不能进入 use/import apply 写入流程。']
            : []),
          ...(referenceDecision?.decisionCode === 'inline-fallback-write'
            ? ['如继续执行，将以明文写入目标配置文件。']
            : []),
        ])),
      }
      const baseSummary = buildSingleProfileCommandSummary({
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
      const limitations = Array.from(new Set([
        ...baseSummary.limitations,
        ...(referenceDecision?.decisionCode === 'inline-fallback-write'
          ? ['如继续执行，将以明文写入目标配置文件。']
          : []),
      ]))
      const summary = {
        ...baseSummary,
        limitations,
      }

      const requiresReferenceForce = referenceDecision?.decisionCode === 'inline-fallback-write'
      if (requiresReferenceForce) {
        const referenceGovernance = buildReferenceGovernanceFailureDetails(profile, validation, defaultSecretReferenceResolver)
        const details: ConfirmationRequiredDetails = {
          risk: {
            ...risk,
            allowed: false,
          },
          scopePolicy: buildSnapshotScopePolicy(profile.platform, {
            requestedScope: options.scope,
            resolvedScope,
          }),
          scopeCapabilities,
          scopeAvailability,
          referenceDecision: publicReferenceDecision,
          referenceReadiness,
          ...(referenceGovernance ? { referenceGovernance } : {}),
        }

        return {
          ok: false,
          action: 'preview',
          warnings: summary.warnings,
          limitations: summary.limitations,
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message: '当前预览结果需要确认后再继续执行 use/import apply。',
            details,
          },
        }
      }

      return {
        ok: validation.ok,
        action: 'preview',
        data: {
          profile,
          validation,
          preview,
          risk,
          summary,
          ...(referenceGovernance ? { referenceGovernance } : {}),
          referenceDecision: publicReferenceDecision,
          referenceReadiness,
          scopePolicy: buildSnapshotScopePolicy(profile.platform, {
            requestedScope: options.scope,
            resolvedScope,
          }),
          scopeCapabilities,
          scopeAvailability,
        },
        warnings: summary.warnings,
        limitations,
      }
    } catch (error) {
      return {
        ok: false,
        action: 'preview',
        error: {
          code: error instanceof ProfileNotFoundError
            ? 'PROFILE_NOT_FOUND'
            : error instanceof AdapterNotRegisteredError
              ? 'ADAPTER_NOT_REGISTERED'
              : error instanceof InvalidScopeError
                ? 'INVALID_SCOPE'
              : 'PREVIEW_FAILED',
          message: error instanceof Error ? error.message : 'preview 执行失败',
        },
      }
    }
  }
}
