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
  it('preview 能返回 Codex 双文件 explainable 结果', async () => {
    const result = await new PreviewService().preview('codex-prod')
    expect(result.ok).toBe(true)
    expect(result.data?.risk).toEqual(expect.objectContaining({
      allowed: false,
      riskLevel: 'medium',
    }))
    expect(result.data?.risk.reasons).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.data?.risk.reasons).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.data?.risk.reasons).toContain('Codex 将修改多个目标文件。')
    expect(result.data?.risk.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.data?.preview.targetFiles).toHaveLength(2)
    expect(result.data?.preview.targetFiles.map((item) => item.path)).toEqual([codexConfigPath, codexAuthPath])
    expect(result.data?.preview.diffSummary).toHaveLength(2)
    expect(result.data?.preview.diffSummary?.[0]).toMatchObject({
      path: codexConfigPath,
      changedKeys: ['base_url'],
      managedKeys: ['base_url'],
      preservedKeys: ['default_provider'],
    })
    expect(result.data?.preview.diffSummary?.[1]).toMatchObject({
      path: codexAuthPath,
      changedKeys: ['OPENAI_API_KEY'],
      managedKeys: ['OPENAI_API_KEY'],
      preservedKeys: ['user_id'],
    })
    expect(result.data?.preview.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'multi-file-transaction',
        managedKeys: ['base_url', 'OPENAI_API_KEY'],
        notes: ['Codex 配置切换会联动 config.toml 与 auth.json。'],
      }),
      expect.objectContaining({
        target: codexConfigPath,
        type: 'managed-fields',
        managedKeys: ['base_url'],
        preservedKeys: ['default_provider'],
      }),
      expect.objectContaining({
        target: codexAuthPath,
        type: 'managed-fields',
        managedKeys: ['OPENAI_API_KEY'],
        preservedKeys: ['user_id'],
      }),
    ]))
    expect(result.data?.preview.secretReferences).toEqual([
      {
        key: 'OPENAI_API_KEY',
        source: 'inline',
        present: true,
        maskedValue: 'sk-c***56',
      },
    ])
    expect(result.data?.preview.effectiveConfig?.stored).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'base_url',
        maskedValue: 'https://old.example.com/v1',
        source: 'stored',
        secret: false,
      }),
      expect.objectContaining({
        key: 'OPENAI_API_KEY',
        maskedValue: 'sk-o***00',
        source: 'stored',
        secret: true,
      }),
    ]))
    expect(result.data?.preview.effectiveConfig?.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'base_url',
        maskedValue: 'https://gateway.example.com/openai/v1',
        source: 'effective',
        secret: false,
      }),
      expect.objectContaining({
        key: 'OPENAI_API_KEY',
        maskedValue: 'sk-c***56',
        source: 'effective',
        secret: true,
      }),
    ]))
    expect(result.data?.preview.preservedFields).toEqual(['default_provider', 'user_id'])
    expect(result.data?.preview.warnings.some((item) => item.code === 'unmanaged-current-file' && item.message.includes('default_provider'))).toBe(true)
    expect(result.data?.preview.warnings.some((item) => item.code === 'unmanaged-current-file' && item.message.includes('user_id'))).toBe(true)
    expect(result.data?.preview.warnings.some((item) => item.code === 'multi-file-overwrite')).toBe(true)
    expect(result.data?.preview.limitations.map((item) => item.message)).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.data?.preview.riskLevel).toBe('medium')
    expect(result.data?.preview.requiresConfirmation).toBe(true)
    expect(result.data?.preview.backupPlanned).toBe(true)
    expect(result.data?.preview.noChanges).toBe(false)
  })


  it('use 能同时写入 config.toml 和 auth.json 并返回 explainable 结果', async () => {
    const result = await new SwitchService().use('codex-prod', { force: true })
    expect(result.ok).toBe(true)
    expect(result.data?.backupId).toMatch(/^snapshot-codex-/)
    expect(result.data?.risk).toEqual(expect.objectContaining({
      allowed: true,
      riskLevel: 'medium',
    }))
    expect(result.data?.risk.reasons).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.data?.risk.reasons).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.data?.risk.reasons).toContain('Codex 将修改多个目标文件。')
    expect(result.data?.risk.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.data?.changedFiles).toEqual([codexConfigPath, codexAuthPath])
    expect(result.data?.preview.managedBoundaries?.some((item) => item.type === 'multi-file-transaction')).toBe(true)
    expect(result.data?.preview.secretReferences).toEqual([
      {
        key: 'OPENAI_API_KEY',
        source: 'inline',
        present: true,
        maskedValue: 'sk-c***56',
      },
    ])
    expect(result.data?.preview.limitations.map((item) => item.message)).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.data?.preview.warnings.some((item) => item.code === 'multi-file-overwrite')).toBe(true)
    expect(result.data?.noChanges).toBe(false)

    const configContent = await fs.readFile(codexConfigPath, 'utf8')
    const config = parseCodexConfig(configContent)
    const auth = JSON.parse(await fs.readFile(codexAuthPath, 'utf8')) as Record<string, unknown>

    expect(config.base_url).toBe('https://gateway.example.com/openai/v1')
    expect(config.default_provider).toBe('openai')
    expect(configContent).toContain('default_provider = "openai"')
    expect(auth.OPENAI_API_KEY).toBe('sk-codex-live-123456')
    expect(auth.user_id).toBe('u-1')

    const state = await new StateStore().read()
    expect(state.current.codex).toBe('codex-prod')
  })

  it('use 会保留 Codex config.toml 的注释空行和分隔样式', async () => {
    await fs.writeFile(
      codexConfigPath,
      '# codex config\ndefault_provider = "openai"\n\n  base_url   =   "https://old.example.com/v1"   # managed endpoint\ncustom_flag=true\n',
      'utf8',
    )

    const result = await new SwitchService().use('codex-prod', { force: true })
    expect(result.ok).toBe(true)

    const configContent = await fs.readFile(codexConfigPath, 'utf8')
    expect(configContent).toBe(
      '# codex config\ndefault_provider = "openai"\n\n  base_url   =   "https://gateway.example.com/openai/v1"   # managed endpoint\ncustom_flag=true\n',
    )

    const config = parseCodexConfig(configContent)
    expect(config.default_provider).toBe('openai')
    expect(config.base_url).toBe('https://gateway.example.com/openai/v1')
    expect(config.custom_flag).toBe(true)
  })

  it('rollback 能恢复 Codex 双文件并返回 explainable 元数据', async () => {
    const switchResult = await new SwitchService().use('codex-prod', { force: true })
    const backupId = switchResult.data?.backupId
    expect(backupId).toBeTruthy()

    await fs.writeFile(codexConfigPath, 'default_provider = "other"\n', 'utf8')
    await fs.writeFile(codexAuthPath, JSON.stringify({ OPENAI_API_KEY: 'sk-other' }, null, 2), 'utf8')

    const rollbackResult = await new RollbackService().rollback(backupId)
    expect(rollbackResult.ok).toBe(true)
    expect(rollbackResult.data?.summary.warnings).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(rollbackResult.data?.summary.warnings).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(rollbackResult.data?.summary.warnings).toContain('Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(rollbackResult.data?.summary.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(rollbackResult.data?.restoredFiles).toEqual([codexConfigPath, codexAuthPath])
    expect(rollbackResult.data?.rollback?.targetFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: codexConfigPath,
        managedKeys: ['base_url'],
        role: 'config',
      }),
      expect.objectContaining({
        path: codexAuthPath,
        managedKeys: ['OPENAI_API_KEY'],
        role: 'auth',
      }),
    ]))
    expect(rollbackResult.data?.rollback?.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'multi-file-transaction',
        managedKeys: ['base_url', 'OPENAI_API_KEY'],
      }),
      expect.objectContaining({
        target: codexConfigPath,
        preservedKeys: ['default_provider'],
      }),
      expect.objectContaining({
        target: codexAuthPath,
        preservedKeys: ['user_id'],
      }),
    ]))
    expect(rollbackResult.data?.rollback?.warnings?.some((item) => item.message.includes('default_provider'))).toBe(true)
    expect(rollbackResult.data?.rollback?.warnings?.some((item) => item.message.includes('user_id'))).toBe(true)
    expect(rollbackResult.data?.rollback?.warnings?.some((item) => item.message.includes('config.toml 与 auth.json'))).toBe(true)
    expect(rollbackResult.data?.rollback?.limitations?.map((item) => item.message)).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')

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

  it('use 会在缺失 managed key 时追加到末尾并保留前置注释块', async () => {
    await fs.writeFile(
      codexConfigPath,
      '# codex config\n# keep this block\ndefault_provider = "openai"\n\ncustom_flag = true\n',
      'utf8',
    )

    const result = await new SwitchService().use('codex-prod', { force: true })
    expect(result.ok).toBe(true)

    const configContent = await fs.readFile(codexConfigPath, 'utf8')
    expect(configContent).toBe(
      '# codex config\n# keep this block\ndefault_provider = "openai"\n\ncustom_flag = true\n\nbase_url = "https://gateway.example.com/openai/v1"\n',
    )
  })

  it('use 会保留混合空白格式与多段注释块', async () => {
    await fs.writeFile(
      codexConfigPath,
      '# header\n\ndefault_provider\t=\t"openai"\n# endpoint section\n\tbase_url= "https://old.example.com/v1" # trailing\n# footer\ncustom_flag = true\n',
      'utf8',
    )

    const result = await new SwitchService().use('codex-prod', { force: true })
    expect(result.ok).toBe(true)

    const configContent = await fs.readFile(codexConfigPath, 'utf8')
    expect(configContent).toBe(
      '# header\n\ndefault_provider\t=\t"openai"\n# endpoint section\n\tbase_url= "https://gateway.example.com/openai/v1" # trailing\n# footer\ncustom_flag = true\n',
    )
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
