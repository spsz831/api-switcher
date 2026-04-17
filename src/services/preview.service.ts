import { evaluateRisk } from '../domain/risk-engine'
import { AdapterNotRegisteredError, AdapterRegistry } from '../registry/adapter-registry'
import { ProfileNotFoundError, ProfileService } from './profile.service'
import type { ScopeAvailability } from '../types/capabilities'
import type { CommandResult, PreviewCommandOutput } from '../types/command'
import { assertTargetScope, buildSnapshotScopePolicy, getScopeCapabilityMatrix, InvalidScopeError, resolveTargetScope } from './scope-options'

function findScopeAvailability(scopeAvailability: ScopeAvailability[] | undefined, scope: string | undefined): ScopeAvailability | undefined {
  if (!scope) {
    return undefined
  }

  return scopeAvailability?.find((item) => item.scope === scope)
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

      const validation = await adapter.validate(profile)
      const preview = await adapter.preview(profile, { targetScope: resolvedScope })
      const decision = evaluateRisk(preview, validation)
      const risk = {
        allowed: decision.allowed,
        riskLevel: decision.riskLevel,
        reasons: Array.from(new Set(decision.reasons)),
        limitations: Array.from(new Set(decision.limitations)),
      }
      const summary = {
        warnings: risk.reasons,
        limitations: risk.limitations,
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
          scopeCapabilities,
          scopeAvailability,
        },
        warnings: summary.warnings,
        limitations: summary.limitations,
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
