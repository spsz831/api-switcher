import { AdapterNotRegisteredError, AdapterRegistry } from '../registry/adapter-registry'
import { StateStore } from '../stores/state.store'
import type { CurrentProfileResult, ValidationIssue } from '../types/adapter'
import type {
  CommandResult,
  CurrentCommandOutput,
  CurrentListPlatformStat,
  ListCommandItem,
  ListCommandOutput,
} from '../types/command'
import { PLATFORM_NAMES, type HealthStatus, type PlatformName, type RiskLevel } from '../types/platform'
import type { Profile } from '../types/profile'
import { buildPlatformSummary } from './platform-summary'
import { ProfileService } from './profile.service'
import { getScopeCapabilityMatrix } from './scope-options'

type DetectionMap = Partial<Record<PlatformName, CurrentProfileResult>>

export class CurrentStateService {
  constructor(
    private readonly profileService = new ProfileService(),
    private readonly stateStore = new StateStore(),
    private readonly registry = new AdapterRegistry(),
  ) {}

  async getCurrent(): Promise<CommandResult<CurrentCommandOutput>> {
    try {
      const context = await this.collectStateContext()
      const summary = this.buildCurrentSummary(context.profiles, context.state.current, context.detections)

      return {
        ok: true,
        action: 'current',
        data: {
          current: context.state.current,
          lastSwitch: context.state.lastSwitch,
          detections: context.detections,
          summary,
        },
        warnings: summary.warnings,
        limitations: summary.limitations,
      }
    } catch (error) {
      return {
        ok: false,
        action: 'current',
        error: {
          code: error instanceof AdapterNotRegisteredError ? 'ADAPTER_NOT_REGISTERED' : 'CURRENT_FAILED',
          message: error instanceof Error ? error.message : 'current 执行失败',
        },
      }
    }
  }

  async list(options: { platform?: string } = {}): Promise<CommandResult<ListCommandOutput>> {
    try {
      assertListOptions(options)

      const context = await this.collectStateContext()
      const targetProfiles = options.platform
        ? context.profiles.filter((profile) => profile.platform === options.platform)
        : context.profiles
      for (const profile of targetProfiles) {
        this.registry.get(profile.platform)
      }
      const profiles = this.buildListData(context.profiles, context.state.current, context.detectionsByPlatform, options)
      const summary = this.buildListSummary(targetProfiles, context.state.current, context.detectionsByPlatform, context.detections)

      return {
        ok: true,
        action: 'list',
        data: {
          profiles,
          summary,
        },
        warnings: summary.warnings,
        limitations: summary.limitations,
      }
    } catch (error) {
      return {
        ok: false,
        action: 'list',
        error: {
          code: error instanceof UnsupportedPlatformError
            ? 'UNSUPPORTED_PLATFORM'
            : error instanceof AdapterNotRegisteredError
              ? 'ADAPTER_NOT_REGISTERED'
              : 'LIST_FAILED',
          message: error instanceof Error ? error.message : 'list 执行失败',
        },
      }
    }
  }

