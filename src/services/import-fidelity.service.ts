import type {
  ImportFidelityDriftSummary,
  ImportFidelityMismatchGroup,
  ImportFidelityMismatch,
  ImportFidelityReport,
  ImportObservation,
  ImportPreviewDecision,
  ImportPreviewDecisionReason,
} from '../types/command'
import type { PlatformName } from '../types/platform'

export class ImportFidelityService {
  evaluate(input: {
    platform: PlatformName
    exportedObservation?: ImportObservation
    localObservation?: ImportObservation
  }): {
    fidelity: ImportFidelityReport
    previewDecision: ImportPreviewDecision
  } {
    if (!input.exportedObservation || !input.localObservation) {
      return {
        fidelity: {
          status: 'insufficient-data',
          mismatches: [],
          driftSummary: this.buildDriftSummary([]),
          groupedMismatches: this.buildGroupedMismatches([]),
          highlights: ['导出 observation 或本地 observation 缺失，无法建立有效 fidelity 结论。'],
        },
        previewDecision: {
          canProceedToApplyDesign: false,
          recommendedScope: this.resolveRecommendedScope(input.localObservation, input.exportedObservation),
          requiresLocalResolution: false,
          reasonCodes: ['BLOCKED_BY_INSUFFICIENT_OBSERVATION'],
          reasons: this.buildDecisionReasons({
            fidelityStatus: 'insufficient-data',
            requiresLocalResolution: false,
          }),
        },
      }
    }

    const hasPartialObservation = !input.exportedObservation.scopeAvailability
      || !input.exportedObservation.scopeCapabilities
      || !input.exportedObservation.observedAt

    const mismatches = [
      ...this.compareDefaultWriteScope(input.exportedObservation, input.localObservation),
      ...this.compareScopeCapabilities(input.exportedObservation, input.localObservation),
      ...this.compareScopeAvailability(input.exportedObservation, input.localObservation),
    ]

    const requiresLocalResolution = mismatches.some((item) => item.field === 'scopeAvailability')
      && input.platform === 'gemini'
      && this.projectResolutionMissing(input.localObservation)

    const fidelity: ImportFidelityReport = mismatches.length > 0
        ? {
          status: 'mismatch',
          mismatches,
          driftSummary: this.buildDriftSummary(mismatches),
          groupedMismatches: this.buildGroupedMismatches(mismatches),
          highlights: this.buildHighlights('mismatch', mismatches),
        }
      : hasPartialObservation
        ? {
            status: 'partial',
            mismatches: [],
            driftSummary: this.buildDriftSummary([]),
            groupedMismatches: this.buildGroupedMismatches([]),
            highlights: ['导出文件缺少部分 observation 字段，当前只做有限对比。'],
          }
        : {
            status: 'match',
            mismatches: [],
            driftSummary: this.buildDriftSummary([]),
            groupedMismatches: this.buildGroupedMismatches([]),
            highlights: [],
          }

    return {
      fidelity,
      previewDecision: this.buildPreviewDecision({
        fidelity,
        requiresLocalResolution,
        recommendedScope: this.resolveRecommendedScope(input.localObservation, input.exportedObservation),
      }),
    }
  }

  private buildPreviewDecision(input: {
    fidelity: ImportFidelityReport
    requiresLocalResolution: boolean
    recommendedScope?: string
  }): ImportPreviewDecision {
    const canProceedToApplyDesign = input.fidelity.status !== 'mismatch' && input.fidelity.status !== 'insufficient-data'
    const reasons = this.buildDecisionReasons({
      fidelityStatus: input.fidelity.status,
      requiresLocalResolution: input.requiresLocalResolution,
    })

    return {
      canProceedToApplyDesign,
      recommendedScope: input.recommendedScope,
      requiresLocalResolution: input.requiresLocalResolution,
      reasonCodes: reasons.map((item) => item.code),
      reasons,
    }
  }

