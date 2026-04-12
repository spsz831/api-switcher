import { collectIssueMessages } from '../domain/masking'
import { AdapterNotRegisteredError, AdapterRegistry } from '../registry/adapter-registry'
import type { ValidationIssue } from '../types/adapter'
import type { CommandResult, ValidateCommandOutput } from '../types/command'
import { ProfileNotFoundError, ProfileService } from './profile.service'

export class ValidateService {
  constructor(
    private readonly profileService = new ProfileService(),
    private readonly registry = new AdapterRegistry(),
  ) {}

  async validate(selector?: string): Promise<CommandResult<ValidateCommandOutput>> {
    try {
      const profiles = selector ? [await this.profileService.resolve(selector)] : await this.profileService.list()
      const items = await Promise.all(profiles.map(async (profile) => ({
        profileId: profile.id,
        platform: profile.platform,
        validation: await this.registry.get(profile.platform).validate(profile),
      })))
      const summary = this.buildValidateSummary(items)

      return {
        ok: items.every((item) => item.validation.ok),
        action: 'validate',
        data: {
          items,
          summary,
        },
        warnings: summary.warnings,
        limitations: summary.limitations,
      }
    } catch (error) {
      return {
        ok: false,
        action: 'validate',
        error: {
          code: error instanceof ProfileNotFoundError
            ? 'PROFILE_NOT_FOUND'
            : error instanceof AdapterNotRegisteredError
              ? 'ADAPTER_NOT_REGISTERED'
              : 'VALIDATE_FAILED',
          message: error instanceof Error ? error.message : 'validate 执行失败',
        },
      }
    }
  }

  private buildValidateSummary(items: ValidateCommandOutput['items']): ValidateCommandOutput['summary'] {
    return {
      warnings: Array.from(new Set(items.flatMap((item) => [
        ...this.collectMessages(item.validation.warnings),
        ...item.validation.effectiveConfig?.overrides.map((override) => override.message) ?? [],
      ]).filter(Boolean))),
      limitations: this.collectMessages(items.flatMap((item) => item.validation.limitations)),
    }
  }

  private collectMessages(issues: ValidationIssue[]): string[] {
    return Array.from(new Set(collectIssueMessages(issues)))
  }
}
