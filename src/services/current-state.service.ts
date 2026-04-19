import { AdapterNotRegisteredError, AdapterRegistry } from '../registry/adapter-registry'
import { StateStore } from '../stores/state.store'
import type { CurrentProfileResult, ValidationIssue } from '../types/adapter'
import type { PlatformExplainableSummary } from '../types/capabilities'
import type { CommandResult, CurrentCommandOutput, ListCommandItem, ListCommandOutput } from '../types/command'
import { PLATFORM_NAMES, type HealthStatus, type PlatformName, type RiskLevel } from '../types/platform'
import type { Profile } from '../types/profile'
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
      const summary = this.buildCurrentSummary(context.detections)

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
      const summary = this.buildCurrentSummary(context.detections)

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
        platformSummary: this.buildPlatformSummary(item.platform, {
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

  private buildCurrentSummary(detections: CurrentProfileResult[]): CurrentCommandOutput['summary'] {
    return {
      warnings: this.collectIssueMessages(detections.flatMap((item) => item.warnings ?? [])),
      limitations: this.collectIssueMessages(detections.flatMap((item) => item.limitations ?? [])),
    }
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
      platformSummary: this.buildPlatformSummary(profile.platform, {
        currentScope: detection?.currentScope,
        composedFiles: detection?.targetFiles.map((target) => target.path) ?? [],
        listMode: true,
      }),
      scopeCapabilities: getScopeCapabilityMatrix(profile.platform),
      scopeAvailability: detection?.scopeAvailability,
    }
  }

  private buildPlatformSummary(
    platform: PlatformName,
    context: { currentScope?: string; composedFiles: string[]; listMode: boolean },
  ): PlatformExplainableSummary | undefined {
    if (platform === 'gemini') {
      return {
        kind: 'scope-precedence',
        precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
        currentScope: context.currentScope,
        facts: [
          { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
          { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
        ],
      }
    }

    if (platform === 'claude') {
      return {
        kind: 'scope-precedence',
        precedence: ['user', 'project', 'local'],
        currentScope: context.currentScope,
        facts: [
          { code: 'CLAUDE_SCOPE_PRECEDENCE', message: 'Claude 支持 user < project < local 三层 precedence。' },
          { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '如果存在 local，同名字段最终以 local 为准。' },
        ],
      }
    }

    if (platform === 'codex') {
      return {
        kind: 'multi-file-composition',
        composedFiles: context.composedFiles,
        facts: [
          { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
          {
            code: context.listMode ? 'CODEX_LIST_IS_PROFILE_LEVEL' : 'CODEX_CURRENT_REQUIRES_BOTH_FILES',
            message: context.listMode
              ? 'list 仅展示 profile 级状态，不表示单文件可独立切换。'
              : 'current 检测不能把单个文件视为完整状态。',
          },
        ],
      }
    }

    return undefined
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
