import { buildExecutabilityStats, buildSecretReferenceStats } from '../domain/secret-inspection'
import type { PlatformExplainableSummary } from '../types/capabilities'
import type { Profile } from '../types/profile'
import { buildAuditSummary, buildEmptyOverlaySummary } from './readonly-triage-summary'
import { buildSinglePlatformStats } from './single-platform-summary'

type SingleProfileCommandSummaryInput = {
  platform: Profile['platform']
  profileId?: string
  profile?: Profile
  targetScope?: string
  warningCount: number
  limitationCount: number
  changedFileCount?: number
  restoredFileCount?: number
  backupCreated?: boolean
  noChanges?: boolean
  platformSummary?: PlatformExplainableSummary
  includeReadonlyFoundations?: boolean
  warnings: string[]
  limitations: string[]
}

export function buildSingleProfileCommandSummary(input: SingleProfileCommandSummaryInput) {
  const {
    platform,
    profileId,
    profile,
    targetScope,
    warningCount,
    limitationCount,
    changedFileCount,
    restoredFileCount,
    backupCreated,
    noChanges,
    platformSummary,
    includeReadonlyFoundations = false,
    warnings,
    limitations,
  } = input

  const platformStats = buildSinglePlatformStats({
    platform,
    profileId,
    targetScope,
    warningCount,
    limitationCount,
    changedFileCount,
    restoredFileCount,
    backupCreated,
    noChanges,
    platformSummary,
  })
  const referenceStats = profile
    ? buildSecretReferenceStats([profile])
    : undefined
  const executabilityStats = profile
    ? buildExecutabilityStats([{ profile }])
    : undefined

  return {
    platformStats,
    referenceStats,
    executabilityStats,
    ...(includeReadonlyFoundations
      ? {
          auditSummary: buildAuditSummary({
            totalProfiles: profile ? 1 : 0,
            platformCount: 1,
            referenceStats,
            executabilityStats,
            highRiskItemCount: warningCount > 0 ? 1 : 0,
          }),
          overlaySummary: buildEmptyOverlaySummary(),
        }
      : {}),
    warnings,
    limitations,
  }
}
