import { collectIssueMessages, collectSecretReferences } from '../domain/masking'
import { AdapterNotRegisteredError, AdapterRegistry } from '../registry/adapter-registry'
import type { CommandResult, ExportCommandOutput } from '../types/command'
import type { ValidationIssue, ValidationResult } from '../types/adapter'
import { ProfileService } from './profile.service'

function withFallbackSecretReferences(validation: ValidationResult, profileApply: Record<string, unknown>): ValidationResult {
  return validation.secretReferences
    ? validation
    : {
        ...validation,
        secretReferences: collectSecretReferences(profileApply),
      }
}

export class ExportService {
  constructor(
    private readonly profileService = new ProfileService(),
    private readonly registry = new AdapterRegistry(),
  ) {}

  async export(): Promise<CommandResult<ExportCommandOutput>> {
    try {
      const profiles = await this.profileService.list()
      const exportedProfiles = await Promise.all(profiles.map(async (profile) => {
        const validation = withFallbackSecretReferences(
          await this.registry.get(profile.platform).validate(profile),
          profile.apply,
        )

        return {
          profile,
          validation,
        }
      }))
      const summary = this.buildExportSummary(exportedProfiles)

      return {
        ok: true,
        action: 'export',
        data: {
          profiles: exportedProfiles,
          summary,
        },
        warnings: summary.warnings,
        limitations: summary.limitations,
      }
    } catch (error) {
      return {
        ok: false,
        action: 'export',
        error: {
          code: error instanceof AdapterNotRegisteredError ? 'ADAPTER_NOT_REGISTERED' : 'EXPORT_FAILED',
          message: error instanceof Error ? error.message : 'export 执行失败',
        },
      }
    }
  }

  private buildExportSummary(items: ExportCommandOutput['profiles']): ExportCommandOutput['summary'] {
    return {
      warnings: Array.from(new Set(items.flatMap((item) => [
        ...this.collectMessages(item.validation?.warnings ?? []),
        ...item.validation?.effectiveConfig?.overrides.map((override) => override.message) ?? [],
      ]).filter(Boolean))),
      limitations: this.collectMessages(items.flatMap((item) => item.validation?.limitations ?? [])),
    }
  }

  private collectMessages(issues: ValidationIssue[]): string[] {
    return Array.from(new Set(collectIssueMessages(issues)))
  }
}
