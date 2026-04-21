import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AdapterNotRegisteredError } from '../../src/registry/adapter-registry'
import { CurrentStateService } from '../../src/services/current-state.service'

let runtimeDir: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-current-state-service-'))
  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('current state service', () => {
  it('getCurrent 读取状态失败时返回结构化失败结果', async () => {
    const result = await new CurrentStateService(
      {
        list: async () => [],
      } as any,
      {
        read: async () => {
          throw new Error('state read failed')
        },
      } as any,
      {
        get: () => ({
          detectCurrent: async () => null,
        }),
      } as any,
    ).getCurrent()

    expect(result).toEqual({
      ok: false,
      action: 'current',
      error: {
        code: 'CURRENT_FAILED',
        message: 'state read failed',
      },
    })
  })

  it('getCurrent 检测当前配置失败时返回结构化失败结果', async () => {
    const result = await new CurrentStateService(
      {
        list: async () => [],
      } as any,
      {
        read: async () => ({
          current: {},
          snapshots: [],
        }),
      } as any,
      {
        get: () => ({
          detectCurrent: async () => {
            throw new Error('detect current failed')
          },
        }),
      } as any,
    ).getCurrent()

    expect(result).toEqual({
      ok: false,
      action: 'current',
      error: {
        code: 'CURRENT_FAILED',
        message: 'detect current failed',
      },
    })
  })

  it('getCurrent 未注册平台适配器时返回结构化失败结果', async () => {
    const result = await new CurrentStateService(
      {
        list: async () => [],
      } as any,
      {
        read: async () => ({
          current: {},
          snapshots: [],
        }),
      } as any,
      {
        get: () => {
          throw new AdapterNotRegisteredError('claude')
        },
      } as any,
    ).getCurrent()

    expect(result).toEqual({
      ok: false,
      action: 'current',
      error: {
        code: 'ADAPTER_NOT_REGISTERED',
        message: '未注册的平台适配器：claude',
      },
    })
  })

  it('getCurrent 成功时为 detection 注入平台 scope 能力矩阵', async () => {
    const result = await new CurrentStateService(
      {
        list: async () => [
          {
            id: 'claude-prod',
            name: 'Claude Prod',
            platform: 'claude',
            source: {},
            apply: {},
          },
          {
            id: 'gemini-prod',
            name: 'Gemini Prod',
            platform: 'gemini',
            source: {},
            apply: {},
          },
        ],
      } as any,
      {
        read: async () => ({
          current: {
            claude: 'claude-prod',
            gemini: 'gemini-prod',
          },
          snapshots: [],
        }),
      } as any,
      {
        get: (platform: string) => ({
          detectCurrent: async () => {
            if (platform === 'codex') {
              return null
            }

            return {
              platform,
              managed: true,
              matchedProfileId: `${platform}-prod`,
              targetFiles: [],
              warnings: platform === 'gemini'
                ? [{ code: 'GEMINI_WARN', level: 'warning', message: 'Gemini warning' }]
                : [],
              limitations: platform === 'gemini'
                ? [{ code: 'GEMINI_LIMIT', level: 'limitation', message: 'Gemini limitation' }]
                : [],
            }
          },
        }),
      } as any,
    ).getCurrent()

    expect(result.ok).toBe(true)
    expect(result.action).toBe('current')
    expect(result.data?.detections.map((item) => item.platform)).toEqual(['claude', 'gemini'])
    expect(result.data?.detections.find((item) => item.platform === 'claude')?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'local', use: true, rollback: true, writable: true }),
    ]))
    expect(result.data?.detections.find((item) => item.platform === 'claude')?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['user', 'project', 'local'],
      currentScope: undefined,
      facts: [
        { code: 'CLAUDE_SCOPE_PRECEDENCE', message: 'Claude 支持 user < project < local 三层 precedence。' },
        { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '如果存在 local，同名字段最终以 local 为准。' },
      ],
    })
    expect(result.data?.detections.find((item) => item.platform === 'gemini')?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'system-defaults', use: false, rollback: false, writable: false }),
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true }),
      expect.objectContaining({ scope: 'system-overrides', use: false, rollback: false, writable: false }),
    ]))
    expect(result.data?.detections.find((item) => item.platform === 'gemini')?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
      currentScope: undefined,
      facts: [
        { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
        { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
      ],
    })
    expect(result.data?.summary).toMatchObject({
      warnings: ['Gemini warning'],
      limitations: ['Gemini limitation'],
      referenceStats: {
        profileCount: 2,
        referenceProfileCount: 0,
        inlineProfileCount: 0,
        writeUnsupportedProfileCount: 0,
        hasReferenceProfiles: false,
        hasInlineProfiles: false,
        hasWriteUnsupportedProfiles: false,
      },
    })
    expect(result.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'claude',
        profileCount: 1,
        currentProfileId: 'claude-prod',
        detectedProfileId: 'claude-prod',
        managed: true,
        referenceStats: expect.objectContaining({
          profileCount: 1,
          referenceProfileCount: 0,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 0,
          hasReferenceProfiles: false,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: false,
        }),
      }),
      expect.objectContaining({
        platform: 'gemini',
        profileCount: 1,
        currentProfileId: 'gemini-prod',
        detectedProfileId: 'gemini-prod',
        managed: true,
        referenceStats: expect.objectContaining({
          profileCount: 1,
          referenceProfileCount: 0,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 0,
          hasReferenceProfiles: false,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: false,
        }),
      }),
      expect.objectContaining({
        platform: 'codex',
        profileCount: 0,
        managed: false,
        referenceStats: expect.objectContaining({
          profileCount: 0,
          referenceProfileCount: 0,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 0,
          hasReferenceProfiles: false,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: false,
        }),
      }),
    ]))
    expect(result.warnings).toEqual(result.data?.summary.warnings)
    expect(result.limitations).toEqual(result.data?.summary.limitations)
  })

  it('list 读取状态失败时返回结构化失败结果', async () => {
    const result = await new CurrentStateService(
      {
        list: async () => [],
      } as any,
      {
        read: async () => {
          throw new Error('list state read failed')
        },
      } as any,
      {
        get: () => ({
          detectCurrent: async () => null,
        }),
      } as any,
    ).list()

    expect(result).toEqual({
      ok: false,
      action: 'list',
      error: {
        code: 'LIST_FAILED',
        message: 'list state read failed',
      },
    })
  })

  it('list 检测当前配置失败时返回结构化失败结果', async () => {
    const result = await new CurrentStateService(
      {
        list: async () => [],
      } as any,
      {
        read: async () => ({
          current: {},
          snapshots: [],
        }),
      } as any,
      {
        get: () => ({
          detectCurrent: async () => {
            throw new Error('list detect current failed')
          },
        }),
      } as any,
    ).list()

    expect(result).toEqual({
      ok: false,
      action: 'list',
      error: {
        code: 'LIST_FAILED',
        message: 'list detect current failed',
      },
    })
  })

  it('list 未注册平台适配器时返回结构化失败结果', async () => {
    const result = await new CurrentStateService(
      {
        list: async () => [],
      } as any,
      {
        read: async () => ({
          current: {},
          snapshots: [],
        }),
      } as any,
      {
        get: () => {
          throw new AdapterNotRegisteredError('claude')
        },
      } as any,
    ).list()

    expect(result).toEqual({
      ok: false,
      action: 'list',
      error: {
        code: 'ADAPTER_NOT_REGISTERED',
        message: '未注册的平台适配器：claude',
      },
    })
  })

  it('list 成功时统一组装 profiles 与 explainable 摘要', async () => {
    const result = await new CurrentStateService(
      {
        list: async () => [
          {
            id: 'claude-prod',
            name: 'Claude Prod',
            platform: 'claude',
            source: {},
            apply: {},
          },
          {
            id: 'codex-dev',
            name: 'Codex Dev',
            platform: 'codex',
            source: {},
            apply: {},
          },
          {
            id: 'gemini-prod',
            name: 'Gemini Prod',
            platform: 'gemini',
            source: {},
            apply: {},
          },
        ],
      } as any,
      {
        read: async () => ({
          current: {
            gemini: 'gemini-prod',
          },
          snapshots: [],
        }),
      } as any,
      {
        get: (platform: string) => ({
          detectCurrent: async () => {
            if (platform === 'claude') {
              return {
                platform: 'claude',
                managed: true,
                matchedProfileId: 'claude-prod',
                targetFiles: [],
                warnings: [],
                limitations: [],
              }
            }

            if (platform === 'gemini') {
              return {
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
                warnings: [{ code: 'GEMINI_WARN', level: 'warning', message: 'Gemini warning' }],
                limitations: [{ code: 'GEMINI_LIMIT', level: 'limitation', message: 'Gemini limitation' }],
              }
            }

            return null
          },
        }),
      } as any,
    ).list()

    expect(result.ok).toBe(true)
    expect(result.action).toBe('list')
    expect(result.data?.profiles.map((item) => item.profile.id)).toEqual(['gemini-prod', 'claude-prod', 'codex-dev'])
    expect(result.data?.profiles[0]).toMatchObject({
      current: true,
      healthStatus: 'valid',
      riskLevel: 'low',
    })
    expect(result.data?.profiles[0]?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true }),
      expect.objectContaining({ scope: 'system-overrides', use: false, rollback: false, writable: false }),
    ]))
    expect(result.data?.profiles[0]?.scopeAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', status: 'available', writable: true }),
      expect.objectContaining({ scope: 'project', status: 'unresolved', reasonCode: 'PROJECT_ROOT_UNRESOLVED' }),
    ]))
    expect(result.data?.profiles[1]).toMatchObject({
      current: false,
      healthStatus: 'warning',
      riskLevel: 'medium',
    })
    expect(result.data?.profiles[1]?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'local', use: true, rollback: true, writable: true }),
    ]))
    expect(result.data?.profiles[1]?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['user', 'project', 'local'],
      currentScope: undefined,
      facts: [
        { code: 'CLAUDE_SCOPE_PRECEDENCE', message: 'Claude 支持 user < project < local 三层 precedence。' },
        { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '如果存在 local，同名字段最终以 local 为准。' },
      ],
    })
    expect(result.data?.profiles[2]?.platformSummary).toEqual({
      kind: 'multi-file-composition',
      composedFiles: [],
      facts: [
        { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
        { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
      ],
    })
    expect(result.data?.summary).toMatchObject({
      warnings: ['Gemini warning'],
      limitations: ['Gemini limitation'],
      referenceStats: {
        profileCount: 3,
        referenceProfileCount: 0,
        inlineProfileCount: 0,
        writeUnsupportedProfileCount: 0,
        hasReferenceProfiles: false,
        hasInlineProfiles: false,
        hasWriteUnsupportedProfiles: false,
      },
    })
    expect(result.data?.summary.platformStats).toMatchObject([
      {
        platform: 'claude',
        profileCount: 1,
        detectedProfileId: 'claude-prod',
        managed: true,
        referenceStats: expect.objectContaining({
          profileCount: 1,
          referenceProfileCount: 0,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 0,
          hasReferenceProfiles: false,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: false,
        }),
      },
      {
        platform: 'codex',
        profileCount: 1,
        managed: false,
        referenceStats: expect.objectContaining({
          profileCount: 1,
          referenceProfileCount: 0,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 0,
          hasReferenceProfiles: false,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: false,
        }),
        platformSummary: {
          kind: 'multi-file-composition',
          composedFiles: [],
          facts: [
            { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
            { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
          ],
        },
      },
      {
        platform: 'gemini',
        profileCount: 1,
        currentProfileId: 'gemini-prod',
        detectedProfileId: 'gemini-prod',
        managed: true,
        referenceStats: expect.objectContaining({
          profileCount: 1,
          referenceProfileCount: 0,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 0,
          hasReferenceProfiles: false,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: false,
        }),
      },
    ])
    expect(result.warnings).toEqual(result.data?.summary.warnings)
    expect(result.limitations).toEqual(result.data?.summary.limitations)
  })

  it('list 非法 platform 时返回结构化失败结果', async () => {
    const result = await new CurrentStateService().list({ platform: 'openai' })

    expect(result).toEqual({
      ok: false,
      action: 'list',
      error: {
        code: 'UNSUPPORTED_PLATFORM',
        message: '不支持的平台：openai',
      },
    })
  })

  it('current/list 会把 reference profile 聚合成稳定的 referenceStats', async () => {
    const profiles = [
      {
        id: 'claude-ref',
        name: 'Claude Ref',
        platform: 'claude',
        source: { secret_ref: 'vault://claude/prod' },
        apply: { auth_reference: 'vault://claude/prod' },
      },
      {
        id: 'gemini-inline',
        name: 'Gemini Inline',
        platform: 'gemini',
        source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
        apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
      },
    ]

    const service = new CurrentStateService(
      {
        list: async () => profiles,
      } as any,
      {
        read: async () => ({
          current: {
            claude: 'claude-ref',
          },
          snapshots: [],
        }),
      } as any,
      {
        get: (platform: string) => ({
          detectCurrent: async () => ({
            platform,
            managed: platform === 'claude',
            matchedProfileId: platform === 'claude' ? 'claude-ref' : undefined,
            targetFiles: [],
            warnings: [],
            limitations: [],
          }),
        }),
      } as any,
    )

    const currentResult = await service.getCurrent()
    const listResult = await service.list()

    expect(currentResult.ok).toBe(true)
    expect(currentResult.data?.summary.referenceStats).toMatchObject({
      profileCount: 2,
      referenceProfileCount: 1,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 1,
      hasReferenceProfiles: true,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: true,
    })
    expect(currentResult.data?.summary.platformStats).toEqual(expect.arrayContaining([
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
      expect.objectContaining({
        platform: 'gemini',
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
    ]))

    expect(listResult.ok).toBe(true)
    expect(listResult.data?.summary.referenceStats).toMatchObject({
      profileCount: 2,
      referenceProfileCount: 1,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 1,
      hasReferenceProfiles: true,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: true,
    })
    expect(listResult.data?.summary.platformStats).toEqual(expect.arrayContaining([
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
      expect.objectContaining({
        platform: 'gemini',
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
    ]))
  })
})
