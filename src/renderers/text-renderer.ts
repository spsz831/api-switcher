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
  CurrentCommandOutput,
  ExportCommandOutput,
  ListCommandOutput,
  PreviewCommandOutput,
  RollbackCommandOutput,
  UseCommandOutput,
  ValidateCommandOutput,
} from '../types/command'

function renderLimitations(limitations?: string[]): string[] {
  return limitations && limitations.length > 0 ? limitations.map((item) => `  - ${item}`) : []
}

function renderWarnings(title: string, warnings?: string[]): string[] {
  return warnings && warnings.length > 0 ? [title, ...warnings.map((item) => `  - ${item}`)] : []
}

function renderCommandLimitations(limitations?: string[]): string[] {
  return limitations && limitations.length > 0 ? ['限制说明:', ...limitations.map((item) => `  - ${item}`)] : []
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
    ...item.targetFiles.map((target) => `  目标文件: ${target.path}`),
    ...renderEffectiveConfig(item.effectiveConfig),
    ...renderManagedBoundaries(item.managedBoundaries),
    ...renderSecretReferences(item.secretReferences),
    ...renderValidationIssues('警告', item.warnings ?? []),
    ...renderValidationIssues('限制', item.limitations ?? []),
  ]
}

function renderCurrent(data: CurrentCommandOutput, warnings?: string[], limitations?: string[]): string {
  const summaryWarnings = data.summary.warnings.length > 0 ? data.summary.warnings : warnings
  const summaryLimitations = data.summary.limitations.length > 0 ? data.summary.limitations : limitations

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

  if (data.detections.length > 0) {
    lines.push('检测结果:')
    for (const detection of data.detections) {
      lines.push(...renderDetection(detection))
    }
  }

  lines.push(...renderWarnings('附加提示:', summaryWarnings))
  lines.push(...renderCommandLimitations(summaryLimitations))

  return lines.join('\n')
}


function renderPreview(data: PreviewCommandOutput, warnings?: string[], limitations?: string[]): string {
  const riskWarnings = data.risk.reasons.length > 0 ? data.risk.reasons : warnings
  const riskLimitations = data.risk.limitations.length > 0 ? data.risk.limitations : limitations

  const lines = [
    `- 配置: ${data.profile.id} (${data.profile.platform})`,
    `  校验结果: ${data.validation.ok ? '通过' : '失败'}`,
    ...renderValidationIssues('错误', data.validation.errors),
    ...renderValidationIssues('校验警告', data.validation.warnings),
    ...renderValidationIssues('限制', data.validation.limitations),
    `  风险等级: ${data.risk.riskLevel}`,
    `  需要确认: ${data.preview.requiresConfirmation ? '是' : '否'}`,
    `  计划备份: ${data.preview.backupPlanned ? '是' : '否'}`,
    `  无变更: ${data.preview.noChanges ? '是' : '否'}`,
    ...renderTargetFiles(data.preview.targetFiles),
    ...renderEffectiveConfig(data.preview.effectiveConfig),
    ...renderManagedBoundaries(data.preview.managedBoundaries),
    ...renderSecretReferences(data.preview.secretReferences),
    ...renderDiffSummary(data.preview.diffSummary),
    ...renderValidationIssues('警告', data.preview.warnings),
    ...renderValidationIssues('限制', data.preview.limitations),
    ...renderWarnings('附加提示:', riskWarnings),
    ...renderCommandLimitations(riskLimitations),
  ]

  return lines.join('\n')
}


function renderUse(data: UseCommandOutput, warnings?: string[], limitations?: string[]): string {
  const riskWarnings = data.risk.reasons.length > 0 ? data.risk.reasons : warnings
  const riskLimitations = data.risk.limitations.length > 0 ? data.risk.limitations : limitations

  const lines = [
    `- 配置: ${data.profile.id} (${data.profile.platform})`,
    `  备份ID: ${data.backupId ?? '未创建'}`,
    `  无变更: ${data.noChanges ? '是' : '否'}`,
    `  风险等级: ${data.risk.riskLevel}`,
    `  计划备份: ${data.preview.backupPlanned ? '是' : '否'}`,
    ...(data.changedFiles.length > 0 ? ['  已变更文件:', ...data.changedFiles.map((item) => `  - ${item}`)] : ['  已变更文件: 无']),
    ...renderEffectiveConfig(data.preview.effectiveConfig),
    ...renderManagedBoundaries(data.preview.managedBoundaries),
    ...renderSecretReferences(data.preview.secretReferences),
    ...renderDiffSummary(data.preview.diffSummary),
    ...renderValidationIssues('警告', data.preview.warnings),
    ...renderValidationIssues('限制', data.preview.limitations),
    ...renderWarnings('附加提示:', riskWarnings),
    ...renderCommandLimitations(riskLimitations),
  ]

  return lines.join('\n')
}

