import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClaudeAdapter } from '../../src/adapters/claude/claude.adapter'
import { PreviewService } from '../../src/services/preview.service'
import { RollbackService } from '../../src/services/rollback.service'
import { SwitchService } from '../../src/services/switch.service'
import { ProfilesStore } from '../../src/stores/profiles.store'
import { StateStore } from '../../src/stores/state.store'

let runtimeDir: string
let claudeProjectRoot: string
let claudeUserSettingsPath: string
let claudeProjectSettingsPath: string
let claudeLocalSettingsPath: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-it-'))
  claudeProjectRoot = path.join(runtimeDir, 'workspace')
  claudeUserSettingsPath = path.join(runtimeDir, 'claude-user-settings.json')
  claudeProjectSettingsPath = path.join(claudeProjectRoot, '.claude', 'settings.json')
  claudeLocalSettingsPath = path.join(claudeProjectRoot, '.claude', 'settings.local.json')
  await fs.mkdir(path.dirname(claudeProjectSettingsPath), { recursive: true })
  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
  process.env.API_SWITCHER_CLAUDE_PROJECT_ROOT = claudeProjectRoot
  process.env.API_SWITCHER_CLAUDE_USER_SETTINGS_PATH = claudeUserSettingsPath
  process.env.API_SWITCHER_CLAUDE_PROJECT_SETTINGS_PATH = claudeProjectSettingsPath
  process.env.API_SWITCHER_CLAUDE_LOCAL_SETTINGS_PATH = claudeLocalSettingsPath
  process.env.API_SWITCHER_CLAUDE_TARGET_SCOPE = 'project'

  const profilesStore = new ProfilesStore()
  await profilesStore.write({
    version: 1,
    profiles: [
      {
        id: 'claude-prod',
        name: 'prod',
        platform: 'claude',
        source: { token: 'sk-live-123456', baseURL: 'https://gateway.example.com/api' },
        apply: {
          ANTHROPIC_AUTH_TOKEN: 'sk-live-123456',
          ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
        },
      },
    ],
  })

  await fs.writeFile(
    claudeProjectSettingsPath,
    JSON.stringify({ theme: 'dark', ANTHROPIC_AUTH_TOKEN: 'sk-old-000', ANTHROPIC_BASE_URL: 'https://old.example.com/api' }, null, 2),
    'utf8',
  )
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  delete process.env.API_SWITCHER_CLAUDE_PROJECT_ROOT
  delete process.env.API_SWITCHER_CLAUDE_USER_SETTINGS_PATH
  delete process.env.API_SWITCHER_CLAUDE_PROJECT_SETTINGS_PATH
  delete process.env.API_SWITCHER_CLAUDE_LOCAL_SETTINGS_PATH
  delete process.env.API_SWITCHER_CLAUDE_TARGET_SCOPE
  delete process.env.API_SWITCHER_CLAUDE_SETTINGS_PATH
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('preview/use/rollback integration', () => {
  it('preview 能返回 Claude scope-aware explainable 结果', async () => {
    const result = await new PreviewService().preview('claude-prod')
    expect(result.ok).toBe(true)
    expect(result.data?.risk).toEqual(expect.objectContaining({
      allowed: false,
      riskLevel: 'medium',
    }))
    expect(result.data?.risk.reasons).toContain('当前 Claude 配置存在非托管字段：theme')
    expect(result.data?.risk.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: claudeProjectSettingsPath,
        scope: 'project',
        role: 'settings',
        managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
        preservedKeys: ['theme'],
      }),
    ])
    expect(result.data?.preview.diffSummary).toEqual([
      expect.objectContaining({
        path: claudeProjectSettingsPath,
        changedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
        managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
        preservedKeys: ['theme'],
        hasChanges: true,
      }),
    ])
    expect(result.data?.preview.managedBoundaries).toEqual([
      expect.objectContaining({
        target: claudeProjectSettingsPath,
        type: 'scope-aware',
        managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
        preservedKeys: ['theme'],
        notes: ['当前写入目标为 Claude 项目级配置文件。'],
      }),
    ])
    expect(result.data?.preview.secretReferences).toEqual([
      {
        key: 'ANTHROPIC_AUTH_TOKEN',
        source: 'inline',
        present: true,
        maskedValue: 'sk-l***56',
      },
    ])
    expect(result.data?.preview.effectiveConfig?.stored).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'ANTHROPIC_AUTH_TOKEN',
        maskedValue: 'sk-o***00',
        source: 'stored',
        scope: 'project',
        secret: true,
      }),
      expect.objectContaining({
        key: 'ANTHROPIC_BASE_URL',
        maskedValue: 'https://old.example.com/api',
        source: 'stored',
        scope: 'project',
        secret: false,
      }),
    ]))
    expect(result.data?.preview.effectiveConfig?.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'ANTHROPIC_AUTH_TOKEN',
        maskedValue: 'sk-l***56',
        source: 'scope-project',
        scope: 'project',
        secret: true,
      }),
      expect.objectContaining({
        key: 'ANTHROPIC_BASE_URL',
        maskedValue: 'https://gateway.example.com/api',
        source: 'scope-project',
        scope: 'project',
        secret: false,
      }),
    ]))
    expect(result.data?.preview.effectiveConfig?.overrides).toEqual([])
    expect(result.data?.preview.preservedFields).toEqual(['theme'])
    expect(result.data?.preview.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'unmanaged-current-file',
        message: '当前 Claude 配置存在非托管字段：theme',
      }),
    ]))
    expect(result.data?.preview.limitations.map((item) => item.message)).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.data?.preview.riskLevel).toBe('medium')
    expect(result.data?.preview.requiresConfirmation).toBe(true)
    expect(result.data?.preview.backupPlanned).toBe(true)
    expect(result.data?.preview.noChanges).toBe(false)
  })


  it('preview 会标记被更高优先级 Claude local scope 覆盖的字段', async () => {
    await fs.writeFile(
      claudeLocalSettingsPath,
      JSON.stringify({ ANTHROPIC_AUTH_TOKEN: 'sk-local-999999' }, null, 2),
      'utf8',
    )

    const result = await new PreviewService().preview('claude-prod')
    expect(result.ok).toBe(true)
    expect(result.data?.risk.reasons).toContain('以下字段写入 Claude 项目级后仍会被更高优先级作用域覆盖：ANTHROPIC_AUTH_TOKEN')
    expect(result.warnings).toContain('以下字段写入 Claude 项目级后仍会被更高优先级作用域覆盖：ANTHROPIC_AUTH_TOKEN')
    expect(result.data?.preview.effectiveConfig?.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'ANTHROPIC_AUTH_TOKEN',
        maskedValue: 'sk-l***99',
        source: 'scope-local',
        scope: 'local',
        secret: true,
        shadowed: true,
      }),
      expect.objectContaining({
        key: 'ANTHROPIC_BASE_URL',
        maskedValue: 'https://gateway.example.com/api',
        source: 'scope-project',
        scope: 'project',
        secret: false,
        shadowed: false,
      }),
    ]))
    expect(result.data?.preview.effectiveConfig?.overrides).toEqual([
      expect.objectContaining({
        key: 'ANTHROPIC_AUTH_TOKEN',
        kind: 'scope',
        source: 'scope-local',
        shadowed: true,
        targetScope: 'project',
      }),
    ])
    expect(result.data?.preview.effectiveConfig?.shadowedKeys).toEqual(['ANTHROPIC_AUTH_TOKEN'])
    expect(result.data?.preview.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'shadowed-by-higher-scope',
        message: '以下字段写入 Claude 项目级后仍会被更高优先级作用域覆盖：ANTHROPIC_AUTH_TOKEN',
        source: 'scope-project',
      }),
    ]))
    expect(result.warnings).toContain('以下字段写入 Claude 项目级后仍会被更高优先级作用域覆盖：ANTHROPIC_AUTH_TOKEN')
  })

  it('detectCurrent 能返回 Claude 当前生效 scope 与未匹配 profile 的现状', async () => {
    const profiles = await new ProfilesStore().list()
    const result = await new ClaudeAdapter().detectCurrent(profiles)

    expect(result).toEqual(expect.objectContaining({
      platform: 'claude',
      matchedProfileId: undefined,
      managed: false,
      currentScope: 'project',
      targetFiles: expect.arrayContaining([
        expect.objectContaining({
          path: claudeUserSettingsPath,
          scope: 'user',
          role: 'settings',
        }),
        expect.objectContaining({
          path: claudeProjectSettingsPath,
          scope: 'project',
          role: 'settings',
        }),
        expect.objectContaining({
          path: claudeLocalSettingsPath,
          scope: 'local',
          role: 'settings',
        }),
      ]),
      managedBoundaries: [
        expect.objectContaining({
          target: claudeProjectSettingsPath,
          type: 'scope-aware',
          managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
          notes: ['当前生效配置来自 Claude 项目级配置文件。'],
        }),
      ],
      secretReferences: [
        expect.objectContaining({
          key: 'ANTHROPIC_AUTH_TOKEN',
          maskedValue: 'sk-o***00',
          source: 'inline',
          present: true,
        }),
      ],
    }))
    expect(result?.effectiveConfig?.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'ANTHROPIC_AUTH_TOKEN',
        maskedValue: 'sk-o***00',
        source: 'scope-project',
        scope: 'project',
        secret: true,
      }),
      expect.objectContaining({
        key: 'ANTHROPIC_BASE_URL',
        maskedValue: 'https://old.example.com/api',
        source: 'scope-project',
        scope: 'project',
        secret: false,
      }),
    ]))
  })

  it('detectCurrent 会在切换后返回匹配的 Claude profile', async () => {
    await new SwitchService().use('claude-prod', { force: true })

    const profiles = await new ProfilesStore().list()
    const result = await new ClaudeAdapter().detectCurrent(profiles)

    expect(result).toEqual(expect.objectContaining({
      platform: 'claude',
      matchedProfileId: 'claude-prod',
      managed: true,
      currentScope: 'project',
    }))
    expect(result?.effectiveConfig?.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'ANTHROPIC_AUTH_TOKEN',
        maskedValue: 'sk-l***56',
        source: 'scope-project',
        scope: 'project',
        secret: true,
      }),
      expect.objectContaining({
        key: 'ANTHROPIC_BASE_URL',
        maskedValue: 'https://gateway.example.com/api',
        source: 'scope-project',
        scope: 'project',
        secret: false,
      }),
    ]))
  })

  it('detectCurrent 会在 local scope 覆盖时返回 local currentScope', async () => {
    await fs.writeFile(
      claudeLocalSettingsPath,
      JSON.stringify({ ANTHROPIC_AUTH_TOKEN: 'sk-local-999999' }, null, 2),
      'utf8',
    )

    const profiles = await new ProfilesStore().list()
    const result = await new ClaudeAdapter().detectCurrent(profiles)

    expect(result).toEqual(expect.objectContaining({
      platform: 'claude',
      matchedProfileId: undefined,
      managed: false,
      currentScope: 'local',
      managedBoundaries: [
        expect.objectContaining({
          target: claudeLocalSettingsPath,
          type: 'scope-aware',
          notes: ['当前生效配置来自 Claude 本地级配置文件。'],
        }),
      ],
    }))
    expect(result?.effectiveConfig?.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'ANTHROPIC_AUTH_TOKEN',
        maskedValue: 'sk-l***99',
        source: 'scope-local',
        scope: 'local',
        secret: true,
      }),
      expect.objectContaining({
        key: 'ANTHROPIC_BASE_URL',
        maskedValue: 'https://old.example.com/api',
        source: 'scope-project',
        scope: 'project',
        secret: false,
      }),
    ]))
  })

  it('use 能创建 snapshot、写入文件并更新 state', async () => {
    const result = await new SwitchService().use('claude-prod', { force: true })
    expect(result.ok).toBe(true)
    expect(result.data?.backupId).toMatch(/^snapshot-claude-/)
    expect(result.data?.risk).toEqual(expect.objectContaining({
      allowed: true,
      riskLevel: 'medium',
    }))
    expect(result.data?.risk.reasons).toContain('当前 Claude 配置存在非托管字段：theme')
    expect(result.data?.risk.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')

    const content = JSON.parse(await fs.readFile(claudeProjectSettingsPath, 'utf8'))
    expect(content.ANTHROPIC_AUTH_TOKEN).toBe('sk-live-123456')
    expect(content.theme).toBe('dark')
  })

  it('rollback 能恢复文件', async () => {
    const switchResult = await new SwitchService().use('claude-prod', { force: true })
    const backupId = switchResult.data?.backupId
    expect(backupId).toBeTruthy()

    await fs.writeFile(claudeProjectSettingsPath, JSON.stringify({ theme: 'light' }, null, 2), 'utf8')
    const rollbackResult = await new RollbackService().rollback(backupId)
    expect(rollbackResult.ok).toBe(true)
    expect(rollbackResult.data?.summary.warnings).toContain('当前 Claude 配置存在非托管字段：theme')
    expect(rollbackResult.data?.summary.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')

    const restored = JSON.parse(await fs.readFile(claudeProjectSettingsPath, 'utf8'))
    expect(restored.ANTHROPIC_AUTH_TOKEN).toBe('sk-old-000')
    expect(restored.theme).toBe('dark')

    const state = await new StateStore().read()
    expect(state.current.claude).toBeUndefined()
    expect(state.lastSwitch?.status).toBe('rolled-back')
  })

  it('no-op 情况不会创建快照', async () => {
    await fs.writeFile(
      claudeProjectSettingsPath,
      JSON.stringify({ theme: 'dark', ANTHROPIC_AUTH_TOKEN: 'sk-live-123456', ANTHROPIC_BASE_URL: 'https://gateway.example.com/api' }, null, 2),
      'utf8',
    )

    const result = await new SwitchService().use('claude-prod', { force: true })
    expect(result.ok).toBe(true)
    expect(result.data?.noChanges).toBe(true)
    expect(result.data?.backupId).toBeUndefined()
  })
})
