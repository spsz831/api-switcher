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
  it('preview 能返回统一结果', async () => {
    const result = await new PreviewService().preview('claude-prod')
    expect(result.ok).toBe(true)
    expect(result.data?.preview.targetFiles).toHaveLength(1)
    expect(result.data?.preview.targetFiles[0]?.path).toBe(claudeProjectSettingsPath)
  })

  it('use 能创建 snapshot、写入文件并更新 state', async () => {
    const result = await new SwitchService().use('claude-prod', { force: true })
    expect(result.ok).toBe(true)
    expect(result.data?.backupId).toMatch(/^snapshot-claude-/)

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
