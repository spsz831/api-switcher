import type {
  ConfigFieldView,
  CurrentProfileResult,
  DiffSummary,
  EffectiveConfigView,
  ManagedBoundary,
  SecretReference,
  TargetFileInfo,
  ValidationIssue,
} from '../types/adapter'
import type {
  AddCommandOutput,
  CommandResult,
  ConfirmationRequiredDetails,
  CurrentCommandOutput,
  ExportCommandOutput,
  ExecutabilityStats,
  ImportObservation,
  ImportApplyCommandOutput,
  ImportApplyNotReadyDetails,
  ImportApplyRedactedSecretDetails,
  ImportPreviewCommandOutput,
  ListCommandOutput,
  PreviewCommandOutput,
  ReferenceGovernanceDetail,
  ReferenceGovernanceFailureDetails,
  ReferenceSummary,
  RollbackCommandOutput,
  SchemaCommandOutput,
  SecretReferenceStats,
  UseCommandOutput,
  ValidateCommandOutput,
} from '../types/command'
import { getReadonlySummarySections } from '../constants/readonly-summary-sections'
import type { PlatformExplainableSummary, PlatformScopeCapability, ScopeAvailability } from '../types/capabilities'
import type { SnapshotScopePolicy } from '../types/snapshot'
import { renderCurrentScopeSummary, renderPreviewScopeSummary } from './scope-renderer'

type ImportFidelity = NonNullable<ImportApplyNotReadyDetails['fidelity']>
type ParsedConfirmationRequiredDetails = ConfirmationRequiredDetails & {
  referenceGovernance?: ReferenceGovernanceFailureDetails
}

function renderLimitations(limitations?: string[]): string[] {
  return limitations && limitations.length > 0 ? limitations.map((item) => `  - ${item}`) : []
}

function renderWarnings(title: string, warnings?: string[]): string[] {
  return warnings && warnings.length > 0 ? [title, ...warnings.map((item) => `  - ${item}`)] : []
}

function renderCommandLimitations(limitations?: string[]): string[] {
  return limitations && limitations.length > 0 ? ['限制说明:', ...limitations.map((item) => `  - ${item}`)] : []
}

function renderPlatformSummary(summary?: PlatformExplainableSummary, indent = ''): string[] {
  if (!summary) {
    return []
  }

  const lines = [`${indent}平台摘要:`]

  if (summary.precedence && summary.precedence.length > 0) {
    lines.push(`${indent}  - precedence: ${summary.precedence.join(' < ')}`)
  }

  if (summary.currentScope) {
    lines.push(`${indent}  - 当前生效作用域: ${summary.currentScope} scope`)
  }

  if (summary.composedFiles && summary.composedFiles.length > 0) {
    lines.push(`${indent}  - 组成文件: ${summary.composedFiles.join(', ')}`)
  }

  lines.push(...summary.facts.map((fact) => `${indent}  - ${fact.message}`))

  return lines
}

function renderCurrentListPlatformStats(
  stats?: CurrentCommandOutput['summary']['platformStats'] | ListCommandOutput['summary']['platformStats'],
): string[] {
  if (!stats || stats.length === 0) {
    return []
  }

  return [
    '按平台汇总:',
    ...stats.flatMap((item) => {
      const summaryParts = [
        `profiles=${item.profileCount}`,
        item.currentProfileId ? `current=${item.currentProfileId}` : null,
        item.detectedProfileId ? `detected=${item.detectedProfileId}` : null,
        `managed=${item.managed ? 'yes' : 'no'}`,
        item.currentScope ? `scope=${item.currentScope}` : null,
      ].filter(Boolean).join(', ')

      return [
        `  - ${item.platform}: ${summaryParts}`,
        ...(item.platformSummary?.facts ?? []).map((fact) => `    - ${fact.message}`),
      ]
    }),
  ]
}

function renderValidateExportPlatformStats(
  stats?: ValidateCommandOutput['summary']['platformStats'] | ExportCommandOutput['summary']['platformStats'],
): string[] {
  if (!stats || stats.length === 0) {
    return []
  }

  return [
    '按平台汇总:',
    ...stats.flatMap((item) => [
      `  - ${item.platform}: profiles=${item.profileCount}, ok=${item.okCount}, warnings=${item.warningCount}, limitations=${item.limitationCount}`,
      ...(item.platformSummary?.facts ?? []).map((fact) => `    - ${fact.message}`),
    ]),
  ]
}

function renderReferenceStats(stats?: SecretReferenceStats): string[] {
  if (!stats) {
    return []
  }

  const lines = [
    'referenceStats 摘要:',
    `  - profiles=${stats.profileCount}, reference=${stats.referenceProfileCount}, inline=${stats.inlineProfileCount}, writeUnsupported=${stats.writeUnsupportedProfileCount}`,
    `  - referenceResolution: resolved=${stats.resolvedReferenceProfileCount}, missing=${stats.missingReferenceProfileCount}, unsupported=${stats.unsupportedReferenceProfileCount}`,
    `  - hasReferenceProfiles=${stats.hasReferenceProfiles ? 'yes' : 'no'}, hasInlineProfiles=${stats.hasInlineProfiles ? 'yes' : 'no'}, hasWriteUnsupportedProfiles=${stats.hasWriteUnsupportedProfiles ? 'yes' : 'no'}`,
  ]

  if (stats.hasInlineProfiles) {
    lines.push('  - 提示: 当前仍有 inline profiles，可优先迁移到 secret reference。')
  }

  if (stats.hasWriteUnsupportedProfiles) {
    lines.push('  - 提示: 当前有 write unsupported profiles，应先结合 reference 摘要确认哪些命令与平台仍不能直接消费这些 profiles。')
  }

  if (stats.hasReferenceProfiles || stats.hasInlineProfiles || stats.hasWriteUnsupportedProfiles) {
    lines.push(`  - 下一步: ${buildReferenceStatsNextStep(stats)}`)
  }

  return lines
}

function renderExecutabilityStats(stats?: ExecutabilityStats): string[] {
  if (!stats) {
    return []
  }

  const lines = [
    'executabilityStats 摘要:',
    `  - profiles=${stats.profileCount}, inlineReady=${stats.inlineReadyProfileCount}, referenceReady=${stats.referenceReadyProfileCount}, referenceMissing=${stats.referenceMissingProfileCount}, writeUnsupported=${stats.writeUnsupportedProfileCount}, sourceRedacted=${stats.sourceRedactedProfileCount}`,
    `  - hasInlineReadyProfiles=${stats.hasInlineReadyProfiles ? 'yes' : 'no'}, hasReferenceReadyProfiles=${stats.hasReferenceReadyProfiles ? 'yes' : 'no'}, hasReferenceMissingProfiles=${stats.hasReferenceMissingProfiles ? 'yes' : 'no'}, hasWriteUnsupportedProfiles=${stats.hasWriteUnsupportedProfiles ? 'yes' : 'no'}, hasSourceRedactedProfiles=${stats.hasSourceRedactedProfiles ? 'yes' : 'no'}`,
  ]

  if (stats.hasReferenceMissingProfiles) {
    lines.push('  - 提示: 当前存在未解析或不受支持的 reference profiles，后续写入不可直接执行。')
  }

  if (stats.hasWriteUnsupportedProfiles) {
    lines.push('  - 提示: 当前有 write unsupported profiles，至少部分写入链路仍不能直接消费这些 profiles。')
  }

  if (stats.hasSourceRedactedProfiles) {
    lines.push('  - 提示: 当前存在 redacted 导入源 profiles，后续 import apply 不可直接执行。')
  }

  if (stats.profileCount > 0) {
    lines.push(`  - 下一步: ${buildExecutabilityStatsNextStep(stats)}`)
  }

  return lines
}

function renderImportSourceExecutability(summary: ImportPreviewCommandOutput['summary']['sourceExecutability']): string[] {
  return [
    '导入源可执行性:',
    `  - total=${summary.totalItems}, apply-ready=${summary.applyReadyCount}, preview-only=${summary.previewOnlyCount}, blocked=${summary.blockedCount}`,
    ...summary.blockedByCodeStats.map((item) => `  - ${item.code}: total=${item.totalCount}`),
    `  - 下一步: ${buildImportSourceExecutabilityNextStep(summary)}`,
  ]
}

function buildReferenceStatsNextStep(stats: SecretReferenceStats): string {
  if (stats.hasMissingReferenceProfiles || stats.hasUnsupportedReferenceProfiles) {
    return '先修复缺失或不受支持的引用，再决定是否继续进入 preview/use/import apply。'
  }

  if (stats.hasWriteUnsupportedProfiles) {
    return '先展开 reference 摘要确认哪些 profile 属于 write-unsupported，再决定是否迁移 secret 形态或切换后续写入路径。'
  }

  if (stats.hasResolvedReferenceProfiles) {
    return '当前存在可解析 reference，可继续结合 executability 与平台能力判断是否进入 preview/use/import apply。'
  }

  if (stats.hasInlineProfiles) {
    return '当前存在 inline-ready profile，可继续执行 preview/use/import apply。'
  }

  return '当前批次暂无需要继续处理的 secret/reference 治理动作。'
}

function buildExecutabilityStatsNextStep(stats: ExecutabilityStats): string {
  if (stats.hasSourceRedactedProfiles) {
    return '先修复 redacted 导入源或补回真实 secret，再继续进入 import apply。'
  }

  if (stats.hasReferenceMissingProfiles) {
    return '先修复未解析或不受支持的 reference，再继续进入写入链路。'
  }

  if (stats.hasWriteUnsupportedProfiles) {
    return '先展开 reference 细节确认 write-unsupported 项，再决定是否改用受支持的 secret 形态。'
  }

  if (stats.hasReferenceReadyProfiles || stats.hasInlineReadyProfiles) {
    return '当前存在可执行项，可继续进入 preview/use/import apply。'
  }

  return '当前批次暂无可继续推进到写入链路的 executability 信号。'
}

