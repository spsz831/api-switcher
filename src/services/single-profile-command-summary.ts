import { buildExecutabilityStats, buildSecretReferenceStats } from '../domain/secret-inspection'
import type { PlatformExplainableSummary } from '../types/capabilities'
import type { Profile } from '../types/profile'
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
    warnings,
    limitations,
  } = input

  return {
    platformStats: buildSinglePlatformStats({
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
    }),
    referenceStats: profile
      ? buildSecretReferenceStats([profile])
      : undefined,
    executabilityStats: profile
      ? buildExecutabilityStats([{ profile }])
      : undefined,
    warnings,
    limitations,
  }
}
