import { AdapterRegistry } from '../registry/adapter-registry'
import { StateStore } from '../stores/state.store'
import type { CurrentProfileResult } from '../types/adapter'
import type { CommandResult, CurrentCommandOutput, ListCommandItem, ListCommandOutput } from '../types/command'
import { PLATFORM_NAMES, type HealthStatus, type PlatformName, type RiskLevel } from '../types/platform'
import type { Profile } from '../types/profile'
import { ProfileService } from './profile.service'

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

      return {
        ok: true,
        action: 'current',
        data: {
          current: context.state.current,
          lastSwitch: context.state.lastSwitch,
          detections: context.detections,
        },
      }
    } catch (error) {
      return {
        ok: false,
        action: 'current',
        error: {
          code: 'CURRENT_FAILED',
          message: error instanceof Error ? error.message : 'current 执行失败',
        },
      }
    }
  }

  async list(options: { platform?: PlatformName } = {}): Promise<CommandResult<ListCommandOutput>> {
    try {
      const context = await this.collectStateContext()
      const data = this.buildListData(context.profiles, context.state.current, context.detectionsByPlatform, options)

      return {
        ok: true,
        action: 'list',
        data,
      }
    } catch (error) {
      return {
        ok: false,
        action: 'list',
        error: {
          code: 'LIST_FAILED',
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
    const filteredDetections = detections.filter((item): item is NonNullable<typeof item> => Boolean(item))
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

  private buildListData(
    profiles: Profile[],
    current: Partial<Record<PlatformName, string>>,
    detectionsByPlatform: DetectionMap,
    options: { platform?: PlatformName },
  ): ListCommandOutput {
    const matchedManagedProfiles = new Set(
      Object.values(detectionsByPlatform)
        .filter((item): item is CurrentProfileResult => Boolean(item?.managed && item.matchedProfileId))
        .map((item) => item.matchedProfileId as string),
    )

    const items = profiles
      .map((profile) => this.buildListItem(profile, current, matchedManagedProfiles))
      .filter((item) => !options.platform || item.profile.platform === options.platform)

    items.sort((left, right) => {
      if (left.current !== right.current) {
        return left.current ? -1 : 1
      }

      return left.profile.id.localeCompare(right.profile.id)
    })

    return { profiles: items }
  }

  private buildListItem(
    profile: Profile,
    current: Partial<Record<PlatformName, string>>,
    matchedManagedProfiles: Set<string>,
  ): ListCommandItem {
    const isCurrent = current[profile.platform] === profile.id
    const hasManagedDetection = matchedManagedProfiles.has(profile.id)
    const riskLevel = this.inferRiskLevel(profile, isCurrent, hasManagedDetection)
    const healthStatus = this.inferHealthStatus(profile, isCurrent, hasManagedDetection, riskLevel)

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