function buildImportSourceExecutabilityNextStep(summary: ImportPreviewCommandOutput['summary']['sourceExecutability']): string {
  if (summary.blockedCount > 0) {
    return '先修复 blocked source 项；apply-ready 项可继续进入 import apply。'
  }

  if (summary.previewOnlyCount > 0) {
    return 'preview-only 项继续停留在分析面；apply-ready 项可继续进入 import apply。'
  }

  if (summary.applyReadyCount > 0) {
    return '当前导入源已具备 apply-ready 项，可继续进入 import apply。'
  }

  return '当前导入源暂无可继续推进到 import apply 的项。'
}

function renderImportPreviewPlatformStats(stats: ImportPreviewCommandOutput['summary']['platformStats']): string[] {
  if (!stats || stats.length === 0) {
    return []
  }

  return [
    '按平台汇总:',
    ...stats.map((item) => `  - ${item.platform}: total=${item.totalItems}, match=${item.matchCount}, mismatch=${item.mismatchCount}, partial=${item.partialCount}, insufficient-data=${item.insufficientDataCount}`),
  ]
}

function renderReadonlySummarySections(
  action: 'current' | 'list' | 'validate' | 'export' | 'import',
  renderers: Partial<Record<'platform' | 'reference' | 'executability' | 'source-executability', () => string[]>>,
): string[] {
  return getReadonlySummarySections(action).flatMap((section) => {
    const renderer = renderers[section.id]
    return renderer ? renderer() : []
  })
}

function renderSecretExportPolicy(stats?: ExportCommandOutput['summary']['secretExportPolicy']): string[] {
  if (!stats) {
    return []
  }

  return [
    'secret 导出策略:',
    `  - mode=${stats.mode}`,
    `  - inline secrets: redacted=${stats.inlineSecretsRedacted}, exported=${stats.inlineSecretsExported}`,
    `  - reference secrets: preserved=${stats.referenceSecretsPreserved}`,
    `  - profiles with redacted secrets: ${stats.profilesWithRedactedSecrets}`,
  ]
}

function renderSecretExportSummary(summary?: ExportCommandOutput['profiles'][number]['secretExportSummary'], indent = '  '): string[] {
  if (!summary) {
    return []
  }

  const lines = [
    `${indent}secret 导出摘要:`,
    `${indent}- hasInlineSecrets=${summary.hasInlineSecrets ? 'yes' : 'no'}, hasRedactedInlineSecrets=${summary.hasRedactedInlineSecrets ? 'yes' : 'no'}, hasReferenceSecrets=${summary.hasReferenceSecrets ? 'yes' : 'no'}`,
    `${indent}- redacted=${summary.redactedFieldCount}, referencePreserved=${summary.preservedReferenceCount}`,
  ]

  if (!summary.details || summary.details.length === 0) {
    return lines
  }

  const redacted = summary.details.filter((item) => item.kind === 'inline-secret-redacted')
  const exported = summary.details.filter((item) => item.kind === 'inline-secret-exported')
  const preserved = summary.details.filter((item) => item.kind === 'reference-preserved')

  const renderDetails = (title: string, items: typeof summary.details): string[] => {
    if (!items || items.length === 0) {
      return []
    }

    return [
      `${indent}- ${title}:`,
      ...items.map((item) => `${indent}  - ${item.field}`),
    ]
  }

  return [
    ...lines,
    ...renderDetails('inline secrets 已脱敏导出', redacted),
    ...renderDetails('inline secrets 已按原值导出', exported),
    ...renderDetails('reference 已保留', preserved),
  ]
}

function renderSinglePlatformStats(
  stats?: PreviewCommandOutput['summary']['platformStats']
    | AddCommandOutput['summary']['platformStats']
    | UseCommandOutput['summary']['platformStats']
    | RollbackCommandOutput['summary']['platformStats']
    | ImportApplyCommandOutput['summary']['platformStats'],
): string[] {
  if (!stats || stats.length === 0) {
    return []
  }

  return [
    '按平台汇总:',
    ...stats.flatMap((item) => {
      const summaryParts = [
        `profiles=${item.profileCount}`,
        item.profileId ? `profile=${item.profileId}` : null,
        item.targetScope ? `scope=${item.targetScope}` : null,
        `warnings=${item.warningCount}`,
        `limitations=${item.limitationCount}`,
        item.changedFileCount !== undefined ? `changedFiles=${item.changedFileCount}` : null,
        item.restoredFileCount !== undefined ? `restoredFiles=${item.restoredFileCount}` : null,
        item.backupCreated !== undefined ? `backup=${item.backupCreated ? 'yes' : 'no'}` : null,
        item.noChanges !== undefined ? `noChanges=${item.noChanges ? 'yes' : 'no'}` : null,
      ].filter(Boolean).join(', ')

      return [
        `  - ${item.platform}: ${summaryParts}`,
        ...(item.platformSummary?.facts ?? []).map((fact) => `    - ${fact.message}`),
      ]
    }),
  ]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function parseScopePolicy(value: unknown): SnapshotScopePolicy | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const explicitScope = value.explicitScope
  const highRisk = value.highRisk
  const rollbackScopeMatchRequired = value.rollbackScopeMatchRequired

  if (
    typeof explicitScope !== 'boolean'
    || typeof highRisk !== 'boolean'
    || typeof rollbackScopeMatchRequired !== 'boolean'
  ) {
    return undefined
  }

  return {
    requestedScope: typeof value.requestedScope === 'string' ? value.requestedScope : undefined,
    resolvedScope: typeof value.resolvedScope === 'string' ? value.resolvedScope : undefined,
    defaultScope: typeof value.defaultScope === 'string' ? value.defaultScope : undefined,
    explicitScope,
    highRisk,
    riskWarning: typeof value.riskWarning === 'string' ? value.riskWarning : undefined,
    rollbackScopeMatchRequired,
  }
}

function parseScopeCapabilities(value: unknown): PlatformScopeCapability[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const parsed = value.flatMap((item) => {
    if (!isRecord(item)) {
      return []
    }

    if (
      typeof item.scope !== 'string'
      || typeof item.detect !== 'boolean'
      || typeof item.preview !== 'boolean'
      || typeof item.use !== 'boolean'
      || typeof item.rollback !== 'boolean'
      || typeof item.writable !== 'boolean'
    ) {
      return []
    }

    return [{
      scope: item.scope,
      detect: item.detect,
      preview: item.preview,
      use: item.use,
      rollback: item.rollback,
      writable: item.writable,
      risk: item.risk === 'high' || item.risk === 'normal' || item.risk === 'low'
        ? item.risk as PlatformScopeCapability['risk']
        : undefined,
      confirmationRequired: item.confirmationRequired === true,
      note: typeof item.note === 'string' ? item.note : undefined,
    }]
  })

  return parsed.length > 0 ? parsed : undefined
}

function parseScopeAvailability(value: unknown): ScopeAvailability[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const parsed = value.flatMap((item) => {
    if (!isRecord(item)) {
      return []
    }

    if (
      typeof item.scope !== 'string'
      || typeof item.status !== 'string'
      || typeof item.detected !== 'boolean'
      || typeof item.writable !== 'boolean'
    ) {
      return []
    }

    return [{
      scope: item.scope,
      status: item.status as ScopeAvailability['status'],
      detected: item.detected,
      writable: item.writable,
      path: typeof item.path === 'string' ? item.path : undefined,
      reasonCode: typeof item.reasonCode === 'string' ? item.reasonCode : undefined,
      reason: typeof item.reason === 'string' ? item.reason : undefined,
      remediation: typeof item.remediation === 'string' ? item.remediation : undefined,
    }]
  })

  return parsed.length > 0 ? parsed : undefined
}

function parseConfirmationRequiredDetails(details: unknown): ConfirmationRequiredDetails | undefined {
  if (!isRecord(details) || !isRecord(details.risk)) {
    return undefined
  }

  const { risk } = details
  if (
    typeof risk.allowed !== 'boolean'
    || typeof risk.riskLevel !== 'string'
    || !isStringArray(risk.reasons)
    || !isStringArray(risk.limitations)
  ) {
    return undefined
  }

  const parsed: ParsedConfirmationRequiredDetails = {
    risk: {
      allowed: risk.allowed,
      riskLevel: risk.riskLevel as ConfirmationRequiredDetails['risk']['riskLevel'],
      reasons: risk.reasons,
      limitations: risk.limitations,
    },
    scopePolicy: parseScopePolicy(details.scopePolicy),
    scopeCapabilities: parseScopeCapabilities(details.scopeCapabilities),
    scopeAvailability: parseScopeAvailability(details.scopeAvailability),
  }

  const referenceGovernance = parseReferenceGovernanceFailureDetails(details.referenceGovernance)
  if (referenceGovernance) {
    parsed.referenceGovernance = referenceGovernance
  }

  return parsed
}

function parseReferenceGovernanceDetail(value: unknown): ReferenceGovernanceDetail | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  if (
    typeof value.code !== 'string'
    || typeof value.field !== 'string'
    || typeof value.status !== 'string'
    || typeof value.message !== 'string'
  ) {
    return undefined
  }

  return {
    code: value.code as ReferenceGovernanceDetail['code'],
    field: value.field,
    status: value.status as ReferenceGovernanceDetail['status'],
    reference: typeof value.reference === 'string' ? value.reference : undefined,
    scheme: typeof value.scheme === 'string' ? value.scheme : undefined,
    message: value.message,
  }
}

