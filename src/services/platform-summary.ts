import type { PlatformExplainableSummary } from '../types/capabilities'
import type { PlatformName } from '../types/platform'

export function buildPlatformSummary(
  platform: PlatformName,
  context: { currentScope?: string; composedFiles?: string[]; listMode?: boolean } = {},
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
      composedFiles: context.composedFiles ?? [],
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
