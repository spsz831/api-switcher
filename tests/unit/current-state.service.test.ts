import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
  it('list 非法 platform 时返回结构化失败结果', async () => {
    const result = await new CurrentStateService().list({ platform: 'openai' })

    expect(result).toEqual({
      ok: false,
      action: 'list',
      error: {
        code: 'LIST_FAILED',
        message: '不支持的平台：openai',
      },
    })
  })
})