function parseReferenceGovernanceFailureDetails(value: unknown): ReferenceGovernanceFailureDetails | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  if (
    typeof value.hasReferenceProfiles !== 'boolean'
    || typeof value.hasInlineProfiles !== 'boolean'
    || typeof value.hasWriteUnsupportedProfiles !== 'boolean'
    || !isStringArray(value.reasonCodes)
  ) {
    return undefined
  }

  const parsed: ReferenceGovernanceFailureDetails = {
    hasReferenceProfiles: value.hasReferenceProfiles,
    hasInlineProfiles: value.hasInlineProfiles,
    hasWriteUnsupportedProfiles: value.hasWriteUnsupportedProfiles,
    primaryReason: typeof value.primaryReason === 'string' ? value.primaryReason as ReferenceGovernanceFailureDetails['primaryReason'] : undefined,
    reasonCodes: value.reasonCodes as ReferenceGovernanceFailureDetails['reasonCodes'],
  }

  if (Array.isArray(value.referenceDetails)) {
    const referenceDetails = value.referenceDetails.flatMap((item) => {
      const parsedItem = parseReferenceGovernanceDetail(item)
      return parsedItem ? [parsedItem] : []
    })
    if (referenceDetails.length > 0) {
      parsed.referenceDetails = referenceDetails
    }
  }

  return parsed
}

function parseScopePolicyDetails(details: unknown): { scopePolicy?: SnapshotScopePolicy } | undefined {
  if (!isRecord(details)) {
    return undefined
  }

  const scopePolicy = parseScopePolicy(details.scopePolicy)
  return scopePolicy ? { scopePolicy } : undefined
}

function parseScopeCapabilityDetails(details: unknown): { scopeCapabilities?: PlatformScopeCapability[] } | undefined {
  if (!isRecord(details)) {
    return undefined
  }

  const scopeCapabilities = parseScopeCapabilities(details.scopeCapabilities)
  return scopeCapabilities ? { scopeCapabilities } : undefined
}

function parseScopeAvailabilityDetails(details: unknown): { scopeAvailability?: ScopeAvailability[] } | undefined {
  if (!isRecord(details)) {
    return undefined
  }

  const scopeAvailability = parseScopeAvailability(details.scopeAvailability)
  return scopeAvailability ? { scopeAvailability } : undefined
}

function parseImportObservation(value: unknown): ImportObservation | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const scopeCapabilities = parseScopeCapabilities(value.scopeCapabilities)
  const scopeAvailability = parseScopeAvailability(value.scopeAvailability)
  const defaultWriteScope = typeof value.defaultWriteScope === 'string' ? value.defaultWriteScope : undefined
  const observedAt = typeof value.observedAt === 'string' ? value.observedAt : undefined

  if (!defaultWriteScope && !observedAt && !scopeCapabilities && !scopeAvailability) {
    return undefined
  }

  return {
    defaultWriteScope,
    observedAt,
    scopeCapabilities,
    scopeAvailability,
  }
}

function parseImportPreviewDecision(value: unknown): ImportApplyNotReadyDetails['previewDecision'] | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  if (
    typeof value.canProceedToApplyDesign !== 'boolean'
    || typeof value.requiresLocalResolution !== 'boolean'
    || !isStringArray(value.reasonCodes)
    || !Array.isArray(value.reasons)
  ) {
    return undefined
  }

  const reasons = value.reasons.flatMap((reason) => {
    if (
      !isRecord(reason)
      || typeof reason.code !== 'string'
      || typeof reason.blocking !== 'boolean'
      || typeof reason.message !== 'string'
    ) {
      return []
    }

    return [{
      code: reason.code as ImportApplyNotReadyDetails['previewDecision']['reasons'][number]['code'],
      blocking: reason.blocking,
      message: reason.message,
    }]
  })

  if (reasons.length !== value.reasons.length) {
    return undefined
  }

  return {
    canProceedToApplyDesign: value.canProceedToApplyDesign,
    recommendedScope: typeof value.recommendedScope === 'string' ? value.recommendedScope : undefined,
    requiresLocalResolution: value.requiresLocalResolution,
    reasonCodes: value.reasonCodes as ImportApplyNotReadyDetails['previewDecision']['reasonCodes'],
    reasons,
  }
}

function parseImportFidelity(value: unknown): ImportFidelity | undefined {
  if (!isRecord(value) || !isRecord(value.driftSummary) || !Array.isArray(value.groupedMismatches) || !Array.isArray(value.highlights) || !Array.isArray(value.mismatches)) {
    return undefined
  }

  if (
    typeof value.status !== 'string'
    || typeof value.driftSummary.blocking !== 'number'
    || typeof value.driftSummary.warning !== 'number'
    || typeof value.driftSummary.info !== 'number'
    || !isStringArray(value.highlights)
  ) {
    return undefined
  }

  const mismatches = value.mismatches.flatMap((mismatch) => {
    if (
      !isRecord(mismatch)
      || typeof mismatch.field !== 'string'
      || typeof mismatch.driftKind !== 'string'
      || typeof mismatch.severity !== 'string'
      || typeof mismatch.message !== 'string'
    ) {
      return []
    }

    return [{
      field: mismatch.field as ImportFidelity['mismatches'][number]['field'],
      driftKind: mismatch.driftKind as ImportFidelity['mismatches'][number]['driftKind'],
      severity: mismatch.severity as ImportFidelity['mismatches'][number]['severity'],
      scope: typeof mismatch.scope === 'string' ? mismatch.scope : undefined,
      exportedValue: mismatch.exportedValue,
      localValue: mismatch.localValue,
      message: mismatch.message,
      recommendedAction: typeof mismatch.recommendedAction === 'string' ? mismatch.recommendedAction : undefined,
    }]
  })

  const groupedMismatches = value.groupedMismatches.flatMap((group) => {
    if (
      !isRecord(group)
      || typeof group.driftKind !== 'string'
      || typeof group.totalCount !== 'number'
      || typeof group.blockingCount !== 'number'
      || typeof group.warningCount !== 'number'
      || typeof group.infoCount !== 'number'
      || !Array.isArray(group.mismatches)
    ) {
      return []
    }

    const groupMismatches = group.mismatches.flatMap((mismatch) => {
      if (
        !isRecord(mismatch)
        || typeof mismatch.field !== 'string'
        || typeof mismatch.driftKind !== 'string'
        || typeof mismatch.severity !== 'string'
        || typeof mismatch.message !== 'string'
      ) {
        return []
      }

      return [{
        field: mismatch.field as ImportFidelity['mismatches'][number]['field'],
        driftKind: mismatch.driftKind as ImportFidelity['mismatches'][number]['driftKind'],
        severity: mismatch.severity as ImportFidelity['mismatches'][number]['severity'],
        scope: typeof mismatch.scope === 'string' ? mismatch.scope : undefined,
        exportedValue: mismatch.exportedValue,
        localValue: mismatch.localValue,
        message: mismatch.message,
        recommendedAction: typeof mismatch.recommendedAction === 'string' ? mismatch.recommendedAction : undefined,
      }]
    })

    if (groupMismatches.length !== group.mismatches.length) {
      return []
    }

    return [{
      driftKind: group.driftKind as ImportFidelity['groupedMismatches'][number]['driftKind'],
      totalCount: group.totalCount,
      blockingCount: group.blockingCount,
      warningCount: group.warningCount,
      infoCount: group.infoCount,
      mismatches: groupMismatches,
    }]
  })

  if (mismatches.length !== value.mismatches.length || groupedMismatches.length !== value.groupedMismatches.length) {
    return undefined
  }

  return {
    status: value.status as ImportFidelity['status'],
    mismatches,
    driftSummary: {
      blocking: value.driftSummary.blocking,
      warning: value.driftSummary.warning,
      info: value.driftSummary.info,
    },
    groupedMismatches,
    highlights: value.highlights,
  }
}

function parseImportApplyNotReadyDetails(details: unknown): ImportApplyNotReadyDetails | undefined {
  if (!isRecord(details)) {
    return undefined
  }

  const previewDecision = parseImportPreviewDecision(details.previewDecision)
  if (typeof details.sourceFile !== 'string' || typeof details.profileId !== 'string' || !previewDecision) {
    return undefined
  }

  return {
    sourceFile: details.sourceFile,
    profileId: details.profileId,
    previewDecision,
    fidelity: parseImportFidelity(details.fidelity),
    localObservation: parseImportObservation(details.localObservation),
    exportedObservation: parseImportObservation(details.exportedObservation),
  }
}

function parseImportApplyRedactedSecretDetails(details: unknown): ImportApplyRedactedSecretDetails | undefined {
  if (!isRecord(details) || typeof details.sourceFile !== 'string' || typeof details.profileId !== 'string') {
    return undefined
  }

  if (!Array.isArray(details.redactedInlineSecretFields) || !details.redactedInlineSecretFields.every((item) => typeof item === 'string')) {
    return undefined
  }

  return {
    sourceFile: details.sourceFile,
    profileId: details.profileId,
    redactedInlineSecretFields: details.redactedInlineSecretFields,
  }
}

