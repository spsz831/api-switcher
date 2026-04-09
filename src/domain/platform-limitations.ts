import type { ValidationIssue } from '../types/adapter'
import type { PlatformName } from '../types/platform'

const PLATFORM_LIMITATIONS: Partial<Record<PlatformName, string[]>> = {
  claude: [
    '当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。',
  ],
  codex: [
    '当前会同时托管 Codex 的 config.toml 与 auth.json。',
  ],
  gemini: [
    'GEMINI_API_KEY 仍需通过环境变量生效。',
    '当前仅稳定托管 settings.json 中已确认字段 enforcedAuthType。',
    '官方文档当前未确认自定义 base URL 的稳定写入契约。',
  ],
}

export function getPlatformLimitationIssues(platform: PlatformName): ValidationIssue[] {
  return (PLATFORM_LIMITATIONS[platform] ?? []).map((message, index) => ({
    code: `${platform}-limitation-${index + 1}`,
    level: 'limitation',
    message,
  }))
}