  private async collectStateContext(): Promise<{
    profiles: Profile[]
    state: Awaited<ReturnType<StateStore['read']>>
    detections: CurrentProfileResult[]
    detectionsByPlatform: DetectionMap
  }> {
    const [profiles, state] = await Promise.all([this.profileService.list(), this.stateStore.read()])
    const detections = await Promise.all(
      PLATFORM_NAMES.map((platform) => this.registry.get(platform).detectCurrent(profiles.filter((item) => item.platform === platform))),
    )
    const filteredDetections = detections
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        ...item,
        platformSummary: buildPlatformSummary(item.platform, {
          currentScope: item.currentScope,
          composedFiles: item.targetFiles.map((target) => target.path),
          listMode: false,
        }),
        scopeCapabilities: getScopeCapabilityMatrix(item.platform),
      }))
    const detectionsByPlatform = filteredDetections.reduce<DetectionMap>((acc, item) => {
      acc[item.platform] = item
      return acc
    }, {})

    return {
      profiles,
      state,
      detections: filteredDetections,
      detectionsByPlatform,
    }
  }

  private buildCurrentSummary(
    profiles: Profile[],
    current: Partial<Record<PlatformName, string>>,
    detections: CurrentProfileResult[],
  ): CurrentCommandOutput['summary'] {
    const detectionsByPlatform = detections.reduce<DetectionMap>((acc, item) => {
      acc[item.platform] = item
      return acc
    }, {})

    return {
      platformStats: this.buildPlatformStats(profiles, current, detectionsByPlatform, PLATFORM_NAMES, false),
      warnings: this.collectIssueMessages(detections.flatMap((item) => item.warnings ?? [])),
      limitations: this.collectIssueMessages(detections.flatMap((item) => item.limitations ?? [])),
    }
  }

  private buildListSummary(
    profiles: Profile[],
    current: Partial<Record<PlatformName, string>>,
    detectionsByPlatform: DetectionMap,
    detections: CurrentProfileResult[],
  ): ListCommandOutput['summary'] {
    const targetPlatforms = Array.from(new Set(profiles.map((item) => item.platform))).sort()

    return {
      platformStats: this.buildPlatformStats(profiles, current, detectionsByPlatform, targetPlatforms, true),
      warnings: this.collectIssueMessages(detections.flatMap((item) => item.warnings ?? [])),
      limitations: this.collectIssueMessages(detections.flatMap((item) => item.limitations ?? [])),
    }
  }

  private buildPlatformStats(
    profiles: Profile[],
    current: Partial<Record<PlatformName, string>>,
    detectionsByPlatform: DetectionMap,
    platforms: readonly PlatformName[],
    listMode: boolean,
  ): CurrentListPlatformStat[] {
    return platforms.map((platform) => {
      const detection = detectionsByPlatform[platform]
      const profileCount = profiles.filter((item) => item.platform === platform).length

      return {
        platform,
        profileCount,
        currentProfileId: current[platform],
        detectedProfileId: detection?.matchedProfileId,
        managed: detection?.managed ?? false,
        currentScope: detection?.currentScope,
        platformSummary: buildPlatformSummary(platform, {
          currentScope: detection?.currentScope,
          composedFiles: detection?.targetFiles.map((target) => target.path) ?? [],
          listMode,
        }),
      }
    })
  }

  private collectIssueMessages(issues: ValidationIssue[]): string[] {
    return Array.from(new Set(issues.map((item) => item.message).filter(Boolean)))
  }

  private buildListData(
    profiles: Profile[],
    current: Partial<Record<PlatformName, string>>,
    detectionsByPlatform: DetectionMap,
    options: { platform?: PlatformName },
  ): ListCommandItem[] {
    const matchedManagedProfiles = new Set(
      Object.values(detectionsByPlatform)
        .filter((item): item is CurrentProfileResult => Boolean(item?.managed && item.matchedProfileId))
        .map((item) => item.matchedProfileId as string),
    )

    const items = profiles
      .map((profile) => this.buildListItem(profile, current, matchedManagedProfiles, detectionsByPlatform))
      .filter((item) => !options.platform || item.profile.platform === options.platform)

    items.sort((left, right) => {
      if (left.current !== right.current) {
        return left.current ? -1 : 1
      }

      return left.profile.id.localeCompare(right.profile.id)
    })

    return items
  }

  private buildListItem(
    profile: Profile,
    current: Partial<Record<PlatformName, string>>,
    matchedManagedProfiles: Set<string>,
    detectionsByPlatform: DetectionMap,
  ): ListCommandItem {
    const isCurrent = current[profile.platform] === profile.id
    const hasManagedDetection = matchedManagedProfiles.has(profile.id)
    const riskLevel = this.inferRiskLevel(profile, isCurrent, hasManagedDetection)
    const healthStatus = this.inferHealthStatus(profile, isCurrent, hasManagedDetection, riskLevel)
    const detection = detectionsByPlatform[profile.platform]

    return {
      profile: {
        ...profile,
        meta: {
          ...profile.meta,
          riskLevel,
          healthStatus,
        },
      },
      current: isCurrent,
      riskLevel,
      healthStatus,
      platformSummary: buildPlatformSummary(profile.platform, {
        currentScope: detection?.currentScope,
        composedFiles: detection?.targetFiles.map((target) => target.path) ?? [],
        listMode: true,
      }),
      scopeCapabilities: getScopeCapabilityMatrix(profile.platform),
      scopeAvailability: detection?.scopeAvailability,
    }
  }

  private inferRiskLevel(profile: Profile, current: boolean, managedMatch: boolean): RiskLevel {
    if (profile.meta?.riskLevel) {
      return profile.meta.riskLevel
    }

    if (current) {
      return 'low'
    }

    if (managedMatch) {
      return 'medium'
    }

    return 'low'
  }

  private inferHealthStatus(profile: Profile, current: boolean, managedMatch: boolean, riskLevel: RiskLevel): HealthStatus {
    if (profile.meta?.healthStatus) {
      return profile.meta.healthStatus
    }

    if (current) {
      return 'valid'
    }

    if (managedMatch) {
      return 'warning'
    }

    return riskLevel === 'high' ? 'invalid' : riskLevel === 'medium' ? 'warning' : 'unknown'
  }
}

class UnsupportedPlatformError extends Error {
  constructor(platform: string) {
    super(`不支持的平台：${platform}`)
    this.name = 'UnsupportedPlatformError'
  }
}

function assertListOptions(options: { platform?: string }): asserts options is { platform?: PlatformName } {
  if (options.platform && !PLATFORM_NAMES.includes(options.platform as PlatformName)) {
    throw new UnsupportedPlatformError(options.platform)
  }
}