function renderFailureScopePolicy(scopePolicy?: SnapshotScopePolicy): string[] {
  if (!scopePolicy) {
    return []
  }

  return [
    '作用域策略:',
    ...(scopePolicy.defaultScope ? [`  - 默认目标: ${scopePolicy.defaultScope} scope`] : []),
    `  - 显式指定: ${scopePolicy.explicitScope ? '是' : '否'}`,
    ...(scopePolicy.requestedScope ? [`  - 请求作用域: ${scopePolicy.requestedScope} scope`] : []),
    ...(scopePolicy.resolvedScope ? [`  - 实际目标: ${scopePolicy.resolvedScope} scope`] : []),
    `  - 高风险: ${scopePolicy.highRisk ? '是' : '否'}`,
    ...(scopePolicy.riskWarning ? [`  - 风险原因: ${scopePolicy.riskWarning}`] : []),
    `  - 回滚约束: ${scopePolicy.rollbackScopeMatchRequired ? '必须匹配快照 scope' : '不要求 scope 匹配'}`,
  ]
}

function formatCapabilityBoolean(value: boolean): string {
  return value ? 'yes' : 'no'
}

function formatCapabilityRisk(item: PlatformScopeCapability, includeConfirmationHint = true): string {
  const risk = item.risk ?? 'normal'
  return item.confirmationRequired && includeConfirmationHint ? `${risk}, requires --force` : risk
}

function renderScopeCapabilities(
  scopeCapabilities?: PlatformScopeCapability[],
  indent = '  ',
  includeConfirmationHint = true,
): string[] {
  if (!scopeCapabilities || scopeCapabilities.length === 0) {
    return []
  }

  return [
    `${indent}作用域能力:`,
    ...scopeCapabilities.flatMap((item) => [
      `${indent}- ${item.scope}: detect/current=${formatCapabilityBoolean(item.detect)}, preview/effective=${formatCapabilityBoolean(item.preview)}, use/write=${formatCapabilityBoolean(item.use && item.writable)}, rollback=${formatCapabilityBoolean(item.rollback)}, risk=${formatCapabilityRisk(item, includeConfirmationHint)}`,
      ...(item.note ? [`${indent}  说明: ${item.note}`] : []),
    ]),
  ]
}

function renderScopeAvailability(scopeAvailability?: ScopeAvailability[], indent = '  '): string[] {
  if (!scopeAvailability || scopeAvailability.length === 0) {
    return []
  }

  return [
    `${indent}作用域可用性:`,
    ...scopeAvailability.flatMap((item) => [
      `${indent}- ${item.scope}: status=${item.status}, detected=${formatCapabilityBoolean(item.detected)}, writable=${formatCapabilityBoolean(item.writable)}`,
      ...(item.path ? [`${indent}  路径: ${item.path}`] : []),
      ...(item.reasonCode ? [`${indent}  原因代码: ${item.reasonCode}`] : []),
      ...(item.reason ? [`${indent}  原因: ${item.reason}`] : []),
      ...(item.remediation ? [`${indent}  建议: ${item.remediation}`] : []),
    ]),
  ]
}

function renderValidationIssues(prefix: string, issues: ValidationIssue[]): string[] {
  return issues.map((item) => `  ${prefix}: ${item.message}`)
}

function renderTargetFiles(targetFiles: TargetFileInfo[]): string[] {
  return targetFiles.length > 0
    ? ['  目标文件:', ...targetFiles.map((target) => `  - ${target.path}`)]
    : []
}

function renderDiffSummary(diffSummary: DiffSummary[]): string[] {
  return diffSummary.length > 0
    ? [
        '  变更摘要:',
        ...diffSummary.map((item) => `  - ${item.path}: ${item.hasChanges ? item.changedKeys.join(', ') || '有变化' : '无变化'}`),
      ]
    : []
}

function renderConfigFieldView(item: ConfigFieldView, indent: string): string {
  const metadata = [
    item.scope ? `scope=${item.scope}` : null,
    item.source ? `source=${item.source}` : null,
    item.secret ? 'secret' : null,
    item.shadowed ? 'shadowed' : null,
  ].filter(Boolean).join(', ')

  return metadata.length > 0
    ? `${indent}- ${item.key}: ${item.maskedValue} (${metadata})`
    : `${indent}- ${item.key}: ${item.maskedValue}`
}

function renderFieldCollection(title: string, fields: ConfigFieldView[] | undefined, indent = '  '): string[] {
  if (!fields || fields.length === 0) {
    return []
  }

  return [
    `${indent}${title}:`,
    ...fields.map((item) => renderConfigFieldView(item, indent)),
  ]
}

function renderEffectiveConfig(view?: EffectiveConfigView, indent = '  '): string[] {
  if (!view) {
    return []
  }

  const lines = [`${indent}生效配置:`]

  if (view.stored.length > 0) {
    lines.push(`${indent}  已写入:`)
    lines.push(...view.stored.map((item) => renderConfigFieldView(item, `${indent}  `)))
  }

  if (view.effective.length > 0) {
    lines.push(`${indent}  最终生效:`)
    lines.push(...view.effective.map((item) => renderConfigFieldView(item, `${indent}  `)))
  }

  if (view.overrides.length > 0) {
    lines.push(`${indent}  覆盖说明:`)
    lines.push(...view.overrides.map((item) => `${indent}  - ${item.key}: ${item.message}`))
  }

  if (view.shadowedKeys && view.shadowedKeys.length > 0) {
    lines.push(`${indent}  被覆盖字段: ${view.shadowedKeys.join(', ')}`)
  }

  return lines.length > 1 ? lines : []
}

function renderManagedBoundaries(boundaries?: ManagedBoundary[], indent = '  '): string[] {
  if (!boundaries || boundaries.length === 0) {
    return []
  }

  return [
    `${indent}托管边界:`,
    ...boundaries.flatMap((item) => [
      `${indent}- 类型: ${item.type}${item.target ? ` / 目标: ${item.target}` : ''}`,
      `${indent}  托管字段: ${item.managedKeys.join(', ') || '无'}`,
      ...(item.preservedKeys && item.preservedKeys.length > 0 ? [`${indent}  保留字段: ${item.preservedKeys.join(', ')}`] : []),
      ...(item.preservedZones && item.preservedZones.length > 0 ? [`${indent}  保留区域: ${item.preservedZones.join(', ')}`] : []),
      ...(item.notes && item.notes.length > 0 ? item.notes.map((note) => `${indent}  说明: ${note}`) : []),
    ]),
  ]
}

function renderSecretReferences(references?: SecretReference[], indent = '  '): string[] {
  if (!references || references.length === 0) {
    return []
  }

  return [
    `${indent}敏感字段引用:`,
    ...references.map((item) => {
      const metadata = [
        `source=${item.source}`,
        `present=${item.present ? 'yes' : 'no'}`,
        item.reference ? `ref=${item.reference}` : null,
      ].filter(Boolean).join(', ')

      return `${indent}- ${item.key}: ${item.maskedValue} (${metadata})`
    }),
  ]
}

function renderDetection(item: CurrentProfileResult): string[] {
  return [
    `- 平台: ${item.platform}`,
    `  托管识别: ${item.managed ? '是' : '否'}`,
    `  匹配配置: ${item.matchedProfileId ?? '未匹配'}`,
    ...(item.currentScope ? [`  当前作用域: ${item.currentScope}`] : []),
    ...renderCurrentScopeSummary(item),
    ...renderCurrentPlatformSummary(item),
    ...renderScopeCapabilities(item.scopeCapabilities),
    ...renderScopeAvailability(item.scopeAvailability),
    ...renderReferenceSummary(item.referenceSummary),
    ...item.targetFiles.map((target) => `  目标文件: ${target.path}`),
    ...renderEffectiveConfig(item.effectiveConfig),
    ...renderManagedBoundaries(item.managedBoundaries),
    ...renderSecretReferences(item.secretReferences),
    ...renderValidationIssues('警告', item.warnings ?? []),
    ...renderValidationIssues('限制', item.limitations ?? []),
  ]
}

function renderCurrent(data: CurrentCommandOutput): string {
  const lines = ['当前 state:']

  if (Object.keys(data.current).length === 0) {
    lines.push('- 当前无已标记配置')
  } else {
    for (const [platform, profileId] of Object.entries(data.current)) {
      lines.push(`- ${platform}: ${profileId}`)
    }
  }

  if (data.lastSwitch) {
    lines.push(`最近切换: ${data.lastSwitch.platform} / ${data.lastSwitch.profileId} / ${data.lastSwitch.status}`)
  }

  lines.push(...renderReadonlySummarySections('current', {
    platform: () => renderCurrentListPlatformStats(data.summary.platformStats),
    reference: () => renderReferenceStats(data.summary.referenceStats),
    executability: () => renderExecutabilityStats(data.summary.executabilityStats),
  }))

  if (data.detections.length > 0) {
    lines.push('检测结果:')
    for (const detection of data.detections) {
      lines.push(...renderDetection(detection))
    }
  }

  lines.push(...renderWarnings('附加提示:', data.summary.warnings))
  lines.push(...renderCommandLimitations(data.summary.limitations))

  return lines.join('\n')
}