  private compareDefaultWriteScope(
    exportedObservation: ImportObservation,
    localObservation: ImportObservation,
  ): ImportFidelityMismatch[] {
    if (!exportedObservation.defaultWriteScope || !localObservation.defaultWriteScope) {
      return []
    }

    if (exportedObservation.defaultWriteScope === localObservation.defaultWriteScope) {
      return []
    }

    return [{
      field: 'defaultWriteScope',
      driftKind: 'default-scope-drift',
      severity: 'warning',
      exportedValue: exportedObservation.defaultWriteScope,
      localValue: localObservation.defaultWriteScope,
      message: `默认写入作用域不一致：导出时为 ${exportedObservation.defaultWriteScope}，当前本地为 ${localObservation.defaultWriteScope}。`,
      recommendedAction: '确认当前平台默认写入策略是否已调整，再决定后续 apply 目标作用域。',
    }]
  }

  private compareScopeAvailability(
    exportedObservation: ImportObservation,
    localObservation: ImportObservation,
  ): ImportFidelityMismatch[] {
    const exportedAvailability = exportedObservation.scopeAvailability ?? []
    const localAvailability = localObservation.scopeAvailability ?? []
    const mismatches: ImportFidelityMismatch[] = []

    for (const exportedItem of exportedAvailability) {
      const localItem = localAvailability.find((candidate) => candidate.scope === exportedItem.scope)
      if (!localItem) {
        continue
      }

      if (
        exportedItem.status !== localItem.status
        || exportedItem.detected !== localItem.detected
        || exportedItem.writable !== localItem.writable
      ) {
        mismatches.push({
          field: 'scopeAvailability',
          driftKind: 'availability-drift',
          severity: exportedItem.scope === 'project' ? 'blocking' : 'warning',
          scope: exportedItem.scope,
          exportedValue: {
            status: exportedItem.status,
            detected: exportedItem.detected,
            writable: exportedItem.writable,
          },
          localValue: {
            status: localItem.status,
            detected: localItem.detected,
            writable: localItem.writable,
          },
          message: `${exportedItem.scope} 作用域的可用性与当前本地环境不一致。`,
          recommendedAction: exportedItem.scope === 'project'
            ? '先修复本地 project scope 解析，再重新执行 import preview。'
            : '重新确认当前本地环境中的作用域可用性，再决定是否继续沿用导出观察。',
        })
      }
    }

    return mismatches
  }

  private compareScopeCapabilities(
    exportedObservation: ImportObservation,
    localObservation: ImportObservation,
  ): ImportFidelityMismatch[] {
    const exportedCapabilities = exportedObservation.scopeCapabilities ?? []
    const localCapabilities = localObservation.scopeCapabilities ?? []
    const mismatches: ImportFidelityMismatch[] = []

    for (const exportedItem of exportedCapabilities) {
      const localItem = localCapabilities.find((candidate) => candidate.scope === exportedItem.scope)
      if (!localItem) {
        continue
      }

      if (
        exportedItem.detect !== localItem.detect
        || exportedItem.preview !== localItem.preview
        || exportedItem.use !== localItem.use
        || exportedItem.rollback !== localItem.rollback
        || exportedItem.writable !== localItem.writable
        || (exportedItem.risk ?? 'normal') !== (localItem.risk ?? 'normal')
        || (exportedItem.confirmationRequired ?? false) !== (localItem.confirmationRequired ?? false)
      ) {
        mismatches.push({
          field: 'scopeCapabilities',
          driftKind: 'capability-drift',
          severity: 'warning',
          scope: exportedItem.scope,
          exportedValue: {
            detect: exportedItem.detect,
            preview: exportedItem.preview,
            use: exportedItem.use,
            rollback: exportedItem.rollback,
            writable: exportedItem.writable,
            risk: exportedItem.risk ?? 'normal',
            confirmationRequired: exportedItem.confirmationRequired ?? false,
          },
          localValue: {
            detect: localItem.detect,
            preview: localItem.preview,
            use: localItem.use,
            rollback: localItem.rollback,
            writable: localItem.writable,
            risk: localItem.risk ?? 'normal',
            confirmationRequired: localItem.confirmationRequired ?? false,
          },
          message: `${exportedItem.scope} 作用域能力与当前平台契约不一致。`,
          recommendedAction: '检查当前平台版本或契约是否已变化，再决定是否继续沿用导出策略。',
        })
      }
    }

    return mismatches
  }

