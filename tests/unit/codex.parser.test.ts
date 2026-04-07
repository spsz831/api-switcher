import { describe, expect, it } from 'vitest'
import { parseCodexConfig, stringifyCodexConfig } from '../../src/adapters/codex/codex.parser'

describe('codex parser', () => {
  it('parseCodexConfig 会解析字符串、布尔和数字', () => {
    const config = parseCodexConfig('base_url = "https://example.com/v1"\ncustom_flag = true\nretry = 3\n')

    expect(config).toEqual({
      base_url: 'https://example.com/v1',
      custom_flag: true,
      retry: 3,
    })
  })

  it('stringifyCodexConfig 会保留注释空行缩进和行尾注释', () => {
    const originalContent = '# header\ndefault_provider = "openai"\n\n  base_url   =   "https://old.example.com/v1"   # managed endpoint\ncustom_flag=true\n'

    const rendered = stringifyCodexConfig({
      default_provider: 'openai',
      base_url: 'https://gateway.example.com/openai/v1',
      custom_flag: true,
    }, originalContent)

    expect(rendered).toBe(
      '# header\ndefault_provider = "openai"\n\n  base_url   =   "https://gateway.example.com/openai/v1"   # managed endpoint\ncustom_flag=true\n',
    )
  })

  it('stringifyCodexConfig 会在缺失 managed key 时追加到末尾', () => {
    const originalContent = '# codex config\n# keep this block\ndefault_provider = "openai"\n\ncustom_flag = true\n'

    const rendered = stringifyCodexConfig({
      default_provider: 'openai',
      custom_flag: true,
      base_url: 'https://gateway.example.com/openai/v1',
    }, originalContent)

    expect(rendered).toBe(
      '# codex config\n# keep this block\ndefault_provider = "openai"\n\ncustom_flag = true\n\nbase_url = "https://gateway.example.com/openai/v1"\n',
    )
  })

  it('stringifyCodexConfig 不会为已带结尾换行的文件额外增加空行', () => {
    const rendered = stringifyCodexConfig({
      default_provider: 'openai',
      base_url: 'https://gateway.example.com/openai/v1',
    }, 'default_provider = "openai"\nbase_url = "https://old.example.com/v1"\n')

    expect(rendered).toBe('default_provider = "openai"\nbase_url = "https://gateway.example.com/openai/v1"\n')
  })

  it('stringifyCodexConfig 在空内容时会生成标准赋值格式', () => {
    const rendered = stringifyCodexConfig({
      base_url: 'https://gateway.example.com/openai/v1',
      custom_flag: true,
    }, null)

    expect(rendered).toBe('base_url = "https://gateway.example.com/openai/v1"\ncustom_flag = true\n')
  })
})
