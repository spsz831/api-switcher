import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  parseJsonResult,
  runCli,
  setupCliIntegrationContext,
  teardownCliIntegrationContext,
  type CliIntegrationContext,
  type ScopeAvailabilityContract,
  writeImportSourceFile,
} from './helpers/cli-testkit'

let context: CliIntegrationContext

beforeEach(async () => {
  context = await setupCliIntegrationContext()
})

afterEach(async () => {
  await teardownCliIntegrationContext()
})

describe('cli import apply integration', () => {
  it('import apply 同时传 --profile 与 --profiles 时返回参数错误', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-mutually-exclusive.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'codex-prod',
          name: 'codex-prod',
          platform: 'codex',
          source: { apiKey: 'sk-codex-live-123456', baseURL: 'https://gateway.example.com/openai/v1' },
          apply: {
            OPENAI_API_KEY: 'sk-codex-live-123456',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
      },
    ])

    const result = await runCli([
      'import',
      'apply',
      importFile,
      '--profile',
      'codex-prod',
      '--profiles',
      'codex-prod',
      '--json',
    ])

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('--profile 与 --profiles 不能同时使用')
  })

  it('import apply --profiles --json 可以顺序应用同平台多条 profile 并返回批量结果', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-batch-codex-success.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'codex-prod-a',
          name: 'codex-prod-a',
          platform: 'codex',
          source: { apiKey: 'sk-codex-batch-a-123456', baseURL: 'https://batch-a.example.com/openai/v1' },
          apply: {
            OPENAI_API_KEY: 'sk-codex-batch-a-123456',
            base_url: 'https://batch-a.example.com/openai/v1',
          },
        },
      },
      {
        profile: {
          id: 'codex-prod-b',
          name: 'codex-prod-b',
          platform: 'codex',
          source: { apiKey: 'sk-codex-batch-b-123456', baseURL: 'https://batch-b.example.com/openai/v1' },
          apply: {
            OPENAI_API_KEY: 'sk-codex-batch-b-123456',
            base_url: 'https://batch-b.example.com/openai/v1',
          },
        },
      },
    ])

    const result = await runCli([
      'import',
      'apply',
      importFile,
      '--profiles',
      'codex-prod-a,codex-prod-b',
      '--force',
      '--json',
    ])

    const payload = parseJsonResult<{
      sourceFile: string
      results: Array<{
        profileId: string
        platform?: string
        appliedScope?: string
        ok: boolean
        noChanges?: boolean
        backupId?: string
        changedFiles?: string[]
      }>
      summary: {
        totalProfiles: number
        appliedCount: number
        failedCount: number
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.sourceFile).toBe(importFile)
    expect(payload.data?.results).toHaveLength(2)
    expect(payload.data?.results.map((item) => item.profileId)).toEqual(['codex-prod-a', 'codex-prod-b'])
    expect(payload.data?.results.every((item) => item.ok)).toBe(true)
    expect(payload.data?.results).toEqual([
      expect.objectContaining({
        profileId: 'codex-prod-a',
        platform: 'codex',
        ok: true,
        noChanges: false,
      }),
      expect.objectContaining({
        profileId: 'codex-prod-b',
        platform: 'codex',
        ok: true,
        noChanges: false,
      }),
    ])
    expect(payload.data?.summary).toEqual({
      totalProfiles: 2,
      appliedCount: 2,
      failedCount: 0,
    })
  })

  it('import apply --profiles --json 部分失败时返回轻量 failure explainable', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-batch-gemini-partial-failure.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
      {
        profile: {
          id: 'gemini-invalid',
          name: 'gemini-invalid',
          platform: 'gemini',
          source: { authType: 'oauth-personal' },
          apply: {
            enforcedAuthType: 'oauth-personal',
          },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])

    const result = await runCli([
      'import',
      'apply',
      importFile,
      '--profiles',
      'gemini-prod,gemini-invalid',
      '--force',
      '--json',
    ])

    const payload = parseJsonResult<{
      sourceFile: string
      results: Array<{
        profileId: string
        platform?: string
        appliedScope?: string
        ok: boolean
        noChanges?: boolean
        failureCategory?: string
        reasonCodes?: string[]
        backupId?: string
        changedFiles?: string[]
        error?: {
          code: string
          details?: {
            errors?: Array<{ code?: string }>
          }
        }
      }>
      summary: {
        totalProfiles: number
        appliedCount: number
        failedCount: number
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('import-apply')
    expect(payload.error?.code).toBe('IMPORT_APPLY_BATCH_PARTIAL_FAILURE')
    expect(payload.error?.details).toEqual(expect.objectContaining({
      summary: {
        totalProfiles: 2,
        appliedCount: 1,
        failedCount: 1,
      },
    }))
    expect(payload.error?.details).toEqual(expect.objectContaining({
      results: expect.arrayContaining([
      expect.objectContaining({
        profileId: 'gemini-prod',
        platform: 'gemini',
        ok: true,
        noChanges: false,
      }),
      expect.objectContaining({
        profileId: 'gemini-invalid',
        platform: 'gemini',
        ok: false,
        failureCategory: 'runtime',
        reasonCodes: ['missing-gemini-api-key'],
        error: expect.objectContaining({
          code: 'VALIDATION_FAILED',
        }),
      }),
    ]),
    }))
  })

  it('import apply --json 会进入 import-apply 管道并返回结构化结果', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-success.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.action).toBe('import-apply')
    expect(payload.error?.code).toBe('CONFIRMATION_REQUIRED')
  })

  it('import apply --json 可以成功应用 Codex profile 并写入双文件目标', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-codex-success.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'codex-prod',
          name: 'codex-prod',
          platform: 'codex',
          source: { apiKey: 'sk-codex-live-123456', baseURL: 'https://gateway.example.com/openai/v1' },
          apply: {
            OPENAI_API_KEY: 'sk-codex-live-123456',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'codex-prod', '--force', '--json'])
    const payload = parseJsonResult<{
      sourceFile: string
      importedProfile: { id: string; platform: string }
      appliedScope?: string
      platformSummary?: {
        kind: string
        precedence?: string[]
        currentScope?: string
        composedFiles?: string[]
        facts: Array<{ code: string; message: string }>
      }
      backupId: string
      changedFiles: string[]
      noChanges: boolean
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          profileId?: string
          targetScope?: string
          warningCount: number
          limitationCount: number
          changedFileCount?: number
          backupCreated?: boolean
          noChanges?: boolean
        }>
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.sourceFile).toBe(importFile)
    expect(payload.data?.importedProfile).toEqual(expect.objectContaining({
      id: 'codex-prod',
      platform: 'codex',
    }))
    expect(payload.data?.appliedScope).toBeUndefined()
    expect(payload.data?.platformSummary).toEqual({
      kind: 'multi-file-composition',
      composedFiles: [context.codexConfigPath, context.codexAuthPath],
      facts: [
        { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
        { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
      ],
    })
    expect(payload.data?.backupId).toMatch(/^snapshot-codex-/)
    expect(payload.data?.changedFiles).toEqual([context.codexConfigPath, context.codexAuthPath])
    expect(payload.data?.noChanges).toBe(false)
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'codex',
        profileCount: 1,
        profileId: 'codex-prod',
        warningCount: payload.data?.summary.warnings.length ?? 0,
        limitationCount: 1,
        changedFileCount: 2,
        backupCreated: true,
        noChanges: false,
      }),
    ]))

    const codexConfig = await fs.readFile(context.codexConfigPath, 'utf8')
    const codexAuth = JSON.parse(await fs.readFile(context.codexAuthPath, 'utf8')) as Record<string, unknown>
    expect(codexConfig).toContain('base_url = "https://gateway.example.com/openai/v1"')
    expect(codexConfig).toContain('default_provider = "openai"')
    expect(codexAuth.OPENAI_API_KEY).toBe('sk-codex-live-123456')
    expect(codexAuth.user_id).toBe('u-1')
  })

  it('import apply --dry-run --json 会执行 apply 前检查但不写入 Codex 双文件目标', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-codex-dry-run.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'codex-prod',
          name: 'codex-prod',
          platform: 'codex',
          source: { apiKey: 'sk-codex-dry-run-123456', baseURL: 'https://dry-run.example.com/openai/v1' },
          apply: {
            OPENAI_API_KEY: 'sk-codex-dry-run-123456',
            base_url: 'https://dry-run.example.com/openai/v1',
          },
        },
      },
    ])

    const configBefore = await fs.readFile(context.codexConfigPath, 'utf8')
    const authBefore = await fs.readFile(context.codexAuthPath, 'utf8')
    const result = await runCli(['import', 'apply', importFile, '--profile', 'codex-prod', '--force', '--dry-run', '--json'])
    const payload = parseJsonResult<{
      dryRun: boolean
      backupId?: string
      changedFiles: string[]
      noChanges: boolean
      preview: { noChanges: boolean; diffSummary: Array<{ path: string; hasChanges: boolean }> }
      summary: {
        platformStats?: Array<{
          changedFileCount?: number
          backupCreated?: boolean
          noChanges?: boolean
        }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.dryRun).toBe(true)
    expect(payload.data?.backupId).toBeUndefined()
    expect(payload.data?.changedFiles).toEqual([])
    expect(payload.data?.noChanges).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.diffSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: context.codexConfigPath, hasChanges: true }),
      expect.objectContaining({ path: context.codexAuthPath, hasChanges: true }),
    ]))
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        changedFileCount: 0,
        backupCreated: false,
        noChanges: true,
      }),
    ]))
    await expect(fs.readFile(context.codexConfigPath, 'utf8')).resolves.toBe(configBefore)
    await expect(fs.readFile(context.codexAuthPath, 'utf8')).resolves.toBe(authBefore)
  })

  it('import apply --dry-run 文本输出明确提示未写入且未创建备份', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-codex-dry-run-text.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'codex-prod',
          name: 'codex-prod',
          platform: 'codex',
          source: { apiKey: 'sk-codex-dry-run-text-123456', baseURL: 'https://dry-run-text.example.com/openai/v1' },
          apply: {
            OPENAI_API_KEY: 'sk-codex-dry-run-text-123456',
            base_url: 'https://dry-run-text.example.com/openai/v1',
          },
        },
      },
    ])

    const configBefore = await fs.readFile(context.codexConfigPath, 'utf8')
    const authBefore = await fs.readFile(context.codexAuthPath, 'utf8')
    const result = await runCli(['import', 'apply', importFile, '--profile', 'codex-prod', '--force', '--dry-run'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[import-apply] 成功')
    expect(result.stdout).toContain('Dry run: 是')
    expect(result.stdout).toContain('备份ID: 未创建')
    expect(result.stdout).toContain('无变更: 是')
    expect(result.stdout).toContain('已变更文件: 无')
    expect(result.stdout).toContain('changedFiles=0, backup=no, noChanges=yes')
    expect(result.stdout).toContain('变更摘要:')
    await expect(fs.readFile(context.codexConfigPath, 'utf8')).resolves.toBe(configBefore)
    await expect(fs.readFile(context.codexAuthPath, 'utf8')).resolves.toBe(authBefore)
  })

  it('import apply --json 命中 redacted inline secret 导入源时会直接阻断', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-redacted-inline-secret.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: '<redacted:inline-secret>', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: '<redacted:inline-secret>', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--json'])
    const payload = parseJsonResult<{
      sourceFile: string
      profileId: string
      redactedInlineSecretFields: string[]
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('import-apply')
    expect(payload.warnings?.some((item) => item.includes('redacted inline secret 占位值'))).toBe(true)
    expect(payload.error?.code).toBe('IMPORT_SOURCE_REDACTED_INLINE_SECRETS')
    expect(payload.error?.details).toEqual({
      sourceFile: importFile,
      profileId: 'gemini-prod',
      redactedInlineSecretFields: ['source.apiKey', 'apply.GEMINI_API_KEY'],
    })
  })

  it('import apply --json 在 mixed source 下按 --profile 精确命中目标平台，不受同批其他 profile 干扰', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-cross-platform-mixed.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-blocked',
          name: 'gemini-blocked',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'project',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
      {
        profile: {
          id: 'codex-prod',
          name: 'codex-prod',
          platform: 'codex',
          source: { apiKey: 'sk-codex-live-123456', baseURL: 'https://gateway.example.com/openai/v1' },
          apply: {
            OPENAI_API_KEY: 'sk-codex-live-123456',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
      },
      {
        profile: {
          id: 'claude-sidecar',
          name: 'claude-sidecar',
          platform: 'claude',
          source: { token: 'sk-live-654321', baseURL: 'https://claude-sidecar.example.com/api' },
          apply: {
            ANTHROPIC_AUTH_TOKEN: 'sk-live-654321',
            ANTHROPIC_BASE_URL: 'https://claude-sidecar.example.com/api',
          },
        },
      },
    ])

    const originalGeminiSettings = await fs.readFile(context.geminiSettingsPath, 'utf8')
    const originalGeminiProjectSettings = await fs.readFile(context.geminiProjectSettingsPath, 'utf8')
    const originalClaudeProjectSettings = await fs.readFile(context.claudeProjectSettingsPath, 'utf8')
    const originalClaudeLocalExists = await fs.access(context.claudeLocalSettingsPath).then(() => true).catch(() => false)

    const result = await runCli(['import', 'apply', importFile, '--profile', 'codex-prod', '--force', '--json'])
    const payload = parseJsonResult<{
      sourceFile: string
      importedProfile: { id: string; platform: string }
      appliedScope?: string
      backupId: string
      changedFiles: string[]
      noChanges: boolean
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.sourceFile).toBe(importFile)
    expect(payload.data?.importedProfile).toEqual(expect.objectContaining({
      id: 'codex-prod',
      platform: 'codex',
    }))
    expect(payload.data?.appliedScope).toBeUndefined()
    expect(payload.data?.backupId).toMatch(/^snapshot-codex-/)
    expect(payload.data?.changedFiles).toEqual([context.codexConfigPath, context.codexAuthPath])
    expect(payload.data?.noChanges).toBe(false)

    const codexConfig = await fs.readFile(context.codexConfigPath, 'utf8')
    const codexAuth = JSON.parse(await fs.readFile(context.codexAuthPath, 'utf8')) as Record<string, unknown>
    expect(codexConfig).toContain('base_url = "https://gateway.example.com/openai/v1"')
    expect(codexAuth.OPENAI_API_KEY).toBe('sk-codex-live-123456')

    expect(await fs.readFile(context.geminiSettingsPath, 'utf8')).toBe(originalGeminiSettings)
    expect(await fs.readFile(context.geminiProjectSettingsPath, 'utf8')).toBe(originalGeminiProjectSettings)
    expect(await fs.readFile(context.claudeProjectSettingsPath, 'utf8')).toBe(originalClaudeProjectSettings)
    const localAfter = await fs.access(context.claudeLocalSettingsPath).then(() => true).catch(() => false)
    expect(localAfter).toBe(originalClaudeLocalExists)
  })

  it('import apply 缺少 --profile 时保持 Commander 用法失败', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-missing-profile.json')
    await writeImportSourceFile(importFile, [])

    const result = await runCli(['import', 'apply', importFile, '--json'])

    expect(result.stdout).toBe('')
    expect(result.stderr).toContain("required option '--profile <id>' not specified")
    expect(result.exitCode).toBe(2)
  })

  it('import apply 在默认 Claude project scope 下可成功应用并写入 project 文件', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-claude-project-success.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'claude-prod',
          name: 'claude-prod',
          platform: 'claude',
          source: { token: 'sk-live-123456', baseURL: 'https://gateway.example.com/api' },
          apply: {
            ANTHROPIC_AUTH_TOKEN: 'sk-live-123456',
            ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
          },
        },
        defaultWriteScope: 'project',
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'claude-prod', '--force', '--json'])
    const payload = parseJsonResult<{
      importedProfile: { id: string; platform: string }
      appliedScope?: string
      changedFiles: string[]
      noChanges: boolean
      preview: { targetFiles: Array<{ path: string; scope?: string }> }
      validation: {
        managedBoundaries?: Array<{ target?: string; notes?: string[] }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.importedProfile).toEqual(expect.objectContaining({
      id: 'claude-prod',
      platform: 'claude',
    }))
    expect(payload.data?.appliedScope).toBe('project')
    expect(payload.data?.changedFiles).toEqual([context.claudeProjectSettingsPath])
    expect(payload.data?.noChanges).toBe(false)
    expect(payload.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: context.claudeProjectSettingsPath,
        scope: 'project',
      }),
    ])
    expect(payload.data?.validation.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        target: context.claudeProjectSettingsPath,
        notes: ['当前写入目标为 Claude 项目级配置文件。'],
      }),
    ]))

    const projectSettings = JSON.parse(await fs.readFile(context.claudeProjectSettingsPath, 'utf8')) as Record<string, unknown>
    const localExists = await fs.access(context.claudeLocalSettingsPath).then(() => true).catch(() => false)
    expect(projectSettings.ANTHROPIC_AUTH_TOKEN).toBe('sk-live-123456')
    expect(projectSettings.ANTHROPIC_BASE_URL).toBe('https://gateway.example.com/api')
    expect(projectSettings.theme).toBe('dark')
    expect(localExists).toBe(false)
  })

  it('import apply --scope local 对 Claude 在未 --force 时返回 CONFIRMATION_REQUIRED', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-claude-local-confirmation.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'claude-prod',
          name: 'claude-prod',
          platform: 'claude',
          source: { token: 'sk-live-123456', baseURL: 'https://gateway.example.com/api' },
          apply: {
            ANTHROPIC_AUTH_TOKEN: 'sk-live-123456',
            ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
          },
        },
        defaultWriteScope: 'project',
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'claude-prod', '--scope', 'local', '--json'])
    const payload = parseJsonResult<{
      scopePolicy?: {
        requestedScope?: string
        resolvedScope?: string
        riskWarning?: string
      }
      risk?: {
        reasons?: string[]
        limitations?: string[]
      }
    }>(result.stdout)
    const confirmationDetails = payload.error?.details as {
      scopePolicy?: {
        requestedScope?: string
        resolvedScope?: string
        riskWarning?: string
      }
      risk?: {
        reasons?: string[]
        limitations?: string[]
      }
    } | undefined

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('import-apply')
    expect(payload.error?.code).toBe('CONFIRMATION_REQUIRED')
    expect(confirmationDetails?.scopePolicy?.requestedScope).toBe('local')
    expect(confirmationDetails?.scopePolicy?.resolvedScope).toBe('local')
    expect(confirmationDetails?.scopePolicy?.riskWarning).toBeUndefined()
    expect(confirmationDetails?.risk?.reasons).toEqual([
      'Claude local scope 高于 project 与 user；同名字段写入后会直接成为当前项目的最终生效值。',
    ])
    expect(confirmationDetails?.risk?.limitations).toEqual(expect.arrayContaining([
      '如果你只是想共享项目级配置，优先使用 project scope，而不是 local scope。',
    ]))
  })

  it('import apply 文本失败时输出 reference 解析摘要', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-reference-details.txt.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'claude-reference-local',
          name: 'claude-reference-local',
          platform: 'claude',
          source: { secret_ref: 'env://API_SWITCHER_MISSING_SECRET' },
          apply: {
            auth_reference: 'vault://claude/prod',
            secondary_auth_reference: 'env://API_SWITCHER_TEST_SECRET',
          },
        },
        defaultWriteScope: 'project',
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'claude-reference-local', '--scope', 'local'], {
      API_SWITCHER_TEST_SECRET: 'sk-live-123456',
    })

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[import-apply] 失败')
    expect(result.stdout).toContain('reference 摘要:')
    expect(result.stdout).toContain('  - hasReferenceProfiles=yes, hasInlineProfiles=no, hasWriteUnsupportedProfiles=yes')
    expect(result.stdout).toContain('  - missing=1, resolved-but-not-writable=1, unsupported=1')
    expect(result.stdout).toContain('  - reasonCodes:')
    expect(result.stdout).toContain('reference 解析摘要:')
    expect(result.stdout).toContain('  - 未解析 env 引用:')
    expect(result.stdout).toContain('    - source.secret_ref -> env://API_SWITCHER_MISSING_SECRET')
    expect(result.stdout).toContain('  - 已解析但当前不会写入:')
    expect(result.stdout).toContain('    - apply.secondary_auth_reference -> env://API_SWITCHER_TEST_SECRET')
    expect(result.stdout).toContain('  - 不支持的引用 scheme:')
    expect(result.stdout).toContain('    - apply.auth_reference -> vault://claude/prod')
  })

  it('import apply --json 对 resolved env auth_reference 在未 --force 时返回 CONFIRMATION_REQUIRED，并暴露 referenceDecision', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-reference-confirmation.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-reference-confirm',
          name: 'gemini-reference-confirm',
          platform: 'gemini',
          source: { secret_ref: 'env://API_SWITCHER_GEMINI_IMPORT_SECRET', authType: 'gemini-api-key' },
          apply: {
            auth_reference: 'env://API_SWITCHER_GEMINI_IMPORT_SECRET',
            enforcedAuthType: 'gemini-api-key',
          },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-reference-confirm', '--json'], {
      API_SWITCHER_GEMINI_IMPORT_SECRET: 'gm-ref-confirm-123456',
    })
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('import-apply')
    expect(payload.error?.code).toBe('CONFIRMATION_REQUIRED')
    expect(payload.error?.details).toEqual(expect.objectContaining({
      referenceDecision: {
        writeDecision: 'inline-fallback-write',
        writeStrategy: 'inline-fallback-only',
        requiresForce: true,
        blocking: false,
        reasonCodes: ['REFERENCE_INLINE_FALLBACK_REQUIRED'],
      },
      risk: expect.objectContaining({
        allowed: false,
        limitations: expect.arrayContaining([
          '如继续执行，将以明文写入目标配置文件。',
        ]),
      }),
    }))
  })

  it('import apply --force --json 对 resolved env auth_reference 可成功写入，并把 summary 标记为 reference-ready', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-reference-success.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-reference-success',
          name: 'gemini-reference-success',
          platform: 'gemini',
          source: { secret_ref: 'env://API_SWITCHER_GEMINI_IMPORT_SUCCESS_SECRET', authType: 'gemini-api-key' },
          apply: {
            auth_reference: 'env://API_SWITCHER_GEMINI_IMPORT_SUCCESS_SECRET',
            enforcedAuthType: 'gemini-api-key',
          },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-reference-success', '--force', '--json'], {
      API_SWITCHER_GEMINI_IMPORT_SUCCESS_SECRET: 'gm-ref-success-123456',
    })
    const payload = parseJsonResult<{
      referenceDecision?: {
        writeDecision: string
        writeStrategy: string
        requiresForce: boolean
        blocking: boolean
        reasonCodes: string[]
      }
      summary: {
        referenceStats?: {
          referenceProfileCount: number
          resolvedReferenceProfileCount: number
          writeUnsupportedProfileCount: number
          hasWriteUnsupportedProfiles: boolean
        }
        executabilityStats?: {
          referenceReadyProfileCount: number
          writeUnsupportedProfileCount: number
          hasReferenceReadyProfiles: boolean
          hasWriteUnsupportedProfiles: boolean
        }
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.referenceDecision).toEqual({
      writeDecision: 'inline-fallback-write',
      writeStrategy: 'inline-fallback-only',
      requiresForce: true,
      blocking: false,
      reasonCodes: ['REFERENCE_INLINE_FALLBACK_REQUIRED'],
    })
    expect(payload.data?.summary.referenceStats).toEqual(expect.objectContaining({
      referenceProfileCount: 1,
      resolvedReferenceProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      hasWriteUnsupportedProfiles: false,
    }))
    expect(payload.data?.summary.executabilityStats).toEqual(expect.objectContaining({
      referenceReadyProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      hasReferenceReadyProfiles: true,
      hasWriteUnsupportedProfiles: false,
    }))
  })

  it('import apply --json 对 unresolved env auth_reference 会直接返回 IMPORT_APPLY_FAILED，并暴露 blocking referenceDecision', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-reference-blocked.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-reference-blocked',
          name: 'gemini-reference-blocked',
          platform: 'gemini',
          source: { secret_ref: 'env://API_SWITCHER_GEMINI_MISSING_SECRET', authType: 'gemini-api-key' },
          apply: {
            auth_reference: 'env://API_SWITCHER_GEMINI_MISSING_SECRET',
            enforcedAuthType: 'gemini-api-key',
          },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-reference-blocked', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('import-apply')
    expect(payload.error?.code).toBe('IMPORT_APPLY_FAILED')
    expect(payload.error?.message).toBe('当前 secret reference 无法进入 import apply 写入流程。')
    expect(payload.error?.details).toEqual(expect.objectContaining({
      referenceDecision: {
        writeDecision: 'reference-blocked',
        writeStrategy: 'blocked',
        requiresForce: false,
        blocking: true,
        reasonCodes: ['REFERENCE_ENV_UNRESOLVED'],
      },
      referenceGovernance: expect.objectContaining({
        primaryReason: 'REFERENCE_MISSING',
        reasonCodes: ['REFERENCE_MISSING'],
        referenceDetails: expect.arrayContaining([
          expect.objectContaining({
            code: 'REFERENCE_ENV_UNRESOLVED',
            field: 'source.secret_ref',
            status: 'unresolved',
            reference: 'env://API_SWITCHER_GEMINI_MISSING_SECRET',
          }),
          expect.objectContaining({
            code: 'REFERENCE_ENV_UNRESOLVED',
            field: 'apply.auth_reference',
            status: 'unresolved',
            reference: 'env://API_SWITCHER_GEMINI_MISSING_SECRET',
          }),
        ]),
      }),
    }))
  })

  it('import apply --scope local --force 对 Claude 可成功应用并只写入 local 文件', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-claude-local-success.json')
    await fs.writeFile(context.claudeLocalSettingsPath, JSON.stringify({ localFlag: true }, null, 2), 'utf8')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'claude-prod',
          name: 'claude-prod',
          platform: 'claude',
          source: { token: 'sk-live-123456', baseURL: 'https://gateway.example.com/api' },
          apply: {
            ANTHROPIC_AUTH_TOKEN: 'sk-live-123456',
            ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
          },
        },
        defaultWriteScope: 'project',
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'claude-prod', '--scope', 'local', '--force', '--json'])
    const payload = parseJsonResult<{
      importedProfile: { id: string; platform: string }
      appliedScope?: string
      changedFiles: string[]
      noChanges: boolean
      preview: { targetFiles: Array<{ path: string; scope?: string }> }
      validation: {
        effectiveConfig?: {
          stored: Array<{ key: string; scope?: string }>
        }
        managedBoundaries?: Array<{ target?: string; notes?: string[] }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.importedProfile).toEqual(expect.objectContaining({
      id: 'claude-prod',
      platform: 'claude',
    }))
    expect(payload.data?.appliedScope).toBe('local')
    expect(payload.data?.changedFiles).toEqual([context.claudeLocalSettingsPath])
    expect(payload.data?.noChanges).toBe(false)
    expect(payload.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: context.claudeLocalSettingsPath,
        scope: 'local',
      }),
    ])
    expect(payload.data?.validation.effectiveConfig?.stored?.[0]).toMatchObject({
      key: 'ANTHROPIC_AUTH_TOKEN',
      scope: 'local',
    })
    expect(payload.data?.validation.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        target: context.claudeLocalSettingsPath,
        notes: ['当前写入目标为 Claude 本地级配置文件。'],
      }),
    ]))

    const localSettings = JSON.parse(await fs.readFile(context.claudeLocalSettingsPath, 'utf8')) as Record<string, unknown>
    const projectSettings = JSON.parse(await fs.readFile(context.claudeProjectSettingsPath, 'utf8')) as Record<string, unknown>
    expect(localSettings.ANTHROPIC_AUTH_TOKEN).toBe('sk-live-123456')
    expect(localSettings.ANTHROPIC_BASE_URL).toBe('https://gateway.example.com/api')
    expect(localSettings.localFlag).toBe(true)
    expect(projectSettings.ANTHROPIC_AUTH_TOKEN).toBe('sk-old-000')
  })

  it('import apply 对 Codex 传入非法 --scope 时返回 INVALID_SCOPE', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-codex-invalid-scope.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'codex-prod',
          name: 'codex-prod',
          platform: 'codex',
          source: { apiKey: 'sk-codex-live-123456', baseURL: 'https://gateway.example.com/openai/v1' },
          apply: {
            OPENAI_API_KEY: 'sk-codex-live-123456',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'codex-prod', '--scope', 'project', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('import-apply')
    expect(payload.error?.code).toBe('INVALID_SCOPE')
    expect(payload.error?.message).toContain('收到：project')
  })

  it('import apply --scope project 在 availability 不可用时先返回 IMPORT_SCOPE_UNAVAILABLE 而非 CONFIRMATION_REQUIRED', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-project-unavailable.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'project',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])
    await fs.rm(context.geminiProjectRoot, { recursive: true, force: true })

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--scope', 'project', '--json'])
    const payload = parseJsonResult<{
      scopeAvailability?: ScopeAvailabilityContract[]
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('import-apply')
    expect(payload.error?.code).toBe('IMPORT_SCOPE_UNAVAILABLE')
    expect(payload.error?.code).not.toBe('CONFIRMATION_REQUIRED')
    expect(payload.error?.details).toEqual(expect.objectContaining({
      resolvedScope: 'project',
      scopePolicy: expect.objectContaining({
        requestedScope: 'project',
        resolvedScope: 'project',
        defaultScope: 'user',
        explicitScope: true,
        highRisk: true,
        rollbackScopeMatchRequired: true,
      }),
      scopeCapabilities: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          risk: 'high',
          confirmationRequired: true,
          writable: true,
        }),
      ]),
      scopeAvailability: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          status: 'unresolved',
          reasonCode: 'PROJECT_ROOT_UNRESOLVED',
        }),
      ]),
    }))
  })

  it('import apply --scope project 在可用但未 --force 时返回 CONFIRMATION_REQUIRED', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-project-confirmation.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'project',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--scope', 'project', '--json'])
    const payload = parseJsonResult<{
      scopePolicy?: {
        requestedScope?: string
        resolvedScope?: string
        riskWarning?: string
      }
      scopeAvailability?: ScopeAvailabilityContract[]
    }>(result.stdout)
    const confirmationDetails = payload.error?.details as {
      scopePolicy?: {
        requestedScope?: string
        resolvedScope?: string
        riskWarning?: string
      }
      scopeAvailability?: ScopeAvailabilityContract[]
    } | undefined
    const projectAvailability = confirmationDetails?.scopeAvailability?.find((item) => item.scope === 'project')

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('import-apply')
    expect(payload.error?.code).toBe('CONFIRMATION_REQUIRED')
    expect(confirmationDetails?.scopePolicy?.requestedScope).toBe('project')
    expect(confirmationDetails?.scopePolicy?.resolvedScope).toBe('project')
    expect(confirmationDetails?.scopePolicy?.riskWarning).toBe('Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。')
    expect(projectAvailability).toEqual(expect.objectContaining({
      scope: 'project',
      status: 'available',
      writable: true,
      path: context.geminiProjectSettingsPath,
    }))
    expect(payload.error?.details).toEqual(expect.objectContaining({
      referenceGovernance: {
        hasReferenceProfiles: false,
        hasInlineProfiles: true,
        hasWriteUnsupportedProfiles: false,
        primaryReason: 'INLINE_SECRET_PRESENT',
        reasonCodes: ['INLINE_SECRET_PRESENT'],
      },
      risk: expect.objectContaining({
        allowed: false,
        riskLevel: 'high',
        reasons: expect.arrayContaining([
          'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
        ]),
      }),
      scopePolicy: expect.objectContaining({
        requestedScope: 'project',
        resolvedScope: 'project',
        defaultScope: 'user',
        explicitScope: true,
        highRisk: true,
        riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
        rollbackScopeMatchRequired: true,
      }),
      scopeCapabilities: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          risk: 'high',
          confirmationRequired: true,
          writable: true,
        }),
      ]),
      scopeAvailability: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          status: 'available',
          writable: true,
          path: context.geminiProjectSettingsPath,
        }),
      ]),
    }))

    const userSettings = JSON.parse(await fs.readFile(context.geminiSettingsPath, 'utf8')) as Record<string, unknown>
    const projectSettings = JSON.parse(await fs.readFile(context.geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    expect(userSettings.enforcedAuthType).toBe('oauth-personal')
    expect((userSettings.ui as { theme?: string }).theme).toBe('dark')
    expect(projectSettings.enforcedAuthType).toBeUndefined()
    expect(projectSettings.projectOnly).toBe(true)
  })

  it('import apply 在默认 user scope 下 --force 成功并写入 Gemini user settings', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-user-success.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--force', '--json'])
    const payload = parseJsonResult<{
      sourceFile: string
      importedProfile: { id: string; platform: string }
      appliedScope: string
      backupId: string
      changedFiles: string[]
      scopePolicy: {
        requestedScope?: string
        resolvedScope?: string
        defaultScope?: string
        explicitScope: boolean
        highRisk: boolean
        rollbackScopeMatchRequired: boolean
      }
      preview: { targetFiles?: Array<{ path: string; scope?: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.sourceFile).toBe(importFile)
    expect(payload.data?.importedProfile).toEqual(expect.objectContaining({
      id: 'gemini-prod',
      platform: 'gemini',
    }))
    expect(payload.data?.appliedScope).toBe('user')
    expect(payload.data?.backupId).toMatch(/^snapshot-gemini-/)
    expect(payload.data?.changedFiles).toEqual([context.geminiSettingsPath])
    expect(payload.data?.scopePolicy).toEqual(expect.objectContaining({
      resolvedScope: 'user',
      defaultScope: 'user',
      explicitScope: false,
      highRisk: false,
      rollbackScopeMatchRequired: true,
    }))
    expect(payload.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: context.geminiSettingsPath,
        scope: 'user',
      }),
    ])

    const userSettings = JSON.parse(await fs.readFile(context.geminiSettingsPath, 'utf8')) as Record<string, unknown>
    const projectSettings = JSON.parse(await fs.readFile(context.geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    expect(userSettings.enforcedAuthType).toBe('gemini-api-key')
    expect((userSettings.ui as { theme?: string }).theme).toBe('dark')
    expect(projectSettings.enforcedAuthType).toBeUndefined()
  })

  it('import apply --scope project 在 --force 下成功并只写入 Gemini project settings', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-project-success.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'project',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--scope', 'project', '--force', '--json'])
    const payload = parseJsonResult<{
      appliedScope: string
      backupId: string
      changedFiles: string[]
      scopePolicy: {
        requestedScope?: string
        resolvedScope?: string
        defaultScope?: string
        explicitScope: boolean
        highRisk: boolean
        riskWarning?: string
        rollbackScopeMatchRequired: boolean
      }
      scopeAvailability?: ScopeAvailabilityContract[]
      preview: { targetFiles?: Array<{ path: string; scope?: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.appliedScope).toBe('project')
    expect(payload.data?.backupId).toMatch(/^snapshot-gemini-/)
    expect(payload.data?.changedFiles).toEqual([context.geminiProjectSettingsPath])
    expect(payload.data?.scopePolicy).toEqual({
      requestedScope: 'project',
      resolvedScope: 'project',
      defaultScope: 'user',
      explicitScope: true,
      highRisk: true,
      riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
      rollbackScopeMatchRequired: true,
    })
    expect(payload.data?.scopeAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'project',
        status: 'available',
        writable: true,
        path: context.geminiProjectSettingsPath,
      }),
    ]))
    expect(payload.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: context.geminiProjectSettingsPath,
        scope: 'project',
      }),
    ])

    const userSettings = JSON.parse(await fs.readFile(context.geminiSettingsPath, 'utf8')) as Record<string, unknown>
    const projectSettings = JSON.parse(await fs.readFile(context.geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    expect(userSettings.enforcedAuthType).toBe('oauth-personal')
    expect(projectSettings.enforcedAuthType).toBe('gemini-api-key')
    expect(projectSettings.projectOnly).toBe(true)
  })

  it('import apply --scope project 在导出默认 scope 仍为 user 时，也按显式目标写入 Gemini project settings', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-project-explicit-target-overrides-default.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
        scopeAvailability: [
          { scope: 'user', status: 'available', detected: true, writable: true, path: context.geminiSettingsPath },
          { scope: 'project', status: 'available', detected: true, writable: true, path: context.geminiProjectSettingsPath },
        ],
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--scope', 'project', '--force', '--json'])
    const payload = parseJsonResult<{
      appliedScope: string
      changedFiles: string[]
      scopePolicy: {
        requestedScope?: string
        resolvedScope?: string
        defaultScope?: string
        explicitScope: boolean
        highRisk: boolean
        riskWarning?: string
        rollbackScopeMatchRequired: boolean
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.appliedScope).toBe('project')
    expect(payload.data?.changedFiles).toEqual([context.geminiProjectSettingsPath])
    expect(payload.data?.scopePolicy).toEqual({
      requestedScope: 'project',
      resolvedScope: 'project',
      defaultScope: 'user',
      explicitScope: true,
      highRisk: true,
      riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
      rollbackScopeMatchRequired: true,
    })

    const userSettings = JSON.parse(await fs.readFile(context.geminiSettingsPath, 'utf8')) as Record<string, unknown>
    const projectSettings = JSON.parse(await fs.readFile(context.geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    expect(userSettings.enforcedAuthType).toBe('oauth-personal')
    expect(projectSettings.enforcedAuthType).toBe('gemini-api-key')
    expect(projectSettings.projectOnly).toBe(true)
  })

  it('import apply 产出的 project scope 快照在 rollback 时必须匹配记录的 scope', async () => {
    const importFile = path.join(context.runtimeDir, 'import-apply-project-rollback-scope.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'project',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])

    const applyResult = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--scope', 'project', '--force', '--json'])
    const applyPayload = parseJsonResult<{ backupId?: string }>(applyResult.stdout)
    expect(applyResult.exitCode).toBe(0)
    expect(applyPayload.data?.backupId).toBeTruthy()

    await fs.writeFile(context.geminiProjectSettingsPath, JSON.stringify({ enforcedAuthType: 'mutated' }, null, 2), 'utf8')
    await fs.writeFile(context.geminiSettingsPath, JSON.stringify({ enforcedAuthType: 'user-mutated' }, null, 2), 'utf8')

    const mismatchRollback = await runCli(['rollback', applyPayload.data!.backupId!, '--scope', 'user', '--json'])
    const mismatchPayload = parseJsonResult<{
      scopePolicy?: {
        requestedScope?: string
        resolvedScope?: string
        defaultScope?: string
        explicitScope: boolean
        highRisk: boolean
        rollbackScopeMatchRequired: boolean
      }
      restoredFiles?: string[]
      rollback?: { targetFiles?: Array<{ path: string; scope?: string }> }
    }>(mismatchRollback.stdout)

    expect(mismatchRollback.stderr).toBe('')
    expect(mismatchRollback.exitCode).toBe(1)
    expect(mismatchPayload.ok).toBe(false)
    expect(mismatchPayload.error?.code).toBe('ROLLBACK_SCOPE_MISMATCH')
    expect(mismatchPayload.error?.details).toEqual(expect.objectContaining({
      scopePolicy: expect.objectContaining({
        requestedScope: 'project',
        resolvedScope: 'project',
        defaultScope: 'user',
        explicitScope: true,
        highRisk: true,
        riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
        rollbackScopeMatchRequired: true,
      }),
      scopeCapabilities: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          risk: 'high',
          confirmationRequired: true,
          writable: true,
        }),
      ]),
      rollback: expect.objectContaining({
        ok: false,
        restoredFiles: [],
        warnings: expect.arrayContaining([
          expect.objectContaining({
            code: 'rollback-scope-mismatch',
          }),
        ]),
      }),
    }))
    expect(mismatchPayload.data).toBeUndefined()
    expect(mismatchPayload.data?.restoredFiles).toBeUndefined()
    expect(mismatchPayload.data?.rollback?.targetFiles).toBeUndefined()

    const unchangedProjectAfterMismatch = JSON.parse(await fs.readFile(context.geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    const unchangedUserAfterMismatch = JSON.parse(await fs.readFile(context.geminiSettingsPath, 'utf8')) as Record<string, unknown>
    expect(unchangedProjectAfterMismatch.enforcedAuthType).toBe('mutated')
    expect(unchangedUserAfterMismatch.enforcedAuthType).toBe('user-mutated')

    const rollbackResult = await runCli(['rollback', applyPayload.data!.backupId!, '--scope', 'project', '--json'])
    const rollbackPayload = parseJsonResult<{
      restoredFiles: string[]
      rollback?: { targetFiles?: Array<{ path: string; scope?: string }> }
    }>(rollbackResult.stdout)

    expect(rollbackResult.stderr).toBe('')
    expect(rollbackResult.exitCode).toBe(0)
    expect(rollbackPayload.ok).toBe(true)
    expect(rollbackPayload.data?.restoredFiles).toEqual([context.geminiProjectSettingsPath])
    expect(rollbackPayload.data?.rollback?.targetFiles).toEqual([
      expect.objectContaining({
        path: context.geminiProjectSettingsPath,
        scope: 'project',
      }),
    ])

    const restoredProject = JSON.parse(await fs.readFile(context.geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    const untouchedUser = JSON.parse(await fs.readFile(context.geminiSettingsPath, 'utf8')) as Record<string, unknown>
    expect(restoredProject.enforcedAuthType).toBeUndefined()
    expect(restoredProject.projectOnly).toBe(true)
    expect(untouchedUser.enforcedAuthType).toBe('user-mutated')
  })
})
