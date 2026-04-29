import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProfilesStore } from '../../src/stores/profiles.store'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../../src/constants/public-json-schema'
import type { Profile } from '../../src/types/profile'
import {
  type ScopeAvailabilityContract,
  type ScopeCapabilityContract,
  markCurrent,
  publicJsonSchemaPath,
  parseJsonResult,
  runCli,
  setupCliIntegrationContext,
  teardownCliIntegrationContext,
  validatePayloadAgainstPublicSchema,
  type CliIntegrationContext,
} from './helpers/cli-testkit'

let context: CliIntegrationContext

beforeEach(async () => {
  context = await setupCliIntegrationContext()
})

afterEach(async () => {
  await teardownCliIntegrationContext()
})

async function setGeminiUserScopeDetectedState(): Promise<void> {
  await fs.writeFile(
    context.geminiSettingsPath,
    JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2),
    'utf8',
  )
}

async function setGeminiCurrentProfile(): Promise<void> {
  await setGeminiUserScopeDetectedState()
  await markCurrent('gemini', 'gemini-prod', 'snapshot-gemini-001')
}

async function setEmptyProfiles(): Promise<void> {
  await new ProfilesStore().write({ version: 1, profiles: [] })
}

describe('readonly cli commands integration', () => {
  it('schema --json 输出当前 public JSON schema 与版本', async () => {
    const result = await runCli(['schema', '--json'])
    const staticSchema = JSON.parse(await fs.readFile(publicJsonSchemaPath, 'utf8')) as {
      $schema: string
      $id: string
      $defs?: Record<string, unknown>
    }
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.schemaVersion).toBe(PUBLIC_JSON_SCHEMA_VERSION)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')
    expect(payload.data?.schemaVersion).toBe(PUBLIC_JSON_SCHEMA_VERSION)
    expect(payload.data?.schemaId).toBe('https://api-switcher.local/schemas/public-json-output.schema.json')
    expect(payload.data?.schema).toEqual(expect.objectContaining({
      $schema: staticSchema.$schema,
      $id: staticSchema.$id,
      $defs: staticSchema.$defs,
    }))

    const recommendedActions = payload.data?.commandCatalog.recommendedActions ?? []
    const consumerProfiles = payload.data?.commandCatalog.consumerProfiles ?? []

    expect(recommendedActions.find((item: any) => item.code === 'continue-to-write')).toEqual({
      code: 'continue-to-write',
      title: 'Continue to write',
      family: 'execute',
      availability: ['readonly'],
      purpose: '在只读分析确认条件满足后，继续进入后续写入链路。',
    })
    expect(recommendedActions.find((item: any) => item.code === 'resolve-scope-before-retry')).toEqual({
      code: 'resolve-scope-before-retry',
      title: 'Resolve scope before retry',
      family: 'repair',
      availability: ['failure'],
      purpose: '先修复或切换 scope 相关条件，再重新执行命令。',
    })
    expect(consumerProfiles.find((item: any) => item.id === 'readonly-state-audit')).toEqual(expect.objectContaining({
      bestEntryAction: 'current',
      defaultConsumerFlowId: 'overview-to-items',
      triageBuckets: expect.arrayContaining([
        expect.objectContaining({
          id: 'reference-governance',
          purpose: '把 reference / inline / unsupported-scheme / missing-value 这类 secret 治理问题归到同一桶里处理。',
        }),
        expect.objectContaining({
          id: 'write-readiness',
          purpose: '把是否还能继续进入 use/import apply 的信号归到同一桶里，先判断 readiness 再决定是否继续写入。',
        }),
      ]),
      consumerFlow: expect.arrayContaining([
        expect.objectContaining({
          id: 'reference-to-governance',
          purpose: '当 summary 已暴露 secret/reference 治理信号时，把读取顺序直接映射到 governance 动作卡片。',
        }),
      ]),
    }))
    expect(consumerProfiles.find((item: any) => item.id === 'readonly-import-batch')).toEqual(expect.objectContaining({
      triageBuckets: expect.arrayContaining([
        expect.objectContaining({
          id: 'source-blocked',
          purpose: '把导入源本身已经阻断 apply 的项单独成桶，例如 redacted inline secret 或 source schema 兼容性问题。',
        }),
      ]),
    }))
    expect(validatePayloadAgainstPublicSchema(staticSchema as any, payload)).toBe(true)
  })

  it('schema --json --consumer-profile 对未知 profile 返回稳定失败 envelope', async () => {
    const result = await runCli(['schema', '--json', '--consumer-profile', 'missing-profile'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('schema')
    expect(payload.error).toEqual({
      code: 'SCHEMA_CONSUMER_PROFILE_NOT_FOUND',
      message: '未找到指定 schema consumer profile: missing-profile',
      details: {
        consumerProfileId: 'missing-profile',
        availableConsumerProfileIds: ['readonly-state-audit', 'single-platform-write', 'readonly-import-batch'],
      },
    })
  })

  it('schema --json --action 对未知 action 返回稳定失败 envelope', async () => {
    const result = await runCli(['schema', '--json', '--action', 'missing-action'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('schema')
    expect(payload.error).toEqual({
      code: 'SCHEMA_ACTION_NOT_FOUND',
      message: '未找到指定 schema action: missing-action',
      details: {
        action: 'missing-action',
        availableActions: ['add', 'current', 'export', 'import', 'import-apply', 'list', 'preview', 'rollback', 'schema', 'use', 'validate'],
      },
    })
  })

  it('schema --json --recommended-action 对未知 code 返回稳定失败 envelope', async () => {
    const result = await runCli(['schema', '--json', '--recommended-action', 'missing-step'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('schema')
    expect(payload.error).toEqual({
      code: 'SCHEMA_RECOMMENDED_ACTION_NOT_FOUND',
      message: '未找到指定 schema recommended action: missing-step',
      details: {
        code: 'missing-step',
        availableRecommendedActions: [
          'inspect-items',
          'review-reference-details',
          'repair-source-input',
          'group-by-platform',
          'continue-to-write',
          'fix-input-and-retry',
          'select-existing-resource',
          'resolve-scope-before-retry',
          'confirm-before-write',
          'check-platform-support',
          'inspect-runtime-details',
          'check-import-source',
          'fix-reference-input',
          'resolve-reference-support',
          'migrate-inline-secret',
        ],
      },
    })
  })

  it('schema --json --consumer-profile 只返回目标 consumer profile', async () => {
    const result = await runCli(['schema', '--json', '--consumer-profile', 'readonly-import-batch'])
    const payload = parseJsonResult<{
      commandCatalog: {
        consumerProfiles?: Array<{ id: string }>
        actions: Array<{ action: string }>
      }
      schema?: Record<string, unknown>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')
    expect(payload.data?.commandCatalog.consumerProfiles?.map((item) => item.id)).toEqual(['readonly-import-batch'])
    expect(payload.data?.commandCatalog.actions.length).toBeGreaterThan(1)
    expect(payload.data?.schema).toBeDefined()
  })

  it('schema --json --action 只返回目标 action capability', async () => {
    const result = await runCli(['schema', '--json', '--action', 'import-apply'])
    const payload = parseJsonResult<{
      commandCatalog: {
        actions: Array<{ action: string }>
        consumerProfiles?: Array<{ id: string }>
      }
      schema?: Record<string, unknown>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')
    expect(payload.data?.commandCatalog.actions.map((item) => item.action)).toEqual(['import-apply'])
    expect(payload.data?.commandCatalog.consumerProfiles?.length).toBeGreaterThan(1)
    expect(payload.data?.schema).toBeDefined()
  })

  it('schema --json --recommended-action 只返回目标 recommended action', async () => {
    const result = await runCli(['schema', '--json', '--recommended-action', 'continue-to-write'])
    const payload = parseJsonResult<{
      commandCatalog: {
        recommendedActions?: Array<{ code: string }>
        actions: Array<{ action: string }>
        consumerProfiles?: Array<{ id: string }>
      }
      schema?: Record<string, unknown>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')
    expect(payload.data?.commandCatalog.recommendedActions?.map((item) => item.code)).toEqual(['continue-to-write'])
    expect(payload.data?.commandCatalog.actions.length).toBeGreaterThan(1)
    expect(payload.data?.commandCatalog.consumerProfiles?.length).toBeGreaterThan(1)
    expect(payload.data?.schema).toBeDefined()
  })

  it('schema --schema-version 只输出当前 public JSON schema 版本', async () => {
    const result = await runCli(['schema', '--schema-version'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[schema] 成功')
    expect(result.stdout).toContain(`Schema Version: ${PUBLIC_JSON_SCHEMA_VERSION}`)
    expect(result.stdout).not.toContain('Schema ID:')
  })

  it('schema --schema-version --json 只返回当前 public JSON schema 版本', async () => {
    const result = await runCli(['schema', '--schema-version', '--json'])
    const payload = parseJsonResult<{ schemaVersion: string }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')
    expect(payload.data).toEqual({ schemaVersion: PUBLIC_JSON_SCHEMA_VERSION })
  })

  it('current --json 输出结构化 state 与检测结果', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'claude-prod',
          name: 'claude-prod',
          platform: 'claude',
          source: { token: 'sk-live-123456', baseURL: 'https://gateway.example.com/api' },
          apply: {
            ANTHROPIC_AUTH_TOKEN: 'sk-live-123456',
            ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
          },
        },
        {
          id: 'codex-prod',
          name: 'codex-prod',
          platform: 'codex',
          source: { apiKey: 'sk-codex-live-123456', baseURL: 'https://gateway.example.com/openai/v1' },
          apply: {
            OPENAI_API_KEY: 'sk-codex-live-123456',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
        {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: {
            GEMINI_API_KEY: 'gm-live-123456',
            enforcedAuthType: 'gemini-api-key',
          },
        },
        {
          id: 'gemini-invalid',
          name: 'gemini-invalid',
          platform: 'gemini',
          source: { authType: 'oauth-personal' },
          apply: {
            enforcedAuthType: 'oauth-personal',
          },
        },
      ],
    })
    await setGeminiCurrentProfile()

    const result = await runCli(['current', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('current')
    expect(payload.data?.current.gemini).toBe('gemini-prod')
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'gemini',
        profileCount: 2,
        currentProfileId: 'gemini-prod',
        detectedProfileId: 'gemini-prod',
        managed: true,
        currentScope: 'user',
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          currentScope: 'user',
          facts: [
            { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
            { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
          ],
        },
      }),
    ]))
    expect(payload.data?.summary.warnings?.some((item: string) => item.startsWith('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效'))).toBe(true)
    expect(payload.data?.summary.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.warnings?.some((item: string) => item.startsWith('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效'))).toBe(true)
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')

    const geminiDetection = payload.data?.detections.find((item: any) => item.platform === 'gemini')
    expect(geminiDetection?.managed).toBe(true)
    expect(geminiDetection?.matchedProfileId).toBe('gemini-prod')
    expect(geminiDetection?.targetFiles.find((item: any) => item.scope === 'user')?.path).toBe(context.geminiSettingsPath)
    expect(geminiDetection?.scopeCapabilities).toEqual([
      expect.objectContaining({
        scope: 'system-defaults',
        detect: true,
        preview: true,
        use: false,
        rollback: false,
        writable: false,
      }),
      expect.objectContaining({
        scope: 'user',
        detect: true,
        preview: true,
        use: true,
        rollback: true,
        writable: true,
        risk: 'normal',
      }),
      expect.objectContaining({
        scope: 'project',
        detect: true,
        preview: true,
        use: true,
        rollback: true,
        writable: true,
        risk: 'high',
        confirmationRequired: true,
      }),
      expect.objectContaining({
        scope: 'system-overrides',
        detect: true,
        preview: true,
        use: false,
        rollback: false,
        writable: false,
      }),
    ])
    expect(geminiDetection?.scopeAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'user',
        status: 'available',
        detected: true,
        writable: true,
      }),
      expect.objectContaining({ scope: 'project', status: 'available', writable: true, path: context.geminiProjectSettingsPath }),
    ]))
    expect(geminiDetection?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
      currentScope: 'user',
      facts: [
        { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
        { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
      ],
    })
    expect(geminiDetection?.managedBoundaries?.[0]?.type).toBe('scope-aware')
    expect(geminiDetection?.managedBoundaries?.[0]?.managedKeys).toContain('enforcedAuthType')
    expect(geminiDetection?.managedBoundaries?.[1]?.type).toBe('managed-fields')
    expect(geminiDetection?.managedBoundaries?.[1]?.preservedKeys).toContain('ui')
    expect(geminiDetection?.secretReferences).toEqual([
      {
        key: 'GEMINI_API_KEY',
        source: 'env',
        present: true,
        maskedValue: 'gm-l***56',
      },
    ])
    expect(geminiDetection?.effectiveConfig?.stored).toHaveLength(1)
    expect(geminiDetection?.effectiveConfig?.stored?.[0]).toMatchObject({
      key: 'enforcedAuthType',
      maskedValue: 'gemini-api-key',
      source: 'stored',
      scope: 'user',
      secret: false,
    })
    expect(geminiDetection?.effectiveConfig?.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'enforcedAuthType',
        maskedValue: 'gemini-api-key',
        source: 'effective',
        scope: 'user',
        secret: false,
      }),
      expect.objectContaining({
        key: 'GEMINI_API_KEY',
        maskedValue: 'gm-l***56',
        source: 'env',
        scope: 'runtime',
        secret: true,
        shadowed: true,
      }),
    ]))
    expect(geminiDetection?.effectiveConfig?.overrides).toEqual([
      {
        key: 'GEMINI_API_KEY',
        kind: 'env',
        source: 'env',
        message: '最终生效的 API key 取决于环境变量，而不是 settings.json。',
        shadowed: true,
      },
    ])
    expect(geminiDetection?.effectiveConfig?.shadowedKeys).toEqual(['GEMINI_API_KEY'])
    expect(geminiDetection?.warnings?.map((item: any) => item.message).some((item: string) => item.startsWith('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效'))).toBe(true)
    expect(geminiDetection?.limitations?.map((item: any) => item.message)).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('list --json 输出结构化 profiles 列表与状态摘要', async () => {
    await setGeminiCurrentProfile()
    const result = await runCli(['list', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('list')
    expect(payload.data?.profiles).toHaveLength(4)
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'claude',
        profileCount: 1,
        managed: false,
        currentScope: 'project',
        platformSummary: expect.objectContaining({
          kind: 'scope-precedence',
          precedence: ['user', 'project', 'local'],
          currentScope: 'project',
          facts: [
            { code: 'CLAUDE_SCOPE_PRECEDENCE', message: 'Claude 支持 user < project < local 三层 precedence。' },
            { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '如果存在 local，同名字段最终以 local 为准。' },
          ],
        }),
      }),
      expect.objectContaining({
        platform: 'codex',
        profileCount: 1,
        managed: false,
        platformSummary: expect.objectContaining({
          kind: 'multi-file-composition',
          facts: [
            { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
            { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
          ],
        }),
      }),
      expect.objectContaining({
        platform: 'gemini',
        profileCount: 2,
        currentProfileId: 'gemini-prod',
        detectedProfileId: 'gemini-prod',
        managed: true,
        currentScope: 'user',
        platformSummary: expect.objectContaining({
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          currentScope: 'user',
          facts: [
            { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
            { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
          ],
        }),
      }),
    ]))
    expect(payload.data?.summary.warnings?.some((item: string) => item.startsWith('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效'))).toBe(true)
    expect(payload.data?.summary.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.warnings?.some((item: string) => item.startsWith('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效'))).toBe(true)
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')

    const geminiProfile = payload.data?.profiles.find((item: any) => item.profile.id === 'gemini-prod')
    expect(geminiProfile?.current).toBe(true)
    expect(geminiProfile?.healthStatus).toBe('valid')
    expect(geminiProfile?.riskLevel).toBe('low')
    expect(geminiProfile?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'system-defaults', use: false, rollback: false, writable: false }),
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true }),
      expect.objectContaining({ scope: 'system-overrides', use: false, rollback: false, writable: false }),
    ]))
    expect(geminiProfile?.scopeAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', status: 'available', writable: true }),
      expect.objectContaining({ scope: 'project', status: 'available', writable: true, path: context.geminiProjectSettingsPath }),
    ]))

    const claudeProfile = payload.data?.profiles.find((item: any) => item.profile.id === 'claude-prod')
    expect(claudeProfile?.current).toBe(false)
    expect(claudeProfile?.healthStatus).toBe('unknown')
    expect(claudeProfile?.riskLevel).toBe('low')
    expect(claudeProfile?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'local', use: true, rollback: true, writable: true }),
    ]))
    expect(claudeProfile?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['user', 'project', 'local'],
      currentScope: 'project',
      facts: [
        { code: 'CLAUDE_SCOPE_PRECEDENCE', message: 'Claude 支持 user < project < local 三层 precedence。' },
        { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '如果存在 local，同名字段最终以 local 为准。' },
      ],
    })

    const codexProfile = payload.data?.profiles.find((item: any) => item.profile.id === 'codex-prod')
    expect(codexProfile?.platformSummary).toEqual({
      kind: 'multi-file-composition',
      composedFiles: expect.any(Array),
      facts: [
        { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
        { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
      ],
    })
  })

  it('list 输出文本结果并带出 current/health/risk', async () => {
    await setGeminiCurrentProfile()

    const result = await runCli(['list'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[list] 成功')
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('  当前生效: 是')
    expect(result.stdout).toContain('  健康状态: valid')
    expect(result.stdout).toContain('  风险等级: low')
    expect(result.stdout).toContain('- gemini-invalid (gemini)')
    expect(result.stdout).toContain('  当前生效: 否')
    expect(result.stdout).toContain('  健康状态: unknown')
    expect(result.stdout).toContain('  风险等级: low')
    expect(result.stdout).toContain('referenceStats 摘要:')
    expect(result.stdout).toContain('executabilityStats 摘要:')
    expect(result.stdout).toContain('  - 下一步:')
  })

  it('list 在 detectCurrent 命中但未被 state 标记时显示 warning/medium', async () => {
    await setGeminiUserScopeDetectedState()

    const result = await runCli(['list', '--platform', 'gemini'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('  当前生效: 否')
    expect(result.stdout).toContain('  健康状态: warning')
    expect(result.stdout).toContain('  风险等级: medium')
  })

  it('list 会把当前生效项排序到前面', async () => {
    await setGeminiCurrentProfile()

    const result = await runCli(['list', '--platform', 'gemini'])
    const geminiCurrentIndex = result.stdout.indexOf('- gemini-prod (gemini)')
    const geminiOtherIndex = result.stdout.indexOf('- gemini-invalid (gemini)')

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(geminiCurrentIndex).toBeGreaterThanOrEqual(0)
    expect(geminiOtherIndex).toBeGreaterThan(geminiCurrentIndex)
  })

  it('list --platform --json 仅返回目标平台的 profiles 与状态摘要', async () => {
    await setGeminiUserScopeDetectedState()

    const result = await runCli(['list', '--platform', 'gemini', '--json'])
    const payload = parseJsonResult<{
      profiles: Array<{
        profile: Profile & { meta?: { riskLevel?: string; healthStatus?: string } }
        current: boolean
        riskLevel: string
        healthStatus: string
      }>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('list')
    expect(payload.data?.profiles).toHaveLength(2)
    expect(payload.data?.profiles.every((item) => item.profile.platform === 'gemini')).toBe(true)

    const detectedGemini = payload.data?.profiles.find((item) => item.profile.id === 'gemini-prod')
    expect(detectedGemini?.current).toBe(false)
    expect(detectedGemini?.riskLevel).toBe('medium')
    expect(detectedGemini?.healthStatus).toBe('warning')
  })

  it('validate --json 成功时返回带 explainable 元数据的结构化 items', async () => {
    const result = await runCli(['validate', 'gemini-prod', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('validate')
    expect(payload.data?.items[0]?.profileId).toBe('gemini-prod')
    expect(payload.data?.items[0]?.platform).toBe('gemini')
    expect(payload.data?.items[0]?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'system-defaults', detect: true, preview: true, use: false, rollback: false, writable: false }),
      expect.objectContaining({ scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true }),
      expect.objectContaining({ scope: 'system-overrides', detect: true, preview: true, use: false, rollback: false, writable: false }),
    ]))
    expect(payload.data?.items[0]?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
      facts: [
        { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
        { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
      ],
    })
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'gemini',
        profileCount: 1,
        okCount: 1,
        warningCount: 2,
        limitationCount: 3,
        referenceStats: expect.objectContaining({
          profileCount: 1,
          inlineProfileCount: 1,
          referenceProfileCount: 0,
          writeUnsupportedProfileCount: 0,
        }),
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          facts: [
            { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
            { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
          ],
        },
      }),
    ]))
    expect(payload.data?.summary.warnings?.some((item: string) => item.startsWith('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效'))).toBe(true)
    expect(payload.data?.summary.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.warnings?.some((item: string) => item.startsWith('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效'))).toBe(true)
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.data?.items[0]?.validation.ok).toBe(true)
    expect(payload.data?.items[0]?.validation.warnings.map((item: any) => item.code)).toContain('INLINE_SECRET_IN_PROFILE')
    expect(payload.data?.items[0]?.validation.errors).toEqual([])
    expect(payload.data?.items[0]?.validation.limitations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        level: 'limitation',
        message: 'GEMINI_API_KEY 仍需通过环境变量生效。',
      }),
      expect.objectContaining({
        level: 'limitation',
        message: '当前仅稳定托管 settings.json 中已确认字段 enforcedAuthType。',
      }),
      expect.objectContaining({
        level: 'limitation',
        message: '官方文档当前未确认自定义 base URL 的稳定写入契约。',
      }),
    ]))
    expect(payload.data?.items[0]?.validation.effectiveConfig?.stored).toEqual([
      expect.objectContaining({
        key: 'enforcedAuthType',
        maskedValue: 'gemini-api-key',
        source: 'stored',
        scope: 'user',
        secret: false,
      }),
    ])
    expect(payload.data?.items[0]?.validation.effectiveConfig?.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'enforcedAuthType',
        maskedValue: 'gemini-api-key',
        source: 'effective',
        scope: 'user',
        secret: false,
      }),
      expect.objectContaining({
        key: 'GEMINI_API_KEY',
        maskedValue: 'gm-l***56',
        source: 'env',
        scope: 'runtime',
        secret: true,
        shadowed: true,
      }),
    ]))
    expect(payload.data?.items[0]?.validation.effectiveConfig?.overrides).toEqual([
      {
        key: 'GEMINI_API_KEY',
        kind: 'env',
        source: 'env',
        message: 'Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。',
        shadowed: true,
      },
    ])
    expect(payload.data?.items[0]?.validation.effectiveConfig?.shadowedKeys).toEqual(['GEMINI_API_KEY'])
    expect(payload.data?.items[0]?.validation.managedBoundaries?.[0]).toEqual(expect.objectContaining({
      type: 'managed-fields',
      managedKeys: ['enforcedAuthType'],
      preservedKeys: ['ui'],
      notes: ['Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。'],
    }))
    expect(payload.data?.items[0]?.validation.secretReferences).toEqual([
      {
        key: 'GEMINI_API_KEY',
        source: 'env',
        present: true,
        maskedValue: 'gm-l***56',
      },
    ])
  })

  it('current 输出文本 state 与检测结果', async () => {
    await setGeminiCurrentProfile()

    const result = await runCli(['current'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[current] 成功')
    expect(result.stdout).toContain('referenceStats 摘要:')
    expect(result.stdout).toContain('executabilityStats 摘要:')
    expect(result.stdout).toContain('  - 下一步:')
    expect(result.stdout).toContain('hasReferenceProfiles=')
    expect(result.stdout).toContain('- gemini: gemini-prod')
    expect(result.stdout).toContain('检测结果:')
    expect(result.stdout).toContain('- 平台: claude')
    expect(result.stdout).toContain('  当前作用域: project')
    expect(result.stdout).toContain('  作用域说明:')
    expect(result.stdout).toContain('  - 检测范围: user, project, local')
    expect(result.stdout).toContain('  - 生效优先级: user < project < local')
    expect(result.stdout).toContain('  - 当前生效来源: project')
    expect(result.stdout).toContain('  - 默认写入目标: 未显式传入 --scope 时，先读取 API_SWITCHER_CLAUDE_TARGET_SCOPE，再回落到 user')
    expect(result.stdout).toContain('- 平台: gemini')
    expect(result.stdout).toContain('  托管识别: 是')
    expect(result.stdout).toContain('  匹配配置: gemini-prod')
    expect(result.stdout).toContain('  当前作用域: user')
    expect(result.stdout).toContain('  作用域说明:')
    expect(result.stdout).toContain('  - 检测范围: system-defaults, user, project, system-overrides')
    expect(result.stdout).toContain('  - 生效优先级: system-defaults < user < project < system-overrides')
    expect(result.stdout).toContain('  - 当前生效来源: user')
    expect(result.stdout).toContain('  - 当前写入策略: api-switcher 当前仅写入 user scope')
    expect(result.stdout).toContain(`  目标文件: ${context.geminiSettingsPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=stored)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=effective)')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: gm-l***56 (scope=runtime, source=env, secret, shadowed)')
    expect(result.stdout).toContain('    覆盖说明:')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: 最终生效的 API key 取决于环境变量，而不是 settings.json。')
    expect(result.stdout).toContain('    被覆盖字段: GEMINI_API_KEY')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${context.geminiSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: enforcedAuthType')
    expect(result.stdout).toContain('    保留字段: ui')
    expect(result.stdout).toContain('    说明: Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY: gm-l***56 (source=env, present=yes)')
    expect(result.stdout).toContain('  警告: Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(result.stdout).toContain('  限制: GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('current 文本输出底层 state 读取异常的失败结果', async () => {
    const statePath = path.join(context.runtimeDir, 'state.json')
    await fs.rm(statePath, { force: true, recursive: true })
    await fs.mkdir(statePath, { recursive: true })

    const result = await runCli(['current'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain('[current] 失败')
    expect(result.stdout).toContain('EISDIR')
  })

  it('validate 成功时输出 explainable 校验详情并保持 exitCode 0', async () => {
    const result = await runCli(['validate', 'gemini-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[validate] 成功')
    expect(result.stdout).toContain('referenceStats 摘要:')
    expect(result.stdout).toContain('executabilityStats 摘要:')
    expect(result.stdout).toContain('  - 下一步:')
    expect(result.stdout).toContain('profiles=1, reference=0, inline=1, writeUnsupported=0')
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=stored)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: gm-l***56 (scope=runtime, source=env, secret, shadowed)')
    expect(result.stdout).toContain('    覆盖说明:')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(result.stdout).toContain('    被覆盖字段: GEMINI_API_KEY')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${context.geminiSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: enforcedAuthType')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY: gm-l***56 (source=env, present=yes)')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(result.stdout).not.toContain('  平台限制:')
  })

  it('export 输出名称、校验摘要与限制说明（重断言版）', async () => {
    const result = await runCli(['export'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[export] 成功')
    expect(result.stdout).toContain('referenceStats 摘要:')
    expect(result.stdout).toContain('executabilityStats 摘要:')
    expect(result.stdout).toContain('  - 下一步:')
    expect(result.stdout).toContain('hasReferenceProfiles=')
    expect(result.stdout).toContain('- claude-prod (claude)')
    expect(result.stdout).toContain('  名称: claude-prod')
    expect(result.stdout).toContain('  校验结果: 通过')
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-l***56 (scope=project, source=stored, secret)')
    expect(result.stdout).toContain('  限制: 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.stdout).toContain('- codex-prod (codex)')
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${context.claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - ANTHROPIC_AUTH_TOKEN: sk-l***56 (source=inline, present=yes)')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.stdout).toContain('  - 当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.stdout).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('list 空列表时输出限制说明', async () => {
    await setEmptyProfiles()

    const result = await runCli(['list'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[list] 成功')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.stdout).toContain('  - 当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.stdout).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('list --json 空列表时返回空数组', async () => {
    await setEmptyProfiles()

    const result = await runCli(['list', '--json'])
    const payload = parseJsonResult<{ profiles: Array<unknown>; summary: { warnings: string[]; limitations: string[] } }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('list')
    expect(payload.data?.profiles).toEqual([])
    expect(payload.data?.summary.warnings).toEqual([])
    expect(payload.data?.summary.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
  })

  it('list 会保留已有 meta 中的状态值', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'claude-meta',
          name: 'claude-meta',
          platform: 'claude',
          source: { token: 'sk-meta-123' },
          apply: { ANTHROPIC_AUTH_TOKEN: 'sk-meta-123' },
          meta: { riskLevel: 'high', healthStatus: 'invalid' },
        },
      ],
    })

    const result = await runCli(['list', '--json'])
    const payload = parseJsonResult<{
      profiles: Array<{
        profile: Profile & { meta?: { riskLevel?: string; healthStatus?: string } }
        current: boolean
        riskLevel: string
        healthStatus: string
      }>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.profiles[0]?.riskLevel).toBe('high')
    expect(payload.data?.profiles[0]?.healthStatus).toBe('invalid')
    expect(payload.data?.profiles[0]?.profile.meta?.riskLevel).toBe('high')
    expect(payload.data?.profiles[0]?.profile.meta?.healthStatus).toBe('invalid')
  })

  it('list --platform 输出按平台过滤后的文本结果', async () => {
    const result = await runCli(['list', '--platform', 'gemini'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[list] 成功')
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('- gemini-invalid (gemini)')
    expect(result.stdout).not.toContain('- claude-prod (claude)')
    expect(result.stdout).not.toContain('- codex-prod (codex)')
  })

  it('validate 失败时输出 explainable 校验详情并设置 exitCode 1', async () => {
    const result = await runCli(['validate', 'gemini-invalid'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[validate] 失败')
    expect(result.stdout).toContain('- gemini-invalid (gemini)')
    expect(result.stdout).toContain('  校验结果: 失败')
    expect(result.stdout).toContain('  错误: 缺少 GEMINI_API_KEY')
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - enforcedAuthType: oauth-personal (scope=user, source=stored)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - enforcedAuthType: oauth-personal (scope=user, source=effective)')
    expect(result.stdout).not.toContain('    - GEMINI_API_KEY:')
    expect(result.stdout).not.toContain('    瑕嗙洊璇存槑:')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY:  (source=env, present=no)')
    expect(result.stdout).not.toContain('  平台限制:')
  })

  it('validate selector 不存在时返回结构化失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['validate', 'missing-profile', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('validate')
    expect(payload.error?.code).toBe('PROFILE_NOT_FOUND')
    expect(payload.error?.message).toBe('未找到配置档：missing-profile')
  })

  it('export 未注册平台时返回结构化失败对象并设置 exitCode 1', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'openai-prod',
          name: 'openai-prod',
          platform: 'openai' as Profile['platform'],
          source: { apiKey: 'sk-openai-123456' },
          apply: { OPENAI_API_KEY: 'sk-openai-123456' },
        },
      ],
    })

    const result = await runCli(['export', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('export')
    expect(payload.error?.code).toBe('ADAPTER_NOT_REGISTERED')
    expect(payload.error?.message).toBe('未注册的平台适配器：openai')
  })

  it('current --json 会聚合 reference profile 的写入未启用 limitation', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'codex-ref',
          name: 'codex-ref',
          platform: 'codex',
          source: {
            secret_ref: 'vault://codex/prod',
            baseURL: 'https://gateway.example.com/openai/v1',
          },
          apply: {
            auth_reference: 'vault://codex/prod',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
      ],
    })

    const result = await runCli(['current', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.summary.limitations).toContain('当前已识别 secret_ref/auth_reference；真正的本地解析、治理判断与写入策略需要在 preview/use/import apply 阶段结合平台能力进一步确认。')
    expect(payload.limitations).toContain('当前已识别 secret_ref/auth_reference；真正的本地解析、治理判断与写入策略需要在 preview/use/import apply 阶段结合平台能力进一步确认。')
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
    expect(payload.data?.summary.triageStats?.buckets.map((item: { id: string; totalCount: number }) => [item.id, item.totalCount])).toEqual([
      ['overview', 1],
      ['reference-governance', 1],
      ['write-readiness', 1],
    ])
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'codex',
        referenceStats: expect.objectContaining({
          profileCount: 1,
          referenceProfileCount: 1,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 1,
          hasReferenceProfiles: true,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: true,
        }),
      }),
    ]))
  })

  it('list --json 会聚合 reference profile 的写入未启用 limitation', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'claude-ref',
          name: 'claude-ref',
          platform: 'claude',
          source: {
            secret_ref: 'vault://claude/prod',
            baseURL: 'https://gateway.example.com/api',
          },
          apply: {
            auth_reference: 'vault://claude/prod',
            ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
          },
        },
      ],
    })

    const result = await runCli(['list', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.summary.limitations).toContain('当前已识别 secret_ref/auth_reference；真正的本地解析、治理判断与写入策略需要在 preview/use/import apply 阶段结合平台能力进一步确认。')
    expect(payload.limitations).toContain('当前已识别 secret_ref/auth_reference；真正的本地解析、治理判断与写入策略需要在 preview/use/import apply 阶段结合平台能力进一步确认。')
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
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'claude',
        referenceStats: expect.objectContaining({
          profileCount: 1,
          referenceProfileCount: 1,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 1,
          hasReferenceProfiles: true,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: true,
        }),
      }),
    ]))
    expect(payload.data?.profiles?.[0]?.referenceSummary).toMatchObject({
      hasReferenceFields: true,
      hasInlineSecrets: false,
      writeUnsupported: true,
      resolvedReferenceCount: 0,
      missingReferenceCount: 0,
      unsupportedReferenceCount: 2,
      missingValueCount: 0,
    })
  })

  it('list 文本输出会提示 reference profile 当前不会被写入链路消费', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'codex-ref',
          name: 'codex-ref',
          platform: 'codex',
          source: {
            secret_ref: 'vault://codex/prod',
            baseURL: 'https://gateway.example.com/openai/v1',
          },
          apply: {
            auth_reference: 'vault://codex/prod',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
      ],
    })

    const result = await runCli(['list'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前已识别 secret_ref/auth_reference；真正的本地解析、治理判断与写入策略需要在 preview/use/import apply 阶段结合平台能力进一步确认。')
    expect(result.stdout).toContain('referenceStats 摘要:')
    expect(result.stdout).toContain('profiles=1, reference=1, inline=0, writeUnsupported=1')
    expect(result.stdout).toContain('reference 摘要:')
    expect(result.stdout).toContain('hasReferenceFields=yes, hasInlineSecrets=no, writeUnsupported=yes')
  })

  it('list 文本输出非法 platform 的失败结果', async () => {
    const result = await runCli(['list', '--platform', 'openai'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[list] 失败')
    expect(result.stdout).toContain('不支持的平台：openai')
  })

  it('list 未注册平台时返回结构化失败对象并设置 exitCode 1', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'openai-prod',
          name: 'openai-prod',
          platform: 'openai' as Profile['platform'],
          source: { apiKey: 'sk-openai-123456' },
          apply: { OPENAI_API_KEY: 'sk-openai-123456' },
        },
      ],
    })

    const result = await runCli(['list', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('list')
    expect(payload.error?.code).toBe('ADAPTER_NOT_REGISTERED')
    expect(payload.error?.message).toBe('未注册的平台适配器：openai')
  })

  it('validate 在空 profiles 下返回空 items', async () => {
    await new ProfilesStore().write({ version: 1, profiles: [] })

    const result = await runCli(['validate', '--json'])
    const payload = parseJsonResult<{ items: Array<{ profileId: string }> }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('validate')
    expect(payload.data?.items).toEqual([])
  })

  it('validate selector 不存在时文本输出 explainable 失败结果', async () => {
    const result = await runCli(['validate', 'missing-profile'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[validate] 失败')
    expect(result.stdout).toContain('未找到配置档：missing-profile')
  })

  it('validate 未注册平台时返回结构化失败对象并设置 exitCode 1', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'openai-prod',
          name: 'openai-prod',
          platform: 'openai' as Profile['platform'],
          source: { apiKey: 'sk-openai-123456' },
          apply: { OPENAI_API_KEY: 'sk-openai-123456' },
        },
      ],
    })

    const result = await runCli(['validate', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('validate')
    expect(payload.error?.code).toBe('ADAPTER_NOT_REGISTERED')
    expect(payload.error?.message).toBe('未注册的平台适配器：openai')
  })

  it('export 文本输出未注册平台的 explainable 失败结果', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'openai-prod',
          name: 'openai-prod',
          platform: 'openai' as Profile['platform'],
          source: { apiKey: 'sk-openai-123456' },
          apply: { OPENAI_API_KEY: 'sk-openai-123456' },
        },
      ],
    })

    const result = await runCli(['export'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[export] 失败')
    expect(result.stdout).toContain('未注册的平台适配器：openai')
  })

  it('export --json 保留 secret_ref/auth_reference profile 契约并聚合 limitation', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'codex-ref',
          name: 'codex-ref',
          platform: 'codex',
          source: {
            secret_ref: 'vault://codex/prod',
            baseURL: 'https://gateway.example.com/openai/v1',
          },
          apply: {
            auth_reference: 'vault://codex/prod',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
      ],
    })

    const result = await runCli(['export', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.summary.warnings).toEqual([])
    expect(payload.data?.summary.limitations).toContain('当前已识别 secret_ref/auth_reference；真正的本地解析、治理判断与写入策略需要在 preview/use/import apply 阶段结合平台能力进一步确认。')
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
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'codex',
        okCount: 1,
        warningCount: 0,
        limitationCount: 2,
        referenceStats: expect.objectContaining({
          profileCount: 1,
          referenceProfileCount: 1,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 1,
          hasReferenceProfiles: true,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: true,
        }),
      }),
    ]))
    expect(payload.data?.profiles?.[0]?.referenceSummary).toMatchObject({
      hasReferenceFields: true,
      hasInlineSecrets: false,
      writeUnsupported: true,
      resolvedReferenceCount: 0,
      missingReferenceCount: 0,
      unsupportedReferenceCount: 2,
      missingValueCount: 0,
    })
    expect(payload.data?.profiles?.[0]?.secretExportSummary).toEqual({
      hasInlineSecrets: false,
      hasRedactedInlineSecrets: false,
      hasReferenceSecrets: true,
      redactedFieldCount: 0,
      preservedReferenceCount: 2,
      details: [
        { field: 'source.secret_ref', kind: 'reference-preserved' },
        { field: 'apply.auth_reference', kind: 'reference-preserved' },
      ],
    })
    expect(payload.data?.profiles?.[0]?.validation?.warnings).toEqual([])
    expect(payload.data?.profiles?.[0]?.validation?.errors).toEqual([])
    expect(payload.data?.profiles?.[0]?.validation?.limitations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SECRET_REFERENCE_WRITE_UNSUPPORTED',
        level: 'limitation',
      }),
    ]))
    expect(payload.data?.summary.secretExportPolicy).toEqual({
      mode: 'redacted-by-default',
      inlineSecretsExported: 0,
      inlineSecretsRedacted: 0,
      referenceSecretsPreserved: 2,
      profilesWithRedactedSecrets: 0,
    })
  })

  it('validate --json 支持 secret_ref/auth_reference profile 契约并提示写入链路未支持', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'claude-ref',
          name: 'claude-ref',
          platform: 'claude',
          source: {
            auth_reference: 'vault://claude/prod',
            baseURL: 'https://gateway.example.com/api',
          },
          apply: {
            auth_reference: 'vault://claude/prod',
            ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
          },
        },
      ],
    })

    const result = await runCli(['validate', 'claude-ref', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.items[0]?.validation.errors).toEqual([])
    expect(payload.data?.items[0]?.validation.warnings).toEqual([])
    expect(payload.data?.items[0]?.validation.limitations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SECRET_REFERENCE_WRITE_UNSUPPORTED',
        level: 'limitation',
      }),
    ]))
    expect(payload.data?.summary.warnings).toEqual([])
    expect(payload.data?.summary.limitations).toContain('当前已识别 secret_ref/auth_reference；真正的本地解析、治理判断与写入策略需要在 preview/use/import apply 阶段结合平台能力进一步确认。')
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
    expect(payload.data?.summary.triageStats?.buckets.map((item: { id: string; totalCount: number }) => [item.id, item.totalCount])).toEqual([
      ['overview', 1],
      ['reference-governance', 1],
      ['write-readiness', 1],
    ])
    expect(payload.data?.summary.triageStats).toEqual({
      totalItems: 1,
      buckets: [
        {
          id: 'overview',
          title: 'Overview bucket',
          totalCount: 1,
          summaryFields: ['summary.platformStats'],
          itemFields: ['platformSummary'],
          recommendedNextStep: 'inspect-items',
        },
        {
          id: 'reference-governance',
          title: 'Reference governance bucket',
          totalCount: 1,
          summaryFields: ['summary.referenceStats'],
          itemFields: ['detections.referenceSummary', 'profiles.referenceSummary'],
          recommendedNextStep: 'review-reference-details',
        },
        {
          id: 'write-readiness',
          title: 'Write readiness bucket',
          totalCount: 1,
          summaryFields: ['summary.executabilityStats'],
          itemFields: ['detections.referenceSummary', 'profiles.referenceSummary'],
          recommendedNextStep: 'continue-to-write',
        },
      ],
    })
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'claude',
        referenceStats: expect.objectContaining({
          profileCount: 1,
          referenceProfileCount: 1,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 1,
          hasReferenceProfiles: true,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: true,
        }),
      }),
    ]))
    expect(payload.data?.items[0]?.referenceSummary).toMatchObject({
      hasReferenceFields: true,
      hasInlineSecrets: false,
      writeUnsupported: true,
      resolvedReferenceCount: 0,
      missingReferenceCount: 0,
      unsupportedReferenceCount: 2,
      missingValueCount: 0,
    })
  })

  it('export --json 输出结构化 profiles 与 explainable 摘要', async () => {
    const result = await runCli(['export', '--json'])
    const payload = parseJsonResult<{
      profiles: Array<{
        profile: Profile
        platformSummary?: {
          kind: string
          precedence?: string[]
          currentScope?: string
          composedFiles?: string[]
          facts: Array<{ code: string; message: string }>
        }
        scopeCapabilities?: ScopeCapabilityContract[]
        scopeAvailability?: ScopeAvailabilityContract[]
        defaultWriteScope?: string
        observedAt?: string
        secretExportSummary?: {
          hasInlineSecrets: boolean
          hasRedactedInlineSecrets: boolean
          hasReferenceSecrets: boolean
          redactedFieldCount: number
          preservedReferenceCount: number
          details?: Array<{ field: string; kind: string }>
        }
        validation?: {
          ok: boolean
          errors: Array<{ code: string }>
          warnings: Array<{ code: string; message: string }>
          limitations: Array<{ code: string; message: string }>
          effectiveConfig?: {
            stored: Array<{ key: string; maskedValue: string; source: string; scope?: string; secret?: boolean }>
            effective: Array<{ key: string; maskedValue: string; source: string; scope?: string; secret?: boolean; shadowed?: boolean }>
          }
          managedBoundaries?: Array<{ type: string; managedKeys: string[]; preservedKeys?: string[] }>
          secretReferences?: Array<{ key: string; source: string; present: boolean; maskedValue: string }>
        }
      }>
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          okCount: number
          warningCount: number
          limitationCount: number
          platformSummary?: {
            kind: string
            precedence?: string[]
            currentScope?: string
            composedFiles?: string[]
            facts: Array<{ code: string; message: string }>
          }
        }>
        secretExportPolicy?: {
          mode: 'redacted-by-default' | 'include-secrets'
          inlineSecretsExported: number
          inlineSecretsRedacted: number
          referenceSecretsPreserved: number
          profilesWithRedactedSecrets: number
        }
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('export')
    expect(payload.data?.profiles).toHaveLength(4)
    expect(payload.data?.summary.warnings?.some((item) => item.startsWith('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效'))).toBe(true)
    expect(payload.data?.summary.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(payload.data?.summary.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.data?.summary.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.warnings?.some((item) => item.startsWith('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效'))).toBe(true)
    expect(payload.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(payload.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')

    const claudeProfile = payload.data?.profiles.find((item) => item.profile.id === 'claude-prod')
    const codexProfile = payload.data?.profiles.find((item) => item.profile.id === 'codex-prod')
    const geminiProfile = payload.data?.profiles.find((item) => item.profile.id === 'gemini-prod')

    expect(claudeProfile?.profile.source).toEqual({ token: '<redacted:inline-secret>', baseURL: 'https://gateway.example.com/api' })
    expect(claudeProfile?.profile.apply).toEqual({
      ANTHROPIC_AUTH_TOKEN: '<redacted:inline-secret>',
      ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
    })
    expect(claudeProfile?.secretExportSummary).toEqual({
      hasInlineSecrets: true,
      hasRedactedInlineSecrets: true,
      hasReferenceSecrets: false,
      redactedFieldCount: 2,
      preservedReferenceCount: 0,
      details: [
        { field: 'source.token', kind: 'inline-secret-redacted' },
        { field: 'apply.ANTHROPIC_AUTH_TOKEN', kind: 'inline-secret-redacted' },
      ],
    })
    expect(claudeProfile?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'local', use: true, rollback: true, writable: true }),
    ]))
    expect(claudeProfile?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['user', 'project', 'local'],
      facts: [
        { code: 'CLAUDE_SCOPE_PRECEDENCE', message: 'Claude 支持 user < project < local 三层 precedence。' },
        { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '如果存在 local，同名字段最终以 local 为准。' },
      ],
    })
    expect(claudeProfile?.validation?.ok).toBe(true)
    expect(claudeProfile?.validation?.errors).toEqual([])
    expect(claudeProfile?.validation?.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INLINE_SECRET_IN_PROFILE', field: 'source.token' }),
      expect.objectContaining({ code: 'INLINE_SECRET_IN_PROFILE', field: 'apply.ANTHROPIC_AUTH_TOKEN' }),
    ]))
    expect(claudeProfile?.validation?.limitations.map((item) => item.message)).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(claudeProfile?.validation?.effectiveConfig?.stored?.[0]).toMatchObject({
      key: 'ANTHROPIC_AUTH_TOKEN',
      source: 'stored',
      scope: 'project',
      secret: true,
    })
    expect(claudeProfile?.validation?.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'scope-aware',
        managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
      }),
    ]))

    expect(codexProfile?.profile.source).toEqual({ apiKey: '<redacted:inline-secret>', baseURL: 'https://gateway.example.com/openai/v1' })
    expect(codexProfile?.profile.apply).toEqual({
      OPENAI_API_KEY: '<redacted:inline-secret>',
      base_url: 'https://gateway.example.com/openai/v1',
    })
    expect(codexProfile?.secretExportSummary).toEqual({
      hasInlineSecrets: true,
      hasRedactedInlineSecrets: true,
      hasReferenceSecrets: false,
      redactedFieldCount: 2,
      preservedReferenceCount: 0,
      details: [
        { field: 'source.apiKey', kind: 'inline-secret-redacted' },
        { field: 'apply.OPENAI_API_KEY', kind: 'inline-secret-redacted' },
      ],
    })
    expect(codexProfile?.platformSummary).toEqual({
      kind: 'multi-file-composition',
      composedFiles: [],
      facts: [
        { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
        { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
      ],
    })
    expect(codexProfile?.validation?.limitations.map((item) => item.message)).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(codexProfile?.validation?.managedBoundaries?.some((item) => item.type === 'multi-file-transaction')).toBe(true)

    expect(geminiProfile?.profile.source).toEqual({ apiKey: '<redacted:inline-secret>', authType: 'gemini-api-key' })
    expect(geminiProfile?.profile.apply).toEqual({
      GEMINI_API_KEY: '<redacted:inline-secret>',
      enforcedAuthType: 'gemini-api-key',
    })
    expect(geminiProfile?.secretExportSummary).toEqual({
      hasInlineSecrets: true,
      hasRedactedInlineSecrets: true,
      hasReferenceSecrets: false,
      redactedFieldCount: 2,
      preservedReferenceCount: 0,
      details: [
        { field: 'source.apiKey', kind: 'inline-secret-redacted' },
        { field: 'apply.GEMINI_API_KEY', kind: 'inline-secret-redacted' },
      ],
    })
    expect(geminiProfile?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'system-defaults', use: false, rollback: false, writable: false }),
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true }),
      expect.objectContaining({ scope: 'system-overrides', use: false, rollback: false, writable: false }),
    ]))
    expect(geminiProfile?.scopeAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', status: 'available', writable: true }),
      expect.objectContaining({ scope: 'project', status: 'available', writable: true, path: context.geminiProjectSettingsPath }),
    ]))
    expect(geminiProfile?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
      facts: [
        { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
        { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
      ],
    })
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'claude',
        profileCount: 1,
        okCount: 1,
        warningCount: 2,
        limitationCount: 1,
        platformSummary: expect.objectContaining({
          kind: 'scope-precedence',
          precedence: ['user', 'project', 'local'],
        }),
      }),
      expect.objectContaining({
        platform: 'codex',
        profileCount: 1,
        okCount: 1,
        warningCount: 2,
        limitationCount: 1,
        platformSummary: expect.objectContaining({
          kind: 'multi-file-composition',
        }),
      }),
      expect.objectContaining({
        platform: 'gemini',
        profileCount: 2,
        okCount: 1,
        warningCount: 3,
        limitationCount: 6,
        platformSummary: expect.objectContaining({
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
        }),
      }),
    ]))
    expect(payload.data?.summary.secretExportPolicy).toEqual({
      mode: 'redacted-by-default',
      inlineSecretsExported: 0,
      inlineSecretsRedacted: 6,
      referenceSecretsPreserved: 0,
      profilesWithRedactedSecrets: 3,
    })
    expect(geminiProfile?.defaultWriteScope).toBe('user')
    expect(geminiProfile?.observedAt).toEqual(expect.any(String))
    expect(new Date(geminiProfile?.observedAt ?? '').toString()).not.toBe('Invalid Date')
    expect(claudeProfile?.observedAt).toBeUndefined()
    expect(geminiProfile?.validation?.limitations.map((item) => item.message)).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(geminiProfile?.validation?.managedBoundaries?.[0]?.managedKeys).toEqual(['enforcedAuthType'])
    expect(claudeProfile?.validation?.secretReferences).toEqual([
      {
        key: 'ANTHROPIC_AUTH_TOKEN',
        source: 'inline',
        present: true,
        maskedValue: 'sk-l***56',
      },
    ])
    expect(codexProfile?.validation?.secretReferences).toEqual([
      {
        key: 'OPENAI_API_KEY',
        source: 'inline',
        present: true,
        maskedValue: 'sk-c***56',
      },
    ])
    expect(geminiProfile?.validation?.secretReferences).toEqual([
      {
        key: 'GEMINI_API_KEY',
        source: 'env',
        present: true,
        maskedValue: 'gm-l***56',
      },
    ])
  })

  it('export --json --include-secrets 显式保留 inline secret 明文', async () => {
    const result = await runCli(['export', '--json', '--include-secrets'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)

    const claudeProfile = payload.data?.profiles.find((item: any) => item.profile.id === 'claude-prod')
    const codexProfile = payload.data?.profiles.find((item: any) => item.profile.id === 'codex-prod')
    const geminiProfile = payload.data?.profiles.find((item: any) => item.profile.id === 'gemini-prod')

    expect(claudeProfile?.profile.source?.token).toBe('sk-live-123456')
    expect(codexProfile?.profile.source?.apiKey).toBe('sk-codex-live-123456')
    expect(geminiProfile?.profile.source?.apiKey).toBe('gm-live-123456')
    expect(payload.data?.summary.secretExportPolicy).toEqual({
      mode: 'include-secrets',
      inlineSecretsExported: 6,
      inlineSecretsRedacted: 0,
      referenceSecretsPreserved: 0,
      profilesWithRedactedSecrets: 0,
    })
    expect(geminiProfile?.secretExportSummary).toEqual({
      hasInlineSecrets: true,
      hasRedactedInlineSecrets: false,
      hasReferenceSecrets: false,
      redactedFieldCount: 0,
      preservedReferenceCount: 0,
      details: [
        { field: 'source.apiKey', kind: 'inline-secret-exported' },
        { field: 'apply.GEMINI_API_KEY', kind: 'inline-secret-exported' },
      ],
    })
  })
})
