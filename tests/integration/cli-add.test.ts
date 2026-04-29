import fs from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProfilesStore } from '../../src/stores/profiles.store'
import type { Profile } from '../../src/types/profile'
import {
  parseJsonResult,
  runCli,
  setupCliIntegrationContext,
  teardownCliIntegrationContext,
  type CliIntegrationContext,
  type ScopeCapabilityContract,
} from './helpers/cli-testkit'

let context: CliIntegrationContext

beforeEach(async () => {
  context = await setupCliIntegrationContext()
})

afterEach(async () => {
  await teardownCliIntegrationContext()
})

describe('cli add integration', () => {
  it('add --help 明确说明明文模式与 reference-only 模式互斥，并提示解析阶段在后续命令', async () => {
    const result = await runCli(['add', '--help'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('--key <key>')
    expect(result.stdout).toContain('--secret-ref <ref>')
    expect(result.stdout).toContain('--auth-reference <reference>')
    expect(result.stdout).toContain('明文输入与 reference-only 输入互斥')
    expect(result.stdout).toContain('reference-only 模式下，--secret-ref 与 --auth-reference 在同时传入时必须保持一致')
    expect(result.stdout).toContain('add 只记录 reference 输入，不验证当前环境能否解析')
    expect(result.stdout).toContain('reference 的可执行性与治理判断请在 preview/use/import apply 阶段查看')
  })

  it('add 输出文本结果、validate/preview explainable 摘要并落盘 profile', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'new-prod', '--key', 'sk-new-123', '--url', 'https://new.example.com'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[add] 成功')
    expect(result.stdout).toContain('- 配置: claude-new-prod (claude)')
    expect(result.stdout).toContain('  名称: new-prod')
    expect(result.stdout).toContain('  校验结果: 通过')
    expect(result.stdout).toContain('  警告: ANTHROPIC_BASE_URL 可能缺少 /api 后缀。')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')
    expect(result.stdout).toContain('  计划备份: 是')
    expect(result.stdout).toContain('  无变更: 否')
    expect(result.stdout).toContain('  目标文件:')
    expect(result.stdout).toContain(`  - ${context.claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-o***00 (scope=project, source=stored, secret)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-n***23 (scope=project, source=scope-project, secret)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${context.claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(result.stdout).toContain('    保留字段: theme')
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - ANTHROPIC_AUTH_TOKEN: sk-n***23 (source=inline, present=yes)')
    expect(result.stdout).toContain('  变更摘要:')
    expect(result.stdout).toContain('  预览警告: 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('限制说明:')
  })

  it('add --json 支持 secret_ref/auth_reference 创建 profile，并明确后续解析与写入策略需在执行阶段确认', async () => {
    const result = await runCli([
      'add',
      '--platform', 'codex',
      '--name', 'ref-profile',
      '--secret-ref', 'vault://codex/prod',
      '--auth-reference', 'vault://codex/prod',
      '--url', 'https://gateway.example.com/openai/v1',
      '--json',
    ])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.profile.source).toEqual({
      secret_ref: 'vault://codex/prod',
      baseURL: 'https://gateway.example.com/openai/v1',
    })
    expect(payload.data?.profile.apply).toEqual({
      auth_reference: 'vault://codex/prod',
      base_url: 'https://gateway.example.com/openai/v1',
    })
    expect(payload.data?.summary.referenceStats).toMatchObject({
      profileCount: 1,
      referenceProfileCount: 1,
      inlineProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      hasReferenceProfiles: true,
      hasInlineProfiles: false,
      hasWriteUnsupportedProfiles: true,
    })
    expect(payload.data?.summary.executabilityStats).toMatchObject({
      profileCount: 1,
      inlineReadyProfileCount: 0,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: false,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: true,
      hasSourceRedactedProfiles: false,
    })
    expect(payload.data?.summary.limitations).toContain('当前已识别 secret_ref/auth_reference；真正的本地解析、治理判断与写入策略需要在 preview/use/import apply 阶段结合平台能力进一步确认。')
    expect(payload.limitations).toContain('当前已识别 secret_ref/auth_reference；真正的本地解析、治理判断与写入策略需要在 preview/use/import apply 阶段结合平台能力进一步确认。')
  })

  it('add 同时传入 --key 与 reference 参数时返回结构化参数错误', async () => {
    const result = await runCli([
      'add',
      '--platform', 'claude',
      '--name', 'conflict-profile',
      '--key', 'sk-conflict-123',
      '--secret-ref', 'vault://claude/prod',
      '--json',
    ])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.error?.code).toBe('ADD_INPUT_CONFLICT')
    expect(payload.error?.message).toBe('不能同时提供 --key 与 --secret-ref/--auth-reference。')
  })

  it('add reference-only 输入全为空白时返回结构化缺失输入错误', async () => {
    const result = await runCli([
      'add',
      '--platform', 'codex',
      '--name', 'blank-reference-input',
      '--secret-ref', '   ',
      '--auth-reference', ' ',
      '--json',
    ])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.error?.code).toBe('ADD_INPUT_REQUIRED')
    expect(payload.error?.message).toBe('必须提供 --key 或 --secret-ref/--auth-reference 其中之一。')
  })

  it('add reference-only 输入不一致时返回结构化冲突错误', async () => {
    const result = await runCli([
      'add',
      '--platform', 'claude',
      '--name', 'mismatched-reference-input',
      '--secret-ref', 'vault://claude/source',
      '--auth-reference', 'vault://claude/apply',
      '--json',
    ])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.error?.code).toBe('ADD_INPUT_CONFLICT')
    expect(payload.error?.message).toBe('reference-only 输入存在冲突；请确保 --secret-ref/--auth-reference 格式有效且在同时传入时保持一致。')
  })

  it('add 输出低风险摘要时显示无需确认', async () => {
    await fs.writeFile(context.claudeProjectSettingsPath, JSON.stringify({}, null, 2), 'utf8')

    const result = await runCli(['add', '--platform', 'claude', '--name', 'new-low-risk', '--key', 'sk-new-789', '--url', 'https://new.example.com/api'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  风险等级: low')
    expect(result.stdout).toContain('  需要确认: 否')
    expect(result.stdout).toContain('  计划备份: 是')
    expect(result.stdout).toContain('  无变更: 否')
  })

  it('add 无变更时摘要显示 noChanges', async () => {
    await fs.writeFile(
      context.claudeProjectSettingsPath,
      JSON.stringify({ theme: 'dark', ANTHROPIC_AUTH_TOKEN: 'sk-same-123', ANTHROPIC_BASE_URL: 'https://same.example.com/api' }, null, 2),
      'utf8',
    )

    const result = await runCli(['add', '--platform', 'claude', '--name', 'same-config', '--key', 'sk-same-123', '--url', 'https://same.example.com/api'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  无变更: 是')
    expect(result.stdout).toContain('  需要确认: 是')
  })

  it('add --json 低风险摘要返回无需确认的 preview', async () => {
    await fs.writeFile(context.claudeProjectSettingsPath, JSON.stringify({}, null, 2), 'utf8')

    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-low-risk', '--key', 'sk-json-low-123', '--url', 'https://new.example.com/api', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      scopeCapabilities?: ScopeCapabilityContract[]
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; warnings: Array<{ code: string; message: string }> }
      risk: { allowed: boolean; riskLevel: string; reasons: string[]; limitations: string[] }
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          profileId?: string
          warningCount: number
          limitationCount: number
          changedFileCount?: number
          backupCreated?: boolean
          noChanges?: boolean
        }>
        referenceStats?: {
          profileCount: number
          referenceProfileCount: number
          inlineProfileCount: number
          writeUnsupportedProfileCount: number
        }
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.validation.ok).toBe(true)
    expect(payload.data?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'local', use: true, rollback: true, writable: true }),
    ]))
    expect(payload.data?.validation.errors).toEqual([])
    expect(payload.data?.validation.warnings).toEqual([])
    expect(payload.data?.preview.riskLevel).toBe('low')
    expect(payload.data?.risk?.allowed).toBe(true)
    expect(payload.data?.risk?.riskLevel).toBe('low')
    expect(payload.data?.risk?.reasons).toEqual([])
    expect(payload.data?.risk?.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(payload.data?.summary).toEqual(expect.objectContaining({
      warnings: [],
      limitations: ['当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。'],
    }))
    expect(payload.data?.summary.platformStats).toEqual([
      expect.objectContaining({
        platform: 'claude',
        profileCount: 1,
        profileId: 'claude-json-low-risk',
        warningCount: 0,
        limitationCount: 1,
        changedFileCount: 1,
        backupCreated: true,
        noChanges: false,
      }),
    ])
    expect(payload.data?.preview.requiresConfirmation).toBe(false)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.warnings).toEqual([])
    expect(payload.warnings).toEqual([])
    expect(payload.limitations).toEqual(['当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。'])
  })

  it('add --json 在现有非托管字段下返回 medium 风险摘要', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-with-theme', '--key', 'sk-json-theme-123', '--url', 'https://new.example.com/api', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; warnings: Array<{ code: string; message: string }> }
      risk: { allowed: boolean; riskLevel: string; reasons: string[]; limitations: string[] }
      summary: { warnings: string[]; limitations: string[] }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.validation.warnings).toEqual([])
    expect(payload.data?.preview.riskLevel).toBe('medium')
    expect(payload.data?.risk?.riskLevel).toBe('medium')
    expect(payload.data?.risk?.allowed).toBe(false)
    expect(payload.data?.risk?.reasons).toContain('当前 Claude 配置存在非托管字段：theme')
    expect(payload.data?.summary?.warnings).toContain('当前 Claude 配置存在非托管字段：theme')
    expect(payload.data?.summary?.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.preview.warnings.some((item) => item.code === 'unmanaged-current-file')).toBe(true)
    expect(payload.warnings).toContain('当前 Claude 配置存在非托管字段：theme')
    expect(payload.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
  })

  it('add --json 对 Claude 传入非 /api url 时返回 validation warning', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-claude-warning', '--key', 'sk-new-123', '--url', 'https://new.example.com', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; diffSummary: Array<{ path: string }> }
      risk: { allowed: boolean; riskLevel: string; reasons: string[]; limitations: string[] }
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          profileId?: string
          warningCount: number
          limitationCount: number
          changedFileCount?: number
          backupCreated?: boolean
          noChanges?: boolean
        }>
        referenceStats?: {
          profileCount: number
          referenceProfileCount: number
          inlineProfileCount: number
          writeUnsupportedProfileCount: number
        }
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('add')
    expect(payload.data?.profile.id).toBe('claude-json-claude-warning')
    expect(payload.data?.validation.ok).toBe(true)
    expect(payload.data?.validation.errors).toEqual([])
    expect(payload.data?.validation.warnings.some((item) => item.code === 'url-path-warning')).toBe(true)
    expect(payload.data?.risk.allowed).toBe(false)
    expect(payload.data?.risk.riskLevel).toBe('medium')
    expect(payload.data?.risk.reasons).toContain('ANTHROPIC_BASE_URL 可能缺少 /api 后缀。')
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'claude',
        profileCount: 1,
        profileId: 'claude-json-claude-warning',
        limitationCount: 1,
        changedFileCount: 1,
        backupCreated: true,
        noChanges: false,
      }),
    ]))
    expect(payload.data?.summary.platformStats?.[0]?.warningCount).toBeGreaterThanOrEqual(1)
    expect(payload.data?.summary.referenceStats).toMatchObject({
      profileCount: 1,
      referenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      hasReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
    })
    expect(payload.data?.summary.executabilityStats).toMatchObject({
      profileCount: 1,
      inlineReadyProfileCount: 1,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: true,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: false,
      hasSourceRedactedProfiles: false,
    })
    expect(payload.data?.summary.warnings).toContain('ANTHROPIC_BASE_URL 可能缺少 /api 后缀。')
    expect(payload.data?.summary.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(payload.data?.preview.riskLevel).toBe('medium')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.diffSummary[0]?.path).toBe(context.claudeProjectSettingsPath)
    expect(payload.warnings).toContain('ANTHROPIC_BASE_URL 可能缺少 /api 后缀。')
    expect(payload.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
  })

  it('add --json 对 Claude 在空现有配置下返回低风险摘要', async () => {
    await fs.writeFile(context.claudeProjectSettingsPath, JSON.stringify({}, null, 2), 'utf8')

    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-claude', '--key', 'sk-new-123', '--url', 'https://new.example.com/api', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('add')
    expect(payload.data?.profile.id).toBe('claude-json-claude')
    expect(payload.data?.profile.platform).toBe('claude')
    expect(payload.data?.profile.source).toEqual({
      token: 'sk-n***23',
      baseURL: 'https://new.example.com/api',
    })
    expect(payload.data?.profile.apply).toEqual({
      ANTHROPIC_AUTH_TOKEN: 'sk-n***23',
      ANTHROPIC_BASE_URL: 'https://new.example.com/api',
    })
    expect(payload.data?.validation.ok).toBe(true)
    expect(payload.data?.validation.errors).toEqual([])
    expect(payload.data?.validation.warnings).toEqual([])
    expect(payload.data?.summary).toEqual(expect.objectContaining({
      warnings: [],
      limitations: ['当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。'],
    }))
    expect(payload.data?.summary.platformStats).toEqual([
      expect.objectContaining({
        platform: 'claude',
        profileCount: 1,
        profileId: 'claude-json-claude',
        warningCount: 0,
        limitationCount: 1,
        changedFileCount: 1,
        backupCreated: true,
        noChanges: false,
      }),
    ])
    expect(payload.data?.preview.riskLevel).toBe('low')
    expect(payload.data?.preview.requiresConfirmation).toBe(false)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.diffSummary[0]?.path).toBe(context.claudeProjectSettingsPath)
    expect(payload.warnings).toEqual([])
    expect(payload.limitations).toEqual(['当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。'])
  })

  it('add --json 对 Claude 返回 profile 级 validate/preview 摘要', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-claude-legacy', '--key', 'sk-new-123', '--url', 'https://new.example.com', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('add')
    expect(payload.data?.profile.id).toBe('claude-json-claude-legacy')
    expect(payload.data?.profile.platform).toBe('claude')
    expect(payload.data?.profile.source).toEqual({
      token: 'sk-n***23',
      baseURL: 'https://new.example.com',
    })
    expect(payload.data?.profile.apply).toEqual({
      ANTHROPIC_AUTH_TOKEN: 'sk-n***23',
      ANTHROPIC_BASE_URL: 'https://new.example.com',
    })
    expect(payload.data?.validation.ok).toBe(true)
    expect(payload.data?.validation.errors).toEqual([])
    expect(payload.data?.validation.warnings.some((item: any) => item.code === 'url-path-warning')).toBe(true)
    expect(payload.data?.risk.allowed).toBe(false)
    expect(payload.data?.risk.riskLevel).toBe('medium')
    expect(payload.data?.risk.reasons).toContain('ANTHROPIC_BASE_URL 可能缺少 /api 后缀。')
    expect(payload.data?.summary.warnings).toContain('ANTHROPIC_BASE_URL 可能缺少 /api 后缀。')
    expect(payload.data?.summary.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(payload.data?.preview.riskLevel).toBe('medium')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.diffSummary[0]?.path).toBe(context.claudeProjectSettingsPath)
    expect(payload.warnings).toContain('ANTHROPIC_BASE_URL 可能缺少 /api 后缀。')
    expect(payload.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
  })

  it('add --json 复用当前配置时返回 noChanges 摘要', async () => {
    await fs.writeFile(
      context.claudeProjectSettingsPath,
      JSON.stringify({ ANTHROPIC_AUTH_TOKEN: 'sk-nochange-123', ANTHROPIC_BASE_URL: 'https://same.example.com/api' }, null, 2),
      'utf8',
    )

    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-nochange', '--key', 'sk-nochange-123', '--url', 'https://same.example.com/api', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.preview.riskLevel).toBe('low')
    expect(payload.data?.preview.requiresConfirmation).toBe(false)
    expect(payload.data?.preview.backupPlanned).toBe(false)
    expect(payload.data?.preview.noChanges).toBe(true)
    expect(payload.data?.summary.warnings).toEqual([])
    expect(payload.data?.summary.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(payload.warnings).toEqual([])
    expect(payload.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
  })

  it('add 高风险需要确认摘要不会阻断新增 profile', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'needs-confirmation', '--key', 'gm-needs-confirmation-123'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[add] 成功')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')

    const profiles = await new ProfilesStore().list()
    expect(profiles.some((item) => item.id === 'gemini-needs-confirmation')).toBe(true)
  })

  it('add 对空白 key 输入直接返回缺失输入错误', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'invalid-key', '--key', '', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.error?.code).toBe('ADD_INPUT_REQUIRED')
    expect(payload.error?.message).toBe('必须提供 --key 或 --secret-ref/--auth-reference 其中之一。')
  })

  it('add 先输出摘要再持久化，因此重复 ID 不会被预览阶段拦截', async () => {
    const first = await runCli(['add', '--platform', 'claude', '--name', 'preview-first', '--key', 'sk-preview-first-123', '--url', 'https://first.example.com/api'])
    expect(first.exitCode).toBe(0)

    const second = await runCli(['add', '--platform', 'claude', '--name', 'preview-first', '--key', 'sk-preview-first-456', '--url', 'https://second.example.com/api'])

    expect(second.stderr).toBe('')
    expect(second.exitCode).toBe(1)
    expect(second.stdout).toContain('[add] 失败')
    expect(second.stdout).toContain('配置 ID 已存在：claude-preview-first')
  })

  it('add 支持 codex 的 validate/preview 摘要', async () => {
    const result = await runCli(['add', '--platform', 'codex', '--name', 'codex-summary', '--key', 'sk-codex-summary-123', '--url', 'https://gateway.example.com/openai'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[add] 成功')
    expect(result.stdout).toContain('- 配置: codex-codex-summary (codex)')
    expect(result.stdout).toContain('  警告: base_url 可能缺少 /v1 或 /openai/v1 后缀。')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')
  })

  it('add 的摘要会根据当前文件内容给出非托管字段提示', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'with-unmanaged', '--key', 'sk-unmanaged-123', '--url', 'https://with-unmanaged.example.com/api'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  预览警告: 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('附加提示:')
  })

  it('add 的摘要在 JSON 输出中保留 preview warnings 细节', async () => {
    const result = await runCli(['add', '--platform', 'codex', '--name', 'json-preview-warnings', '--key', 'sk-codex-preview-123', '--url', 'https://gateway.example.com/openai', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.preview.warnings.some((item: any) => item.code === 'multi-file-overwrite')).toBe(true)
    expect(payload.data?.preview.warnings.some((item: any) => item.code === 'unmanaged-current-file')).toBe(true)
    expect(payload.data?.summary.warnings?.length).toBeGreaterThan(0)
    expect(payload.warnings?.length).toBeGreaterThan(0)
  })

  it('add 成功后会把 profile 写入后续 list 可见的数据源', async () => {
    const addResult = await runCli(['add', '--platform', 'claude', '--name', 'listed-after-add', '--key', 'sk-listed-after-add-123', '--url', 'https://listed.example.com/api'])
    expect(addResult.exitCode).toBe(0)

    const listResult = await runCli(['list', '--platform', 'claude'])

    expect(listResult.stderr).toBe('')
    expect(listResult.exitCode).toBe(0)
    expect(listResult.stdout).toContain('- claude-listed-after-add (claude)')
  })

  it('add 的风险提示来源于 preview/validate 聚合结果', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'risk-reasons', '--key', 'gm-risk-reasons-123'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
  })

  it('add 文本输出会展示 preview targetFiles', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'target-files', '--key', 'gm-target-files-123'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  目标文件:')
    expect(result.stdout).toContain(`  - ${context.geminiSettingsPath}`)
  })

  it('add JSON 输出会展示 preview diffSummary path', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'diff-path', '--key', 'gm-diff-path-123', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.preview.diffSummary[0]?.path).toBe(context.geminiSettingsPath)
  })

  it('add JSON 输出会保留 validation warnings', async () => {
    const result = await runCli(['add', '--platform', 'codex', '--name', 'json-validation-warning', '--key', 'sk-codex-validation-warning-123', '--url', 'https://gateway.example.com/openai', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.validation.warnings.some((item: any) => item.code === 'url-path-warning')).toBe(true)
    expect(payload.data?.risk.allowed).toBe(false)
    expect(payload.data?.risk.riskLevel).toBe('medium')
    expect(payload.data?.risk.reasons).toContain('base_url 可能缺少 /v1 或 /openai/v1 后缀。')
    expect(payload.data?.preview.riskLevel).toBe('medium')
  })

  it('add JSON 输出会保留 preview 的 backupPlanned=false 情况', async () => {
    await fs.writeFile(
      context.geminiSettingsPath,
      JSON.stringify({ enforcedAuthType: 'gemini-api-key' }, null, 2),
      'utf8',
    )

    const result = await runCli(['add', '--platform', 'gemini', '--name', 'gemini-no-change', '--key', 'gm-gemini-no-change-123', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.preview.backupPlanned).toBe(false)
    expect(payload.data?.preview.noChanges).toBe(true)
    expect(payload.data?.summary.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(payload.data?.summary.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('add 的文本摘要会展示 preview 生成的风险状态', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'text-risk', '--key', 'gm-text-risk-123'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')
  })

  it('add 的文本输出会把空白 key 视为缺失输入错误', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'text-validation-error', '--key', ''])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[add] 失败')
    expect(result.stdout).toContain('必须提供 --key 或 --secret-ref/--auth-reference 其中之一。')
  })

  it('add --json 为 codex 构造匹配的 source/apply 字段', async () => {
    const result = await runCli(['add', '--platform', 'codex', '--name', 'json-codex', '--key', 'sk-codex-new-123', '--url', 'https://gateway.example.com/openai/v1', '--json'])
    const payload = parseJsonResult<{ profile: Profile }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('add')
    expect(payload.data?.profile.id).toBe('codex-json-codex')
    expect(payload.data?.profile.platform).toBe('codex')
    expect(payload.data?.profile.source).toEqual({
      apiKey: 'sk-c***23',
      baseURL: 'https://gateway.example.com/openai/v1',
    })
    expect(payload.data?.profile.apply).toEqual({
      OPENAI_API_KEY: 'sk-c***23',
      base_url: 'https://gateway.example.com/openai/v1',
    })
  })

  it('add --json 为 gemini 构造匹配字段并返回附加提示', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'json-prod', '--key', 'gm-new-123', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('add')
    expect(payload.data?.profile.id).toBe('gemini-json-prod')
    expect(payload.data?.profile.platform).toBe('gemini')
    expect(payload.data?.profile.source).toEqual({
      apiKey: 'gm-n***23',
      authType: 'gemini-api-key',
    })
    expect(payload.data?.profile.apply).toEqual({
      GEMINI_API_KEY: 'gm-n***23',
      enforcedAuthType: 'gemini-api-key',
    })
    expect(payload.data?.validation.ok).toBe(true)
    expect(payload.data?.risk.allowed).toBe(false)
    expect(payload.data?.risk.riskLevel).toBe('medium')
    expect(payload.data?.risk.reasons?.some((item: string) => item.startsWith('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效'))).toBe(true)
    expect(payload.data?.risk.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.data?.summary.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(payload.data?.summary.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.data?.preview.riskLevel).toBe('medium')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.warnings.some((item: any) => item.code === 'env-auth-required')).toBe(true)
    expect(payload.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('add 非法 platform 时返回结构化失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['add', '--platform', 'openai', '--name', 'bad-platform', '--key', 'sk-bad-123', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('add')
    expect(payload.error?.code).toBe('UNSUPPORTED_PLATFORM')
    expect(payload.error?.message).toBe('不支持的平台：openai')
  })

  it('add 文本参数失败时输出 explainable 失败结果', async () => {
    const result = await runCli(['add', '--platform', 'openai', '--name', 'bad-platform', '--key', 'sk-bad-123'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[add] 失败')
    expect(result.stdout).toContain('不支持的平台：openai')
  })

  it('add 对 gemini 传入 --url 时返回结构化失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'bad-url', '--key', 'gm-bad-123', '--url', 'https://example.com', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('add')
    expect(payload.error?.code).toBe('GEMINI_URL_UNSUPPORTED')
    expect(payload.error?.message).toBe('gemini 平台暂不支持 --url，请改用默认官方链路。')
  })

  it('add 重复 ID 时返回 explainable 失败结果并保持已有 profiles 不变', async () => {
    const first = await runCli(['add', '--platform', 'claude', '--name', 'dup-prod', '--key', 'sk-new-123'])
    expect(first.stderr).toBe('')
    expect(first.exitCode).toBe(0)

    const second = await runCli(['add', '--platform', 'claude', '--name', 'dup-prod', '--key', 'sk-new-456'])

    expect(second.stdout).toContain('[add] 失败')
    expect(second.stderr).toBe('')
    expect(second.exitCode).toBe(1)
    expect(second.stdout).toContain('配置 ID 已存在：claude-dup-prod')

    const profiles = await new ProfilesStore().list()
    expect(profiles.filter((item) => item.id === 'claude-dup-prod')).toHaveLength(1)
  })

  it('add 缺少必填参数时保持 Commander 的 stderr 失败出口', async () => {
    const result = await runCli(['add'])

    expect(result.stdout).toBe('')
    expect(result.stderr).toContain("error: required option '--platform <platform>' not specified")
    expect(result.exitCode).toBe(1)
  })

  it('add 的 reference-only 文本输出明确只录入不解析', async () => {
    const result = await runCli([
      'add',
      '--platform', 'codex',
      '--name', 'ref-text-profile',
      '--secret-ref', 'vault://codex/prod',
      '--auth-reference', 'vault://codex/prod',
      '--url', 'https://gateway.example.com/openai/v1',
    ])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[add] 成功')
    expect(result.stdout).toContain('referenceStats 摘要:')
    expect(result.stdout).toContain('executabilityStats 摘要:')
    expect(result.stdout).toContain('add 只记录 reference 输入；真正的本地解析、治理判断和写入可执行性检查在 preview/use/import apply 阶段完成。')
  })
})
