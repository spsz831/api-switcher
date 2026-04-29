import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AdapterNotRegisteredError } from '../../src/registry/adapter-registry'
import { AddService } from '../../src/services/add.service'
import { ProfilesStore } from '../../src/stores/profiles.store'
import type { Profile } from '../../src/types/profile'

let runtimeDir: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-add-service-'))
  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('add service', () => {
  it('非法 platform 时返回结构化失败结果', async () => {
    const result = await new AddService().add({
      platform: 'openai',
      name: 'bad-platform',
      key: 'sk-bad-123',
    })

    expect(result).toEqual({
      ok: false,
      action: 'add',
      error: {
        code: 'UNSUPPORTED_PLATFORM',
        message: '不支持的平台：openai',
      },
    })
  })

  it('未注册平台适配器时返回结构化失败结果', async () => {
    const result = await new AddService(
      {
        add: async () => undefined,
      } as any,
      {
        get: () => {
          throw new AdapterNotRegisteredError('claude')
        },
      } as any,
    ).add({
      platform: 'claude',
      name: 'missing-adapter',
      key: 'sk-test-123456',
    })

    expect(result).toEqual({
      ok: false,
      action: 'add',
      error: {
        code: 'ADAPTER_NOT_REGISTERED',
        message: '未注册的平台适配器：claude',
      },
    })
  })

  it('重复 ID 时返回结构化失败结果', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'claude-dup-prod',
          name: 'dup-prod',
          platform: 'claude' as Profile['platform'],
          source: { token: 'sk-old-123456' },
          apply: { ANTHROPIC_AUTH_TOKEN: 'sk-old-123456' },
        },
      ],
    })

    const result = await new AddService().add({
      platform: 'claude',
      name: 'dup-prod',
      key: 'sk-new-123456',
    })

    expect(result).toEqual({
      ok: false,
      action: 'add',
      error: {
        code: 'DUPLICATE_PROFILE_ID',
        message: '配置 ID 已存在：claude-dup-prod',
      },
    })
  })

  it('成功新增时返回平台 scope 能力矩阵', async () => {
    const result = await new AddService(
      {
        add: async () => undefined,
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
            platform: 'claude',
            profileId: 'claude-new-profile',
            targetFiles: [],
            effectiveFields: [],
            storedOnlyFields: [],
            diffSummary: [],
            warnings: [],
            limitations: [],
            riskLevel: 'low',
            requiresConfirmation: false,
            backupPlanned: false,
            noChanges: true,
          }),
        }),
      } as any,
    ).add({
      platform: 'claude',
      name: 'new-profile',
      key: 'sk-test-123456',
    })

    expect(result.ok).toBe(true)
    expect(result.data?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'local', use: true, rollback: true, writable: true }),
    ]))
    expect(result.data?.summary.platformStats).toEqual([
      expect.objectContaining({
        platform: 'claude',
        profileCount: 1,
        profileId: 'claude-new-profile',
        warningCount: 0,
        limitationCount: 0,
        changedFileCount: 0,
        backupCreated: false,
        noChanges: true,
      }),
    ])
  })

  it('支持仅用 secret_ref/auth_reference 创建 profile，并提示写入链路尚未消费引用', async () => {
    const result = await new AddService(
      {
        add: async () => undefined,
      } as any,
      {
        get: () => ({
          validate: async () => ({
            ok: true,
            errors: [],
            warnings: [],
            limitations: [{
              code: 'SECRET_REFERENCE_WRITE_UNSUPPORTED',
              level: 'limitation',
              message: '当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。',
            }],
          }),
          preview: async () => ({
            platform: 'codex',
            profileId: 'codex-ref-profile',
            targetFiles: [],
            effectiveFields: [],
            storedOnlyFields: [],
            diffSummary: [],
            warnings: [],
            limitations: [{
              code: 'SECRET_REFERENCE_WRITE_UNSUPPORTED',
              level: 'limitation',
              message: '当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。',
            }],
            riskLevel: 'low',
            requiresConfirmation: false,
            backupPlanned: false,
            noChanges: true,
          }),
        }),
      } as any,
    ).add({
      platform: 'codex',
      name: 'ref-profile',
      secretRef: 'vault://codex/prod',
      authReference: 'vault://codex/prod',
      url: 'https://gateway.example.com/openai/v1',
    } as any)

    expect(result.ok).toBe(true)
    expect(result.data?.profile.source).toEqual({
      secret_ref: 'vault://codex/prod',
      baseURL: 'https://gateway.example.com/openai/v1',
    })
    expect(result.data?.profile.apply).toEqual({
      auth_reference: 'vault://codex/prod',
      base_url: 'https://gateway.example.com/openai/v1',
    })
    expect(result.data?.summary.referenceStats).toMatchObject({
      profileCount: 1,
      referenceProfileCount: 1,
      inlineProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      hasReferenceProfiles: true,
      hasInlineProfiles: false,
      hasWriteUnsupportedProfiles: true,
    })
    expect(result.data?.summary.executabilityStats).toMatchObject({
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
    expect(result.data?.summary.limitations).toContain('当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。')
  })

  it('明文 key 与 secret reference 同时出现时返回参数错误', async () => {
    const result = await new AddService().add({
      platform: 'claude',
      name: 'conflict-profile',
      key: 'sk-test-123456',
      secretRef: 'vault://claude/prod',
    } as any)

    expect(result).toEqual({
      ok: false,
      action: 'add',
      error: {
        code: 'ADD_INPUT_CONFLICT',
        message: '不能同时提供 --key 与 --secret-ref/--auth-reference。',
      },
    })
  })

  it('缺少 key 和 secret reference 时返回参数错误', async () => {
    const result = await new AddService().add({
      platform: 'gemini',
      name: 'missing-secret-input',
    } as any)

    expect(result).toEqual({
      ok: false,
      action: 'add',
      error: {
        code: 'ADD_INPUT_REQUIRED',
        message: '必须提供 --key 或 --secret-ref/--auth-reference 其中之一。',
      },
    })
  })

  it('reference-only 输入全为空白时按缺失输入处理', async () => {
    const result = await new AddService().add({
      platform: 'codex',
      name: 'blank-reference-input',
      secretRef: '   ',
      authReference: '\t',
    } as any)

    expect(result).toEqual({
      ok: false,
      action: 'add',
      error: {
        code: 'ADD_INPUT_REQUIRED',
        message: '必须提供 --key 或 --secret-ref/--auth-reference 其中之一。',
      },
    })
  })

  it('reference-only 输入明显冲突时返回参数错误', async () => {
    const result = await new AddService().add({
      platform: 'claude',
      name: 'mismatched-reference-input',
      secretRef: 'vault://claude/source',
      authReference: 'vault://claude/apply',
    } as any)

    expect(result).toEqual({
      ok: false,
      action: 'add',
      error: {
        code: 'ADD_INPUT_CONFLICT',
        message: 'reference-only 输入存在冲突；请确保 --secret-ref/--auth-reference 格式有效且在同时传入时保持一致。',
      },
    })
  })
})
