import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PreviewService } from '../../src/services/preview.service'
import { RollbackService } from '../../src/services/rollback.service'
import { SwitchService } from '../../src/services/switch.service'
import { ProfilesStore } from '../../src/stores/profiles.store'
import { StateStore } from '../../src/stores/state.store'
import { parseCodexConfig } from '../../src/adapters/codex/codex.parser'

let runtimeDir: string
let codexConfigPath: string
let codexAuthPath: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-codex-it-'))
  codexConfigPath = path.join(runtimeDir, 'config.toml')
  codexAuthPath = path.join(runtimeDir, 'auth.json')

  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
  process.env.API_SWITCHER_CODEX_CONFIG_PATH = codexConfigPath
  process.env.API_SWITCHER_CODEX_AUTH_PATH = codexAuthPath

  const profilesStore = new ProfilesStore()
  await profilesStore.write({
    version: 1,
    profiles: [
      {
        id: 'codex-prod',
        name: 'codex-prod',
        platform: 'codex',
        source: { apiKey: 'sk-codex-live-123456', baseURL: 'https://gateway.example.com/openai/v1', notes: 'Codex 主线路径' },
        apply: {
          OPENAI_API_KEY: 'sk-codex-live-123456',
          base_url: 'https://gateway.example.com/openai/v1',
        },
      },
    ],
  })

  await fs.writeFile(codexConfigPath, 'default_provider = "openai"\nbase_url = "https://old.example.com/v1"\n', 'utf8')
  await fs.writeFile(codexAuthPath, JSON.stringify({ OPENAI_API_KEY: 'sk-old-000', user_id: 'u-1' }, null, 2), 'utf8')
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  delete process.env.API_SWITCHER_CODEX_CONFIG_PATH
  delete process.env.API_SWITCHER_CODEX_AUTH_PATH
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('codex preview/use/rollback integration', () => {
  it('preview 能返回 Codex 双文件结果', async () => {
    const result = await new PreviewService().preview('codex-prod')
    expect(result.ok).toBe(true)
    expect(result.data?.preview.targetFiles).toHaveLength(2)
    expect(result.data?.preview.diffSummary).toHaveLength(2)
  })

  it('use 能同时写入 config.toml 和 auth.json', async () => {
    const result = await new SwitchService().use('codex-prod', { force: true })
    expect(result.ok).toBe(true)
    expect(result.data?.backupId).toMatch(/^snapshot-codex-/)
    expect(result.data?.changedFiles).toHaveLength(2)

    const config = parseCodexConfig(await fs.readFile(codexConfigPath, 'utf8'))
    const auth = JSON.parse(await fs.readFile(codexAuthPath, 'utf8')) as Record<string, unknown>

    expect(config.base_url).toBe('https://gateway.example.com/openai/v1')
    expect(config.default_provider).toBe('openai')
    expect(auth.OPENAI_API_KEY).toBe('sk-codex-live-123456')
    expect(auth.user_id).toBe('u-1')

    const state = await new StateStore().read()
    expect(state.current.codex).toBe('codex-prod')
  })

  it('rollback 能恢复 Codex 双文件并清空 current', async () => {
    const switchResult = await new SwitchService().use('codex-prod', { force: true })
    const backupId = switchResult.data?.backupId
    expect(backupId).toBeTruthy()

    await fs.writeFile(codexConfigPath, 'default_provider = "other"\n', 'utf8')
    await fs.writeFile(codexAuthPath, JSON.stringify({ OPENAI_API_KEY: 'sk-other' }, null, 2), 'utf8')

    const rollbackResult = await new RollbackService().rollback(backupId)
    expect(rollbackResult.ok).toBe(true)
    expect(rollbackResult.data?.restoredFiles).toHaveLength(2)

    const restoredConfig = parseCodexConfig(await fs.readFile(codexConfigPath, 'utf8'))
    const restoredAuth = JSON.parse(await fs.readFile(codexAuthPath, 'utf8')) as Record<string, unknown>

    expect(restoredConfig.base_url).toBe('https://old.example.com/v1')
    expect(restoredConfig.default_provider).toBe('openai')
    expect(restoredAuth.OPENAI_API_KEY).toBe('sk-old-000')
    expect(restoredAuth.user_id).toBe('u-1')

    const state = await new StateStore().read()
    expect(state.current.codex).toBeUndefined()
    expect(state.lastSwitch?.status).toBe('rolled-back')
  })

  it('no-op 情况不会重复创建 Codex 快照', async () => {
    await fs.writeFile(codexConfigPath, 'default_provider = "openai"\nbase_url = "https://gateway.example.com/openai/v1"\n', 'utf8')
    await fs.writeFile(codexAuthPath, JSON.stringify({ OPENAI_API_KEY: 'sk-codex-live-123456', user_id: 'u-1' }, null, 2), 'utf8')

    const result = await new SwitchService().use('codex-prod', { force: true })
    expect(result.ok).toBe(true)
    expect(result.data?.noChanges).toBe(true)
    expect(result.data?.backupId).toBeUndefined()
  })
})
