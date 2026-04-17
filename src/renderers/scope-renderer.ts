import { DEFAULT_CAPABILITIES } from '../constants/platforms'
import type { CurrentProfileResult } from '../types/adapter'
import type { PreviewCommandOutput } from '../types/command'
import type { PlatformScopeExplainable } from '../types/capabilities'

function getScopeExplainable(platform: string): PlatformScopeExplainable | undefined {
  return DEFAULT_CAPABILITIES[platform as keyof typeof DEFAULT_CAPABILITIES]?.scopeExplainable
}

function joinPrecedence(scopes: string[]): string {
  return scopes.join(' < ')
}

export function renderCurrentScopeSummary(item: CurrentProfileResult): string[] {
  const config = getScopeExplainable(item.platform)
  if (!config) {
    return []
  }

  return [
    '  作用域说明:',
    `  - 检测范围: ${config.current.detectionScopes.join(', ')}`,
    `  - 生效优先级: ${joinPrecedence(config.current.precedence)}`,
    `  - 当前生效来源: ${item.currentScope ?? 'unknown'}`,
    `  - ${config.current.writeLabel}: ${config.current.writePolicy}`,
  ]
}

export function renderPreviewScopeSummary(data: PreviewCommandOutput): string[] {
  const config = getScopeExplainable(data.profile.platform)
  if (!config) {
    return []
  }

  const targetScope = data.preview.targetFiles.find((target) => target.scope)?.scope ?? 'user'
  const relationship = config.preview.relationships[targetScope] ?? config.preview.defaultRelationship
  const reminder = config.preview.reminders[targetScope] ?? config.preview.defaultReminder

  return [
    '  作用域说明:',
    `  - 生效优先级: ${joinPrecedence(config.preview.precedence)}`,
    `  - 预览视角: ${config.preview.perspective}`,
    `  - 本次写入目标: ${targetScope} scope`,
    `  - 覆盖关系: ${relationship}`,
    `  - 覆盖提醒: ${reminder}`,
  ]
}
