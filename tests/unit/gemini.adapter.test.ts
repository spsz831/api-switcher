import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GeminiAdapter } from '../../src/adapters/gemini/gemini.adapter'
import type { Profile } from '../../src/types/profile'

let runtimeDir: string
let settingsPath: string

const baseProfile: Profile = {
  id: 'gemini-prod',
  name: 'gemini-prod',
  platform: 'gemini',
  source: {
    apiKey: 'gm-live-123456',
    authType: 'gemini-api-key',
  },
  apply: {
    GEMINI_API_KEY: 'gm-live-123456',
    enforcedAuthType: 'gemini-api-key',
  },
}

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-gemini-unit-'))
  settingsPath = path.join(runtimeDir, 'settings.json')
  process.env.API_SWITCHER_GEMINI_SETTINGS_PATH = settingsPath
})

afterEach(async () => {
  delete process.env.API_SWITCHER_GEMINI_SETTINGS_PATH
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('gemini adapter', () => {
  it('preview 会给出 env 鉴权与非托管字段 warning，并只比较托管字段 diff', async () => {
    await fs.writeFile(settingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'oauth-personal' }, null, 2), 'utf8')

    const result = await new GeminiAdapter().preview(baseProfile)

    expect(result.targetFiles).toHaveLength(1)
    expect(result.diffSummary).toHaveLength(1)
    expect(result.diffSummary[0]?.hasChanges).toBe(true)
    expect(result.diffSummary[0]?.changedKeys).toEqual(['enforcedAuthType'])
    expect(result.warnings.some((item) => item.code === 'env-auth-required')).toBe(true)
    expect(result.warnings.some((item) => item.code === 'unmanaged-current-file')).toBe(true)
    expect(result.noChanges).toBe(false)
  })

  it('当 settings 已匹配时 preview 返回 noChanges', async () => {
    await fs.writeFile(settingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await new GeminiAdapter().preview(baseProfile)

    expect(result.diffSummary[0]?.hasChanges).toBe(false)
    expect(result.diffSummary[0]?.changedKeys).toEqual([])
    expect(result.noChanges).toBe(true)
  })

  it('validate 会提示未确认的 base url 与不支持的 auth type', async () => {
    const result = await new GeminiAdapter().validate({
      ...baseProfile,
      apply: {
        GEMINI_API_KEY: 'gm-live-123456',
        enforcedAuthType: 'oauth-personal',
        GEMINI_BASE_URL: 'https://example.com',
      },
    })

    expect(result.ok).toBe(true)
    expect(result.warnings.map((item) => item.code)).toContain('unsupported-auth-type')
    expect(result.warnings.map((item) => item.code)).toContain('unsupported-base-url')
  })
})