function renderPreview(data: PreviewCommandOutput): string {
  const lines = [
    ...renderSinglePlatformStats(data.summary.platformStats),
    ...renderReferenceStats(data.summary.referenceStats),
    ...renderExecutabilityStats(data.summary.executabilityStats),
    `- 配置: ${data.profile.id} (${data.profile.platform})`,
    `  校验结果: ${data.validation.ok ? '通过' : '失败'}`,
    ...renderValidationIssues('错误', data.validation.errors),
    ...renderValidationIssues('校验警告', data.validation.warnings),
    ...renderValidationIssues('限制', data.validation.limitations),
    `  风险等级: ${data.risk.riskLevel}`,
    `  需要确认: ${data.preview.requiresConfirmation ? '是' : '否'}`,
    `  计划备份: ${data.preview.backupPlanned ? '是' : '否'}`,
    `  无变更: ${data.preview.noChanges ? '是' : '否'}`,
    ...renderPreviewScopeSummary(data),
    ...renderScopeCapabilities(data.scopeCapabilities),
    ...renderScopeAvailability(data.scopeAvailability),
    ...renderReferenceGovernanceDetails(data.referenceGovernance),
    ...renderTargetFiles(data.preview.targetFiles),
    ...renderFieldCollection('生效字段', data.preview.effectiveFields),
    ...renderFieldCollection('仅存档字段', data.preview.storedOnlyFields),
    ...renderEffectiveConfig(data.preview.effectiveConfig),
    ...renderManagedBoundaries(data.preview.managedBoundaries),
    ...renderSecretReferences(data.preview.secretReferences),
    ...renderDiffSummary(data.preview.diffSummary),
    ...renderValidationIssues('警告', data.preview.warnings),
    ...renderValidationIssues('限制', data.preview.limitations),
    ...renderWarnings('附加提示:', data.summary.warnings),
    ...renderCommandLimitations(data.summary.limitations),
  ]

  return lines.join('\n')
}


function renderUse(data: UseCommandOutput): string {
  const lines = [
    ...renderSinglePlatformStats(data.summary.platformStats),
    ...renderReferenceStats(data.summary.referenceStats),
    ...renderExecutabilityStats(data.summary.executabilityStats),
    `- 配置: ${data.profile.id} (${data.profile.platform})`,
    ...(data.dryRun ? ['  Dry run: 是'] : []),
    `  备份ID: ${data.backupId ?? '未创建'}`,
    `  无变更: ${data.noChanges ? '是' : '否'}`,
    `  风险等级: ${data.risk.riskLevel}`,
    `  计划备份: ${data.preview.backupPlanned ? '是' : '否'}`,
    ...(data.changedFiles.length > 0 ? ['  已变更文件:', ...data.changedFiles.map((item) => `  - ${item}`)] : ['  已变更文件: 无']),
    ...renderUsePlatformSummary(data),
    ...renderScopeCapabilities(data.scopeCapabilities),
    ...renderScopeAvailability(data.scopeAvailability),
    ...renderFieldCollection('生效字段', data.preview.effectiveFields),
    ...renderFieldCollection('仅存档字段', data.preview.storedOnlyFields),
    ...renderEffectiveConfig(data.preview.effectiveConfig),
    ...renderManagedBoundaries(data.preview.managedBoundaries),
    ...renderSecretReferences(data.preview.secretReferences),
    ...renderDiffSummary(data.preview.diffSummary),
    ...renderValidationIssues('警告', data.preview.warnings),
    ...renderValidationIssues('限制', data.preview.limitations),
    ...renderWarnings('附加提示:', data.summary.warnings),
    ...renderCommandLimitations(data.summary.limitations),
  ]

  return lines.join('\n')
}

function renderAdd(data: AddCommandOutput): string {
  const referenceOnlyBoundaryNote = data.summary.referenceStats?.hasReferenceProfiles
    ? ['  说明: add 只记录 reference 输入；真正的本地解析、治理判断和写入可执行性检查在 preview/use/import apply 阶段完成。']
    : []

  return [
    ...renderSinglePlatformStats(data.summary.platformStats),
    ...renderReferenceStats(data.summary.referenceStats),
    ...renderExecutabilityStats(data.summary.executabilityStats),
    `- 配置: ${data.profile.id} (${data.profile.platform})`,
    `  名称: ${data.profile.name}`,
    `  校验结果: ${data.validation.ok ? '通过' : '失败'}`,
    ...renderValidationIssues('错误', data.validation.errors),
    ...renderValidationIssues('警告', data.validation.warnings),
    ...renderValidationIssues('限制', data.validation.limitations),
    `  风险等级: ${data.risk.riskLevel}`,
    `  需要确认: ${data.preview.requiresConfirmation ? '是' : '否'}`,
    `  计划备份: ${data.preview.backupPlanned ? '是' : '否'}`,
    `  无变更: ${data.preview.noChanges ? '是' : '否'}`,
    ...renderScopeCapabilities(data.scopeCapabilities),
    ...renderTargetFiles(data.preview.targetFiles),
    ...renderFieldCollection('生效字段', data.preview.effectiveFields),
    ...renderFieldCollection('仅存档字段', data.preview.storedOnlyFields),
    ...renderEffectiveConfig(data.preview.effectiveConfig),
    ...renderManagedBoundaries(data.preview.managedBoundaries),
    ...renderSecretReferences(data.preview.secretReferences),
    ...referenceOnlyBoundaryNote,
    ...renderDiffSummary(data.preview.diffSummary),
    ...renderValidationIssues('预览警告', data.preview.warnings),
    ...renderValidationIssues('预览限制', data.preview.limitations),
    ...renderWarnings('附加提示:', data.summary.warnings),
    ...renderCommandLimitations(data.summary.limitations),
  ].join('\n')
}

function renderRollback(data: RollbackCommandOutput): string {
  return [
    ...renderSinglePlatformStats(data.summary.platformStats),
    ...renderReferenceStats(data.summary.referenceStats),
    ...renderExecutabilityStats(data.summary.executabilityStats),
    `- 备份ID: ${data.backupId}`,
    ...(data.restoredFiles.length > 0 ? ['  已恢复文件:', ...data.restoredFiles.map((item) => `  - ${item}`)] : ['  已恢复文件: 无']),
    ...renderRollbackPlatformSummary(data),
    ...renderFailureScopePolicy(data.scopePolicy),
    ...renderScopeCapabilities(data.scopeCapabilities),
    ...renderScopeAvailability(data.scopeAvailability),
    ...renderEffectiveConfig(data.rollback?.effectiveConfig),
    ...renderManagedBoundaries(data.rollback?.managedBoundaries),
    ...renderValidationIssues('回滚警告', data.rollback?.warnings ?? []),
    ...renderValidationIssues('回滚限制', data.rollback?.limitations ?? []),
    ...renderWarnings('附加提示:', data.summary.warnings),
    ...renderCommandLimitations(data.summary.limitations),
  ].join('\n')
}

function renderExport(data: ExportCommandOutput): string {
  return [
    ...renderReadonlySummarySections('export', {
      platform: () => renderValidateExportPlatformStats(data.summary.platformStats),
      reference: () => renderReferenceStats(data.summary.referenceStats),
      executability: () => renderExecutabilityStats(data.summary.executabilityStats),
    }),
    ...renderSecretExportPolicy(data.summary.secretExportPolicy),
    data.profiles.map((item) => [
      `- ${item.profile.id} (${item.profile.platform})`,
      `  名称: ${item.profile.name}`,
      ...('defaultWriteScope' in item && item.defaultWriteScope ? [`  默认写入作用域: ${item.defaultWriteScope} scope`] : []),
      ...renderScopeCapabilities(item.scopeCapabilities),
      ...renderScopeAvailability(item.scopeAvailability),
      ...renderReferenceSummary(item.referenceSummary),
      ...renderSecretExportSummary(item.secretExportSummary),
      ...(item.validation ? [
        `  校验结果: ${item.validation.ok ? '通过' : '失败'}`,
        ...item.validation.errors.map((error) => `  错误: ${error.message}`),
        ...item.validation.warnings.map((warning) => `  警告: ${warning.message}`),
        ...item.validation.limitations.map((issue) => `  限制: ${issue.message}`),
        ...renderEffectiveConfig(item.validation.effectiveConfig),
        ...renderManagedBoundaries(item.validation.managedBoundaries),
        ...renderSecretReferences(item.validation.secretReferences),
      ] : []),
    ].join('\n')).join('\n'),
    ...renderWarnings('附加提示:', data.summary.warnings),
    ...renderCommandLimitations(data.summary.limitations),
  ].filter(Boolean).join('\n')
}

function renderImportObservation(title: string, observation?: ImportObservation): string[] {
  if (!observation) {
    return [`  ${title}: 无`]
  }

  return [
    `  ${title}:`,
    ...(observation.defaultWriteScope ? [`    默认写入作用域: ${observation.defaultWriteScope} scope`] : []),
    ...(observation.observedAt ? [`    导出观测时间: ${observation.observedAt}`] : []),
    ...renderScopeCapabilities(observation.scopeCapabilities, '    '),
    ...renderScopeAvailability(observation.scopeAvailability, '    '),
  ]
}

function renderImportPreviewDecision(decision: ImportApplyNotReadyDetails['previewDecision']): string[] {
  return [
    'Preview 决策:',
    ...(decision.recommendedScope ? [`  推荐作用域: ${decision.recommendedScope} scope`] : []),
    `  可进入 apply 设计: ${decision.canProceedToApplyDesign ? '是' : '否'}`,
    `  需要先修复本地解析: ${decision.requiresLocalResolution ? '是' : '否'}`,
    ...(decision.reasonCodes.length > 0 ? [`  决策代码: ${decision.reasonCodes.join(', ')}`] : []),
    ...decision.reasons.map((reason) => `  决策原因: [${reason.code}] ${reason.blocking ? 'blocking' : 'non-blocking'} / ${reason.message}`),
  ]
}

