import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProfilesStore } from '../../src/stores/profiles.store'
import { StateStore } from '../../src/stores/state.store'
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

describe('cli preview/use/rollback integration', () => {
  it('preview --json 输出 Codex 结构化预览结果与 warnings', async () => {
    const result = await runCli(['preview', 'codex-prod', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      risk: {
        allowed: boolean
        riskLevel: string
        reasons: string[]
        limitations: string[]
      }
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
      preview: {
        riskLevel: string
        requiresConfirmation: boolean
        backupPlanned: boolean
        noChanges?: boolean
        diffSummary: Array<{ path: string; changedKeys: string[]; managedKeys?: string[]; preservedKeys?: string[] }>
        managedBoundaries?: Array<{ type: string; target?: string; managedKeys: string[]; preservedKeys?: string[]; notes?: string[] }>
        secretReferences?: Array<{ key: string; source: string; present: boolean; maskedValue: string }>
        limitations?: Array<{ code: string; message: string }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.schemaVersion).toBe('2026-04-15.public-json.v1')
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('preview')
    expect(payload.data?.profile.id).toBe('codex-prod')
    expect(payload.data?.risk).toEqual(expect.objectContaining({
      allowed: false,
      riskLevel: 'medium',
    }))
    expect(payload.data?.summary).toEqual(expect.objectContaining({
      platformStats: expect.arrayContaining([
        expect.objectContaining({
          platform: 'codex',
          profileCount: 1,
          profileId: 'codex-prod',
          warningCount: payload.data?.risk.reasons.length ?? 0,
          limitationCount: payload.data?.risk.limitations.length ?? 0,
          changedFileCount: 2,
          backupCreated: true,
          noChanges: false,
        }),
      ]),
      referenceStats: expect.objectContaining({
        profileCount: 1,
        referenceProfileCount: 0,
        inlineProfileCount: 1,
        writeUnsupportedProfileCount: 0,
        hasReferenceProfiles: false,
        hasInlineProfiles: true,
        hasWriteUnsupportedProfiles: false,
      }),
      executabilityStats: expect.objectContaining({
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
      }),
      warnings: payload.data?.risk.reasons ?? [],
      limitations: payload.data?.risk.limitations ?? [],
    }))
    expect(payload.data?.risk.reasons).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(payload.data?.risk.reasons).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(payload.data?.risk.reasons).toContain('Codex 将修改多个目标文件。')
    expect(payload.data?.risk.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.data?.preview.riskLevel).toBe('medium')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.diffSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: context.codexConfigPath,
        changedKeys: ['base_url'],
        managedKeys: ['base_url'],
        preservedKeys: ['default_provider'],
      }),
      expect.objectContaining({
        path: context.codexAuthPath,
        changedKeys: ['OPENAI_API_KEY'],
        managedKeys: ['OPENAI_API_KEY'],
        preservedKeys: ['user_id'],
      }),
    ]))
    expect(payload.data?.preview.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'multi-file-transaction',
        managedKeys: ['base_url', 'OPENAI_API_KEY'],
      }),
      expect.objectContaining({
        target: context.codexConfigPath,
        managedKeys: ['base_url'],
        preservedKeys: ['default_provider'],
      }),
      expect.objectContaining({
        target: context.codexAuthPath,
        managedKeys: ['OPENAI_API_KEY'],
        preservedKeys: ['user_id'],
      }),
    ]))
    expect(payload.data?.preview.secretReferences).toEqual([
      {
        key: 'OPENAI_API_KEY',
        source: 'inline',
        present: true,
        maskedValue: 'sk-c***56',
      },
    ])
    expect(payload.data?.preview.limitations?.map((item) => item.message)).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.warnings).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(payload.warnings).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(payload.warnings).toContain('Codex 将修改多个目标文件。')
  })

  it('preview --json 对 blocking reference profile 返回成功态观测结果，并暴露 blocking reference 决策', async () => {
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

    const result = await runCli(['preview', 'codex-ref', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('preview')
    expect(payload.error).toBeUndefined()
    expect(payload.data).toEqual(expect.objectContaining({
      referenceReadiness: {
        level: 'blocked',
        primaryReason: 'REFERENCE_SCHEME_UNSUPPORTED',
        canProceedToUse: false,
        requiresForce: false,
        nextAction: 'fix-reference-before-write',
        summary: '当前 reference 暂不受支持，进入 use 前需要先修复引用。',
      },
      referenceDecision: {
        writeDecision: 'reference-blocked',
        writeStrategy: 'blocked',
        requiresForce: false,
        blocking: true,
        reasonCodes: ['REFERENCE_SCHEME_UNSUPPORTED'],
      },
      risk: expect.objectContaining({
        allowed: false,
        reasons: expect.arrayContaining([
          '当前 reference 已被治理策略阻断，preview 仅提供只读观测结果。',
        ]),
        limitations: expect.arrayContaining([
          '当前 secret reference 仍不能进入 use/import apply 写入流程。',
        ]),
      }),
      referenceGovernance: expect.objectContaining({
        hasReferenceProfiles: true,
        hasInlineProfiles: false,
        hasWriteUnsupportedProfiles: true,
        primaryReason: 'REFERENCE_MISSING',
        reasonCodes: ['REFERENCE_MISSING'],
        referenceDetails: expect.arrayContaining([
          expect.objectContaining({
            code: 'REFERENCE_SCHEME_UNSUPPORTED',
            field: 'source.secret_ref',
            status: 'unsupported-scheme',
            reference: 'vault://codex/prod',
            scheme: 'vault',
          }),
          expect.objectContaining({
            code: 'REFERENCE_SCHEME_UNSUPPORTED',
            field: 'apply.auth_reference',
            status: 'unsupported-scheme',
            reference: 'vault://codex/prod',
            scheme: 'vault',
          }),
        ]),
      }),
      scopeCapabilities: [],
    }))
  })

  it('preview --json 对 resolved env auth_reference 在写入前返回 CONFIRMATION_REQUIRED，并暴露 referenceDecision', async () => {
    const profilesStore = new ProfilesStore()
    const existing = await profilesStore.read()
    await profilesStore.write({
      ...existing,
      profiles: [
        ...existing.profiles,
        {
          id: 'codex-preview-reference-confirm',
          name: 'codex-preview-reference-confirm',
          platform: 'codex',
          source: {},
          apply: {
            auth_reference: 'env://API_SWITCHER_CODEX_PREVIEW_SECRET',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
      ],
    })

    const result = await runCli(['preview', 'codex-preview-reference-confirm', '--json'], {
      API_SWITCHER_CODEX_PREVIEW_SECRET: 'sk-preview-ref-123456',
    })
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('preview')
    expect(payload.error?.code).toBe('CONFIRMATION_REQUIRED')
    expect(payload.error?.details).toEqual(expect.objectContaining({
      referenceReadiness: {
        level: 'fallback-ready',
        primaryReason: 'REFERENCE_INLINE_FALLBACK_REQUIRED',
        canProceedToUse: true,
        requiresForce: true,
        nextAction: 'confirm-before-write',
        summary: '当前 reference 仅支持明文 fallback 写入；继续前需要显式确认。',
      },
      referenceDecision: {
        writeDecision: 'inline-fallback-write',
        writeStrategy: 'inline-fallback-only',
        requiresForce: true,
        blocking: false,
        reasonCodes: ['REFERENCE_INLINE_FALLBACK_REQUIRED'],
      },
      referenceGovernance: expect.objectContaining({
        hasReferenceProfiles: true,
        hasInlineProfiles: false,
      }),
      risk: expect.objectContaining({
        allowed: false,
        limitations: expect.arrayContaining([
          '如继续执行，将以明文写入目标配置文件。',
        ]),
      }),
    }))
  })

  it('preview 文本在 blocking reference 下输出 reference 解析摘要', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'codex-preview-reference-blocked-text',
          name: 'codex-preview-reference-blocked-text',
          platform: 'codex',
          source: {
            secret_ref: 'vault://codex/prod',
          },
          apply: {
            auth_reference: 'vault://codex/prod',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
      ],
    })

    const result = await runCli(['preview', 'codex-preview-reference-blocked-text'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[preview] 成功')
    expect(result.stdout).toContain('reference 解析摘要:')
    expect(result.stdout).toContain('  - 不支持的引用 scheme:')
    expect(result.stdout).toContain('    - source.secret_ref -> vault://codex/prod')
    expect(result.stdout).toContain('    - apply.auth_reference -> vault://codex/prod')
    expect(result.stdout).toContain('  - 当前 secret reference 仍不能进入 use/import apply 写入流程。')
  })

  it('use --json 在 --force 下返回 Codex 结构化执行结果并写入 state', async () => {
    const result = await runCli(['use', 'codex-prod', '--force', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      backupId?: string
      platformSummary?: {
        kind: string
        precedence?: string[]
        currentScope?: string
        composedFiles?: string[]
        facts: Array<{ code: string; message: string }>
      }
      risk: {
        allowed: boolean
        riskLevel: string
        reasons: string[]
        limitations: string[]
      }
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          targetScope?: string
          warningCount: number
          limitationCount: number
          restoredFileCount?: number
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
      changedFiles: string[]
      preview?: {
        managedBoundaries?: Array<{ type: string; target?: string; managedKeys: string[]; preservedKeys?: string[] }>
        secretReferences?: Array<{ key: string; source: string; present: boolean; maskedValue: string }>
        limitations?: Array<{ code: string; message: string }>
        warnings?: Array<{ code: string; message: string }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('use')
    expect(payload.data?.profile.id).toBe('codex-prod')
    expect(payload.data?.backupId).toMatch(/^snapshot-codex-/)
    expect(payload.data?.risk).toEqual(expect.objectContaining({
      allowed: true,
      riskLevel: 'medium',
    }))
    expect(payload.data?.summary).toEqual(expect.objectContaining({
      platformStats: expect.arrayContaining([
        expect.objectContaining({
          platform: 'codex',
          profileCount: 1,
          profileId: 'codex-prod',
          warningCount: payload.data?.risk.reasons.length ?? 0,
          limitationCount: payload.data?.risk.limitations.length ?? 0,
          changedFileCount: 2,
          backupCreated: true,
          noChanges: false,
        }),
      ]),
      referenceStats: expect.objectContaining({
        profileCount: 1,
        referenceProfileCount: 0,
        inlineProfileCount: 1,
        writeUnsupportedProfileCount: 0,
      }),
      executabilityStats: expect.objectContaining({
        profileCount: 1,
        inlineReadyProfileCount: 1,
        referenceReadyProfileCount: 0,
        referenceMissingProfileCount: 0,
        writeUnsupportedProfileCount: 0,
        sourceRedactedProfileCount: 0,
      }),
      warnings: payload.data?.risk.reasons ?? [],
      limitations: payload.data?.risk.limitations ?? [],
    }))
    expect(payload.data?.risk.reasons).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(payload.data?.risk.reasons).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(payload.data?.risk.reasons).toContain('Codex 将修改多个目标文件。')
    expect(payload.data?.risk.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.data?.platformSummary).toEqual({
      kind: 'multi-file-composition',
      composedFiles: [context.codexConfigPath, context.codexAuthPath],
      facts: [
        { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
        { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
      ],
    })
    expect(payload.data?.changedFiles).toEqual([context.codexConfigPath, context.codexAuthPath])
    expect(payload.data?.preview?.managedBoundaries?.some((item) => item.type === 'multi-file-transaction')).toBe(true)
    expect(payload.data?.preview?.secretReferences).toEqual([
      {
        key: 'OPENAI_API_KEY',
        source: 'inline',
        present: true,
        maskedValue: 'sk-c***56',
      },
    ])
    expect(payload.data?.preview?.limitations?.map((item) => item.message)).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.data?.preview?.warnings?.some((item) => item.code === 'multi-file-overwrite')).toBe(true)
    expect(payload.warnings).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(payload.warnings).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(payload.warnings).toContain('Codex 将修改多个目标文件。')
    expect(payload.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')

    const state = await new StateStore().read()
    expect(state.current.codex).toBe('codex-prod')
  })

  it('use --dry-run --json 会执行写入前检查但不写入 Codex 双文件目标', async () => {
    const configBefore = await fs.readFile(context.codexConfigPath, 'utf8')
    const authBefore = await fs.readFile(context.codexAuthPath, 'utf8')
    const result = await runCli(['use', 'codex-prod', '--force', '--dry-run', '--json'])
    const payload = parseJsonResult<{
      dryRun: boolean
      backupId?: string
      changedFiles: string[]
      noChanges: boolean
      preview: {
        noChanges: boolean
        diffSummary: Array<{ path: string; hasChanges: boolean }>
      }
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
    expect(payload.action).toBe('use')
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

  it('use --json 无 --force 时返回失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['use', 'gemini-prod', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('use')
    expect(payload.error?.code).toBe('CONFIRMATION_REQUIRED')
    expect(payload.error?.message).toBe('当前切换需要确认或 --force。')
    expect(payload.error?.details).toMatchObject({
      referenceGovernance: {
        hasReferenceProfiles: false,
        hasInlineProfiles: true,
        hasWriteUnsupportedProfiles: false,
        primaryReason: 'INLINE_SECRET_PRESENT',
        reasonCodes: ['INLINE_SECRET_PRESENT'],
      },
      risk: expect.objectContaining({
        allowed: false,
      }),
      scopeCapabilities: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          use: true,
          rollback: true,
          writable: true,
          risk: 'high',
          confirmationRequired: true,
        }),
        expect.objectContaining({
          scope: 'system-overrides',
          use: false,
          rollback: false,
          writable: false,
        }),
      ]),
      scopePolicy: expect.objectContaining({
        resolvedScope: 'user',
        defaultScope: 'user',
        explicitScope: false,
        highRisk: false,
        rollbackScopeMatchRequired: true,
      }),
    })
    expect(payload.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('use 文本失败时输出 explainable 摘要', async () => {
    const result = await runCli(['use', 'gemini-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[use] 失败')
    expect(result.stdout).toContain('当前切换需要确认或 --force。')
    expect(result.stdout).toContain('作用域策略:')
    expect(result.stdout).toContain('  - 默认目标: user scope')
    expect(result.stdout).toContain('  - 显式指定: 否')
    expect(result.stdout).toContain('  - 实际目标: user scope')
    expect(result.stdout).toContain('  - 高风险: 否')
    expect(result.stdout).toContain('  - 回滚约束: 必须匹配快照 scope')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('use 文本失败时输出 reference 解析摘要', async () => {
    const profilesStore = new ProfilesStore()
    const existing = await profilesStore.read()
    await profilesStore.write({
      ...existing,
      profiles: [
        ...existing.profiles,
        {
          id: 'claude-reference-local',
          name: 'claude-reference-local',
          platform: 'claude',
          source: { secret_ref: 'env://API_SWITCHER_MISSING_SECRET' },
          apply: {
            auth_reference: 'vault://claude/prod',
            secondary_auth_reference: 'env://API_SWITCHER_TEST_SECRET',
          },
        },
      ],
    })

    const result = await runCli(['use', 'claude-reference-local', '--scope', 'local'], {
      API_SWITCHER_TEST_SECRET: 'sk-live-123456',
    })

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain('[use] 失败')
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

  it('use --json 对 resolved env auth_reference 在未 --force 时返回 CONFIRMATION_REQUIRED，并暴露 referenceDecision', async () => {
    const profilesStore = new ProfilesStore()
    const existing = await profilesStore.read()
    await profilesStore.write({
      ...existing,
      profiles: [
        ...existing.profiles,
        {
          id: 'gemini-use-reference-confirm',
          name: 'gemini-use-reference-confirm',
          platform: 'gemini',
          source: { secret_ref: 'env://API_SWITCHER_GEMINI_USE_SECRET', authType: 'gemini-api-key' },
          apply: {
            auth_reference: 'env://API_SWITCHER_GEMINI_USE_SECRET',
            enforcedAuthType: 'gemini-api-key',
          },
        },
      ],
    })

    const result = await runCli(['use', 'gemini-use-reference-confirm', '--json'], {
      API_SWITCHER_GEMINI_USE_SECRET: 'gm-use-ref-confirm-123456',
    })
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('use')
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

  it('use --json 对 unresolved env auth_reference 会直接返回 USE_FAILED，并暴露 blocking referenceDecision', async () => {
    const profilesStore = new ProfilesStore()
    const existing = await profilesStore.read()
    await profilesStore.write({
      ...existing,
      profiles: [
        ...existing.profiles,
        {
          id: 'gemini-use-reference-blocked',
          name: 'gemini-use-reference-blocked',
          platform: 'gemini',
          source: { secret_ref: 'env://API_SWITCHER_GEMINI_USE_MISSING_SECRET', authType: 'gemini-api-key' },
          apply: {
            auth_reference: 'env://API_SWITCHER_GEMINI_USE_MISSING_SECRET',
            enforcedAuthType: 'gemini-api-key',
          },
        },
      ],
    })

    const result = await runCli(['use', 'gemini-use-reference-blocked', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('use')
    expect(payload.error?.code).toBe('USE_FAILED')
    expect(payload.error?.message).toBe('当前 secret reference 无法进入 use 写入流程。')
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
            reference: 'env://API_SWITCHER_GEMINI_USE_MISSING_SECRET',
          }),
          expect.objectContaining({
            code: 'REFERENCE_ENV_UNRESOLVED',
            field: 'apply.auth_reference',
            status: 'unresolved',
            reference: 'env://API_SWITCHER_GEMINI_USE_MISSING_SECRET',
          }),
        ]),
      }),
    }))
  })

  it('rollback --json 输出 Codex 结构化恢复结果并更新 state', async () => {
    const useResult = await runCli(['use', 'codex-prod', '--force', '--json'])
    const usePayload = parseJsonResult<{ backupId?: string }>(useResult.stdout)
    expect(usePayload.data?.backupId).toBeTruthy()

    await fs.writeFile(context.codexConfigPath, 'default_provider = "other"\n', 'utf8')
    await fs.writeFile(context.codexAuthPath, JSON.stringify({ OPENAI_API_KEY: 'sk-other' }, null, 2), 'utf8')
    const result = await runCli(['rollback', usePayload.data!.backupId!, '--json'])
    const payload = parseJsonResult<{
      backupId: string
      restoredFiles: string[]
      platformSummary?: {
        kind: string
        precedence?: string[]
        currentScope?: string
        composedFiles?: string[]
        facts: Array<{ code: string; message: string }>
      }
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
      rollback?: {
        targetFiles?: Array<{ path: string; managedKeys?: string[]; role?: string }>
        managedBoundaries?: Array<{ type: string; target?: string; managedKeys: string[]; preservedKeys?: string[] }>
        warnings?: Array<{ code: string; message: string }>
        limitations?: Array<{ code: string; message: string }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('rollback')
    expect(payload.data?.backupId).toBe(usePayload.data?.backupId)
    expect(payload.data?.summary.warnings).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(payload.data?.summary.warnings).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(payload.data?.summary.warnings).toContain('Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(payload.data?.summary.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'codex',
        profileCount: 1,
        warningCount: payload.data?.summary.warnings.length ?? 0,
        limitationCount: 1,
        restoredFileCount: 2,
        noChanges: false,
      }),
    ]))
    expect(payload.data?.summary.referenceStats).toMatchObject({
      profileCount: 1,
      referenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
    })
    expect(payload.data?.summary.executabilityStats).toMatchObject({
      profileCount: 1,
      inlineReadyProfileCount: 1,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
    })
    expect(payload.data?.platformSummary).toEqual({
      kind: 'multi-file-composition',
      composedFiles: [context.codexConfigPath, context.codexAuthPath],
      facts: [
        { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
        { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
      ],
    })
    expect(payload.data?.restoredFiles).toEqual([context.codexConfigPath, context.codexAuthPath])
    expect(payload.data?.rollback?.targetFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: context.codexConfigPath,
        managedKeys: ['base_url'],
        role: 'config',
      }),
      expect.objectContaining({
        path: context.codexAuthPath,
        managedKeys: ['OPENAI_API_KEY'],
        role: 'auth',
      }),
    ]))
    expect(payload.data?.rollback?.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'multi-file-transaction',
        managedKeys: ['base_url', 'OPENAI_API_KEY'],
      }),
      expect.objectContaining({
        target: context.codexConfigPath,
        preservedKeys: ['default_provider'],
      }),
      expect.objectContaining({
        target: context.codexAuthPath,
        preservedKeys: ['user_id'],
      }),
    ]))
    expect(payload.data?.rollback?.warnings?.some((item) => item.message.includes('default_provider'))).toBe(true)
    expect(payload.data?.rollback?.warnings?.some((item) => item.message.includes('user_id'))).toBe(true)
    expect(payload.data?.rollback?.warnings?.some((item) => item.message.includes('config.toml 与 auth.json'))).toBe(true)
    expect(payload.data?.rollback?.limitations?.map((item) => item.message)).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.warnings).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(payload.warnings).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(payload.warnings).toContain('Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(payload.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')

    const state = await new StateStore().read()
    expect(state.current.codex).toBeUndefined()
    expect(state.lastSwitch?.status).toBe('rolled-back')
  })

  it('preview --json selector 不存在时返回失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['preview', 'missing-profile', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('preview')
    expect(payload.error?.code).toBe('PROFILE_NOT_FOUND')
    expect(payload.error?.message).toBe('未找到配置档：missing-profile')
  })

  it('preview 文本输出底层 settings 读取异常的失败结果', async () => {
    await fs.rm(context.geminiSettingsPath, { force: true, recursive: true })
    await fs.mkdir(context.geminiSettingsPath, { recursive: true })

    const result = await runCli(['preview', 'gemini-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain('[preview] 失败')
    expect(result.stdout).toContain('EISDIR')
  })

  it('preview --json 底层 settings 读取异常时返回失败对象并设置 exitCode 1', async () => {
    await fs.rm(context.geminiSettingsPath, { force: true, recursive: true })
    await fs.mkdir(context.geminiSettingsPath, { recursive: true })

    const result = await runCli(['preview', 'gemini-prod', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('preview')
    expect(payload.error?.code).toBe('PREVIEW_FAILED')
    expect(payload.error?.message).toContain('EISDIR')
  })

  it('use --json selector 不存在时返回失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['use', 'missing-profile', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('use')
    expect(payload.error?.code).toBe('PROFILE_NOT_FOUND')
    expect(payload.error?.message).toBe('未找到配置档：missing-profile')
  })

  it('use --json 底层 settings 读取异常时返回失败对象并设置 exitCode 1', async () => {
    await fs.rm(context.geminiSettingsPath, { force: true, recursive: true })
    await fs.mkdir(context.geminiSettingsPath, { recursive: true })

    const result = await runCli(['use', 'gemini-prod', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('use')
    expect(payload.error?.code).toBe('USE_FAILED')
    expect(payload.error?.message).toContain('EISDIR')
  })

  it('use --json 校验失败时返回 explainable 失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['use', 'gemini-invalid', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('use')
    expect(payload.error?.code).toBe('VALIDATION_FAILED')
    expect(payload.error?.message).toBe('配置校验失败')
    expect(payload.warnings).toContain('Gemini 首版仅稳定支持 enforcedAuthType = gemini-api-key。')
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('use 校验失败时文本输出 explainable 失败结果', async () => {
    const result = await runCli(['use', 'gemini-invalid'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[use] 失败')
    expect(result.stdout).toContain('配置校验失败')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - Gemini 首版仅稳定支持 enforcedAuthType = gemini-api-key。')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('rollback --json 无快照时返回失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['rollback', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('rollback')
    expect(payload.error?.code).toBe('BACKUP_NOT_FOUND')
    expect(payload.error?.message).toBe('没有可回滚的快照。')
  })

  it('rollback --json 非法 backupId 时返回失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['rollback', 'invalid-backup-id', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('rollback')
    expect(payload.error?.code).toBe('INVALID_BACKUP_ID')
    expect(payload.error?.message).toBe('无法从 backupId 推断平台：invalid-backup-id')
  })

  it('rollback 文本输出底层 manifest 读取异常的失败结果', async () => {
    const useResult = await runCli(['use', 'codex-prod', '--force', '--json'])
    const usePayload = parseJsonResult<{ backupId?: string }>(useResult.stdout)

    expect(usePayload.data?.backupId).toBeTruthy()

    const manifestPath = path.join(context.runtimeDir, 'backups', 'codex', usePayload.data!.backupId!, 'manifest.json')
    await fs.rm(manifestPath, { force: true, recursive: true })
    await fs.mkdir(manifestPath, { recursive: true })

    const result = await runCli(['rollback', usePayload.data!.backupId!])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain('[rollback] 失败')
    expect(result.stdout).toContain('EISDIR')
  })

  it('rollback --json 底层 manifest 读取异常时返回失败对象并设置 exitCode 1', async () => {
    const useResult = await runCli(['use', 'codex-prod', '--force', '--json'])
    const usePayload = parseJsonResult<{ backupId?: string }>(useResult.stdout)

    expect(usePayload.data?.backupId).toBeTruthy()

    const manifestPath = path.join(context.runtimeDir, 'backups', 'codex', usePayload.data!.backupId!, 'manifest.json')
    await fs.rm(manifestPath, { force: true, recursive: true })
    await fs.mkdir(manifestPath, { recursive: true })

    const result = await runCli(['rollback', usePayload.data!.backupId!, '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('rollback')
    expect(payload.error?.code).toBe('ROLLBACK_FAILED')
    expect(payload.error?.message).toContain('EISDIR')
  })

  it('preview --scope project 返回 Gemini project 目标与 scope policy', async () => {
    const result = await runCli(['preview', 'gemini-prod', '--scope', 'project', '--json'])
    const payload = parseJsonResult<{
      scopePolicy?: {
        requestedScope?: string
        resolvedScope?: string
        defaultScope?: string
        explicitScope: boolean
        highRisk: boolean
        riskWarning?: string
        rollbackScopeMatchRequired: boolean
      }
      scopeCapabilities?: ScopeCapabilityContract[]
      preview: {
        targetFiles: Array<{ path: string; scope?: string }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('preview')
    expect(payload.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: context.geminiProjectSettingsPath,
        scope: 'project',
      }),
    ])
    expect(payload.data?.scopePolicy).toEqual({
      requestedScope: 'project',
      resolvedScope: 'project',
      defaultScope: 'user',
      explicitScope: true,
      highRisk: true,
      riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
      rollbackScopeMatchRequired: true,
    })
    expect(payload.data?.scopeCapabilities).toEqual([
      expect.objectContaining({
        scope: 'system-defaults',
        detect: true,
        preview: true,
        use: false,
        rollback: false,
        writable: false,
        risk: 'normal',
        confirmationRequired: false,
      }),
      expect.objectContaining({
        scope: 'user',
        detect: true,
        preview: true,
        use: true,
        rollback: true,
        writable: true,
        risk: 'normal',
        confirmationRequired: false,
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
        risk: 'normal',
        confirmationRequired: false,
      }),
    ])
  })

  it('preview 输出风险、explainable 细节与附加提示', async () => {
    const result = await runCli(['preview', 'gemini-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[preview] 成功')
    expect(result.stdout).toContain('- 配置: gemini-prod (gemini)')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  作用域说明:')
    expect(result.stdout).toContain('  - 生效优先级: system-defaults < user < project < system-overrides')
    expect(result.stdout).toContain('  - 预览视角: 先按四层 precedence 推导 current/effective，再评估本次写入')
    expect(result.stdout).toContain('  - 本次写入目标: user scope')
    expect(result.stdout).toContain('  - 覆盖提醒: 如果 project 或 system-overrides 存在同名字段，user 写入后仍可能不会成为最终生效值')
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - enforcedAuthType: oauth-personal (scope=user, source=stored)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=effective)')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: gm-l***56 (scope=user, source=effective, secret)')
    expect(result.stdout).toContain('    覆盖说明:')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: 最终生效的 API key 取决于环境变量，而不是 settings.json。')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${context.geminiSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: enforcedAuthType')
    expect(result.stdout).toContain('    保留字段: ui')
    expect(result.stdout).toContain('    说明: Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY: gm-l***56 (source=inline, present=yes)')
    expect(result.stdout).toContain('  变更摘要:')
    expect(result.stdout).toContain('附加提示:')
  })

  it('preview --scope project 在 project scope 无法解析时返回 availability 结构化失败', async () => {
    const result = await runCli(['preview', 'gemini-prod', '--scope', 'project', '--json'], {
      API_SWITCHER_GEMINI_PROJECT_ROOT: path.join(context.runtimeDir, 'missing-project-root'),
    })
    const payload = parseJsonResult<{
      requestedScope?: string
      scopeAvailability?: ScopeCapabilityContract[]
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(payload.ok).toBe(false)
    expect(payload.error?.code).toBe('PREVIEW_FAILED')
    expect(payload.error?.details).toEqual(expect.objectContaining({
      requestedScope: 'project',
      scopeAvailability: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          status: 'unresolved',
          reasonCode: 'PROJECT_ROOT_UNRESOLVED',
        }),
      ]),
    }))
  })

  it('preview --scope project 文本失败时输出 project root 修复建议，而不是提示 --force', async () => {
    const result = await runCli(['preview', 'gemini-prod', '--scope', 'project'], {
      API_SWITCHER_GEMINI_PROJECT_ROOT: path.join(context.runtimeDir, 'missing-project-root'),
    })

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain('[preview] 失败')
    expect(result.stdout).toContain('当前无法解析 Gemini project scope 的 project root。')
    expect(result.stdout).toContain('作用域策略:')
    expect(result.stdout).toContain('作用域可用性:')
    expect(result.stdout).toContain('  - project: status=unresolved, detected=no, writable=no')
    expect(result.stdout).toContain('    原因代码: PROJECT_ROOT_UNRESOLVED')
    expect(result.stdout).toContain('    建议: 请在项目目录中运行，或显式提供 API_SWITCHER_GEMINI_PROJECT_ROOT。')
    expect(result.stdout).not.toContain('当前切换需要确认或 --force。')
  })

  it('preview --scope project 文本输出明确 project 覆盖 user 且仍可能被 system-overrides 覆盖', async () => {
    const result = await runCli(['preview', 'gemini-prod', '--scope', 'project'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[preview] 成功')
    expect(result.stdout).toContain('  风险等级: high')
    expect(result.stdout).toContain('  - 本次写入目标: project scope')
    expect(result.stdout).toContain('  - 覆盖关系: project scope 高于 user scope，会覆盖 user 中的同名字段')
    expect(result.stdout).toContain('  - 覆盖提醒: system-overrides 仍高于 project，存在同名字段时 project 写入后仍可能不会成为最终生效值')
    expect(result.stdout).toContain(`  - ${context.geminiProjectSettingsPath}`)
    expect(result.stdout).toContain('Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。')
  })

  it('Gemini 非法 --scope 会返回明确 INVALID_SCOPE 失败', async () => {
    const result = await runCli(['preview', 'gemini-prod', '--scope', 'system-overrides', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('preview')
    expect(payload.error?.code).toBe('INVALID_SCOPE')
    expect(payload.error?.message).toBe('Gemini 当前仅支持写入 user/project scope；system-defaults/system-overrides 仅用于检测。收到：system-overrides')
  })

  it('preview 输出 Claude scope-aware explainable 摘要', async () => {
    const result = await runCli(['preview', 'claude-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[preview] 成功')
    expect(result.stdout).toContain('- 配置: claude-prod (claude)')
    expect(result.stdout).toContain('  校验结果: 通过')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')
    expect(result.stdout).toContain('  计划备份: 是')
    expect(result.stdout).toContain('  无变更: 否')
    expect(result.stdout).toContain('  作用域说明:')
    expect(result.stdout).toContain('  - 生效优先级: user < project < local')
    expect(result.stdout).toContain('  - 预览视角: 先按 Claude 多层 scope 合并 current/effective，再评估本次写入')
    expect(result.stdout).toContain('  - 本次写入目标: project scope')
    expect(result.stdout).toContain('  - 覆盖关系: project scope 高于 user scope，但仍低于 local scope')
    expect(result.stdout).toContain('  - 覆盖提醒: 如果 local scope 存在同名字段，project 写入后仍可能不会成为最终生效值')
    expect(result.stdout).toContain('  目标文件:')
    expect(result.stdout).toContain(`  - ${context.claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-o***00 (scope=project, source=stored, secret)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-l***56 (scope=project, source=scope-project, secret)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${context.claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(result.stdout).toContain('    保留字段: theme')
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - ANTHROPIC_AUTH_TOKEN: sk-l***56 (source=inline, present=yes)')
    expect(result.stdout).toContain('  变更摘要:')
    expect(result.stdout).toContain(`  - ${context.claudeProjectSettingsPath}: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL`)
    expect(result.stdout).toContain('  警告: 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('  限制: 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Claude 配置存在非托管字段：theme')
  })

  it('preview --scope user 会覆盖 Claude 环境默认 scope', async () => {
    await fs.writeFile(
      context.claudeUserSettingsPath,
      JSON.stringify({ userTheme: 'light', ANTHROPIC_AUTH_TOKEN: 'sk-user-000', ANTHROPIC_BASE_URL: 'https://user.example.com/api' }, null, 2),
      'utf8',
    )

    const result = await runCli(['preview', 'claude-prod', '--scope', 'user'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain(`  - ${context.claudeUserSettingsPath}`)
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${context.claudeUserSettingsPath}`)
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 用户级配置文件。')
    expect(result.stdout).not.toContain(`  - 类型: scope-aware / 目标: ${context.claudeProjectSettingsPath}`)
  })

  it('use 在 --force 下输出 explainable 摘要并写入 state', async () => {
    const result = await runCli(['use', 'claude-prod', '--force'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[use] 成功')
    expect(result.stdout).toContain('- 配置: claude-prod (claude)')
    expect(result.stdout).toContain('  备份ID: snapshot-claude-')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.stdout).toContain('  已变更文件:')
    expect(result.stdout).toContain(`  - ${context.claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-o***00 (scope=project, source=stored, secret)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-l***56 (scope=project, source=scope-project, secret)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${context.claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(result.stdout).toContain('    保留字段: theme')
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - ANTHROPIC_AUTH_TOKEN: sk-l***56 (source=inline, present=yes)')

    const state = await new StateStore().read()
    expect(state.current.claude).toBe('claude-prod')
  })

  it('use 无 --force 时对需要确认的预览返回失败并设置 exitCode 1', async () => {
    const result = await runCli(['use', 'gemini-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[use] 失败')
    expect(result.stdout).toContain('当前切换需要确认或 --force。')
  })

  it('use 命中真实用户目录时即使低风险也会强制要求二次确认', async () => {
    const result = await runCli(['use', 'codex-prod', '--json'], {
      API_SWITCHER_CODEX_CONFIG_PATH: 'C:/Users/spsz0/.codex/config.toml',
      API_SWITCHER_CODEX_AUTH_PATH: 'C:/Users/spsz0/.codex/auth.json',
    })
    const payload = parseJsonResult<{
      risk?: {
        reasons: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('use')
    expect(payload.error?.code).toBe('CONFIRMATION_REQUIRED')
    const details = payload.error?.details as { risk?: { reasons: string[]; limitations: string[] } } | undefined
    expect(details?.risk?.reasons).toContain('当前写入目标命中真实用户目录；继续执行前请再次确认这不是开发态误写。')
    expect(details?.risk?.limitations).toContain('目标文件位于真实用户目录（例如 C:/Users/...）；如需继续，请显式使用 --force 并确认影响范围。')
  })

  it('use 输出 Codex 双文件 explainable 摘要并写入 state', async () => {
    const result = await runCli(['use', 'codex-prod', '--force'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[use] 成功')
    expect(result.stdout).toContain('- 配置: codex-prod (codex)')
    expect(result.stdout).toContain('  备份ID: snapshot-codex-')
    expect(result.stdout).toContain('  无变更: 否')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  计划备份: 是')
    expect(result.stdout).toContain('  已变更文件:')
    expect(result.stdout).toContain(`  - ${context.codexConfigPath}`)
    expect(result.stdout).toContain(`  - ${context.codexAuthPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - base_url: https://old.example.com/v1 (source=stored)')
    expect(result.stdout).toContain('    - OPENAI_API_KEY: sk-o***00 (source=stored, secret)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - base_url: https://gateway.example.com/openai/v1 (source=effective)')
    expect(result.stdout).toContain('    - OPENAI_API_KEY: sk-c***56 (source=effective, secret)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain('  - 类型: multi-file-transaction')
    expect(result.stdout).toContain('    托管字段: base_url, OPENAI_API_KEY')
    expect(result.stdout).toContain('    说明: Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${context.codexConfigPath}`)
    expect(result.stdout).toContain('    保留字段: default_provider')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${context.codexAuthPath}`)
    expect(result.stdout).toContain('    保留字段: user_id')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - OPENAI_API_KEY: sk-c***56 (source=inline, present=yes)')
    expect(result.stdout).toContain('  变更摘要:')
    expect(result.stdout).toContain(`  - ${context.codexConfigPath}: base_url`)
    expect(result.stdout).toContain(`  - ${context.codexAuthPath}: OPENAI_API_KEY`)
    expect(result.stdout).toContain('  警告: 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  警告: 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  警告: Codex 将修改多个目标文件。')
    expect(result.stdout).toContain('  限制: 当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  - 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  - Codex 将修改多个目标文件。')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前会同时托管 Codex 的 config.toml 与 auth.json。')

    const state = await new StateStore().read()
    expect(state.current.codex).toBe('codex-prod')
  })

  it('rollback 输出恢复文件并更新 state', async () => {
    const useResult = await runCli(['use', 'claude-prod', '--force'])
    const backupIdMatch = useResult.stdout.match(/备份ID: (snapshot-claude-[^\n]+)/)
    expect(backupIdMatch?.[1]).toBeTruthy()

    await fs.writeFile(context.claudeProjectSettingsPath, JSON.stringify({ theme: 'light' }, null, 2), 'utf8')
    const result = await runCli(['rollback', backupIdMatch![1]])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[rollback] 成功')
    expect(result.stdout).toContain(`- 备份ID: ${backupIdMatch![1]}`)
    expect(result.stdout).toContain('  已恢复文件:')
    expect(result.stdout).toContain(`  - ${context.claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${context.claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(result.stdout).toContain('    保留字段: theme')
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(result.stdout).toContain('  回滚警告: 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('  回滚限制: 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')

    const state = await new StateStore().read()
    expect(state.current.claude).toBeUndefined()
    expect(state.lastSwitch?.status).toBe('rolled-back')
  })

  it('rollback 输出 Codex 双文件恢复摘要并更新 state', async () => {
    const useResult = await runCli(['use', 'codex-prod', '--force'])
    const backupIdMatch = useResult.stdout.match(/备份ID: (snapshot-codex-[^\n]+)/)
    expect(backupIdMatch?.[1]).toBeTruthy()

    await fs.writeFile(context.codexConfigPath, 'default_provider = "other"\n', 'utf8')
    await fs.writeFile(context.codexAuthPath, JSON.stringify({ OPENAI_API_KEY: 'sk-other' }, null, 2), 'utf8')
    const result = await runCli(['rollback', backupIdMatch![1]])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[rollback] 成功')
    expect(result.stdout).toContain(`- 备份ID: ${backupIdMatch![1]}`)
    expect(result.stdout).toContain('  已恢复文件:')
    expect(result.stdout).toContain(`  - ${context.codexConfigPath}`)
    expect(result.stdout).toContain(`  - ${context.codexAuthPath}`)
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain('  - 类型: multi-file-transaction')
    expect(result.stdout).toContain('    托管字段: base_url, OPENAI_API_KEY')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${context.codexConfigPath}`)
    expect(result.stdout).toContain('    保留字段: default_provider')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${context.codexAuthPath}`)
    expect(result.stdout).toContain('    保留字段: user_id')
    expect(result.stdout).toContain('  回滚警告: 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  回滚警告: 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  回滚警告: Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(result.stdout).toContain('  回滚限制: 当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  - 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  - Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前会同时托管 Codex 的 config.toml 与 auth.json。')

    const state = await new StateStore().read()
    expect(state.current.codex).toBeUndefined()
    expect(state.lastSwitch?.status).toBe('rolled-back')
  })

  it('preview 校验失败时仍输出预览摘要并设置 exitCode 1', async () => {
    const result = await runCli(['preview', 'gemini-invalid'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[preview] 失败')
    expect(result.stdout).toContain('- 配置: gemini-invalid (gemini)')
    expect(result.stdout).toContain('  校验结果: 失败')
    expect(result.stdout).toContain('  错误: 缺少 GEMINI_API_KEY')
    expect(result.stdout).toContain('  限制: GEMINI_API_KEY 仍需通过环境变量生效。')
  })
})