  private projectResolutionMissing(localObservation: ImportObservation): boolean {
    const projectScope = localObservation.scopeAvailability?.find((item) => item.scope === 'project')
    return projectScope?.status === 'unresolved'
  }

  private resolveRecommendedScope(
    localObservation?: ImportObservation,
    exportedObservation?: ImportObservation,
  ): string | undefined {
    return localObservation?.defaultWriteScope
      ?? exportedObservation?.defaultWriteScope
      ?? localObservation?.scopeAvailability?.find((item) => item.writable)?.scope
      ?? exportedObservation?.scopeAvailability?.find((item) => item.writable)?.scope
  }

  private buildDriftSummary(mismatches: ImportFidelityMismatch[]): ImportFidelityDriftSummary {
    return mismatches.reduce<ImportFidelityDriftSummary>((acc, item) => {
      acc[item.severity] += 1
      return acc
    }, {
      blocking: 0,
      warning: 0,
      info: 0,
    })
  }

  private buildGroupedMismatches(mismatches: ImportFidelityMismatch[]): ImportFidelityMismatchGroup[] {
    const orderedDriftKinds: ImportFidelityMismatchGroup['driftKind'][] = [
      'default-scope-drift',
      'availability-drift',
      'capability-drift',
    ]

    return orderedDriftKinds.map((driftKind) => {
      const groupedItems = mismatches.filter((item) => item.driftKind === driftKind)
      return {
        driftKind,
        totalCount: groupedItems.length,
        blockingCount: groupedItems.filter((item) => item.severity === 'blocking').length,
        warningCount: groupedItems.filter((item) => item.severity === 'warning').length,
        infoCount: groupedItems.filter((item) => item.severity === 'info').length,
        mismatches: groupedItems,
      }
    })
  }

  private buildDecisionReasons(input: {
    fidelityStatus: ImportFidelityReport['status']
    requiresLocalResolution: boolean
  }): ImportPreviewDecisionReason[] {
    const reasons: ImportPreviewDecisionReason[] = []

    if (input.fidelityStatus === 'insufficient-data') {
      reasons.push({
        code: 'BLOCKED_BY_INSUFFICIENT_OBSERVATION',
        blocking: true,
        message: '导出 observation 或本地 observation 缺失，当前不能进入 apply 设计。',
      })
    }

    if (input.fidelityStatus === 'mismatch') {
      reasons.push({
        code: 'BLOCKED_BY_FIDELITY_MISMATCH',
        blocking: true,
        message: '导出观察与当前本地观察存在关键漂移，当前不应继续进入 apply 设计。',
      })
    }

    if (input.requiresLocalResolution) {
      reasons.push({
        code: 'REQUIRES_LOCAL_SCOPE_RESOLUTION',
        blocking: true,
        message: '当前本地 scope 解析未完成，需先修复本地解析结果。',
      })
    }

    if (input.fidelityStatus === 'partial') {
      reasons.push({
        code: 'LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION',
        blocking: false,
        message: '导出 observation 不完整，当前只适合基于本地 observation 做有限 apply 设计评估。',
      })
    }

    if (input.fidelityStatus === 'match') {
      reasons.push({
        code: 'READY_USING_LOCAL_OBSERVATION',
        blocking: false,
        message: '当前本地 observation 与导出观察一致，可继续基于本地 observation 评估 apply 设计。',
      })
    }

    return reasons
  }

  private buildHighlights(
    status: ImportFidelityReport['status'],
    mismatches: ImportFidelityMismatch[],
  ): string[] {
    if (status !== 'mismatch') {
      return []
    }

    const highlights: string[] = []
    if (mismatches.some((item) => item.driftKind === 'availability-drift')) {
      highlights.push('当前本地 scope availability 与导出观察不一致，应以本地实时环境为准。')
    }
    if (mismatches.some((item) => item.driftKind === 'capability-drift')) {
      highlights.push('当前平台契约与导出时记录的 capability 存在漂移，后续策略应以本地平台契约为准。')
    }
    if (mismatches.some((item) => item.driftKind === 'default-scope-drift')) {
      highlights.push('默认写入作用域已发生变化，后续 apply 设计需要重新确认目标 scope。')
    }

    return highlights
  }
}