function renderImportFidelity(fidelity?: ImportApplyNotReadyDetails['fidelity']): string[] {
  if (!fidelity) {
    return []
  }

  return [
    'Fidelity:',
    `  状态: ${fidelity.status}`,
    `  Drift 汇总: blocking=${fidelity.driftSummary.blocking}, warning=${fidelity.driftSummary.warning}, info=${fidelity.driftSummary.info}`,
    ...fidelity.groupedMismatches
      .filter((group) => group.totalCount > 0)
      .map((group) => `  Drift 分组: ${group.driftKind}, total=${group.totalCount}, blocking=${group.blockingCount}, warning=${group.warningCount}, info=${group.infoCount}`),
    ...fidelity.highlights.map((highlight) => `  Highlight: ${highlight}`),
    ...fidelity.mismatches.flatMap((mismatch) => [
      `  - ${mismatch.message}`,
      `    drift=${mismatch.driftKind}, severity=${mismatch.severity}`,
      ...(mismatch.exportedValue !== undefined ? [`    导出值: ${formatImportMismatchValue(mismatch.exportedValue)}`] : []),
      ...(mismatch.localValue !== undefined ? [`    本地值: ${formatImportMismatchValue(mismatch.localValue)}`] : []),
      ...(mismatch.recommendedAction ? [`    建议动作: ${mismatch.recommendedAction}`] : []),
    ]),
  ]
}

function renderRiskSummary(risk: ConfirmationRequiredDetails['risk']): string[] {
  return [
    '风险摘要:',
    `  - 风险等级: ${risk.riskLevel}`,
    ...risk.reasons.map((reason) => `  - 原因: ${reason}`),
    ...risk.limitations.map((limitation) => `  - 限制: ${limitation}`),
  ]
}

function renderReferenceGovernanceDetails(referenceGovernance?: ReferenceGovernanceFailureDetails): string[] {
  if (!referenceGovernance?.referenceDetails || referenceGovernance.referenceDetails.length === 0) {
    return []
  }

  const missingEnv = referenceGovernance.referenceDetails.filter((item) => item.code === 'REFERENCE_ENV_UNRESOLVED')
  const resolvedEnv = referenceGovernance.referenceDetails.filter((item) => item.code === 'REFERENCE_ENV_RESOLVED')
  const unsupportedSchemes = referenceGovernance.referenceDetails.filter((item) => item.code === 'REFERENCE_SCHEME_UNSUPPORTED')
  const missingValues = referenceGovernance.referenceDetails.filter((item) => item.code === 'REFERENCE_VALUE_MISSING')

  const renderItems = (title: string, items: ReferenceGovernanceDetail[]): string[] => {
    if (items.length === 0) {
      return []
    }

    return [
      `  - ${title}:`,
      ...items.flatMap((item) => [
        `    - ${item.field}${item.reference ? ` -> ${item.reference}` : ''}`,
        `      ${item.message}`,
      ]),
    ]
  }

  return [
    'reference 解析摘要:',
    ...renderItems('未解析 env 引用', missingEnv),
    ...renderItems('已解析但当前不会写入', resolvedEnv),
    ...renderItems('不支持的引用 scheme', unsupportedSchemes),
    ...renderItems('缺少引用值', missingValues),
  ]
}

function renderReferenceGovernanceOverview(referenceGovernance?: ReferenceGovernanceFailureDetails): string[] {
  if (!referenceGovernance?.referenceDetails || referenceGovernance.referenceDetails.length === 0) {
    return []
  }

  const missingCount = referenceGovernance.referenceDetails.filter((item) =>
    item.code === 'REFERENCE_ENV_UNRESOLVED' || item.code === 'REFERENCE_VALUE_MISSING').length
  const resolvedCount = referenceGovernance.referenceDetails.filter((item) =>
    item.code === 'REFERENCE_ENV_RESOLVED').length
  const unsupportedCount = referenceGovernance.referenceDetails.filter((item) =>
    item.code === 'REFERENCE_SCHEME_UNSUPPORTED').length

  return [
    'reference 摘要:',
    `  - hasReferenceProfiles=${referenceGovernance.hasReferenceProfiles ? 'yes' : 'no'}, hasInlineProfiles=${referenceGovernance.hasInlineProfiles ? 'yes' : 'no'}, hasWriteUnsupportedProfiles=${referenceGovernance.hasWriteUnsupportedProfiles ? 'yes' : 'no'}`,
    `  - missing=${missingCount}, resolved-but-not-writable=${resolvedCount}, unsupported=${unsupportedCount}`,
    ...(referenceGovernance.reasonCodes.length > 0 ? [`  - reasonCodes: ${referenceGovernance.reasonCodes.join(', ')}`] : []),
  ]
}

function renderReferenceSummary(referenceSummary?: ReferenceSummary, indent = '  '): string[] {
  if (!referenceSummary) {
    return []
  }

  const lines = [
    `${indent}reference 摘要:`,
    `${indent}- hasReferenceFields=${referenceSummary.hasReferenceFields ? 'yes' : 'no'}, hasInlineSecrets=${referenceSummary.hasInlineSecrets ? 'yes' : 'no'}, writeUnsupported=${referenceSummary.writeUnsupported ? 'yes' : 'no'}`,
    `${indent}- resolved=${referenceSummary.resolvedReferenceCount}, missing=${referenceSummary.missingReferenceCount}, unsupported=${referenceSummary.unsupportedReferenceCount}, missingValue=${referenceSummary.missingValueCount}`,
  ]

  if (!referenceSummary.referenceDetails || referenceSummary.referenceDetails.length === 0) {
    return lines
  }

  return [
    ...lines,
    ...renderReferenceGovernanceDetails({
      hasReferenceProfiles: referenceSummary.hasReferenceFields,
      hasInlineProfiles: referenceSummary.hasInlineSecrets,
      hasWriteUnsupportedProfiles: referenceSummary.writeUnsupported,
      reasonCodes: [],
      referenceDetails: referenceSummary.referenceDetails,
    }).map((line) => `${indent}${line}`),
  ]
}

function formatImportMismatchValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined'
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function renderImportPreview(data: ImportPreviewCommandOutput): string {
  return [
    `导入文件: ${data.sourceFile}`,
    `源兼容性: ${data.sourceCompatibility.mode}`,
    ...data.sourceCompatibility.warnings.map((warning) => `  - ${warning}`),
    `汇总: total=${data.summary.totalItems}, match=${data.summary.matchCount}, mismatch=${data.summary.mismatchCount}, partial=${data.summary.partialCount}, insufficient-data=${data.summary.insufficientDataCount}`,
    ...renderReadonlySummarySections('import', {
      'source-executability': () => renderImportSourceExecutability(data.summary.sourceExecutability),
      executability: () => renderExecutabilityStats(data.summary.executabilityStats),
      platform: () => renderImportPreviewPlatformStats(data.summary.platformStats),
    }),
    ...(data.summary.decisionCodeStats.length > 0
      ? [
          '决策代码汇总:',
          ...data.summary.decisionCodeStats.map((item) => `  - ${item.code}: total=${item.totalCount}, blocking=${item.blockingCount}, non-blocking=${item.nonBlockingCount}`),
        ]
      : []),
    ...(data.summary.driftKindStats.length > 0
      ? [
          'Drift 类型汇总:',
          ...data.summary.driftKindStats.map((item) => `  - ${item.driftKind}: total=${item.totalCount}, blocking=${item.blockingCount}, warning=${item.warningCount}, info=${item.infoCount}`),
        ]
      : []),
    ...data.items.flatMap((item) => [
      `- 配置: ${item.profile.id} (${item.platform})`,
      ...renderPlatformSummary(item.platformSummary, '  '),
      ...renderImportObservation('导出时观察', item.exportedObservation),
      ...renderImportObservation('当前本地观察', item.localObservation),
      ...(item.fidelity ? [
        `  Fidelity: ${item.fidelity.status}`,
        ...renderImportFidelity(item.fidelity).slice(2),
      ] : []),
      ...(item.previewDecision.recommendedScope ? [`  推荐作用域: ${item.previewDecision.recommendedScope} scope`] : []),
      `  可进入 apply 设计: ${item.previewDecision.canProceedToApplyDesign ? '是' : '否'}`,
      `  需要先修复本地解析: ${item.previewDecision.requiresLocalResolution ? '是' : '否'}`,
      ...(item.previewDecision.reasonCodes.length > 0 ? [`  决策代码: ${item.previewDecision.reasonCodes.join(', ')}`] : []),
      ...item.previewDecision.reasons.map((reason) => `  决策原因: [${reason.code}] ${reason.blocking ? 'blocking' : 'non-blocking'} / ${reason.message}`),
      `  建议: ${item.previewDecision.requiresLocalResolution
        ? '先修复本地作用域解析，再考虑进入 apply 设计。'
        : item.previewDecision.canProceedToApplyDesign
          ? '可继续基于当前本地 observation 评估 apply 设计。'
          : '当前 observation 不足，建议先补齐导出或本地环境信息。'
      }`,
    ]),
    ...renderWarnings('附加提示:', data.summary.warnings),
    ...renderCommandLimitations(data.summary.limitations),
  ].join('\n')
}

