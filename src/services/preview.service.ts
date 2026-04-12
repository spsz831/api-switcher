import { evaluateRisk } from '../domain/risk-engine'
import { AdapterRegistry } from '../registry/adapter-registry'
import { ProfileNotFoundError, ProfileService } from './profile.service'
import type { CommandResult, PreviewCommandOutput } from '../types/command'

export class PreviewService {
  constructor(
    private readonly profileService = new ProfileService(),
    private readonly registry = new AdapterRegistry(),
  ) {}

  async preview(selector: string): Promise<CommandResult<PreviewCommandOutput>> {
    try {
      const profile = await this.profileService.resolve(selector)
      const adapter = this.registry.get(profile.platform)
      const validation = await adapter.validate(profile)
      const preview = await adapter.preview(profile)
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
        data: { profile, validation, preview, risk, summary },
        warnings: summary.warnings,
        limitations: summary.limitations,
      }
    } catch (error) {
      return {
        ok: false,
        action: 'preview',
        error: {
          code: error instanceof ProfileNotFoundError ? 'PROFILE_NOT_FOUND' : 'PREVIEW_FAILED',
          message: error instanceof Error ? error.message : 'preview 执行失败',
        },
      }
    }
  }
}
