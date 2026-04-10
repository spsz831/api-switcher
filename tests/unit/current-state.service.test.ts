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
