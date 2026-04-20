import { collectIssueMessages, collectSecretReferences } from '../domain/masking'
import { withProfileSecretWarnings } from '../domain/secret-inspection'
import { AdapterNotRegisteredError, AdapterRegistry } from '../registry/adapter-registry'
import type { CommandResult, ExportCommandOutput, ValidateExportPlatformStat } from '../types/command'
import type { ValidationIssue, ValidationResult } from '../types/adapter'
import { buildPlatformSummary } from './platform-summary'
import { ProfileService } from './profile.service'
import { getScopeCapabilityMatrix } from './scope-options'

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
      const observedAt = new Date().toISOString()
      const exportedProfiles = await Promise.all(profiles.map(async (profile) => {
        const adapter = this.registry.get(profile.platform)
        const validation = withFallbackSecretReferences(
          withProfileSecretWarnings(await adapter.validate(profile), profile),
          profile.apply,
        )
        const scopeAvailability = profile.platform === 'gemini'
          ? (await adapter.detectCurrent([profile]))?.scopeAvailability
          : undefined

        return {
          profile,
          validation,
          platformSummary: buildPlatformSummary(profile.platform, { listMode: true }),
          scopeCapabilities: getScopeCapabilityMatrix(profile.platform),
          scopeAvailability,
          defaultWriteScope: profile.platform === 'gemini' ? 'user' : undefined,
          observedAt: profile.platform === 'gemini' ? observedAt : undefined,
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
      platformStats: this.buildPlatformStats(items),
      warnings: Array.from(new Set(items.flatMap((item) => [
        ...this.collectMessages(item.validation?.warnings ?? []),
        ...item.validation?.effectiveConfig?.overrides.map((override) => override.message) ?? [],
      ]).filter(Boolean))),
      limitations: this.collectMessages(items.flatMap((item) => item.validation?.limitations ?? [])),
    }
  }

  private buildPlatformStats(items: ExportCommandOutput['profiles']): ValidateExportPlatformStat[] {
    const platforms = Array.from(new Set(items.map((item) => item.profile.platform))).sort()

    return platforms.map((platform) => {
      const platformItems = items.filter((item) => item.profile.platform === platform)
      return {
        platform,
        profileCount: platformItems.length,
        okCount: platformItems.filter((item) => item.validation?.ok).length,
        warningCount: platformItems.reduce((count, item) => count + (item.validation?.warnings?.length ?? 0), 0),
        limitationCount: platformItems.reduce((count, item) => count + (item.validation?.limitations?.length ?? 0), 0),
        platformSummary: platformItems[0]?.platformSummary,
      }
    })
  }

  private collectMessages(issues: ValidationIssue[]): string[] {
    return Array.from(new Set(collectIssueMessages(issues)))
  }
}
