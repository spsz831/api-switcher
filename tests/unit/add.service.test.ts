import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
})
