import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PreviewService } from '../../src/services/preview.service'
import { RollbackService } from '../../src/services/rollback.service'
import { SnapshotStore } from '../../src/stores/snapshot.store'
import { SwitchService } from '../../src/services/switch.service'
import { ProfilesStore } from '../../src/stores/profiles.store'
import { StateStore } from '../../src/stores/state.store'

let runtimeDir: string
let geminiSettingsPath: string
let geminiProjectRoot: string
let geminiProjectSettingsPath: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-gemini-it-'))
  geminiSettingsPath = path.join(runtimeDir, 'settings.json')
  geminiProjectRoot = path.join(runtimeDir, 'workspace')
  geminiProjectSettingsPath = path.join(geminiProjectRoot, '.gemini', 'settings.json')

  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
  process.env.API_SWITCHER_GEMINI_SETTINGS_PATH = geminiSettingsPath
  process.env.API_SWITCHER_GEMINI_PROJECT_ROOT = geminiProjectRoot

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
      {
        id: 'gemini-proxy',
        name: 'gemini-proxy',
        platform: 'gemini',
        source: {
          apiKey: 'gm-live-654321',
          authType: 'gemini-api-key',
          baseURL: 'https://proxy.example.com',
          notes: 'Gemini 代理链路',
        },
        apply: {
          GEMINI_API_KEY: 'gm-live-654321',
          enforcedAuthType: 'gemini-api-key',
          GEMINI_BASE_URL: 'https://proxy.example.com',
        },
      },
    ],
  })

  await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'oauth-personal' }, null, 2), 'utf8')
  await fs.mkdir(path.dirname(geminiProjectSettingsPath), { recursive: true })
  await fs.writeFile(geminiProjectSettingsPath, JSON.stringify({ projectOnly: true }, null, 2), 'utf8')
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  delete process.env.API_SWITCHER_GEMINI_SETTINGS_PATH
  delete process.env.API_SWITCHER_GEMINI_PROJECT_ROOT
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('gemini preview/use/rollback integration', () => {
  it('preview 支持显式 project scope，并把 user -> project 写入升级为高风险确认', async () => {
    await fs.writeFile(geminiProjectSettingsPath, JSON.stringify({ projectOnly: true, enforcedAuthType: 'oauth-personal' }, null, 2), 'utf8')

    const result = await new PreviewService().preview('gemini-prod', { scope: 'project' })

    expect(result.ok).toBe(true)
    expect(result.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: geminiProjectSettingsPath,
        scope: 'project',
        role: 'settings',
        managedKeys: ['enforcedAuthType'],
      }),
    ])
    expect(result.data?.preview.diffSummary).toEqual([
      expect.objectContaining({
        path: geminiProjectSettingsPath,
        changedKeys: ['enforcedAuthType'],
        preservedKeys: ['projectOnly'],
        hasChanges: true,
      }),
    ])
    expect(result.data?.preview.effectiveFields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'enforcedAuthType',
        source: 'profile',
        scope: 'project',
      }),
    ]))
    expect(result.data?.preview.effectiveConfig?.stored).toEqual([
      expect.objectContaining({
        key: 'enforcedAuthType',
        maskedValue: 'oauth-personal',
        source: 'stored',
        scope: 'project',
      }),
    ])
    expect(result.data?.preview.managedBoundaries).toEqual([
      expect.objectContaining({
        target: geminiProjectSettingsPath,
        type: 'managed-fields',
        preservedKeys: ['projectOnly'],
      }),
    ])
    expect(result.data?.preview.riskLevel).toBe('high')
    expect(result.data?.preview.requiresConfirmation).toBe(true)
    expect(result.data?.risk.allowed).toBe(false)
    expect(result.data?.risk.riskLevel).toBe('high')
    expect(result.data?.risk.reasons).toContain('Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。')
    expect(result.data?.scopeAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'project',
        status: 'available',
        writable: true,
      }),
    ]))
  })

  it('use project scope 没有 force 时会被确认门槛阻止', async () => {
    await fs.writeFile(geminiProjectSettingsPath, JSON.stringify({ projectOnly: true, enforcedAuthType: 'oauth-personal' }, null, 2), 'utf8')

    const result = await new SwitchService().use('gemini-prod', { scope: 'project' })
    const confirmationDetails = result.error?.details as {
      scopePolicy?: {
        requestedScope?: string
        resolvedScope?: string
        riskWarning?: string
      }
      scopeAvailability?: Array<{
        scope?: string
        status?: string
        writable?: boolean
        path?: string
      }>
    } | undefined
    const scopePolicy = confirmationDetails?.scopePolicy as {
      requestedScope?: string
      resolvedScope?: string
      riskWarning?: string
    } | undefined
    const scopeAvailability = confirmationDetails?.scopeAvailability as Array<{
      scope?: string
      status?: string
      writable?: boolean
      path?: string
    }> | undefined
    const projectAvailability = scopeAvailability?.find((item) => item.scope === 'project')

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CONFIRMATION_REQUIRED')
    expect(result.warnings).toContain('Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。')
    expect(scopePolicy?.requestedScope).toBe('project')
    expect(scopePolicy?.resolvedScope).toBe('project')
    expect(scopePolicy?.riskWarning).toBe('Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。')
    expect(projectAvailability).toEqual(expect.objectContaining({
      scope: 'project',
      status: 'available',
      writable: true,
      path: geminiProjectSettingsPath,
    }))
    expect(result.error?.details).toEqual(expect.objectContaining({
      risk: expect.objectContaining({
        allowed: false,
        riskLevel: 'high',
        reasons: expect.arrayContaining([
          'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
        ]),
      }),
      scopePolicy: expect.objectContaining({
        requestedScope: 'project',
        resolvedScope: 'project',
        defaultScope: 'user',
        explicitScope: true,
        highRisk: true,
        riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
        rollbackScopeMatchRequired: true,
      }),
      scopeAvailability: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          status: 'available',
          writable: true,
          path: geminiProjectSettingsPath,
        }),
      ]),
    }))

    const userSettings = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    const projectSettings = JSON.parse(await fs.readFile(geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    expect(userSettings.enforcedAuthType).toBe('oauth-personal')
    expect((userSettings.ui as { theme?: string }).theme).toBe('dark')
    expect(projectSettings.enforcedAuthType).toBe('oauth-personal')
    expect(projectSettings.projectOnly).toBe(true)
  })

  it('preview --scope project 在 project scope 无法解析时返回结构化 availability 失败', async () => {
    process.env.API_SWITCHER_GEMINI_PROJECT_ROOT = path.join(runtimeDir, 'missing-project-root')

    const result = await new PreviewService().preview('gemini-prod', { scope: 'project' })

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('PREVIEW_FAILED')
    expect(result.error?.details).toEqual(expect.objectContaining({
      requestedScope: 'project',
      scopeAvailability: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          status: 'unresolved',
          reasonCode: 'PROJECT_ROOT_UNRESOLVED',
        }),
      ]),
    }))
  })

  it('use --scope project 在 availability 不可用时先返回结构化失败而非 CONFIRMATION_REQUIRED', async () => {
    process.env.API_SWITCHER_GEMINI_PROJECT_ROOT = path.join(runtimeDir, 'missing-project-root')

    const result = await new SwitchService().use('gemini-prod', { scope: 'project' })

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('USE_FAILED')
    expect(result.error?.details).toEqual(expect.objectContaining({
      requestedScope: 'project',
      scopeAvailability: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          status: 'unresolved',
          reasonCode: 'PROJECT_ROOT_UNRESOLVED',
        }),
      ]),
    }))
    expect(result.error?.code).not.toBe('CONFIRMATION_REQUIRED')
  })

  it('use project scope 会独立备份并只写入 project settings，rollback 只恢复 project', async () => {
    await fs.writeFile(geminiProjectSettingsPath, JSON.stringify({ projectOnly: true, enforcedAuthType: 'oauth-personal' }, null, 2), 'utf8')

    const result = await new SwitchService().use('gemini-prod', { scope: 'project', force: true })

    expect(result.ok).toBe(true)
    expect(result.data?.backupId).toMatch(/^snapshot-gemini-/)
    expect(result.data?.changedFiles).toEqual([geminiProjectSettingsPath])
    expect(result.data?.scopeAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'project',
        status: 'available',
        writable: true,
      }),
    ]))
    expect(result.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: geminiProjectSettingsPath,
        scope: 'project',
      }),
    ])

    const userSettings = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    const projectSettings = JSON.parse(await fs.readFile(geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    expect(userSettings.enforcedAuthType).toBe('oauth-personal')
    expect(projectSettings.enforcedAuthType).toBe('gemini-api-key')
    expect(projectSettings.projectOnly).toBe(true)

    const manifest = await new SnapshotStore().readManifest('gemini', result.data!.backupId!)
    expect(manifest.manifest.scopePolicy).toEqual({
      requestedScope: 'project',
      resolvedScope: 'project',
      defaultScope: 'user',
      explicitScope: true,
      highRisk: true,
      riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
      rollbackScopeMatchRequired: true,
    })

    await fs.writeFile(geminiProjectSettingsPath, JSON.stringify({ enforcedAuthType: 'mutated' }, null, 2), 'utf8')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ enforcedAuthType: 'user-mutated' }, null, 2), 'utf8')

    const rollbackResult = await new RollbackService().rollback(result.data?.backupId, { scope: 'project' })

    expect(rollbackResult.ok).toBe(true)
    expect(rollbackResult.data?.restoredFiles).toEqual([geminiProjectSettingsPath])
    expect(rollbackResult.data?.rollback?.targetFiles).toEqual([
      expect.objectContaining({
        path: geminiProjectSettingsPath,
        scope: 'project',
      }),
    ])

    const restoredProject = JSON.parse(await fs.readFile(geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    const untouchedUser = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    expect(restoredProject.enforcedAuthType).toBe('oauth-personal')
    expect(restoredProject.projectOnly).toBe(true)
    expect(untouchedUser.enforcedAuthType).toBe('user-mutated')
  })

  it('rollback --scope project 在 availability 不可用时先返回结构化失败而非 scope mismatch', async () => {
    await fs.writeFile(geminiProjectSettingsPath, JSON.stringify({ projectOnly: true, enforcedAuthType: 'oauth-personal' }, null, 2), 'utf8')

    const useResult = await new SwitchService().use('gemini-prod', { scope: 'project', force: true })
    expect(useResult.ok).toBe(true)

    process.env.API_SWITCHER_GEMINI_PROJECT_ROOT = path.join(runtimeDir, 'missing-project-root')
    const rollbackResult = await new RollbackService().rollback(useResult.data?.backupId, { scope: 'project' })

    expect(rollbackResult.ok).toBe(false)
    expect(rollbackResult.error?.code).toBe('ROLLBACK_FAILED')
    expect(rollbackResult.error?.code).not.toBe('ROLLBACK_SCOPE_MISMATCH')
    expect(rollbackResult.error?.details).toEqual(expect.objectContaining({
      scopePolicy: {
        requestedScope: 'project',
        resolvedScope: 'project',
        defaultScope: 'user',
        explicitScope: true,
        highRisk: true,
        riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
        rollbackScopeMatchRequired: true,
      },
      scopeAvailability: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          status: 'unresolved',
          reasonCode: 'PROJECT_ROOT_UNRESOLVED',
        }),
      ]),
    }))
  })

  it('preview 能返回 Gemini env-first explainable 结果', async () => {
    const result = await new PreviewService().preview('gemini-prod')
    expect(result.ok).toBe(true)
    expect(result.data?.risk).toEqual(expect.objectContaining({
      allowed: false,
      riskLevel: 'medium',
    }))
    expect(result.data?.summary).toEqual({
      warnings: result.data?.risk.reasons ?? [],
      limitations: result.data?.risk.limitations ?? [],
    })
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

  it('preview 会把 Gemini 自定义 base URL 标记为实验性支持', async () => {
    const result = await new PreviewService().preview('gemini-proxy')

    expect(result.ok).toBe(true)
    expect(result.data?.preview.backupPlanned).toBe(true)
    expect(result.data?.preview.effectiveFields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'GEMINI_BASE_URL',
        maskedValue: 'https://proxy.example.com',
        source: 'managed-policy',
        scope: 'runtime',
      }),
      expect.objectContaining({
        key: 'GEMINI_API_KEY',
        maskedValue: 'gm-l***21',
        source: 'env',
        scope: 'runtime',
        secret: true,
      }),
    ]))
    expect(result.data?.preview.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'legacy-gemini-base-url',
        message: '检测到 legacy apply.GEMINI_BASE_URL，已按实验性配置解释。',
      }),
      expect.objectContaining({
        code: 'experimental-gemini-base-url',
        message: 'Gemini 自定义 base URL 属于实验性支持，默认不按稳定托管字段写入。',
      }),
    ]))
  })


  it('use 能写入 settings.json 并返回 Gemini explainable 结果', async () => {
    const result = await new SwitchService().use('gemini-prod', { force: true })
    expect(result.ok).toBe(true)
    expect(result.data?.backupId).toMatch(/^snapshot-gemini-/)
    expect(result.data?.risk).toEqual(expect.objectContaining({
      allowed: true,
      riskLevel: 'medium',
    }))
    expect(result.data?.summary).toEqual({
      warnings: result.data?.risk.reasons ?? [],
      limitations: result.data?.risk.limitations ?? [],
    })
    expect(result.data?.risk.reasons).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(result.data?.risk.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
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

  it('use 会写入稳定 Gemini 设置，但把实验性 base URL 明确标记为未落盘', async () => {
    const result = await new SwitchService().use('gemini-proxy', { force: true })

    expect(result.ok).toBe(true)
    expect(result.data?.changedFiles).toEqual([geminiSettingsPath])
    expect(result.data?.summary.warnings).toContain('Gemini 实验性 base URL 当前没有可靠写入目标，本次不会落盘。')

    const settings = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    expect(settings.enforcedAuthType).toBe('gemini-api-key')
    expect(settings.GEMINI_BASE_URL).toBeUndefined()
  })

  it('rollback 能恢复 settings.json 并返回 Gemini explainable 元数据', async () => {
    const switchResult = await new SwitchService().use('gemini-prod', { force: true })
    const backupId = switchResult.data?.backupId
    expect(backupId).toBeTruthy()

    await fs.writeFile(geminiSettingsPath, JSON.stringify({ enforcedAuthType: 'other' }, null, 2), 'utf8')

    const rollbackResult = await new RollbackService().rollback(backupId)
    expect(rollbackResult.ok).toBe(true)
    expect(rollbackResult.data?.summary.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(rollbackResult.data?.summary.warnings).toContain('当前 Gemini settings.json 存在非托管字段：ui')
    expect(rollbackResult.data?.summary.warnings).toContain('Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。')
    expect(rollbackResult.data?.summary.warnings).toContain('已按快照清单恢复托管文件。')
    expect(rollbackResult.data?.summary.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(rollbackResult.data?.summary.limitations).toContain('当前仅稳定托管 settings.json 中已确认字段 enforcedAuthType。')
    expect(rollbackResult.data?.summary.limitations).toContain('回滚不会恢复环境变量。')
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
