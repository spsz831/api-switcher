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
})
