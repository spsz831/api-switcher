import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SwitchService } from '../../src/services/switch.service'
import { ProfilesStore } from '../../src/stores/profiles.store'

let runtimeDir: string
let settingsPath: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-switch-service-'))
  settingsPath = path.join(runtimeDir, 'settings.json')
  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
  process.env.API_SWITCHER_GEMINI_SETTINGS_PATH = settingsPath
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  delete process.env.API_SWITCHER_GEMINI_SETTINGS_PATH
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('switch service', () => {
  it('validation 失败时返回结构化失败结果，并带出 explainable warnings 与 limitations', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'gemini-invalid',
          name: 'gemini-invalid',
          platform: 'gemini',
          source: { authType: 'oauth-personal' },
          apply: {
            enforcedAuthType: 'oauth-personal',
          },
        },
      ],
    })

    const result = await new SwitchService().use('gemini-invalid')

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      action: 'use',
      error: expect.objectContaining({
        code: 'VALIDATION_FAILED',
        message: '配置校验失败',
      }),
    }))
    expect(result.warnings).toEqual([
      'Gemini 首版仅稳定支持 enforcedAuthType = gemini-api-key。',
    ])
    expect(result.limitations).toEqual([
      'GEMINI_API_KEY 仍需通过环境变量生效。',
      '当前仅稳定托管 settings.json 中已确认字段 enforcedAuthType。',
      '官方文档当前未确认自定义 base URL 的稳定写入契约。',
    ])
  })

  it('需要确认但未 force 时返回 CONFIRMATION_REQUIRED', async () => {
    await fs.writeFile(settingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'gemini-confirm',
          name: 'gemini-confirm',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: {
            GEMINI_API_KEY: 'gm-live-123456',
            enforcedAuthType: 'gemini-api-key',
          },
        },
      ],
    })

    const result = await new SwitchService().use('gemini-confirm')

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      action: 'use',
      error: expect.objectContaining({
        code: 'CONFIRMATION_REQUIRED',
        message: '当前切换需要确认或 --force。',
      }),
    }))
    expect(result.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(result.warnings).toContain('当前 Gemini settings.json 存在非托管字段：ui')
    expect(result.limitations).toEqual([
      'GEMINI_API_KEY 仍需通过环境变量生效。',
      '当前仅稳定托管 settings.json 中已确认字段 enforcedAuthType。',
      '官方文档当前未确认自定义 base URL 的稳定写入契约。',
    ])
  })

  it('apply 失败时返回 APPLY_FAILED，并透传 apply explainable 摘要', async () => {
    let markCurrentCalled = false
    const profile = {
      id: 'gemini-apply-fail',
      name: 'gemini-apply-fail',
      platform: 'gemini',
      source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
      apply: {
        GEMINI_API_KEY: 'gm-live-123456',
        enforcedAuthType: 'gemini-api-key',
      },
    }

    const service = new SwitchService(
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
            platform: 'gemini',
            profileId: profile.id,
            targetFiles: [],
            effectiveFields: [],
            storedOnlyFields: [],
            diffSummary: [
              {
                path: settingsPath,
                changedKeys: ['enforcedAuthType'],
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
          apply: async () => ({
            ok: false,
            changedFiles: [],
            noChanges: false,
            diffSummary: [],
            warnings: [
              {
                code: 'apply-warning-1',
                level: 'warning',
                message: 'apply warning',
              },
            ],
            limitations: [
              {
                code: 'apply-limitation-1',
                level: 'limitation',
                message: 'apply limitation',
              },
            ],
          }),
        }),
      } as any,
      {
        createBeforeApply: async () => ({
          backupId: 'snapshot-gemini-20260409123000-abcdef',
          manifestPath: 'backups/gemini/manifest.json',
          targetFiles: [settingsPath],
          warnings: [],
          limitations: [],
        }),
      } as any,
      {
        markCurrent: async () => {
          markCurrentCalled = true
        },
      } as any,
    )

    const result = await service.use('gemini-apply-fail', { force: true })

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      action: 'use',
      error: expect.objectContaining({
        code: 'APPLY_FAILED',
        message: '配置写入失败',
      }),
    }))
    expect(result.warnings).toEqual(['apply warning'])
    expect(result.limitations).toEqual(['apply limitation'])
    expect(markCurrentCalled).toBe(false)
  })

  it('dryRun 成功时 summary 与顶层 explainable 摘要保持一致', async () => {
    await fs.writeFile(settingsPath, JSON.stringify({ enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: {
            GEMINI_API_KEY: 'gm-live-123456',
            enforcedAuthType: 'gemini-api-key',
          },
        },
      ],
    })

    const result = await new SwitchService().use('gemini-prod', { dryRun: true, force: true })

    expect(result.ok).toBe(true)
    expect(result.action).toBe('use')
    expect(result.data?.summary).toEqual({
      warnings: result.warnings ?? [],
      limitations: result.limitations ?? [],
    })
    expect(result.data?.noChanges).toBe(true)
    expect(result.data?.changedFiles).toEqual([])
  })
})
