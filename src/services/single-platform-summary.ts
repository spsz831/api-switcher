import type { PlatformExplainableSummary } from '../types/capabilities'
import type { SinglePlatformStat } from '../types/command'
import type { PlatformName } from '../types/platform'

interface BuildSinglePlatformStatOptions {
  platform: PlatformName
  profileId?: string
  targetScope?: string
  warningCount: number
  limitationCount: number
  changedFileCount?: number
  restoredFileCount?: number
  backupCreated?: boolean
  noChanges?: boolean
  platformSummary?: PlatformExplainableSummary
}

export function buildSinglePlatformStats(options: BuildSinglePlatformStatOptions): SinglePlatformStat[] {
  return [{
    platform: options.platform,
    profileCount: 1,
    profileId: options.profileId,
    targetScope: options.targetScope,
    warningCount: options.warningCount,
    limitationCount: options.limitationCount,
    changedFileCount: options.changedFileCount,
    restoredFileCount: options.restoredFileCount,
    backupCreated: options.backupCreated,
    noChanges: options.noChanges,
    platformSummary: options.platformSummary,
  }]
}
