import { REDACTED_INLINE_SECRET_PLACEHOLDER } from '../constants/secret-export'
import { collectIssueMessages, collectSecretReferences, isSecretLikeKey, isSecretReferenceKey } from '../domain/masking'
import { buildExecutabilityStats, buildProfileReferenceSummary, buildSecretReferenceStats, withProfileSecretReferenceContract, withProfileSecretWarnings } from '../domain/secret-inspection'
import { AdapterNotRegisteredError, AdapterRegistry } from '../registry/adapter-registry'
import type {
  CommandResult,
  ExportCommandOutput,
  SecretExportItemDetail,
  SecretExportItemSummary,
  SecretExportPolicySummary,
  ValidateExportPlatformStat,
} from '../types/command'
import type { ValidationIssue, ValidationResult } from '../types/adapter'
import { buildPlatformSummary } from './platform-summary'
import { buildReadonlyStateAuditTriageStats } from './readonly-triage-summary'
import { ProfileService } from './profile.service'
import { getScopeCapabilityMatrix } from './scope-options'
import type { Profile } from '../types/profile'

interface ExportOptions {
  includeSecrets?: boolean
}

interface RedactedProfileResult {
  profile: Profile
  secretExportSummary?: SecretExportItemSummary
}

interface TransformRecordResult {
  record: Record<string, unknown>
  details: SecretExportItemDetail[]
  inlineSecretCount: number
  redactedFieldCount: number
  referenceFieldCount: number
}

function withFallbackSecretReferences(validation: ValidationResult, profileApply: Record<string, unknown>): ValidationResult {
  return validation.secretReferences
    ? validation
    : {
        ...validation,
        secretReferences: collectSecretReferences(profileApply),
      }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasSecretValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim().length > 0
}

export class ExportService {
  constructor(
    private readonly profileService = new ProfileService(),
    private readonly registry = new AdapterRegistry(),
  ) {}

  async export(options: ExportOptions = {}): Promise<CommandResult<ExportCommandOutput>> {
    try {
      const profiles = await this.profileService.list()
      const observedAt = new Date().toISOString()
      const includeSecrets = options.includeSecrets === true
      const exportedProfiles = await Promise.all(profiles.map(async (profile) => {
        const adapter = this.registry.get(profile.platform)
        const validation = withFallbackSecretReferences(
          withProfileSecretReferenceContract(
            withProfileSecretWarnings(await adapter.validate(profile), profile),
            profile,
          ),
          profile.apply,
        )
        const exportedProfile = this.buildExportedProfile(profile, includeSecrets)
        const scopeAvailability = profile.platform === 'gemini'
          ? (await adapter.detectCurrent([profile]))?.scopeAvailability
          : undefined

        return {
          profile: exportedProfile.profile,
          validation,
          platformSummary: buildPlatformSummary(profile.platform, { listMode: true }),
          scopeCapabilities: getScopeCapabilityMatrix(profile.platform),
          scopeAvailability,
          defaultWriteScope: profile.platform === 'gemini' ? 'user' : undefined,
          observedAt: profile.platform === 'gemini' ? observedAt : undefined,
          referenceSummary: buildProfileReferenceSummary(profile),
          secretExportSummary: exportedProfile.secretExportSummary,
        }
      }))
      const summary = this.buildExportSummary(exportedProfiles, includeSecrets)

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

  private buildExportSummary(items: ExportCommandOutput['profiles'], includeSecrets: boolean): ExportCommandOutput['summary'] {
    const profiles = items.map((item) => item.profile)
    return {
      platformStats: this.buildPlatformStats(items),
      referenceStats: buildSecretReferenceStats(profiles),
      executabilityStats: buildExecutabilityStats(profiles.map((profile) => ({ profile }))),
      triageStats: buildReadonlyStateAuditTriageStats(profiles),
      secretExportPolicy: this.buildSecretExportPolicy(items, includeSecrets),
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
        referenceStats: buildSecretReferenceStats(platformItems.map((item) => item.profile)),
        platformSummary: platformItems[0]?.platformSummary,
      }
    })
  }