function renderValidate(data: ValidateCommandOutput): string {
  return [
    ...renderReadonlySummarySections('validate', {
      platform: () => renderValidateExportPlatformStats(data.summary.platformStats),
      reference: () => renderReferenceStats(data.summary.referenceStats),
      executability: () => renderExecutabilityStats(data.summary.executabilityStats),
    }),
    data.items.map((item) => [
      `- ${item.profileId} (${item.platform})`,
      `  校验结果: ${item.validation.ok ? '通过' : '失败'}`,
      ...item.validation.errors.map((error) => `  错误: ${error.message}`),
      ...item.validation.warnings.map((warning) => `  警告: ${warning.message}`),
      ...item.validation.limitations.map((issue) => `  限制: ${issue.message}`),
      ...renderScopeCapabilities(item.scopeCapabilities),
      ...renderReferenceSummary(item.referenceSummary),
      ...renderEffectiveConfig(item.validation.effectiveConfig),
      ...renderManagedBoundaries(item.validation.managedBoundaries),
      ...renderSecretReferences(item.validation.secretReferences),
    ].join('\n')).join('\n'),
    ...renderWarnings('附加提示:', data.summary.warnings),
    ...renderCommandLimitations(data.summary.limitations),
  ].filter(Boolean).join('\n')
}

function renderList(data: ListCommandOutput): string {
  return [
    ...renderReadonlySummarySections('list', {
      platform: () => renderCurrentListPlatformStats(data.summary.platformStats),
      reference: () => renderReferenceStats(data.summary.referenceStats),
      executability: () => renderExecutabilityStats(data.summary.executabilityStats),
    }),
    data.profiles.map((item) => [
      `- ${item.profile.id} (${item.profile.platform})`,
      `  名称: ${item.profile.name}`,
      `  当前生效: ${item.current ? '是' : '否'}`,
      `  健康状态: ${item.healthStatus}`,
      `  风险等级: ${item.riskLevel}`,
      ...renderListPlatformSummary(item),
      ...renderScopeCapabilities(item.scopeCapabilities),
      ...renderScopeAvailability(item.scopeAvailability),
      ...renderReferenceSummary(item.referenceSummary),
    ].join('\n')).join('\n'),
    ...renderWarnings('附加提示:', data.summary.warnings),
    ...renderCommandLimitations(data.summary.limitations),
  ].filter(Boolean).join('\n')
}

function renderSchema(data: SchemaCommandOutput): string {
  const catalogSummary = data.catalogSummary
  const catalogSummaryLines = catalogSummary
    ? [
        'Catalog Summary:',
        `  - consumerProfiles=${catalogSummary.counts.consumerProfiles}, actions=${catalogSummary.counts.actions}, recommendedActions=${catalogSummary.counts.recommendedActions}`,
        '  - 推荐画像入口:',
        ...catalogSummary.consumerProfiles.map((profile) => {
          const details = [
            `entry=${profile.bestEntryAction}`,
            `recommended=${profile.recommendedEntryMode ?? 'full-consumer-profile'}`,
            profile.starterTemplateId ? `starterTemplate=${profile.starterTemplateId}` : null,
            profile.defaultConsumerActionId ? `defaultAction=${profile.defaultConsumerActionId}` : null,
            profile.defaultCommandExample ? `command=${profile.defaultCommandExample}` : null,
            `next=api-switcher schema --json --consumer-profile ${profile.id}`,
          ].filter(Boolean).join(', ')

          return `    - ${profile.id}: ${details}`
        }),
      ]
    : []

  return [
    `Schema Version: ${data.schemaVersion}`,
    ...(data.schemaId ? [`Schema ID: ${data.schemaId}`] : []),
    ...catalogSummaryLines,
  ].join('\n')
}

function renderImportApplyPlatformSummary(data: ImportApplyCommandOutput): string[] {
  return renderPlatformSummary(data.platformSummary)
}

function renderCurrentPlatformSummary(item: CurrentProfileResult): string[] {
  if (item.platformSummary) {
    return renderPlatformSummary(item.platformSummary, '  ')
  }

  if (item.platform === 'claude' && item.currentScope === 'local') {
    return [
      '  平台摘要:',
      '  - Claude 当前检测到 local scope 生效。',
      '  - local 高于 project 与 user，同名字段会以 local 为准。',
    ]
  }

  if (item.platform === 'codex') {
    return [
      '  平台摘要:',
      '  - Codex 当前由 config.toml 与 auth.json 共同组成有效配置。',
      '  - current 检测不能把单个文件视为完整状态。',
    ]
  }

  return []
}

function renderListPlatformSummary(item: ListCommandOutput['profiles'][number]): string[] {
  if (item.platformSummary) {
    return renderPlatformSummary(item.platformSummary, '  ')
  }

  if (item.profile.platform === 'claude') {
    return [
      '  平台摘要:',
      '  - Claude 支持 user < project < local 三层 precedence。',
      '  - 如果存在 local，同名字段最终以 local 为准。',
    ]
  }

  if (item.profile.platform === 'codex') {
    return [
      '  平台摘要:',
      '  - Codex 当前由 config.toml 与 auth.json 共同组成有效配置。',
      '  - list 仅展示 profile 级状态，不表示单文件可独立切换。',
    ]
  }

  return []
}

function inferScopeFromTargetFiles(targetFiles?: Array<{ scope?: string }>): string | undefined {
  const scopedTarget = targetFiles?.find((item) => typeof item.scope === 'string' && item.scope.length > 0)
  return scopedTarget?.scope
}

function inferPlatformFromPaths(paths: string[]): 'gemini' | 'codex' | 'claude' | undefined {
  if (paths.some((item) => item.includes('/.gemini/') || item.includes('\\.gemini\\'))) {
    return 'gemini'
  }

  if (paths.some((item) => item.includes('/.codex/') || item.includes('\\.codex\\'))) {
    return 'codex'
  }

  if (paths.some((item) => item.includes('/.claude/') || item.includes('\\.claude\\'))) {
    return 'claude'
  }

  return undefined
}

function renderUsePlatformSummary(data: UseCommandOutput): string[] {
  if (data.platformSummary) {
    return renderPlatformSummary(data.platformSummary)
  }

  const platform = data.profile.platform
  const targetScope = inferScopeFromTargetFiles(data.preview.targetFiles)

  if (platform === 'gemini' && targetScope === 'project') {
    return [
      '平台摘要:',
      '  - Gemini project scope 会覆盖 user 的同名字段。',
      '  - 当前快照要求 rollback 时必须匹配 project scope。',
    ]
  }

  if (platform === 'codex') {
    return [
      '平台摘要:',
      '  - Codex 当前按双文件事务写入 config.toml 与 auth.json。',
      '  - config.toml 承载配置字段，auth.json 承载认证字段。',
    ]
  }

  if (platform === 'claude' && targetScope === 'local') {
    return [
      '平台摘要:',
      '  - Claude 当前写入目标是 local scope。',
      '  - local 是当前项目最高优先级层，会直接成为最终生效值。',
    ]
  }

  if (platform === 'claude' && targetScope) {
    return [
      '平台摘要:',
      `  - Claude 当前写入目标是 ${targetScope} scope。`,
    ]
  }

  return []
}

function renderRollbackPlatformSummary(data: RollbackCommandOutput): string[] {
  if (data.platformSummary) {
    return renderPlatformSummary(data.platformSummary)
  }

  const paths = [
    ...data.restoredFiles,
    ...(data.rollback?.managedBoundaries ?? []).flatMap((item) => [
      ...(item.target ? [item.target] : []),
      ...((Array.isArray(item.targets) ? item.targets : [])),
    ]),
  ]
  const platform = inferPlatformFromPaths(paths)
  const targetScope = data.scopePolicy?.resolvedScope ?? data.scopePolicy?.requestedScope

  if (platform === 'gemini' && targetScope === 'project') {
    return [
      '平台摘要:',
      '  - 当前正在恢复 Gemini project scope 快照。',
      '  - project scope 快照只能按同一 scope 恢复。',
    ]
  }

  if (platform === 'codex') {
    return [
      '平台摘要:',
      '  - Codex 当前按双文件事务恢复 config.toml 与 auth.json。',
      '  - config.toml 恢复配置字段，auth.json 恢复认证字段。',
    ]
  }

  if (platform === 'claude' && targetScope === 'local') {
    return [
      '平台摘要:',
      '  - Claude 当前恢复的是 local scope 快照。',
      '  - local 恢复后会重新成为当前项目最高优先级层。',
    ]
  }

  if (platform === 'claude' && targetScope) {
    return [
      '平台摘要:',
      `  - Claude 当前恢复的是 ${targetScope} scope 快照。`,
    ]
  }

  return []
}

function extractFailurePaths(details: unknown): string[] {
  if (!isRecord(details)) {
    return []
  }

  const targetFiles = Array.isArray(details.targetFiles)
    ? details.targetFiles.flatMap((item) => {
      if (!isRecord(item) || typeof item.path !== 'string') {
        return []
      }
      return [item.path]
    })
    : []

  const managedBoundaries = Array.isArray(details.managedBoundaries)
    ? details.managedBoundaries.flatMap((item) => {
      if (!isRecord(item)) {
        return []
      }
      return [
        ...(typeof item.target === 'string' ? [item.target] : []),
        ...(Array.isArray(item.targets) ? item.targets.filter((value): value is string => typeof value === 'string') : []),
      ]
    })
    : []

  const scopeAvailability = Array.isArray(details.scopeAvailability)
    ? details.scopeAvailability.flatMap((item) => {
      if (!isRecord(item) || typeof item.path !== 'string') {
        return []
      }
      return [item.path]
    })
    : []

  return [...targetFiles, ...managedBoundaries, ...scopeAvailability]
}

