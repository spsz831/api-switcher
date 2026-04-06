import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PreviewService } from '../../src/services/preview.service'
import { RollbackService } from '../../src/services/rollback.service'
import { SwitchService } from '../../src/services/switch.service'
import { ProfilesStore } from '../../src/stores/profiles.store'
import { StateStore } from '../../src/stores/state.store'

let runtimeDir: string
let geminiSettingsPath: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-gemini-it-'))
  geminiSettingsPath = path.join(runtimeDir, 'settings.json')

  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
  process.env.API_SWITCHER_GEMINI_SETTINGS_PATH = geminiSettingsPath

  const profilesStore = new ProfilesStore()
  await profilesStore.write({
    version: 1,
    profiles: [
      {
        id: 'gemini-prod',
        name: 'gemini-prod',
        platform: 'gemini',
        source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key', notes: 'Gemini 主线路径' },
        apply: {
          GEMINI_API_KEY: 'gm-live-123456',
          enforcedAuthType: 'gemini-api-key',
        },
      },
    ],
  })

  await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'oauth-personal' }, null, 2), 'utf8')
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  delete process.env.API_SWITCHER_GEMINI_SETTINGS_PATH
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('gemini preview/use/rollback integration', () => {
  it('preview 能返回 Gemini settings 结果并提示 env 鉴权限制', async () => {
    const result = await new PreviewService().preview('gemini-prod')
    expect(result.ok).toBe(true)
    expect(result.data?.preview.targetFiles).toHaveLength(1)
    expect(result.data?.preview.diffSummary).toHaveLength(1)
    expect(result.data?.preview.warnings.some((item) => item.code === 'env-auth-required')).toBe(true)
  })

  it('use 能写入 settings.json 并更新 state', async () => {
    const result = await new SwitchService().use('gemini-prod', { force: true })
    expect(result.ok).toBe(true)
    expect(result.data?.backupId).toMatch(/^snapshot-gemini-/)
    expect(result.data?.changedFiles).toHaveLength(1)

    const settings = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    expect(settings.enforcedAuthType).toBe('gemini-api-key')
    expect((settings.ui as { theme?: string }).theme).toBe('dark')

    const state = await new StateStore().read()
    expect(state.current.gemini).toBe('gemini-prod')
  })

  it('rollback 能恢复 settings.json 并清空 current', async () => {
    const switchResult = await new SwitchService().use('gemini-prod', { force: true })
    const backupId = switchResult.data?.backupId
    expect(backupId).toBeTruthy()

    await fs.writeFile(geminiSettingsPath, JSON.stringify({ enforcedAuthType: 'other' }, null, 2), 'utf8')

    const rollbackResult = await new RollbackService().rollback(backupId)
    expect(rollbackResult.ok).toBe(true)
    expect(rollbackResult.data?.restoredFiles).toHaveLength(1)

    const restored = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    expect(restored.enforcedAuthType).toBe('oauth-personal')
    expect((restored.ui as { theme?: string }).theme).toBe('dark')

    const state = await new StateStore().read()
    expect(state.current.gemini).toBeUndefined()
    expect(state.lastSwitch?.status).toBe('rolled-back')
  })

  it('no-op 情况不会重复创建 Gemini 快照', async () => {
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await new SwitchService().use('gemini-prod', { force: true })
    expect(result.ok).toBe(true)
    expect(result.data?.noChanges).toBe(true)
    expect(result.data?.backupId).toBeUndefined()
  })
})