  private collectMessages(issues: ValidationIssue[]): string[] {
    return Array.from(new Set(collectIssueMessages(issues)))
  }

  private buildExportedProfile(profile: Profile, includeSecrets: boolean): RedactedProfileResult {
    const source = this.transformRecord(profile.source, 'source', includeSecrets)
    const apply = this.transformRecord(profile.apply, 'apply', includeSecrets)
    const details = [...source.details, ...apply.details]
    const hasInlineSecrets = source.inlineSecretCount + apply.inlineSecretCount > 0
    const hasReferenceSecrets = source.referenceFieldCount + apply.referenceFieldCount > 0
    const redactedFieldCount = source.redactedFieldCount + apply.redactedFieldCount
    const preservedReferenceCount = source.referenceFieldCount + apply.referenceFieldCount

    return {
      profile: {
        ...profile,
        source: source.record,
        apply: apply.record,
      },
      secretExportSummary: hasInlineSecrets || hasReferenceSecrets
        ? {
            hasInlineSecrets,
            hasRedactedInlineSecrets: redactedFieldCount > 0,
            hasReferenceSecrets,
            redactedFieldCount,
            preservedReferenceCount,
            ...(details.length > 0 ? { details } : {}),
          }
        : undefined,
    }
  }

  private transformRecord(
    record: Record<string, unknown>,
    prefix: string,
    includeSecrets: boolean,
  ): TransformRecordResult {
    const transformedEntries: [string, unknown][] = []
    const details: SecretExportItemDetail[] = []
    let inlineSecretCount = 0
    let redactedFieldCount = 0
    let referenceFieldCount = 0

    for (const [key, value] of Object.entries(record)) {
      const field = `${prefix}.${key}`
      if (isRecord(value)) {
        const nested = this.transformRecord(value, field, includeSecrets)
        transformedEntries.push([key, nested.record])
        details.push(...nested.details)
        inlineSecretCount += nested.inlineSecretCount
        redactedFieldCount += nested.redactedFieldCount
        referenceFieldCount += nested.referenceFieldCount
        continue
      }

      if (isSecretReferenceKey(key)) {
        transformedEntries.push([key, value])
        referenceFieldCount += 1
        details.push({
          field,
          kind: 'reference-preserved',
        })
        continue
      }

      if (isSecretLikeKey(key) && hasSecretValue(value)) {
        inlineSecretCount += 1
        if (includeSecrets) {
          transformedEntries.push([key, value])
          details.push({
            field,
            kind: 'inline-secret-exported',
          })
        } else {
          transformedEntries.push([key, REDACTED_INLINE_SECRET_PLACEHOLDER])
          redactedFieldCount += 1
          details.push({
            field,
            kind: 'inline-secret-redacted',
          })
        }
        continue
      }

      transformedEntries.push([key, value])
    }

    return {
      record: Object.fromEntries(transformedEntries),
      details,
      inlineSecretCount,
      redactedFieldCount,
      referenceFieldCount,
    }
  }

  private buildSecretExportPolicy(
    items: ExportCommandOutput['profiles'],
    includeSecrets: boolean,
  ): SecretExportPolicySummary {
    const secretExportSummaries = items.map((item) => item.secretExportSummary).filter((item) => item !== undefined)

    return {
      mode: includeSecrets ? 'include-secrets' : 'redacted-by-default',
      inlineSecretsExported: secretExportSummaries.reduce((count, item) =>
        count + (item?.details?.filter((detail) => detail.kind === 'inline-secret-exported').length ?? 0), 0),
      inlineSecretsRedacted: secretExportSummaries.reduce((count, item) => count + (item?.redactedFieldCount ?? 0), 0),
      referenceSecretsPreserved: secretExportSummaries.reduce((count, item) => count + (item?.preservedReferenceCount ?? 0), 0),
      profilesWithRedactedSecrets: secretExportSummaries.filter((item) => (item?.redactedFieldCount ?? 0) > 0).length,
    }
  }
}