function renderAdd(data: AddCommandOutput, warnings?: string[], limitations?: string[]): string {
  const riskWarnings = data.risk.reasons.length > 0 ? data.risk.reasons : warnings
  const riskLimitations = data.risk.limitations.length > 0 ? data.risk.limitations : limitations

  return [
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
    ...renderTargetFiles(data.preview.targetFiles),
    ...renderEffectiveConfig(data.preview.effectiveConfig),
    ...renderManagedBoundaries(data.preview.managedBoundaries),
    ...renderSecretReferences(data.preview.secretReferences),
    ...renderDiffSummary(data.preview.diffSummary),
    ...renderValidationIssues('预览警告', data.preview.warnings),
    ...renderValidationIssues('预览限制', data.preview.limitations),
    ...renderWarnings('附加提示:', riskWarnings),
    ...renderCommandLimitations(riskLimitations),
  ].join('\n')
}

function renderRollback(data: RollbackCommandOutput, warnings?: string[], limitations?: string[]): string {
  const summaryWarnings = data.summary.warnings.length > 0 ? data.summary.warnings : warnings
  const summaryLimitations = data.summary.limitations.length > 0 ? data.summary.limitations : limitations

  return [
    `- 备份ID: ${data.backupId}`,
    ...(data.restoredFiles.length > 0 ? ['  已恢复文件:', ...data.restoredFiles.map((item) => `  - ${item}`)] : ['  已恢复文件: 无']),
    ...renderEffectiveConfig(data.rollback?.effectiveConfig),
    ...renderManagedBoundaries(data.rollback?.managedBoundaries),
    ...renderValidationIssues('回滚警告', data.rollback?.warnings ?? []),
    ...renderValidationIssues('回滚限制', data.rollback?.limitations ?? []),
    ...renderWarnings('附加提示:', summaryWarnings),
    ...renderCommandLimitations(summaryLimitations),
  ].join('\n')
}

function renderExport(data: ExportCommandOutput, limitations?: string[]): string {
  return [
    data.profiles.map((item) => [
      `- ${item.profile.id} (${item.profile.platform})`,
      `  名称: ${item.profile.name}`,
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
    ...renderCommandLimitations(limitations),
  ].filter(Boolean).join('\n')
}

function renderValidate(data: ValidateCommandOutput, limitations?: string[]): string {
  return [
    data.items.map((item) => [
      `- ${item.profileId} (${item.platform})`,
      `  校验结果: ${item.validation.ok ? '通过' : '失败'}`,
      ...item.validation.errors.map((error) => `  错误: ${error.message}`),
      ...item.validation.warnings.map((warning) => `  警告: ${warning.message}`),
      ...item.validation.limitations.map((issue) => `  限制: ${issue.message}`),
      ...renderEffectiveConfig(item.validation.effectiveConfig),
      ...renderManagedBoundaries(item.validation.managedBoundaries),
      ...renderSecretReferences(item.validation.secretReferences),
    ].join('\n')).join('\n'),
    ...renderCommandLimitations(limitations),
  ].filter(Boolean).join('\n')
}

function renderList(data: ListCommandOutput, warnings?: string[], limitations?: string[]): string {
  const summaryWarnings = data.summary.warnings.length > 0 ? data.summary.warnings : warnings
  const summaryLimitations = data.summary.limitations.length > 0 ? data.summary.limitations : limitations

  return [
    data.profiles.map((item) => [
      `- ${item.profile.id} (${item.profile.platform})`,
      `  名称: ${item.profile.name}`,
      `  当前生效: ${item.current ? '是' : '否'}`,
      `  健康状态: ${item.healthStatus}`,
      `  风险等级: ${item.riskLevel}`,
    ].join('\n')).join('\n'),
    ...renderWarnings('附加提示:', summaryWarnings),
    ...renderCommandLimitations(summaryLimitations),
  ].filter(Boolean).join('\n')
}


export function renderText(result: CommandResult): string {
  const status = result.ok ? '成功' : '失败'

  if (result.action === 'current' && result.data) {
    return `[${result.action}] ${status}\n${renderCurrent(result.data as CurrentCommandOutput, result.warnings, result.limitations)}`
  }

  if (result.action === 'preview' && result.data) {
    return `[${result.action}] ${status}\n${renderPreview(result.data as PreviewCommandOutput, result.warnings, result.limitations)}`
  }

  if (result.action === 'use' && result.data) {
    return `[${result.action}] ${status}\n${renderUse(result.data as UseCommandOutput, result.warnings, result.limitations)}`
  }

  if (result.action === 'rollback' && result.data) {
    return `[${result.action}] ${status}\n${renderRollback(result.data as RollbackCommandOutput, result.warnings, result.limitations)}`
  }

  if (result.action === 'validate' && result.data) {
    return `[${result.action}] ${status}\n${renderValidate(result.data as ValidateCommandOutput, result.limitations)}`
  }

  if (result.action === 'export' && result.data) {
    return `[${result.action}] ${status}\n${renderExport(result.data as ExportCommandOutput, result.limitations)}`
  }

  if (result.action === 'add' && result.data) {
    return `[${result.action}] ${status}\n${renderAdd(result.data as AddCommandOutput, result.warnings, result.limitations)}`
  }

  if (result.action === 'list' && result.data) {
    return `[${result.action}] ${status}\n${renderList(result.data as ListCommandOutput, result.warnings, result.limitations)}`
  }

  if (!result.ok) {
    return `[${result.action}] 失败\n${result.error?.message ?? '未知错误'}`
  }

  const summary = result.data ? JSON.stringify(result.data, null, 2) : '执行成功'
  return `[${result.action}] ${status}\n${summary}`
}
