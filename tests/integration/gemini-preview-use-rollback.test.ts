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
  it('preview 能返回 Gemini env-first explainable 结果', async () => {
    const result = await new PreviewService().preview('gemini-prod')
    expect(result.ok).toBe(true)
    expect(result.data?.risk).toEqual(expect.objectContaining({
      allowed: false,
      riskLevel: 'medium',
    }))
    expect(result.data?.risk.reasons).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(result.data?.risk.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(result.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: geminiSettingsPath,
        scope: 'user',
        role: 'settings',
        managedKeys: ['enforcedAuthType'],
      }),
    ])
    expect(result.data?.preview.diffSummary).toEqual([
      expect.objectContaining({
        path: geminiSettingsPath,
        changedKeys: ['enforcedAuthType'],
        managedKeys: ['enforcedAuthType'],
        preservedKeys: ['ui'],
        hasChanges: true,
      }),
    ])
    expect(result.data?.preview.managedBoundaries).toEqual([
      expect.objectContaining({
        target: geminiSettingsPath,
        type: 'managed-fields',
        managedKeys: ['enforcedAuthType'],
        preservedKeys: ['ui'],
        notes: ['Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。'],
      }),
    ])
    expect(result.data?.preview.secretReferences).toEqual([
      {
        key: 'GEMINI_API_KEY',
        source: 'inline',
        present: true,
        maskedValue: 'gm-l***56',
      },
    ])
    expect(result.data?.preview.effectiveConfig?.stored).toEqual([
      expect.objectContaining({
        key: 'enforcedAuthType',
        maskedValue: 'oauth-personal',
        source: 'stored',
        scope: 'user',
        secret: false,
      }),
    ])
    expect(result.data?.preview.effectiveConfig?.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'enforcedAuthType',
        maskedValue: 'gemini-api-key',
        source: 'effective',
        scope: 'user',
        secret: false,
      }),
      expect.objectContaining({
        key: 'GEMINI_API_KEY',
        maskedValue: 'gm-l***56',
        source: 'effective',
        scope: 'user',
        secret: true,
      }),
    ]))
    expect(result.data?.preview.effectiveConfig?.overrides).toEqual([
      expect.objectContaining({
        key: 'GEMINI_API_KEY',
        kind: 'env',
        source: 'env',
        message: '最终生效的 API key 取决于环境变量，而不是 settings.json。',
      }),
    ])
    expect(result.data?.preview.effectiveConfig?.shadowedKeys).toEqual([])
    expect(result.data?.preview.preservedFields).toEqual(['ui'])
    expect(result.data?.preview.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'env-auth-required',
        message: 'Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。',
      }),
      expect.objectContaining({
        code: 'unmanaged-current-file',
        message: '当前 Gemini settings.json 存在非托管字段：ui',
      }),
    ]))
    expect(result.data?.preview.limitations.map((item) => item.message)).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(result.data?.preview.riskLevel).toBe('medium')
    expect(result.data?.preview.requiresConfirmation).toBe(true)
    expect(result.data?.preview.backupPlanned).toBe(true)
    expect(result.data?.preview.noChanges).toBe(false)
  })


  it('use 能写入 settings.json 并返回 Gemini explainable 结果', async () => {
    const result = await new SwitchService().use('gemini-prod', { force: true })
    expect(result.ok).toBe(true)
    expect(result.data?.backupId).toMatch(/^snapshot-gemini-/)
    expect(result.data?.changedFiles).toEqual([geminiSettingsPath])
    expect(result.data?.preview.managedBoundaries).toEqual([
      expect.objectContaining({
        target: geminiSettingsPath,
        type: 'managed-fields',
        managedKeys: ['enforcedAuthType'],
        preservedKeys: ['ui'],
      }),
    ])
    expect(result.data?.preview.secretReferences).toEqual([
      {
        key: 'GEMINI_API_KEY',
        source: 'inline',
        present: true,
        maskedValue: 'gm-l***56',
      },
    ])
    expect(result.data?.preview.warnings.some((item) => item.code === 'env-auth-required')).toBe(true)
    expect(result.data?.preview.limitations.map((item) => item.message)).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(result.data?.noChanges).toBe(false)

    const settings = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    expect(settings.enforcedAuthType).toBe('gemini-api-key')
    expect((settings.ui as { theme?: string }).theme).toBe('dark')

    const state = await new StateStore().read()
    expect(state.current.gemini).toBe('gemini-prod')
  })

  it('rollback 能恢复 settings.json 并返回 Gemini explainable 元数据', async () => {
    const switchResult = await new SwitchService().use('gemini-prod', { force: true })
    const backupId = switchResult.data?.backupId
    expect(backupId).toBeTruthy()

    await fs.writeFile(geminiSettingsPath, JSON.stringify({ enforcedAuthType: 'other' }, null, 2), 'utf8')

    const rollbackResult = await new RollbackService().rollback(backupId)
    expect(rollbackResult.ok).toBe(true)
    expect(rollbackResult.data?.restoredFiles).toEqual([geminiSettingsPath])
    expect(rollbackResult.data?.rollback?.targetFiles).toEqual([
      expect.objectContaining({
        path: geminiSettingsPath,
        managedKeys: ['enforcedAuthType'],
        role: 'settings',
      }),
    ])
    expect(rollbackResult.data?.rollback?.effectiveConfig?.stored).toEqual([
      expect.objectContaining({
        key: 'enforcedAuthType',
        maskedValue: 'oauth-personal',
        source: 'stored',
        scope: 'user',
      }),
    ])
    expect(rollbackResult.data?.rollback?.effectiveConfig?.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'enforcedAuthType',
        maskedValue: 'oauth-personal',
        source: 'effective',
        scope: 'user',
      }),
      expect.objectContaining({
        key: 'GEMINI_API_KEY',
        maskedValue: 'gm-l***56',
        source: 'env',
        scope: 'runtime',
        secret: true,
        shadowed: true,
      }),
    ]))
    expect(rollbackResult.data?.rollback?.effectiveConfig?.overrides).toEqual([
      expect.objectContaining({
        key: 'GEMINI_API_KEY',
        kind: 'env',
        source: 'env',
        message: 'Gemini API key 仍由环境变量决定。',
        shadowed: true,
      }),
    ])
    expect(rollbackResult.data?.rollback?.effectiveConfig?.shadowedKeys).toEqual(['GEMINI_API_KEY'])
    expect(rollbackResult.data?.rollback?.managedBoundaries).toEqual([
      expect.objectContaining({
        target: geminiSettingsPath,
        type: 'managed-fields',
        managedKeys: ['enforcedAuthType'],
        preservedKeys: ['ui'],
        notes: ['回滚仅恢复 Gemini settings.json 中的托管字段。'],
      }),
    ])
    expect(rollbackResult.data?.rollback?.warnings).toEqual([
      expect.objectContaining({
        code: 'rollback-restored-managed-files',
        message: '已按快照清单恢复托管文件。',
      }),
    ])
    expect(rollbackResult.data?.rollback?.limitations).toEqual([
      expect.objectContaining({
        code: 'rollback-env-not-restored',
        message: '回滚不会恢复环境变量。',
      }),
    ])

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
