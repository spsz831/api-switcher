import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PreviewService } from '../../src/services/preview.service'
import { ProfilesStore } from '../../src/stores/profiles.store'
import type { Profile } from '../../src/types/profile'

let runtimeDir: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-preview-service-'))
  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('preview service', () => {
  it('selector 不存在时返回结构化失败结果', async () => {
    await new ProfilesStore().write({ version: 1, profiles: [] })

    const result = await new PreviewService().preview('missing-profile')

    expect(result).toEqual({
      ok: false,
      action: 'preview',
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

    const result = await new PreviewService().preview('openai-prod')

    expect(result).toEqual({
      ok: false,
      action: 'preview',
      error: {
        code: 'ADAPTER_NOT_REGISTERED',
        message: '未注册的平台适配器：openai',
      },
    })
  })

  it('preview 会把 Claude 的 resolved env reference 标记为 native-reference-write', async () => {
    process.env.API_SWITCHER_TEST_ANTHROPIC_TOKEN = 'sk-ant-live-123456'
    const profile = {
      id: 'claude-native-reference',
      name: 'claude-native-reference',
      platform: 'claude' as const,
      source: {},
      apply: {
        auth_reference: 'env://API_SWITCHER_TEST_ANTHROPIC_TOKEN',
      },
    }

    const result = await new PreviewService(
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
            platform: 'claude',
            profileId: profile.id,
            targetFiles: [
              {
                path: 'E:\\WorkSpace\\.claude\\settings.json',
                format: 'json',
                exists: true,
                managedScope: 'partial-fields',
                scope: 'project',
                role: 'settings',
                managedKeys: ['auth_reference'],
              },
            ],
            effectiveFields: [],
            storedOnlyFields: [],
            diffSummary: [
              {
                path: 'E:\\WorkSpace\\.claude\\settings.json',
                changedKeys: ['auth_reference'],
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
        }),
      } as any,
    ).preview('claude-native-reference')

    expect(result.ok).toBe(true)
    expect(result.data).toEqual(expect.objectContaining({
      referenceReadiness: {
        level: 'native-ready',
        primaryReason: 'REFERENCE_NATIVE_WRITE_SUPPORTED',
        canProceedToUse: true,
        requiresForce: false,
        nextAction: 'proceed',
        summary: '当前 reference 可按平台原生形态继续进入 use。',
      },
      referenceDecision: expect.objectContaining({
        writeDecision: 'native-reference-write',
        requiresForce: false,
        blocking: false,
        reasonCodes: ['REFERENCE_NATIVE_WRITE_SUPPORTED'],
      }),
      risk: expect.objectContaining({
        allowed: true,
      }),
    }))
  })

  it('preview 会把 Codex 的 resolved env reference 标记为 inline-fallback-write', async () => {
    process.env.API_SWITCHER_TEST_OPENAI_KEY = 'sk-openai-live-123456'
    const profile = {
      id: 'codex-inline-fallback',
      name: 'codex-inline-fallback',
      platform: 'codex' as const,
      source: {},
      apply: {
        auth_reference: 'env://API_SWITCHER_TEST_OPENAI_KEY',
      },
    }

    const result = await new PreviewService(
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
            platform: 'codex',
            profileId: profile.id,
            targetFiles: [
              {
                path: 'E:\\WorkSpace\\.codex\\auth.json',
                format: 'json',
                exists: true,
                managedScope: 'multi-file',
                role: 'auth',
                managedKeys: ['OPENAI_API_KEY'],
              },
            ],
            effectiveFields: [],
            storedOnlyFields: [],
            diffSummary: [
              {
                path: 'E:\\WorkSpace\\.codex\\auth.json',
                changedKeys: ['OPENAI_API_KEY'],
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
        }),
      } as any,
    ).preview('codex-inline-fallback')

    expect(result.ok).toBe(false)
    expect(result.action).toBe('preview')
    expect(result.error).toEqual(expect.objectContaining({
      code: 'CONFIRMATION_REQUIRED',
      details: expect.objectContaining({
        referenceReadiness: {
          level: 'fallback-ready',
          primaryReason: 'REFERENCE_INLINE_FALLBACK_REQUIRED',
          canProceedToUse: true,
          requiresForce: true,
          nextAction: 'confirm-before-write',
          summary: '当前 reference 仅支持明文 fallback 写入；继续前需要显式确认。',
        },
        referenceDecision: expect.objectContaining({
          writeDecision: 'inline-fallback-write',
          requiresForce: true,
          blocking: false,
          reasonCodes: ['REFERENCE_INLINE_FALLBACK_REQUIRED'],
        }),
        referenceGovernance: expect.objectContaining({
          hasReferenceProfiles: true,
        }),
        risk: expect.objectContaining({
          allowed: false,
        }),
      }),
    }))
    expect(result.limitations).toContain('如继续执行，将以明文写入目标配置文件。')
  })

  it('preview 会在 env reference unresolved 时返回成功态观测结果，并附带 referenceGovernance 失败细节', async () => {
    const profile = {
      id: 'claude-unresolved-reference',
      name: 'claude-unresolved-reference',
      platform: 'claude' as const,
      source: {},
      apply: {
        auth_reference: 'env://API_SWITCHER_TEST_MISSING_TOKEN',
      },
    }

    const result = await new PreviewService(
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
            platform: 'claude',
            profileId: profile.id,
            targetFiles: [
              {
                path: 'E:\\WorkSpace\\.claude\\settings.json',
                format: 'json',
                exists: true,
                managedScope: 'partial-fields',
                scope: 'project',
                role: 'settings',
                managedKeys: ['auth_reference'],
              },
            ],
            effectiveFields: [],
            storedOnlyFields: [],
            diffSummary: [
              {
                path: 'E:\\WorkSpace\\.claude\\settings.json',
                changedKeys: ['auth_reference'],
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
        }),
      } as any,
    ).preview('claude-unresolved-reference')

    expect(result.ok).toBe(true)
    expect(result.action).toBe('preview')
    expect(result.error).toBeUndefined()
    expect(result.data).toEqual(expect.objectContaining({
      referenceReadiness: {
        level: 'blocked',
        primaryReason: 'REFERENCE_ENV_UNRESOLVED',
        canProceedToUse: false,
        requiresForce: false,
        nextAction: 'fix-reference-before-write',
        summary: '当前 reference 尚未解析，进入 use 前需要先修复引用。',
      },
      referenceDecision: expect.objectContaining({
        writeDecision: 'reference-blocked',
        blocking: true,
        reasonCodes: ['REFERENCE_ENV_UNRESOLVED'],
      }),
      referenceGovernance: expect.objectContaining({
        primaryReason: 'REFERENCE_MISSING',
        referenceDetails: expect.arrayContaining([
          expect.objectContaining({
            code: 'REFERENCE_ENV_UNRESOLVED',
            status: 'unresolved',
          }),
        ]),
      }),
      risk: expect.objectContaining({
        allowed: false,
        reasons: expect.arrayContaining([
          '当前 reference 已被治理策略阻断，preview 仅提供只读观测结果。',
        ]),
        limitations: expect.arrayContaining([
          '当前 secret reference 仍不能进入 use/import apply 写入流程。',
        ]),
      }),
    }))
  })
})
