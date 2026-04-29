import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ValidateService } from '../../src/services/validate.service'
import { ProfilesStore } from '../../src/stores/profiles.store'
import type { Profile } from '../../src/types/profile'

let runtimeDir: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-validate-service-'))
  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('validate service', () => {
  it('读取配置档失败时返回结构化失败结果', async () => {
    const result = await new ValidateService(
      {
        list: async () => {
          throw new Error('profiles list failed')
        },
        resolve: async () => {
          throw new Error('should not resolve')
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
    ).validate()

    expect(result).toEqual({
      ok: false,
      action: 'validate',
      error: {
        code: 'VALIDATE_FAILED',
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

    const result = await new ValidateService(
      {
        list: async () => [profile],
        resolve: async () => profile,
      } as any,
      {
        get: () => ({
          validate: async () => {
            throw new Error('adapter validate failed')
          },
        }),
      } as any,
    ).validate()

    expect(result).toEqual({
      ok: false,
      action: 'validate',
      error: {
        code: 'VALIDATE_FAILED',
        message: 'adapter validate failed',
      },
    })
  })

  it('selector 不存在时返回结构化失败结果', async () => {
    await new ProfilesStore().write({ version: 1, profiles: [] })

    const result = await new ValidateService().validate('missing-profile')

    expect(result).toEqual({
      ok: false,
      action: 'validate',
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
          id: 'openai-prod',
          name: 'openai-prod',
          platform: 'openai' as Profile['platform'],
          source: { apiKey: 'sk-openai-123456' },
          apply: { OPENAI_API_KEY: 'sk-openai-123456' },
        },
      ],
    })

    const result = await new ValidateService().validate('openai-prod')

    expect(result).toEqual({
      ok: false,
      action: 'validate',
      error: {
        code: 'ADAPTER_NOT_REGISTERED',
        message: '未注册的平台适配器：openai',
      },
    })
  })

  it('成功校验时为每个 item 注入平台 scope 能力矩阵', async () => {
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

    const result = await new ValidateService(
      {
        list: async () => [profile],
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
        }),
      } as any,
    ).validate('gemini-prod')

    expect(result.ok).toBe(true)
    expect(result.data?.items[0]).toMatchObject({
      profileId: 'gemini-prod',
      platform: 'gemini',
      validation: {
        ok: true,
      },
    })
    expect(result.data?.items[0]?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'system-defaults', use: false, rollback: false, writable: false }),
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true }),
      expect.objectContaining({ scope: 'system-overrides', use: false, rollback: false, writable: false }),
    ]))
    expect(result.data?.items[0]?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
      facts: [
        { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
        { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
      ],
    })
    expect(result.data?.summary.platformStats).toMatchObject([
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
    expect(result.data?.summary.referenceStats).toMatchObject({
      profileCount: 1,
      referenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      hasReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
    })
    expect(result.data?.summary.executabilityStats).toMatchObject({
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
  })

  it('会把 profile 中的明文 secret 暴露为非阻断 warning', async () => {
    const profile = {
      id: 'codex-prod',
      name: 'codex-prod',
      platform: 'codex',
      source: { apiKey: 'sk-codex-live-123456', baseURL: 'https://gateway.example.com/openai/v1' },
      apply: {
        OPENAI_API_KEY: 'sk-codex-live-123456',
        base_url: 'https://gateway.example.com/openai/v1',
      },
    }

    const result = await new ValidateService(
      {
        list: async () => [profile],
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
        }),
      } as any,
    ).validate('codex-prod')

    expect(result.ok).toBe(true)
    expect(result.data?.items[0]?.validation.ok).toBe(true)
    expect(result.data?.items[0]?.validation.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'INLINE_SECRET_IN_PROFILE',
        level: 'warning',
        field: 'source.apiKey',
        source: 'profile',
      }),
      expect.objectContaining({
        code: 'INLINE_SECRET_IN_PROFILE',
        level: 'warning',
        field: 'apply.OPENAI_API_KEY',
        source: 'profile',
      }),
    ]))
    expect(result.data?.summary.warnings).toEqual(expect.arrayContaining([
      'profile.source.apiKey 当前以明文 secret 存储；后续版本建议迁移到 secret_ref 或环境变量引用。',
      'profile.apply.OPENAI_API_KEY 当前以明文 secret 存储；后续版本建议迁移到 secret_ref 或环境变量引用。',
    ]))
    expect(result.data?.summary.platformStats).toMatchObject([
      expect.objectContaining({
        platform: 'codex',
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
    expect(result.data?.summary.referenceStats).toMatchObject({
      profileCount: 1,
      referenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      hasReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
    })
    expect(result.data?.summary.executabilityStats).toMatchObject({
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
  })

  it('secret_ref/auth_reference profile 在 validate 层可被识别，但会提示后续解析与写入策略需在执行阶段确认', async () => {
    const profile = {
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
    }

    const result = await new ValidateService(
      {
        list: async () => [profile],
        resolve: async () => profile,
      } as any,
      {
        get: () => ({
          validate: async (inputProfile: typeof profile) => ({
            ok: true,
            errors: [],
            warnings: [],
            limitations: [],
            effectiveConfig: {
              stored: [],
              effective: [],
              overrides: [],
            },
            managedBoundaries: [],
            secretReferences: [
              {
                key: 'auth_reference',
                source: 'auth_reference',
                reference: inputProfile.apply.auth_reference,
                present: true,
                maskedValue: inputProfile.apply.auth_reference,
              },
            ],
            preservedFields: [],
            retainedZones: [],
          }),
        }),
      } as any,
    ).validate('claude-ref')

    expect(result.ok).toBe(true)
    expect(result.data?.items[0]?.validation.errors).toEqual([])
    expect(result.data?.items[0]?.validation.warnings).toEqual([])
    expect(result.data?.items[0]?.validation.limitations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SECRET_REFERENCE_WRITE_UNSUPPORTED',
        level: 'limitation',
      }),
    ]))
    expect(result.data?.summary.limitations).toContain('当前已识别 secret_ref/auth_reference；真正的本地解析、治理判断与写入策略需要在 preview/use/import apply 阶段结合平台能力进一步确认。')
    expect(result.data?.summary.warnings).not.toContain('profile.source.auth_reference 当前以明文 secret 存储；后续版本建议迁移到 secret_ref 或环境变量引用。')
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
    expect(result.data?.summary.platformStats).toEqual(expect.arrayContaining([
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
    expect(result.data?.items[0]?.referenceSummary).toMatchObject({
      hasReferenceFields: true,
      hasInlineSecrets: false,
      writeUnsupported: true,
      resolvedReferenceCount: 0,
      missingReferenceCount: 0,
      unsupportedReferenceCount: 2,
      missingValueCount: 0,
    })
  })

  it('空 secret_ref/auth_reference 会返回结构化校验错误', async () => {
    const profile = {
      id: 'gemini-empty-ref',
      name: 'gemini-empty-ref',
      platform: 'gemini',
      source: { secret_ref: '' },
      apply: {
        auth_reference: '   ',
        enforcedAuthType: 'gemini-api-key',
      },
    }

    const result = await new ValidateService(
      {
        list: async () => [profile],
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
        }),
      } as any,
    ).validate('gemini-empty-ref')

    expect(result.ok).toBe(false)
    expect(result.data?.items[0]?.validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SECRET_REFERENCE_MISSING',
        level: 'error',
        field: 'source.secret_ref',
      }),
      expect.objectContaining({
        code: 'SECRET_REFERENCE_MISSING',
        level: 'error',
        field: 'apply.auth_reference',
      }),
    ]))
  })
})
