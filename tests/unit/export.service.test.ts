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
        code: 'EXPORT_FAILED',
        message: '未注册的平台适配器：openai',
      },
    })
  })
})
