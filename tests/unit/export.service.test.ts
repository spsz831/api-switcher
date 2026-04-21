import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ExportService } from '../../src/services/export.service'
import { ProfilesStore } from '../../src/stores/profiles.store'
import type { Profile } from '../../src/types/profile'

let runtimeDir: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-export-service-'))
  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('export service', () => {
  it('读取配置档失败时返回结构化失败结果', async () => {
    const result = await new ExportService(
      {
        list: async () => {
          throw new Error('profiles list failed')
        },
      } as any,
      {
        get: () => ({
          validate: async () => ({
            ok: true,
            errors: [],
            warnings: [],
            limitations: [],
          }),
        }),
      } as any,
    ).export()

    expect(result).toEqual({
      ok: false,
      action: 'export',
      error: {
        code: 'EXPORT_FAILED',
        message: 'profiles list failed',
      },
    })
  })

  it('适配器校验失败时返回结构化失败结果', async () => {
    const profile = {
      id: 'gemini-prod',
      name: 'gemini-prod',
      platform: 'gemini',
      source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
      apply: {
        GEMINI_API_KEY: 'gm-live-123456',
        enforcedAuthType: 'gemini-api-key',
      },
    }

    const result = await new ExportService(
      {
        list: async () => [profile],
      } as any,
      {
        get: () => ({
          validate: async () => {
            throw new Error('adapter validate failed')
          },
        }),
      } as any,
    ).export()

    expect(result).toEqual({
      ok: false,
      action: 'export',
      error: {
        code: 'EXPORT_FAILED',
        message: 'adapter validate failed',
      },
    })
  })

  it('未注册平台适配器时返回结构化失败结果', async () => {
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

    const result = await new ExportService().export()

    expect(result).toEqual({
      ok: false,
      action: 'export',
      error: {
        code: 'ADAPTER_NOT_REGISTERED',
        message: '未注册的平台适配器：openai',
      },
    })
  })

  it('成功导出时为每个 profile 注入平台 scope 能力矩阵', async () => {
    const profiles = [
      {
        id: 'claude-prod',
        name: 'claude-prod',
        platform: 'claude',
        source: { token: 'sk-live-123456' },
        apply: { ANTHROPIC_AUTH_TOKEN: 'sk-live-123456' },
      },
      {
        id: 'gemini-prod',
        name: 'gemini-prod',
        platform: 'gemini',
        source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
        apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
      },
    ]

    const result = await new ExportService(
      {
        list: async () => profiles,
      } as any,
      {
        get: (platform: string) => ({
          validate: async () => ({
            ok: true,
            errors: [],
            warnings: [],
            limitations: [],
          }),
          detectCurrent: async () => (platform === 'gemini'
            ? {
                platform: 'gemini',
                managed: true,
                matchedProfileId: 'gemini-prod',
                targetFiles: [],
                scopeAvailability: [
                  {
                    scope: 'user',
                    status: 'available',
                    detected: true,
                    writable: true,
                    path: 'C:/Users/test/.gemini/settings.json',
                  },
                  {
                    scope: 'project',
                    status: 'unresolved',
                    detected: false,
                    writable: false,
                    reasonCode: 'PROJECT_ROOT_UNRESOLVED',
                    reason: 'Gemini project root is unavailable.',
                    remediation: 'Set API_SWITCHER_GEMINI_PROJECT_ROOT.',
                  },
                ],
              }
            : null),
        }),
      } as any,
    ).export()

    expect(result.ok).toBe(true)
    expect(result.data?.profiles[0]).toMatchObject({
      profile: profiles[0],
      validation: {
        ok: true,
      },
    })
    expect(result.data?.profiles[0]?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'local', use: true, rollback: true, writable: true }),
    ]))
    expect(result.data?.profiles[0]?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['user', 'project', 'local'],
      facts: [
        { code: 'CLAUDE_SCOPE_PRECEDENCE', message: 'Claude 支持 user < project < local 三层 precedence。' },
        { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '如果存在 local，同名字段最终以 local 为准。' },
      ],
    })
    expect(result.data?.profiles[1]).toMatchObject({
      profile: profiles[1],
      defaultWriteScope: 'user',
      observedAt: expect.any(String),
    })
    expect(result.data?.profiles[1]?.scopeAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', status: 'available', writable: true }),
      expect.objectContaining({ scope: 'project', status: 'unresolved', reasonCode: 'PROJECT_ROOT_UNRESOLVED' }),
    ]))
    expect(result.data?.profiles[1]?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
      facts: [
        { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
        { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
      ],
    })
    expect(result.data?.summary.platformStats).toEqual([
      {
        platform: 'claude',
        profileCount: 1,
        okCount: 1,
        warningCount: 2,
        limitationCount: 0,
        referenceStats: {
          profileCount: 1,
          referenceProfileCount: 0,
          inlineProfileCount: 1,
          writeUnsupportedProfileCount: 0,
          hasReferenceProfiles: false,
          hasInlineProfiles: true,
          hasWriteUnsupportedProfiles: false,
        },
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['user', 'project', 'local'],
          facts: [
            { code: 'CLAUDE_SCOPE_PRECEDENCE', message: 'Claude 支持 user < project < local 三层 precedence。' },
            { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '如果存在 local，同名字段最终以 local 为准。' },
          ],
        },
      },
      {
        platform: 'gemini',
        profileCount: 1,
        okCount: 1,
        warningCount: 2,
        limitationCount: 0,
        referenceStats: {
          profileCount: 1,
          referenceProfileCount: 0,
          inlineProfileCount: 1,
          writeUnsupportedProfileCount: 0,
          hasReferenceProfiles: false,
          hasInlineProfiles: true,
          hasWriteUnsupportedProfiles: false,
        },
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          facts: [
            { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
            { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
          ],
        },
      },
    ])
    expect(result.data?.summary.referenceStats).toEqual({
      profileCount: 2,
      referenceProfileCount: 0,
      inlineProfileCount: 2,
      writeUnsupportedProfileCount: 0,
      hasReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
    })
    expect(new Date(result.data?.profiles[1]?.observedAt ?? '').toString()).not.toBe('Invalid Date')
    expect(result.data?.profiles[0]?.observedAt).toBeUndefined()
  })

  it('导出时聚合 profile 明文 secret warning 但不阻断 export', async () => {
    const profiles = [
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
    ]

    const result = await new ExportService(
      {
        list: async () => profiles,
      } as any,
      {
        get: () => ({
          validate: async () => ({
            ok: true,
            errors: [],
            warnings: [],
            limitations: [],
          }),
          detectCurrent: async () => null,
        }),
      } as any,
    ).export()

    expect(result.ok).toBe(true)
    const exportedProfile = result.data?.profiles?.[0]
    expect(exportedProfile).toBeDefined()
    const validationWarnings = exportedProfile?.validation?.warnings ?? []
    expect(validationWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'INLINE_SECRET_IN_PROFILE',
        field: 'source.token',
      }),
      expect.objectContaining({
        code: 'INLINE_SECRET_IN_PROFILE',
        field: 'apply.ANTHROPIC_AUTH_TOKEN',
      }),
    ]))
    expect(result.data?.summary.warnings).toEqual(expect.arrayContaining([
      'profile.source.token 当前以明文 secret 存储；后续版本建议迁移到 secret_ref 或环境变量引用。',
      'profile.apply.ANTHROPIC_AUTH_TOKEN 当前以明文 secret 存储；后续版本建议迁移到 secret_ref 或环境变量引用。',
    ]))
    expect(result.data?.summary.platformStats).toEqual([
      expect.objectContaining({
        platform: 'claude',
        okCount: 1,
        warningCount: 2,
        referenceStats: expect.objectContaining({
          profileCount: 1,
          referenceProfileCount: 0,
          inlineProfileCount: 1,
          writeUnsupportedProfileCount: 0,
          hasReferenceProfiles: false,
          hasInlineProfiles: true,
          hasWriteUnsupportedProfiles: false,
        }),
      }),
    ])
    expect(result.data?.summary.referenceStats).toEqual({
      profileCount: 1,
      referenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      hasReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
    })
  })

  it('导出时保留 secret_ref 契约并聚合未支持写入的 limitation', async () => {
    const profiles = [
      {
        id: 'codex-ref',
        name: 'codex-ref',
        platform: 'codex',
        source: { secret_ref: 'vault://codex/prod', baseURL: 'https://gateway.example.com/openai/v1' },
        apply: {
          auth_reference: 'vault://codex/prod',
          base_url: 'https://gateway.example.com/openai/v1',
        },
      },
    ]

    const result = await new ExportService(
      {
        list: async () => profiles,
      } as any,
      {
        get: () => ({
          validate: async () => ({
            ok: true,
            errors: [],
            warnings: [],
            limitations: [],
            secretReferences: [
              {
                key: 'auth_reference',
                source: 'auth_reference',
                reference: 'vault://codex/prod',
                present: true,
                maskedValue: 'vault://codex/prod',
              },
            ],
          }),
          detectCurrent: async () => null,
        }),
      } as any,
    ).export()

    expect(result.ok).toBe(true)
    expect(result.data?.profiles?.[0]?.validation?.warnings).toEqual([])
    expect(result.data?.profiles?.[0]?.validation?.limitations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SECRET_REFERENCE_WRITE_UNSUPPORTED',
        level: 'limitation',
      }),
    ]))
    expect(result.data?.summary.limitations).toContain('当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。')
    expect(result.data?.summary.referenceStats).toEqual({
      profileCount: 1,
      referenceProfileCount: 1,
      inlineProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      hasReferenceProfiles: true,
      hasInlineProfiles: false,
      hasWriteUnsupportedProfiles: true,
    })
    expect(result.data?.summary.platformStats).toEqual([
      expect.objectContaining({
        platform: 'codex',
        referenceStats: {
          profileCount: 1,
          referenceProfileCount: 1,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 1,
          hasReferenceProfiles: true,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: true,
        },
      }),
    ])
  })
})
