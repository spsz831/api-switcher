import { describe, expect, it } from 'vitest'
import { getPlatformLimitationIssues } from '../../src/domain/platform-limitations'

describe('platform limitations', () => {
  it('将各平台 limitation 文本映射为稳定的 issue 结构', () => {
    expect(getPlatformLimitationIssues('claude')).toEqual([
      {
        code: 'claude-limitation-1',
        level: 'limitation',
        message: '当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。',
      },
    ])
    expect(getPlatformLimitationIssues('codex')).toEqual([
      {
        code: 'codex-limitation-1',
        level: 'limitation',
        message: '当前会同时托管 Codex 的 config.toml 与 auth.json。',
      },
    ])
    expect(getPlatformLimitationIssues('gemini')).toEqual([
      {
        code: 'gemini-limitation-1',
        level: 'limitation',
        message: 'GEMINI_API_KEY 仍需通过环境变量生效。',
      },
      {
        code: 'gemini-limitation-2',
        level: 'limitation',
        message: '当前仅稳定托管 settings.json 中已确认字段 enforcedAuthType。',
      },
      {
        code: 'gemini-limitation-3',
        level: 'limitation',
        message: '官方文档当前未确认自定义 base URL 的稳定写入契约。',
      },
    ])
  })
})
