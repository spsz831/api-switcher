import { AdapterNotRegisteredError, AdapterRegistry } from '../registry/adapter-registry'
import type { CurrentProfileResult } from '../types/adapter'
import type {
  CommandResult,
  ImportObservation,
  ImportPreviewCommandOutput,
  ImportPreviewDecisionCodeStat,
  ImportPreviewDriftKindStat,
  ImportPreviewItem,
  ImportPreviewPlatformStat,
  ImportPreviewSummary,
} from '../types/command'
import { type ImportedProfileSource, ImportSourceError, ImportSourceService } from './import-source.service'
import { ImportFidelityService } from './import-fidelity.service'
import { getScopeCapabilityMatrix, resolveTargetScope } from './scope-options'

export class ImportPreviewService {
  constructor(
    private readonly importSourceService = new ImportSourceService(),
    private readonly registry = new AdapterRegistry(),
    private readonly fidelityService = new ImportFidelityService(),
  ) {}

  async preview(filePath: string): Promise<CommandResult<ImportPreviewCommandOutput>> {
    try {
      const source = await this.importSourceService.load(filePath)
      const items = await Promise.all(source.profiles.map((item) => this.buildPreviewItem(item)))
      const summary = this.buildSummary(items)

      return {
        ok: true,
        action: 'import',
        data: {
          sourceFile: source.sourceFile,
          sourceCompatibility: source.sourceCompatibility,
          items,
          summary,
        },
        warnings: [...source.sourceCompatibility.warnings, ...summary.warnings],
        limitations: summary.limitations,
      }
    } catch (error) {
      return {
        ok: false,
        action: 'import',
        error: {
          code: error instanceof ImportSourceError
            ? error.code
            : error instanceof AdapterNotRegisteredError
              ? 'ADAPTER_NOT_REGISTERED'
              : 'IMPORT_PREVIEW_FAILED',
          message: error instanceof Error ? error.message : 'import preview 执行失败',
        },
      }
    }
  }

  private async buildPreviewItem(sourceItem: ImportedProfileSource): Promise<ImportPreviewItem> {
    const adapter = this.registry.get(sourceItem.profile.platform)
    const detection = await adapter.detectCurrent([sourceItem.profile])
    const localObservation = this.buildLocalObservation(sourceItem.profile.platform, detection)
    const { fidelity, previewDecision } = this.fidelityService.evaluate({
      platform: sourceItem.profile.platform,
      exportedObservation: sourceItem.exportedObservation,
      localObservation,
    })

    return {
      profile: sourceItem.profile,
      platform: sourceItem.profile.platform,
      exportedObservation: sourceItem.exportedObservation,
      localObservation,
      fidelity,
      previewDecision,
    }
  }

  private buildLocalObservation(
    platform: ImportedProfileSource['profile']['platform'],
    detection: CurrentProfileResult | null,
  ): ImportObservation {
    return {
      defaultWriteScope: resolveTargetScope(platform),
      scopeCapabilities: getScopeCapabilityMatrix(platform),
      scopeAvailability: detection?.scopeAvailability,
    }
  }

  private buildSummary(items: ImportPreviewItem[]): ImportPreviewCommandOutput['summary'] {
    const counts = items.reduce<Pick<ImportPreviewSummary, 'totalItems' | 'matchCount' | 'mismatchCount' | 'partialCount' | 'insufficientDataCount'>>((acc, item) => {
      switch (item.fidelity?.status) {
        case 'match':
          acc.matchCount += 1
          break
        case 'mismatch':
          acc.mismatchCount += 1
          break
        case 'partial':
          acc.partialCount += 1
          break
        case 'insufficient-data':
          acc.insufficientDataCount += 1
          break
        default:
          break
      }

      return acc
    }, {
      totalItems: items.length,
      matchCount: 0,
      mismatchCount: 0,
      partialCount: 0,
      insufficientDataCount: 0,
    })

    return {
      ...counts,
      platformStats: this.buildPlatformStats(items),
      decisionCodeStats: this.buildDecisionCodeStats(items),
      driftKindStats: this.buildDriftKindStats(items),
      warnings: Array.from(new Set(items.flatMap((item) => item.fidelity?.mismatches.map((mismatch) => mismatch.message) ?? []))),
      limitations: Array.from(new Set(items.flatMap((item) => {
        if (item.fidelity?.status === 'partial') {
          return ['导出文件的 scope observation 不完整，当前仅能做部分 fidelity 对比。']
        }

        if (item.fidelity?.status === 'insufficient-data') {
          return ['导出文件缺少足够 observation，当前无法建立完整 fidelity 结论。']
        }

        return []
      }))),
    }
  }

  private buildPlatformStats(items: ImportPreviewItem[]): ImportPreviewPlatformStat[] {
    const stats = new Map<ImportPreviewPlatformStat['platform'], ImportPreviewPlatformStat>()

    for (const item of items) {
      const current = stats.get(item.platform) ?? {
        platform: item.platform,
        totalItems: 0,
        matchCount: 0,
        mismatchCount: 0,
        partialCount: 0,
        insufficientDataCount: 0,
      }

      current.totalItems += 1

      switch (item.fidelity?.status) {
        case 'match':
          current.matchCount += 1
          break
        case 'mismatch':
          current.mismatchCount += 1
          break
        case 'partial':
          current.partialCount += 1
          break
        case 'insufficient-data':
          current.insufficientDataCount += 1
          break
        default:
          break
      }

      stats.set(item.platform, current)
    }

    return [...stats.values()].sort((left, right) => left.platform.localeCompare(right.platform))
  }

  private buildDecisionCodeStats(items: ImportPreviewItem[]): ImportPreviewDecisionCodeStat[] {
    const orderedCodes: ImportPreviewDecisionCodeStat['code'][] = [
      'READY_USING_LOCAL_OBSERVATION',
      'LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION',
      'BLOCKED_BY_INSUFFICIENT_OBSERVATION',
      'BLOCKED_BY_FIDELITY_MISMATCH',
      'REQUIRES_LOCAL_SCOPE_RESOLUTION',
    ]

    return orderedCodes.map((code) => {
      const reasons = items.flatMap((item) => item.previewDecision.reasons.filter((reason) => reason.code === code))
      return {
        code,
        totalCount: reasons.length,
        blockingCount: reasons.filter((item) => item.blocking).length,
        nonBlockingCount: reasons.filter((item) => !item.blocking).length,
      }
    })
  }

  private buildDriftKindStats(items: ImportPreviewItem[]): ImportPreviewDriftKindStat[] {
    const orderedKinds: ImportPreviewDriftKindStat['driftKind'][] = [
      'default-scope-drift',
      'availability-drift',
      'capability-drift',
    ]

    return orderedKinds.map((driftKind) => {
      const mismatches = items.flatMap((item) => item.fidelity?.mismatches.filter((mismatch) => mismatch.driftKind === driftKind) ?? [])
      return {
        driftKind,
        totalCount: mismatches.length,
        blockingCount: mismatches.filter((item) => item.severity === 'blocking').length,
        warningCount: mismatches.filter((item) => item.severity === 'warning').length,
        infoCount: mismatches.filter((item) => item.severity === 'info').length,
      }
    })
  }
}
