import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SnapshotService } from '../../src/services/snapshot.service'
import { SwitchService } from '../../src/services/switch.service'
import { SnapshotStore } from '../../src/stores/snapshot.store'
import { ProfilesStore } from '../../src/stores/profiles.store'

let runtimeDir: string
let settingsPath: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-switch-service-'))
  settingsPath = path.join(runtimeDir, 'settings.json')
  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
  process.env.API_SWITCHER_GEMINI_SETTINGS_PATH = settingsPath
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  delete process.env.API_SWITCHER_GEMINI_SETTINGS_PATH
  delete process.env.API_SWITCHER_GEMINI_PROJECT_ROOT
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('switch service', () => {
  it('selector 不存在时返回结构化失败结果', async () => {
    await new ProfilesStore().write({ version: 1, profiles: [] })

    const result = await new SwitchService().use('missing-profile')

    expect(result).toEqual({
      ok: false,
      action: 'use',
      error: {
        code: 'PROFILE_NOT_FOUND',
        message: '未找到配置档：missing-profile',
      },
    })
  })

  it('未注册平台适配器时返回结构化失败结果', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'openai-missing-adapter',
          name: 'openai-missing-adapter',
          platform: 'openai' as any,
          source: {},
          apply: {},
        },
      ],
    })

    const result = await new SwitchService().use('openai-missing-adapter')

    expect(result).toEqual({
      ok: false,
      action: 'use',
      error: {
        code: 'ADAPTER_NOT_REGISTERED',
        message: '未注册的平台适配器：openai',
      },
    })
  })

  it('显式 scope 会传给 validate，而不是只传给 preview/apply', async () => {
    const profile = {
      id: 'claude-local-scope',
      name: 'claude-local-scope',
      platform: 'claude' as const,
      source: { token: 'sk-live-123456' },
      apply: {
        ANTHROPIC_AUTH_TOKEN: 'sk-live-123456',
      },
    }
    const captured: { validate?: any; preview?: any; apply?: any } = {}

    const service = new SwitchService(
      {
        resolve: async () => profile,
      } as any,
      {
        get: () => ({
          validate: async (_profile: unknown, context?: unknown) => {
            captured.validate = context
            return {
              ok: true,
              errors: [],
              warnings: [],
              limitations: [],
            }
          },
          preview: async (_profile: unknown, context?: unknown) => {
            captured.preview = context
            return {
              platform: 'claude',
              profileId: profile.id,
              targetFiles: [
                {
                  path: 'E:\\WorkSpace\\.claude\\settings.local.json',
                  format: 'json',
                  exists: true,
                  managedScope: 'partial-fields',
                  scope: 'local',
                  role: 'settings',
                  managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
                },
              ],
              effectiveFields: [],
              storedOnlyFields: [],
              diffSummary: [
                {
                  path: 'E:\\WorkSpace\\.claude\\settings.local.json',
                  changedKeys: ['ANTHROPIC_AUTH_TOKEN'],
                  hasChanges: true,
                },
              ],
              warnings: [],
              limitations: [],
              riskLevel: 'low',
              requiresConfirmation: false,
              backupPlanned: true,
              noChanges: false,
            }
          },
          apply: async (_profile: unknown, context?: unknown) => {
            captured.apply = context
            return {
              ok: true,
              changedFiles: ['E:\\WorkSpace\\.claude\\settings.local.json'],
              noChanges: false,
              diffSummary: [
                {
                  path: 'E:\\WorkSpace\\.claude\\settings.local.json',
                  changedKeys: ['ANTHROPIC_AUTH_TOKEN'],
                  hasChanges: true,
                },
              ],
            }
          },
        }),
      } as any,
      {
        createBeforeApply: async () => ({
          backupId: 'snapshot-claude-20260418090000-abcdef',
          manifestPath: 'backups/claude/manifest.json',
          targetFiles: ['E:\\WorkSpace\\.claude\\settings.local.json'],
          warnings: [],
          limitations: [],
        }),
      } as any,
      {
        markCurrent: async () => undefined,
      } as any,
    )

    const result = await service.use('claude-local-scope', { scope: 'local', force: true })

    expect(result.ok).toBe(true)
    expect(captured.validate).toEqual({ targetScope: 'local' })
    expect(captured.preview).toEqual({ targetScope: 'local' })
    expect(captured.apply).toEqual({
      backupId: 'snapshot-claude-20260418090000-abcdef',
      targetScope: 'local',
    })
  })

  it('validation 失败时返回结构化失败结果，并带出 explainable warnings 与 limitations', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
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

    const result = await new SwitchService().use('gemini-invalid')

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      action: 'use',
      error: expect.objectContaining({
        code: 'VALIDATION_FAILED',
        message: '配置校验失败',
      }),
    }))
    expect(result.warnings).toEqual([
      'Gemini 首版仅稳定支持 enforcedAuthType = gemini-api-key。',
    ])
    expect(result.limitations).toEqual([
      'GEMINI_API_KEY 仍需通过环境变量生效。',
      '当前仅稳定托管 settings.json 中已确认字段 enforcedAuthType。',
      '官方文档当前未确认自定义 base URL 的稳定写入契约。',
    ])
  })

  it('需要确认但未 force 时返回 CONFIRMATION_REQUIRED', async () => {
    await fs.writeFile(settingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'gemini-confirm',
          name: 'gemini-confirm',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: {
            GEMINI_API_KEY: 'gm-live-123456',
            enforcedAuthType: 'gemini-api-key',
          },
        },
      ],
    })

    const result = await new SwitchService().use('gemini-confirm')

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      action: 'use',
      error: expect.objectContaining({
        code: 'CONFIRMATION_REQUIRED',
        message: '当前切换需要确认或 --force。',
      }),
    }))
    expect(result.error?.details).toEqual(expect.objectContaining({
      risk: expect.objectContaining({
        allowed: false,
        riskLevel: 'medium',
      }),
      scopeCapabilities: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          use: true,
          rollback: true,
          risk: 'high',
          confirmationRequired: true,
        }),
        expect.objectContaining({
          scope: 'system-overrides',
          use: false,
          rollback: false,
        }),
      ]),
      scopePolicy: expect.objectContaining({
        requestedScope: undefined,
        resolvedScope: 'user',
        defaultScope: 'user',
        explicitScope: false,
        highRisk: false,
        rollbackScopeMatchRequired: true,
      }),
      scopeAvailability: undefined,
      referenceGovernance: {
        hasReferenceProfiles: false,
        hasInlineProfiles: true,
        hasWriteUnsupportedProfiles: false,
        primaryReason: 'INLINE_SECRET_PRESENT',
        reasonCodes: ['INLINE_SECRET_PRESENT'],
      },
    }))
    expect(result.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(result.warnings).toContain('当前 Gemini settings.json 存在非托管字段：ui')
    expect(result.limitations).toEqual([
      'GEMINI_API_KEY 仍需通过环境变量生效。',
      '当前仅稳定托管 settings.json 中已确认字段 enforcedAuthType。',
      '官方文档当前未确认自定义 base URL 的稳定写入契约。',
    ])
  })

  it('project scope 不可用时先返回 availability 结构化失败，不进入 CONFIRMATION_REQUIRED', async () => {
    process.env.API_SWITCHER_GEMINI_PROJECT_ROOT = path.join(runtimeDir, 'missing-project-root')
    await fs.writeFile(settingsPath, JSON.stringify({ enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'gemini-project-unresolved',
          name: 'gemini-project-unresolved',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: {
            GEMINI_API_KEY: 'gm-live-123456',
            enforcedAuthType: 'gemini-api-key',
          },
        },
      ],
    })

    const result = await new SwitchService().use('gemini-project-unresolved', { scope: 'project' })

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('USE_FAILED')
    expect(result.error?.details).toEqual(expect.objectContaining({
      requestedScope: 'project',
      scopeAvailability: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          status: 'unresolved',
          reasonCode: 'PROJECT_ROOT_UNRESOLVED',
        }),
      ]),
    }))
    expect(result.error?.code).not.toBe('CONFIRMATION_REQUIRED')
  })

  it('apply 失败时返回 APPLY_FAILED，并透传 apply explainable 摘要', async () => {
    let markCurrentCalled = false
    const profile = {
      id: 'gemini-apply-fail',
      name: 'gemini-apply-fail',
      platform: 'gemini',
      source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
      apply: {
        GEMINI_API_KEY: 'gm-live-123456',
        enforcedAuthType: 'gemini-api-key',
      },
    }

    const service = new SwitchService(
      {
        resolve: async () => profile,
      } as any,
      {
        get: () => ({
          validate: async () => ({
            ok: true,
            errors: [],
            warnings: [],
            limitations: [],
          }),
          preview: async () => ({
            platform: 'gemini',
            profileId: profile.id,
            targetFiles: [],
            effectiveFields: [],
            storedOnlyFields: [],
            diffSummary: [
              {
                path: settingsPath,
                changedKeys: ['enforcedAuthType'],
                hasChanges: true,
              },
            ],
            warnings: [],
            limitations: [],
            riskLevel: 'low',
            requiresConfirmation: false,
            backupPlanned: true,
            noChanges: false,
          }),
          apply: async () => ({
            ok: false,
            changedFiles: [],
            noChanges: false,
            diffSummary: [],
            warnings: [
              {
                code: 'apply-warning-1',
                level: 'warning',
                message: 'apply warning',
              },
            ],
            limitations: [
              {
                code: 'apply-limitation-1',
                level: 'limitation',
                message: 'apply limitation',
              },
            ],
          }),
        }),
      } as any,
      {
        createBeforeApply: async () => ({
          backupId: 'snapshot-gemini-20260409123000-abcdef',
          manifestPath: 'backups/gemini/manifest.json',
          targetFiles: [settingsPath],
          warnings: [],
          limitations: [],
        }),
      } as any,
      {
        markCurrent: async () => {
          markCurrentCalled = true
        },
      } as any,
    )

    const result = await service.use('gemini-apply-fail', { force: true })

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      action: 'use',
      error: expect.objectContaining({
        code: 'APPLY_FAILED',
        message: '配置写入失败',
      }),
    }))
    expect(result.warnings).toEqual(['apply warning'])
    expect(result.limitations).toEqual(['apply limitation'])
    expect(markCurrentCalled).toBe(false)
  })

  it('dryRun 成功时 summary 与顶层 explainable 摘要保持一致', async () => {
    await fs.writeFile(settingsPath, JSON.stringify({ enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')
    await new ProfilesStore().write({
      version: 1,
      profiles: [
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
      ],
    })

    const result = await new SwitchService().use('gemini-prod', { dryRun: true, force: true })

    expect(result.ok).toBe(true)
    expect(result.action).toBe('use')
    expect(result.data?.summary).toEqual(expect.objectContaining({
      warnings: result.warnings ?? [],
      limitations: result.limitations ?? [],
    }))
    expect(result.data?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'user',
        use: true,
        rollback: true,
      }),
      expect.objectContaining({
        scope: 'system-defaults',
        use: false,
        rollback: false,
      }),
    ]))
    expect(result.data?.noChanges).toBe(true)
    expect(result.data?.changedFiles).toEqual([])
  })

  it('createBeforeApply 传入 provenance 时写入 snapshot manifest', async () => {
    await fs.writeFile(settingsPath, JSON.stringify({ enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const profile = {
      id: 'gemini-imported',
      name: 'gemini-imported',
      platform: 'gemini' as const,
      source: { authType: 'gemini-api-key' },
      apply: { enforcedAuthType: 'gemini-api-key' },
    }
    const snapshotService = new SnapshotService()

    const backup = await snapshotService.createBeforeApply({
      listTargets: async () => [],
    } as any, profile, {
      preview: {
        platform: 'gemini',
        profileId: profile.id,
        targetFiles: [
          {
            path: settingsPath,
            format: 'json',
            exists: true,
            managedScope: 'partial-fields',
            scope: 'user',
            role: 'settings',
            managedKeys: ['enforcedAuthType'],
          },
        ],
        effectiveFields: [],
        storedOnlyFields: [],
        diffSummary: [],
        warnings: [],
        limitations: [],
        riskLevel: 'low',
        requiresConfirmation: false,
        backupPlanned: true,
      },
      validation: {
        ok: true,
        errors: [],
        warnings: [],
        limitations: [],
      },
      requestedScope: undefined,
      provenance: {
        origin: 'import-apply',
        sourceFile: 'imports/gemini-prod.json',
        importedProfileId: 'gemini-prod',
      },
    })

    const manifest = await new SnapshotStore().readManifest('gemini', backup.backupId)

    expect(manifest.manifest.provenance).toEqual({
      origin: 'import-apply',
      sourceFile: 'imports/gemini-prod.json',
      importedProfileId: 'gemini-prod',
    })
  })
})