function renderFailurePlatformSummary(result: CommandResult): string[] {
  const details = result.error?.details
  const scopePolicy = parseConfirmationRequiredDetails(details)?.scopePolicy ?? parseScopePolicyDetails(details)?.scopePolicy
  const targetScope = scopePolicy?.resolvedScope ?? scopePolicy?.requestedScope
  const platform = inferPlatformFromPaths(extractFailurePaths(details))

  if (result.action === 'use' && platform === 'gemini' && targetScope === 'project') {
    return [
      '平台摘要:',
      '  - Gemini project scope 会覆盖 user 的同名字段。',
      '  - 当前操作要求先确认高风险 project scope 写入。',
    ]
  }

  if (result.action === 'use' && platform === 'codex') {
    return [
      '平台摘要:',
      '  - Codex 当前会成组写入 config.toml 与 auth.json。',
      '  - 任一文件失败都不应被理解为单文件独立成功。',
    ]
  }

  if (result.action === 'rollback' && platform === 'claude' && targetScope === 'local') {
    return [
      '平台摘要:',
      '  - Claude 当前恢复目标是 local scope。',
      '  - local 恢复失败后，当前项目不会获得这层预期覆盖。',
    ]
  }

  if (result.action === 'import-apply' && platform === 'gemini' && targetScope === 'project') {
    return [
      '平台摘要:',
      '  - Gemini project scope 会覆盖 user 的同名字段。',
      '  - 当前导入应用要求先确认高风险 project scope 写入。',
    ]
  }

  if (result.action === 'import-apply' && platform === 'codex') {
    return [
      '平台摘要:',
      '  - Codex 当前会成组写入 config.toml 与 auth.json。',
      '  - 任一文件失败都不应被理解为单文件独立成功。',
    ]
  }

  if (result.action === 'import-apply' && platform === 'claude' && targetScope === 'local') {
    return [
      '平台摘要:',
      '  - Claude 当前写入目标是 local scope。',
      '  - local scope 不可用时，本次导入不会获得这层预期覆盖。',
    ]
  }

  return []
}

function renderImportApply(data: ImportApplyCommandOutput): string {
  return [
    `导入文件: ${data.sourceFile}`,
    ...renderSinglePlatformStats(data.summary.platformStats),
    ...renderReferenceStats(data.summary.referenceStats),
    ...renderExecutabilityStats(data.summary.executabilityStats),
    `导入配置: ${data.importedProfile.id} (${data.importedProfile.platform})`,
    ...(data.appliedScope ? [`应用作用域: ${data.appliedScope} scope`] : []),
    ...(data.dryRun ? ['Dry run: 是'] : []),
    `备份ID: ${data.backupId ?? '未创建'}`,
    ...renderFailureScopePolicy(data.scopePolicy),
    ...renderScopeCapabilities(data.scopeCapabilities),
    ...renderScopeAvailability(data.scopeAvailability),
    `  校验结果: ${data.validation.ok ? '通过' : '失败'}`,
    ...renderValidationIssues('错误', data.validation.errors),
    ...renderValidationIssues('校验警告', data.validation.warnings),
    ...renderValidationIssues('校验限制', data.validation.limitations),
    `  风险等级: ${data.risk.riskLevel}`,
    `  计划备份: ${data.preview.backupPlanned ? '是' : '否'}`,
    `  无变更: ${data.noChanges ? '是' : '否'}`,
    ...renderTargetFiles(data.preview.targetFiles),
    ...renderFieldCollection('生效字段', data.preview.effectiveFields),
    ...renderFieldCollection('仅存档字段', data.preview.storedOnlyFields),
    ...renderEffectiveConfig(data.preview.effectiveConfig),
    ...renderManagedBoundaries(data.preview.managedBoundaries),
    ...renderSecretReferences(data.preview.secretReferences),
    ...renderDiffSummary(data.preview.diffSummary),
    ...(data.changedFiles.length > 0 ? ['  已变更文件:', ...data.changedFiles.map((item) => `  - ${item}`)] : ['  已变更文件: 无']),
    ...renderImportApplyPlatformSummary(data),
    ...renderValidationIssues('预览警告', data.preview.warnings),
    ...renderValidationIssues('预览限制', data.preview.limitations),
    ...renderWarnings('附加提示:', data.summary.warnings),
    ...renderCommandLimitations(data.summary.limitations),
  ].join('\n')
}


function renderFailure(result: CommandResult): string {
  const confirmationDetails = parseConfirmationRequiredDetails(result.error?.details)
  const scopePolicyDetails = parseScopePolicyDetails(result.error?.details)
  const scopeCapabilityDetails = parseScopeCapabilityDetails(result.error?.details)
  const scopeAvailabilityDetails = parseScopeAvailabilityDetails(result.error?.details)
  const importApplyNotReadyDetails = parseImportApplyNotReadyDetails(result.error?.details)
  const importApplyRedactedSecretDetails = parseImportApplyRedactedSecretDetails(result.error?.details)
  const referenceGovernanceDetails = isRecord(result.error?.details)
    ? parseReferenceGovernanceFailureDetails(result.error.details.referenceGovernance)
    : undefined

  if (result.action === 'import-apply' && importApplyNotReadyDetails) {
    return [
      result.error?.message ?? '未知错误',
      `导入文件: ${importApplyNotReadyDetails.sourceFile}`,
      `导入配置: ${importApplyNotReadyDetails.profileId}`,
      ...renderImportObservation('当前本地观察', importApplyNotReadyDetails.localObservation),
      ...renderImportObservation('导出时观察', importApplyNotReadyDetails.exportedObservation),
      ...renderImportPreviewDecision(importApplyNotReadyDetails.previewDecision),
      ...renderImportFidelity(importApplyNotReadyDetails.fidelity),
      ...renderWarnings('附加提示:', result.warnings),
      ...renderCommandLimitations(result.limitations),
    ].join('\n')
  }

  if (result.action === 'import-apply' && importApplyRedactedSecretDetails) {
    return [
      result.error?.message ?? '未知错误',
      `导入文件: ${importApplyRedactedSecretDetails.sourceFile}`,
      `导入配置: ${importApplyRedactedSecretDetails.profileId}`,
      '阻断原因:',
      '  - 导入源中的 inline secret 只有 redacted placeholder，没有可执行明文。',
      '  - 当前 import apply 不会从 redacted export 反推真实 secret。',
      'redacted 字段:',
      ...importApplyRedactedSecretDetails.redactedInlineSecretFields.map((field) => `  - ${field}`),
      ...renderWarnings('附加提示:', result.warnings),
      ...renderCommandLimitations(result.limitations),
    ].join('\n')
  }

  const isImportScopeUnavailable = result.action === 'import-apply' && result.error?.code === 'IMPORT_SCOPE_UNAVAILABLE'

  return [
    result.error?.message ?? '未知错误',
    ...(confirmationDetails ? renderRiskSummary(confirmationDetails.risk) : []),
    ...renderFailurePlatformSummary(result),
    ...renderReferenceGovernanceOverview(
      referenceGovernanceDetails
      ?? (confirmationDetails as ParsedConfirmationRequiredDetails | undefined)?.referenceGovernance,
    ),
    ...renderReferenceGovernanceDetails(
      referenceGovernanceDetails
      ?? (confirmationDetails as ParsedConfirmationRequiredDetails | undefined)?.referenceGovernance,
    ),
    ...renderFailureScopePolicy(confirmationDetails?.scopePolicy ?? scopePolicyDetails?.scopePolicy),
    ...renderScopeCapabilities(
      confirmationDetails?.scopeCapabilities ?? scopeCapabilityDetails?.scopeCapabilities,
      '  ',
      !isImportScopeUnavailable,
    ),
    ...renderScopeAvailability(confirmationDetails?.scopeAvailability ?? scopeAvailabilityDetails?.scopeAvailability),
    ...renderWarnings('附加提示:', result.warnings),
    ...renderCommandLimitations(result.limitations),
  ].join('\n')
}


export function renderText(result: CommandResult): string {
  const status = result.ok ? '成功' : '失败'

  if (result.action === 'current' && result.data) {
    return `[${result.action}] ${status}\n${renderCurrent(result.data as CurrentCommandOutput)}`
  }

  if (result.action === 'preview' && result.data) {
    return `[${result.action}] ${status}\n${renderPreview(result.data as PreviewCommandOutput)}`
  }

  if (result.action === 'use' && result.data) {
    return `[${result.action}] ${status}\n${renderUse(result.data as UseCommandOutput)}`
  }

  if (result.action === 'rollback' && result.data) {
    return `[${result.action}] ${status}\n${renderRollback(result.data as RollbackCommandOutput)}`
  }

  if (result.action === 'validate' && result.data) {
    return `[${result.action}] ${status}\n${renderValidate(result.data as ValidateCommandOutput)}`
  }

  if (result.action === 'export' && result.data) {
    return `[${result.action}] ${status}\n${renderExport(result.data as ExportCommandOutput)}`
  }

  if (result.action === 'import' && result.data) {
    return `[${result.action}] ${status}\n${renderImportPreview(result.data as ImportPreviewCommandOutput)}`
  }

  if (result.action === 'import-apply' && result.data) {
    return `[${result.action}] ${status}\n${renderImportApply(result.data as ImportApplyCommandOutput)}`
  }

  if (result.action === 'add' && result.data) {
    return `[${result.action}] ${status}\n${renderAdd(result.data as AddCommandOutput)}`
  }

  if (result.action === 'list' && result.data) {
    return `[${result.action}] ${status}\n${renderList(result.data as ListCommandOutput)}`
  }

  if (result.action === 'schema' && result.data) {
    return `[${result.action}] ${status}\n${renderSchema(result.data as SchemaCommandOutput)}`
  }

  if (!result.ok) {
    return `[${result.action}] 失败\n${renderFailure(result)}`
  }

  const summary = result.data ? JSON.stringify(result.data, null, 2) : '执行成功'
  return `[${result.action}] ${status}\n${summary}`
}
