import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProfilesStore } from '../../src/stores/profiles.store'
import { StateStore } from '../../src/stores/state.store'
import type { CommandResult } from '../../src/types/command'
import type { Profile } from '../../src/types/profile'

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(__dirname, '../..')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')

type CliRunResult = {
  stdout: string
  stderr: string
  exitCode: number
}

let runtimeDir: string
let claudeProjectRoot: string
let claudeUserSettingsPath: string
let claudeProjectSettingsPath: string
let claudeLocalSettingsPath: string
let codexConfigPath: string
let codexAuthPath: string
let geminiSettingsPath: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-cli-it-'))
  claudeProjectRoot = path.join(runtimeDir, 'workspace')
  claudeUserSettingsPath = path.join(runtimeDir, 'claude-user-settings.json')
  claudeProjectSettingsPath = path.join(claudeProjectRoot, '.claude', 'settings.json')
  claudeLocalSettingsPath = path.join(claudeProjectRoot, '.claude', 'settings.local.json')
  codexConfigPath = path.join(runtimeDir, 'config.toml')
  codexAuthPath = path.join(runtimeDir, 'auth.json')
  geminiSettingsPath = path.join(runtimeDir, 'gemini-settings.json')

  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
  process.env.API_SWITCHER_CLAUDE_PROJECT_ROOT = claudeProjectRoot
  process.env.API_SWITCHER_CLAUDE_USER_SETTINGS_PATH = claudeUserSettingsPath
  process.env.API_SWITCHER_CLAUDE_PROJECT_SETTINGS_PATH = claudeProjectSettingsPath
  process.env.API_SWITCHER_CLAUDE_LOCAL_SETTINGS_PATH = claudeLocalSettingsPath
  process.env.API_SWITCHER_CLAUDE_TARGET_SCOPE = 'project'
  process.env.API_SWITCHER_CODEX_CONFIG_PATH = codexConfigPath
  process.env.API_SWITCHER_CODEX_AUTH_PATH = codexAuthPath
  process.env.API_SWITCHER_GEMINI_SETTINGS_PATH = geminiSettingsPath

  const profilesStore = new ProfilesStore()
  await profilesStore.write({
    version: 1,
    profiles: [
      {
        id: 'claude-prod',
        name: 'claude-prod',
        platform: 'claude',
        source: { token: 'sk-live-123456', baseURL: 'https://gateway.example.com/api' },
        apply: {
          ANTHROPIC_AUTH_TOKEN: 'sk-live-123456',
          ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
        },
      },
      {
        id: 'codex-prod',
        name: 'codex-prod',
        platform: 'codex',
        source: { apiKey: 'sk-codex-live-123456', baseURL: 'https://gateway.example.com/openai/v1' },
        apply: {
          OPENAI_API_KEY: 'sk-codex-live-123456',
          base_url: 'https://gateway.example.com/openai/v1',
        },
      },
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
      {
        id: 'gemini-invalid',
        name: 'gemini-invalid',
        platform: 'gemini',
        source: { authType: 'gemini-api-key' },
        apply: {
          enforcedAuthType: 'gemini-api-key',
        },
      },
    ],
  })

  await fs.mkdir(path.dirname(claudeProjectSettingsPath), { recursive: true })
  await fs.writeFile(
    claudeProjectSettingsPath,
    JSON.stringify({ theme: 'dark', ANTHROPIC_AUTH_TOKEN: 'sk-old-000', ANTHROPIC_BASE_URL: 'https://old.example.com/api' }, null, 2),
    'utf8',
  )
  await fs.writeFile(codexConfigPath, 'default_provider = "openai"\nbase_url = "https://old.example.com/v1"\n', 'utf8')
  await fs.writeFile(codexAuthPath, JSON.stringify({ OPENAI_API_KEY: 'sk-old-000', user_id: 'u-1' }, null, 2), 'utf8')
  await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'oauth-personal' }, null, 2), 'utf8')
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  delete process.env.API_SWITCHER_CLAUDE_PROJECT_ROOT
  delete process.env.API_SWITCHER_CLAUDE_USER_SETTINGS_PATH
  delete process.env.API_SWITCHER_CLAUDE_PROJECT_SETTINGS_PATH
  delete process.env.API_SWITCHER_CLAUDE_LOCAL_SETTINGS_PATH
  delete process.env.API_SWITCHER_CLAUDE_TARGET_SCOPE
  delete process.env.API_SWITCHER_CLAUDE_SETTINGS_PATH
  delete process.env.API_SWITCHER_CODEX_CONFIG_PATH
  delete process.env.API_SWITCHER_CODEX_AUTH_PATH
  delete process.env.API_SWITCHER_GEMINI_SETTINGS_PATH

  await fs.rm(runtimeDir, { recursive: true, force: true })
})

async function runCli(argv: string[]): Promise<CliRunResult> {
  const env = {
    ...process.env,
    API_SWITCHER_RUNTIME_DIR: runtimeDir,
    API_SWITCHER_CLAUDE_PROJECT_ROOT: claudeProjectRoot,
    API_SWITCHER_CLAUDE_USER_SETTINGS_PATH: claudeUserSettingsPath,
    API_SWITCHER_CLAUDE_PROJECT_SETTINGS_PATH: claudeProjectSettingsPath,
    API_SWITCHER_CLAUDE_LOCAL_SETTINGS_PATH: claudeLocalSettingsPath,
    API_SWITCHER_CLAUDE_TARGET_SCOPE: 'project',
    API_SWITCHER_CODEX_CONFIG_PATH: codexConfigPath,
    API_SWITCHER_CODEX_AUTH_PATH: codexAuthPath,
    API_SWITCHER_GEMINI_SETTINGS_PATH: geminiSettingsPath,
  }

  try {
    const result = await execFileAsync(process.execPath, [tsxCliPath, 'src/cli/index.ts', ...argv], {
      cwd: repoRoot,
      env,
    })

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
    }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number | string | null }
    return {
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
    }
  }
}

function parseJsonResult<T = unknown>(stdout: string): CommandResult<T> {
  return JSON.parse(stdout) as CommandResult<T>
}

describe('cli commands integration', () => {
  it('current --json 输出结构化 state 与检测结果', async () => {
    await new StateStore().markCurrent('gemini', 'gemini-prod', 'snapshot-gemini-001')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['current', '--json'])
    const payload = parseJsonResult<{
      current: Record<string, string>
      detections: Array<{
        platform: string
        managed: boolean
        matchedProfileId?: string
        targetFiles: Array<{ path: string }>
        managedBoundaries?: Array<{ type: string; managedKeys: string[]; preservedKeys?: string[]; notes?: string[] }>
        secretReferences?: Array<{ key: string; source: string; present: boolean; maskedValue: string }>
        effectiveConfig?: {
          stored: Array<{ key: string; maskedValue: string; source: string; scope?: string; secret?: boolean }>
          effective: Array<{ key: string; maskedValue: string; source: string; scope?: string; secret?: boolean; shadowed?: boolean }>
          overrides: Array<{ key: string; kind: string; source: string; message: string; shadowed?: boolean }>
          shadowedKeys?: string[]
        }
        warnings?: Array<{ code: string; message: string }>
        limitations?: Array<{ code: string; message: string }>
      }>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('current')
    expect(payload.data?.current.gemini).toBe('gemini-prod')

    const geminiDetection = payload.data?.detections.find((item) => item.platform === 'gemini')
    expect(geminiDetection?.managed).toBe(true)
    expect(geminiDetection?.matchedProfileId).toBe('gemini-prod')
    expect(geminiDetection?.targetFiles[0]?.path).toBe(geminiSettingsPath)
    expect(geminiDetection?.managedBoundaries?.[0]?.type).toBe('managed-fields')
    expect(geminiDetection?.managedBoundaries?.[0]?.managedKeys).toContain('enforcedAuthType')
    expect(geminiDetection?.managedBoundaries?.[0]?.preservedKeys).toContain('ui')
    expect(geminiDetection?.secretReferences).toEqual([
      {
        key: 'GEMINI_API_KEY',
        source: 'env',
        present: true,
        maskedValue: 'gm-l***56',
      },
    ])
    expect(geminiDetection?.effectiveConfig?.stored).toHaveLength(1)
    expect(geminiDetection?.effectiveConfig?.stored?.[0]).toMatchObject({
      key: 'enforcedAuthType',
      maskedValue: 'gemini-api-key',
      source: 'stored',
      scope: 'user',
      secret: false,
    })
    expect(geminiDetection?.effectiveConfig?.effective).toEqual(expect.arrayContaining([
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
        source: 'env',
        scope: 'runtime',
        secret: true,
        shadowed: true,
      }),
    ]))
    expect(geminiDetection?.effectiveConfig?.overrides).toEqual([
      {
        key: 'GEMINI_API_KEY',
        kind: 'env',
        source: 'env',
        message: '最终生效的 API key 取决于环境变量，而不是 settings.json。',
        shadowed: true,
      },
    ])
    expect(geminiDetection?.effectiveConfig?.shadowedKeys).toEqual(['GEMINI_API_KEY'])
    expect(geminiDetection?.warnings?.map((item) => item.message)).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(geminiDetection?.limitations?.map((item) => item.message)).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('validate --json 成功时返回带 explainable 元数据的结构化 items', async () => {
    const result = await runCli(['validate', 'gemini-prod', '--json'])
    const payload = parseJsonResult<{
      items: Array<{
        profileId: string
        platform: string
        validation: {
          ok: boolean
          warnings: Array<{ code: string }>
          errors: Array<{ code: string }>
          effectiveConfig?: {
            stored: Array<{ key: string; maskedValue: string; source: string; scope?: string; secret?: boolean }>
            effective: Array<{ key: string; maskedValue: string; source: string; scope?: string; secret?: boolean; shadowed?: boolean }>
            overrides: Array<{ key: string; kind: string; source: string; message: string; shadowed?: boolean }>
            shadowedKeys?: string[]
          }
          managedBoundaries?: Array<{ type: string; managedKeys: string[]; preservedKeys?: string[]; notes?: string[] }>
          secretReferences?: Array<{ key: string; source: string; present: boolean; maskedValue: string }>
        }
        limitations?: string[]
      }>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('validate')
    expect(payload.data?.items[0]?.profileId).toBe('gemini-prod')
    expect(payload.data?.items[0]?.platform).toBe('gemini')
    expect(payload.data?.items[0]?.validation.ok).toBe(true)
    expect(payload.data?.items[0]?.validation.errors).toEqual([])
    expect(payload.data?.items[0]?.validation.warnings).toEqual([])
    expect(payload.data?.items[0]?.validation.effectiveConfig?.stored?.[0]).toMatchObject({
      key: 'enforcedAuthType',
      maskedValue: 'gemini-api-key',
      source: 'stored',
      scope: 'user',
      secret: false,
    })
    expect(payload.data?.items[0]?.validation.effectiveConfig?.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'GEMINI_API_KEY',
        maskedValue: 'gm-l***56',
        source: 'env',
        scope: 'runtime',
        secret: true,
        shadowed: true,
      }),
    ]))
    expect(payload.data?.items[0]?.validation.effectiveConfig?.overrides).toEqual([
      {
        key: 'GEMINI_API_KEY',
        kind: 'env',
        source: 'env',
        message: 'Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。',
        shadowed: true,
      },
    ])
    expect(payload.data?.items[0]?.validation.effectiveConfig?.shadowedKeys).toEqual(['GEMINI_API_KEY'])
    expect(payload.data?.items[0]?.validation.managedBoundaries?.[0]).toMatchObject({
      type: 'managed-fields',
      managedKeys: ['enforcedAuthType'],
      preservedKeys: ['ui'],
      notes: ['Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。'],
    })
    expect(payload.data?.items[0]?.validation.secretReferences).toEqual([
      {
        key: 'GEMINI_API_KEY',
        source: 'env',
        present: true,
        maskedValue: 'gm-l***56',
      },
    ])
    expect(payload.data?.items[0]?.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.data?.items[0]?.limitations).toContain('当前仅稳定托管 settings.json 中已确认字段 enforcedAuthType。')
  })

  it('validate --json 失败时返回错误状态并设置 exitCode 1', async () => {
    const result = await runCli(['validate', 'gemini-invalid', '--json'])
    const payload = parseJsonResult<{ items: Array<{ profileId: string }> }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('validate')
    expect(payload.data?.items[0]?.profileId).toBe('gemini-invalid')
  })

  it('validate 在空 profiles 下返回空 items', async () => {
    await new ProfilesStore().write({ version: 1, profiles: [] })

    const result = await runCli(['validate', '--json'])
    const payload = parseJsonResult<{ items: Array<{ profileId: string }> }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('validate')
    expect(payload.data?.items).toEqual([])
  })

  it('validate selector 不存在时返回 stderr 并设置 exitCode 2', async () => {
    const result = await runCli(['validate', 'missing-profile'])

    expect(result.stdout).toBe('')
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('未找到配置档：missing-profile')
  })

  it('export --json 输出结构化 profiles', async () => {
    const result = await runCli(['export', '--json'])
    const payload = parseJsonResult<{
      profiles: Array<{
        profile: Profile
        limitations?: string[]
        managedBoundaries?: Array<{ type: string; managedKeys: string[]; preservedKeys?: string[] }>
        secretReferences?: Array<{ key: string; source: string; present: boolean; maskedValue: string }>
      }>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('export')
    expect(payload.data?.profiles).toHaveLength(4)

    const claudeProfile = payload.data?.profiles.find((item) => item.profile.id === 'claude-prod')
    const codexProfile = payload.data?.profiles.find((item) => item.profile.id === 'codex-prod')
    const geminiProfile = payload.data?.profiles.find((item) => item.profile.id === 'gemini-prod')

    expect(claudeProfile?.profile.source).toEqual({ token: 'sk-live-123456', baseURL: 'https://gateway.example.com/api' })
    expect(claudeProfile?.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(claudeProfile?.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'scope-aware',
        managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
      }),
    ]))

    expect(codexProfile?.profile.source).toEqual({ apiKey: 'sk-codex-live-123456', baseURL: 'https://gateway.example.com/openai/v1' })
    expect(codexProfile?.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(codexProfile?.managedBoundaries?.some((item) => item.type === 'multi-file-transaction')).toBe(true)

    expect(geminiProfile?.profile.source).toEqual({ apiKey: 'gm-live-123456', authType: 'gemini-api-key' })
    expect(geminiProfile?.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(geminiProfile?.managedBoundaries?.[0]?.managedKeys).toEqual(['enforcedAuthType'])
    expect(claudeProfile?.secretReferences).toEqual([
      {
        key: 'ANTHROPIC_AUTH_TOKEN',
        source: 'inline',
        present: true,
        maskedValue: 'sk-l***56',
      },
    ])
    expect(codexProfile?.secretReferences).toEqual([
      {
        key: 'OPENAI_API_KEY',
        source: 'inline',
        present: true,
        maskedValue: 'sk-c***56',
      },
    ])
    expect(geminiProfile?.secretReferences).toEqual([
      {
        key: 'GEMINI_API_KEY',
        source: 'env',
        present: true,
        maskedValue: 'gm-l***56',
      },
    ])
  })

  it('preview --json 输出 Codex 结构化预览结果与 warnings', async () => {
    const result = await runCli(['preview', 'codex-prod', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      preview: {
        riskLevel: string
        requiresConfirmation: boolean
        backupPlanned: boolean
        noChanges?: boolean
        diffSummary: Array<{ path: string; changedKeys: string[]; managedKeys?: string[]; preservedKeys?: string[] }>
        managedBoundaries?: Array<{ type: string; target?: string; managedKeys: string[]; preservedKeys?: string[]; notes?: string[] }>
        secretReferences?: Array<{ key: string; source: string; present: boolean; maskedValue: string }>
        limitations?: Array<{ code: string; message: string }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('preview')
    expect(payload.data?.profile.id).toBe('codex-prod')
    expect(payload.data?.preview.riskLevel).toBe('medium')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.diffSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: codexConfigPath,
        changedKeys: ['base_url'],
        managedKeys: ['base_url'],
        preservedKeys: ['default_provider'],
      }),
      expect.objectContaining({
        path: codexAuthPath,
        changedKeys: ['OPENAI_API_KEY'],
        managedKeys: ['OPENAI_API_KEY'],
        preservedKeys: ['user_id'],
      }),
    ]))
    expect(payload.data?.preview.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'multi-file-transaction',
        managedKeys: ['base_url', 'OPENAI_API_KEY'],
      }),
      expect.objectContaining({
        target: codexConfigPath,
        managedKeys: ['base_url'],
        preservedKeys: ['default_provider'],
      }),
      expect.objectContaining({
        target: codexAuthPath,
        managedKeys: ['OPENAI_API_KEY'],
        preservedKeys: ['user_id'],
      }),
    ]))
    expect(payload.data?.preview.secretReferences).toEqual([
      {
        key: 'OPENAI_API_KEY',
        source: 'inline',
        present: true,
        maskedValue: 'sk-c***56',
      },
    ])
    expect(payload.data?.preview.limitations?.map((item) => item.message)).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.warnings).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(payload.warnings).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(payload.warnings).toContain('Codex 将修改多个目标文件。')
  })

  it('use --json 在 --force 下返回 Codex 结构化执行结果并写入 state', async () => {
    const result = await runCli(['use', 'codex-prod', '--force', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      backupId?: string
      changedFiles: string[]
      preview?: {
        managedBoundaries?: Array<{ type: string; target?: string; managedKeys: string[]; preservedKeys?: string[] }>
        secretReferences?: Array<{ key: string; source: string; present: boolean; maskedValue: string }>
        limitations?: Array<{ code: string; message: string }>
        warnings?: Array<{ code: string; message: string }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('use')
    expect(payload.data?.profile.id).toBe('codex-prod')
    expect(payload.data?.backupId).toMatch(/^snapshot-codex-/)
    expect(payload.data?.changedFiles).toEqual([codexConfigPath, codexAuthPath])
    expect(payload.data?.preview?.managedBoundaries?.some((item) => item.type === 'multi-file-transaction')).toBe(true)
    expect(payload.data?.preview?.secretReferences).toEqual([
      {
        key: 'OPENAI_API_KEY',
        source: 'inline',
        present: true,
        maskedValue: 'sk-c***56',
      },
    ])
    expect(payload.data?.preview?.limitations?.map((item) => item.message)).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.data?.preview?.warnings?.some((item) => item.code === 'multi-file-overwrite')).toBe(true)

    const state = await new StateStore().read()
    expect(state.current.codex).toBe('codex-prod')
  })

  it('use --json 无 --force 时返回失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['use', 'gemini-prod', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('use')
    expect(payload.error?.code).toBe('CONFIRMATION_REQUIRED')
    expect(payload.error?.message).toBe('当前切换需要确认或 --force。')
  })

  it('rollback --json 输出 Codex 结构化恢复结果并更新 state', async () => {
    const useResult = await runCli(['use', 'codex-prod', '--force', '--json'])
    const usePayload = parseJsonResult<{ backupId?: string }>(useResult.stdout)
    expect(usePayload.data?.backupId).toBeTruthy()

    await fs.writeFile(codexConfigPath, 'default_provider = "other"\n', 'utf8')
    await fs.writeFile(codexAuthPath, JSON.stringify({ OPENAI_API_KEY: 'sk-other' }, null, 2), 'utf8')
    const result = await runCli(['rollback', usePayload.data!.backupId!, '--json'])
    const payload = parseJsonResult<{
      backupId: string
      restoredFiles: string[]
      rollback?: {
        targetFiles?: Array<{ path: string; managedKeys?: string[]; role?: string }>
        managedBoundaries?: Array<{ type: string; target?: string; managedKeys: string[]; preservedKeys?: string[] }>
        warnings?: Array<{ code: string; message: string }>
        limitations?: Array<{ code: string; message: string }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('rollback')
    expect(payload.data?.backupId).toBe(usePayload.data?.backupId)
    expect(payload.data?.restoredFiles).toEqual([codexConfigPath, codexAuthPath])
    expect(payload.data?.rollback?.targetFiles).toEqual(expect.arrayContaining([
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
    expect(payload.data?.rollback?.managedBoundaries).toEqual(expect.arrayContaining([
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
    expect(payload.data?.rollback?.warnings?.some((item) => item.message.includes('default_provider'))).toBe(true)
    expect(payload.data?.rollback?.warnings?.some((item) => item.message.includes('user_id'))).toBe(true)
    expect(payload.data?.rollback?.warnings?.some((item) => item.message.includes('config.toml 与 auth.json'))).toBe(true)
    expect(payload.data?.rollback?.limitations?.map((item) => item.message)).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')

    const state = await new StateStore().read()
    expect(state.current.codex).toBeUndefined()
    expect(state.lastSwitch?.status).toBe('rolled-back')
  })

  it('preview --json selector 不存在时返回失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['preview', 'missing-profile', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('preview')
    expect(payload.error?.code).toBe('PREVIEW_FAILED')
    expect(payload.error?.message).toBe('未找到配置档：missing-profile')
  })

  it('use --json selector 不存在时返回失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['use', 'missing-profile', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('use')
    expect(payload.error?.code).toBe('USE_FAILED')
    expect(payload.error?.message).toBe('未找到配置档：missing-profile')
  })

  it('rollback --json 无快照时返回失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['rollback', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('rollback')
    expect(payload.error?.code).toBe('BACKUP_NOT_FOUND')
    expect(payload.error?.message).toBe('没有可回滚的快照。')
  })

  it('rollback --json 非法 backupId 时返回失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['rollback', 'invalid-backup-id', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('rollback')
    expect(payload.error?.code).toBe('ROLLBACK_FAILED')
    expect(payload.error?.message).toBe('无法从 backupId 推断平台：invalid-backup-id')
  })

  it('add 输出文本结果、validate/preview explainable 摘要并落盘 profile', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'new-prod', '--key', 'sk-new-123', '--url', 'https://new.example.com'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[add] 成功')
    expect(result.stdout).toContain('- 配置: claude-new-prod (claude)')
    expect(result.stdout).toContain('  名称: new-prod')
    expect(result.stdout).toContain('  校验结果: 通过')
    expect(result.stdout).toContain('  警告: ANTHROPIC_BASE_URL 可能缺少 /api 后缀。')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')
    expect(result.stdout).toContain('  计划备份: 是')
    expect(result.stdout).toContain('  无变更: 否')
    expect(result.stdout).toContain('  目标文件:')
    expect(result.stdout).toContain(`  - ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-o***00 (scope=project, source=stored, secret)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-n***23 (scope=project, source=scope-project, secret)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(result.stdout).toContain('    保留字段: theme')
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - ANTHROPIC_AUTH_TOKEN: sk-n***23 (source=inline, present=yes)')
    expect(result.stdout).toContain('  变更摘要:')
    expect(result.stdout).toContain('  预览警告: 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('附加提示:')

    const profiles = await new ProfilesStore().list()
    expect(profiles.some((item) => item.id === 'claude-new-prod')).toBe(true)
  })

  it('add 输出低风险摘要时显示无需确认', async () => {
    await fs.writeFile(claudeProjectSettingsPath, JSON.stringify({}, null, 2), 'utf8')

    const result = await runCli(['add', '--platform', 'claude', '--name', 'new-low-risk', '--key', 'sk-new-789', '--url', 'https://new.example.com/api'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  风险等级: low')
    expect(result.stdout).toContain('  需要确认: 否')
    expect(result.stdout).toContain('  计划备份: 是')
    expect(result.stdout).toContain('  无变更: 否')
  })

  it('add 无变更时摘要显示 noChanges', async () => {
    await fs.writeFile(
      claudeProjectSettingsPath,
      JSON.stringify({ theme: 'dark', ANTHROPIC_AUTH_TOKEN: 'sk-same-123', ANTHROPIC_BASE_URL: 'https://same.example.com/api' }, null, 2),
      'utf8',
    )

    const result = await runCli(['add', '--platform', 'claude', '--name', 'same-config', '--key', 'sk-same-123', '--url', 'https://same.example.com/api'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  无变更: 是')
    expect(result.stdout).toContain('  需要确认: 是')
  })

  it('add --json 低风险摘要返回无需确认的 preview', async () => {
    await fs.writeFile(claudeProjectSettingsPath, JSON.stringify({}, null, 2), 'utf8')

    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-low-risk', '--key', 'sk-json-low-123', '--url', 'https://new.example.com/api', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; warnings: Array<{ code: string; message: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.validation.ok).toBe(true)
    expect(payload.data?.validation.errors).toEqual([])
    expect(payload.data?.validation.warnings).toEqual([])
    expect(payload.data?.preview.riskLevel).toBe('low')
    expect(payload.data?.preview.requiresConfirmation).toBe(false)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.warnings).toEqual([])
    expect(payload.warnings).toEqual([])
  })

  it('add --json 在现有非托管字段下返回 medium 风险摘要', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-with-theme', '--key', 'sk-json-theme-123', '--url', 'https://new.example.com/api', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; warnings: Array<{ code: string; message: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.validation.warnings).toEqual([])
    expect(payload.data?.preview.riskLevel).toBe('medium')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.preview.warnings.some((item) => item.code === 'unmanaged-current-file')).toBe(true)
    expect(payload.warnings).toContain('当前 Claude 配置存在非托管字段：theme')
  })

  it('add --json 为 claude 传入非 /api url 时返回 validation warning', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-claude-warning', '--key', 'sk-new-123', '--url', 'https://new.example.com', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; diffSummary: Array<{ path: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('add')
    expect(payload.data?.profile.id).toBe('claude-json-claude-warning')
    expect(payload.data?.validation.ok).toBe(true)
    expect(payload.data?.validation.errors).toEqual([])
    expect(payload.data?.validation.warnings.some((item) => item.code === 'url-path-warning')).toBe(true)
    expect(payload.data?.preview.riskLevel).toBe('medium')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.diffSummary[0]?.path).toBe(claudeProjectSettingsPath)
    expect(payload.warnings?.length).toBeGreaterThan(0)
  })

  it('add --json 为 claude 在空现有配置下返回低风险摘要', async () => {
    await fs.writeFile(claudeProjectSettingsPath, JSON.stringify({}, null, 2), 'utf8')

    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-claude', '--key', 'sk-new-123', '--url', 'https://new.example.com/api', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; diffSummary: Array<{ path: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('add')
    expect(payload.data?.profile.id).toBe('claude-json-claude')
    expect(payload.data?.profile.platform).toBe('claude')
    expect(payload.data?.profile.source).toEqual({
      token: 'sk-new-123',
      baseURL: 'https://new.example.com/api',
    })
    expect(payload.data?.profile.apply).toEqual({
      ANTHROPIC_AUTH_TOKEN: 'sk-new-123',
      ANTHROPIC_BASE_URL: 'https://new.example.com/api',
    })
    expect(payload.data?.validation.ok).toBe(true)
    expect(payload.data?.validation.errors).toEqual([])
    expect(payload.data?.validation.warnings).toEqual([])
    expect(payload.data?.preview.riskLevel).toBe('low')
    expect(payload.data?.preview.requiresConfirmation).toBe(false)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.diffSummary[0]?.path).toBe(claudeProjectSettingsPath)
    expect(payload.warnings).toEqual([])
  })

  it('add --json 为 claude 返回 profile 与 validate/preview 摘要', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-claude-legacy', '--key', 'sk-new-123', '--url', 'https://new.example.com', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; diffSummary: Array<{ path: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('add')
    expect(payload.data?.profile.id).toBe('claude-json-claude-legacy')
    expect(payload.data?.profile.platform).toBe('claude')
    expect(payload.data?.profile.source).toEqual({
      token: 'sk-new-123',
      baseURL: 'https://new.example.com',
    })
    expect(payload.data?.profile.apply).toEqual({
      ANTHROPIC_AUTH_TOKEN: 'sk-new-123',
      ANTHROPIC_BASE_URL: 'https://new.example.com',
    })
    expect(payload.data?.validation.ok).toBe(true)
    expect(payload.data?.validation.errors).toEqual([])
    expect(payload.data?.validation.warnings.some((item) => item.code === 'url-path-warning')).toBe(true)
    expect(payload.data?.preview.riskLevel).toBe('medium')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.diffSummary[0]?.path).toBe(claudeProjectSettingsPath)
    expect(payload.warnings?.length).toBeGreaterThan(0)
  })


  it('add --json 复用当前设置时返回 noChanges 摘要', async () => {
    await fs.writeFile(
      claudeProjectSettingsPath,
      JSON.stringify({ ANTHROPIC_AUTH_TOKEN: 'sk-nochange-123', ANTHROPIC_BASE_URL: 'https://same.example.com/api' }, null, 2),
      'utf8',
    )

    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-nochange', '--key', 'sk-nochange-123', '--url', 'https://same.example.com/api', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; warnings: Array<{ code: string; message: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.preview.riskLevel).toBe('low')
    expect(payload.data?.preview.requiresConfirmation).toBe(false)
    expect(payload.data?.preview.backupPlanned).toBe(false)
    expect(payload.data?.preview.noChanges).toBe(true)
  })

  it('add 高风险/需确认摘要不会阻止新增 profile', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'needs-confirmation', '--key', 'gm-needs-confirmation-123'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[add] 成功')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')

    const profiles = await new ProfilesStore().list()
    expect(profiles.some((item) => item.id === 'gemini-needs-confirmation')).toBe(true)
  })

  it('add 校验失败时仍返回摘要并写入 profile', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'invalid-key', '--key', '', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string; message: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.validation.ok).toBe(false)
    expect(payload.data?.validation.errors.some((item) => item.code === 'missing-anthropic-auth-token')).toBe(true)
    expect(payload.data?.preview.riskLevel).toBe('high')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)

    const profiles = await new ProfilesStore().list()
    expect(profiles.some((item) => item.id === 'claude-invalid-key')).toBe(true)
  })

  it('add 先输出摘要再持久化，因此重复 ID 不会被预览阶段阻断', async () => {
    const first = await runCli(['add', '--platform', 'claude', '--name', 'preview-first', '--key', 'sk-preview-first-123', '--url', 'https://first.example.com/api'])
    expect(first.exitCode).toBe(0)

    const second = await runCli(['add', '--platform', 'claude', '--name', 'preview-first', '--key', 'sk-preview-first-456', '--url', 'https://second.example.com/api'])

    expect(second.stdout).toBe('')
    expect(second.exitCode).toBe(2)
    expect(second.stderr).toContain('配置 ID 已存在：claude-preview-first')
  })

  it('add 支持 codex 的 validate/preview 摘要', async () => {
    const result = await runCli(['add', '--platform', 'codex', '--name', 'codex-summary', '--key', 'sk-codex-summary-123', '--url', 'https://gateway.example.com/openai'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[add] 成功')
    expect(result.stdout).toContain('- 配置: codex-codex-summary (codex)')
    expect(result.stdout).toContain('  警告: base_url 可能缺少 /v1 或 /openai/v1 后缀。')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')
  })

  it('add 的摘要会根据当前文件内容给出非托管字段提示', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'with-unmanaged', '--key', 'sk-unmanaged-123', '--url', 'https://with-unmanaged.example.com/api'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  预览警告: 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('附加提示:')
  })

  it('add 的摘要在 JSON 输出中保留 preview warnings 细节', async () => {
    const result = await runCli(['add', '--platform', 'codex', '--name', 'json-preview-warnings', '--key', 'sk-codex-preview-123', '--url', 'https://gateway.example.com/openai', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; warnings: Array<{ code: string; message: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.preview.warnings.some((item) => item.code === 'multi-file-overwrite')).toBe(true)
    expect(payload.data?.preview.warnings.some((item) => item.code === 'unmanaged-current-file')).toBe(true)
    expect(payload.warnings?.length).toBeGreaterThan(0)
  })

  it('add 成功后会把 profile 写入后续 list 可见的数据源', async () => {
    const addResult = await runCli(['add', '--platform', 'claude', '--name', 'listed-after-add', '--key', 'sk-listed-after-add-123', '--url', 'https://listed.example.com/api'])
    expect(addResult.exitCode).toBe(0)

    const listResult = await runCli(['list', '--platform', 'claude'])

    expect(listResult.stderr).toBe('')
    expect(listResult.exitCode).toBe(0)
    expect(listResult.stdout).toContain('- claude-listed-after-add (claude)')
  })

  it('add 的风险提示来源于 preview/validate 聚合结果', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'risk-reasons', '--key', 'gm-risk-reasons-123'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
  })

  it('add 文本输出会展示 preview targetFiles', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'target-files', '--key', 'gm-target-files-123'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  目标文件:')
    expect(result.stdout).toContain(`  - ${geminiSettingsPath}`)
  })

  it('add JSON 输出会展示 preview diffSummary path', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'diff-path', '--key', 'gm-diff-path-123', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; diffSummary: Array<{ path: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.preview.diffSummary[0]?.path).toBe(geminiSettingsPath)
  })

  it('add JSON 输出会保留 validation warnings', async () => {
    const result = await runCli(['add', '--platform', 'codex', '--name', 'json-validation-warning', '--key', 'sk-codex-validation-warning-123', '--url', 'https://gateway.example.com/openai', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.validation.warnings.some((item) => item.code === 'url-path-warning')).toBe(true)
    expect(payload.data?.preview.riskLevel).toBe('medium')
  })

  it('add JSON 输出会保留 preview 的 backupPlanned=false 情况', async () => {
    await fs.writeFile(
      geminiSettingsPath,
      JSON.stringify({ enforcedAuthType: 'gemini-api-key' }, null, 2),
      'utf8',
    )

    const result = await runCli(['add', '--platform', 'gemini', '--name', 'gemini-no-change', '--key', 'gm-gemini-no-change-123', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.preview.backupPlanned).toBe(false)
    expect(payload.data?.preview.noChanges).toBe(true)
  })

  it('add 的文本摘要会展示 preview 生成的风险状态', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'text-risk', '--key', 'gm-text-risk-123'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')
  })

  it('add 的文本摘要会展示 validation errors', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'text-validation-error', '--key', ''])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  校验结果: 失败')
    expect(result.stdout).toContain('  错误: 缺少 ANTHROPIC_AUTH_TOKEN')
  })

  it('add --json 为 codex 构造匹配的 source/apply 字段', async () => {
    const result = await runCli(['add', '--platform', 'codex', '--name', 'json-codex', '--key', 'sk-codex-new-123', '--url', 'https://gateway.example.com/openai/v1', '--json'])
    const payload = parseJsonResult<{ profile: Profile }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('add')
    expect(payload.data?.profile.id).toBe('codex-json-codex')
    expect(payload.data?.profile.platform).toBe('codex')
    expect(payload.data?.profile.source).toEqual({
      apiKey: 'sk-codex-new-123',
      baseURL: 'https://gateway.example.com/openai/v1',
    })
    expect(payload.data?.profile.apply).toEqual({
      OPENAI_API_KEY: 'sk-codex-new-123',
      base_url: 'https://gateway.example.com/openai/v1',
    })
  })

  it('add --json 为 gemini 构造匹配字段并返回附加提示', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'json-prod', '--key', 'gm-new-123', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; warnings: Array<{ code: string; message: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('add')
    expect(payload.data?.profile.id).toBe('gemini-json-prod')
    expect(payload.data?.profile.platform).toBe('gemini')
    expect(payload.data?.profile.source).toEqual({
      apiKey: 'gm-new-123',
      authType: 'gemini-api-key',
    })
    expect(payload.data?.profile.apply).toEqual({
      GEMINI_API_KEY: 'gm-new-123',
      enforcedAuthType: 'gemini-api-key',
    })
    expect(payload.data?.validation.ok).toBe(true)
    expect(payload.data?.preview.riskLevel).toBe('medium')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.warnings.some((item) => item.code === 'env-auth-required')).toBe(true)
    expect(payload.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
  })

  it('add 非法 platform 时返回 stderr 并设置 exitCode 2', async () => {
    const result = await runCli(['add', '--platform', 'openai', '--name', 'bad-platform', '--key', 'sk-bad-123'])

    expect(result.stdout).toBe('')
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('不支持的平台：openai')
  })

  it('add 为 gemini 传入 --url 时返回 stderr 并设置 exitCode 2', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'bad-url', '--key', 'gm-bad-123', '--url', 'https://example.com'])

    expect(result.stdout).toBe('')
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('gemini 平台暂不支持 --url，请改用默认官方链路。')
  })

  it('add 重复 ID 时返回 stderr 并保持已有 profiles 不变', async () => {
    const first = await runCli(['add', '--platform', 'claude', '--name', 'dup-prod', '--key', 'sk-new-123'])
    expect(first.stderr).toBe('')
    expect(first.exitCode).toBe(0)

    const second = await runCli(['add', '--platform', 'claude', '--name', 'dup-prod', '--key', 'sk-new-456'])

    expect(second.stdout).toBe('')
    expect(second.exitCode).toBe(2)
    expect(second.stderr).toContain('配置 ID 已存在：claude-dup-prod')

    const profiles = await new ProfilesStore().list()
    expect(profiles.filter((item) => item.id === 'claude-dup-prod')).toHaveLength(1)
  })

  it('list 输出文本结果并带出 current/health/risk', async () => {
    await new StateStore().markCurrent('gemini', 'gemini-prod', 'snapshot-gemini-001')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['list'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[list] 成功')
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('  当前生效: 是')
    expect(result.stdout).toContain('  健康状态: valid')
    expect(result.stdout).toContain('  风险等级: low')
    expect(result.stdout).toContain('- gemini-invalid (gemini)')
    expect(result.stdout).toContain('  当前生效: 否')
    expect(result.stdout).toContain('  健康状态: unknown')
    expect(result.stdout).toContain('  风险等级: low')
  })

  it('list 在 detectCurrent 命中但未被 state 标记时显示 warning/medium', async () => {
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['list', '--platform', 'gemini'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('  当前生效: 否')
    expect(result.stdout).toContain('  健康状态: warning')
    expect(result.stdout).toContain('  风险等级: medium')
  })

  it('list 会把当前生效项排序到前面', async () => {
    await new StateStore().markCurrent('gemini', 'gemini-prod', 'snapshot-gemini-001')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['list', '--platform', 'gemini'])
    const geminiCurrentIndex = result.stdout.indexOf('- gemini-prod (gemini)')
    const geminiOtherIndex = result.stdout.indexOf('- gemini-invalid (gemini)')

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(geminiCurrentIndex).toBeGreaterThanOrEqual(0)
    expect(geminiOtherIndex).toBeGreaterThan(geminiCurrentIndex)
  })

  it('list --json 输出结构化 profiles 列表与状态摘要', async () => {
    await new StateStore().markCurrent('gemini', 'gemini-prod', 'snapshot-gemini-001')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['list', '--json'])
    const payload = parseJsonResult<{
      profiles: Array<{
        profile: Profile & { meta?: { riskLevel?: string; healthStatus?: string } }
        current: boolean
        riskLevel: string
        healthStatus: string
      }>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('list')
    expect(payload.data?.profiles).toHaveLength(4)

    const currentGemini = payload.data?.profiles.find((item) => item.profile.id === 'gemini-prod')
    expect(currentGemini?.current).toBe(true)
    expect(currentGemini?.riskLevel).toBe('low')
    expect(currentGemini?.healthStatus).toBe('valid')
    expect(currentGemini?.profile.meta?.riskLevel).toBe('low')
    expect(currentGemini?.profile.meta?.healthStatus).toBe('valid')
  })

  it('list --platform --json 仅返回目标平台的 profiles 与状态摘要', async () => {
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['list', '--platform', 'gemini', '--json'])
    const payload = parseJsonResult<{
      profiles: Array<{
        profile: Profile & { meta?: { riskLevel?: string; healthStatus?: string } }
        current: boolean
        riskLevel: string
        healthStatus: string
      }>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('list')
    expect(payload.data?.profiles).toHaveLength(2)
    expect(payload.data?.profiles.every((item) => item.profile.platform === 'gemini')).toBe(true)

    const detectedGemini = payload.data?.profiles.find((item) => item.profile.id === 'gemini-prod')
    expect(detectedGemini?.current).toBe(false)
    expect(detectedGemini?.riskLevel).toBe('medium')
    expect(detectedGemini?.healthStatus).toBe('warning')
  })

  it('list 会保留已有 meta 中的状态值', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'claude-meta',
          name: 'claude-meta',
          platform: 'claude',
          source: { token: 'sk-meta-123' },
          apply: { ANTHROPIC_AUTH_TOKEN: 'sk-meta-123' },
          meta: { riskLevel: 'high', healthStatus: 'invalid' },
        },
      ],
    })

    const result = await runCli(['list', '--json'])
    const payload = parseJsonResult<{
      profiles: Array<{
        profile: Profile & { meta?: { riskLevel?: string; healthStatus?: string } }
        current: boolean
        riskLevel: string
        healthStatus: string
      }>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.profiles[0]?.riskLevel).toBe('high')
    expect(payload.data?.profiles[0]?.healthStatus).toBe('invalid')
    expect(payload.data?.profiles[0]?.profile.meta?.riskLevel).toBe('high')
    expect(payload.data?.profiles[0]?.profile.meta?.healthStatus).toBe('invalid')
  })

  it('list 空列表时输出空正文', async () => {
    await new ProfilesStore().write({ version: 1, profiles: [] })

    const result = await runCli(['list'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('[list] 成功\n\n')
  })

  it('list --json 空列表时返回空数组', async () => {
    await new ProfilesStore().write({ version: 1, profiles: [] })

    const result = await runCli(['list', '--json'])
    const payload = parseJsonResult<{ profiles: Array<unknown> }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('list')
    expect(payload.data?.profiles).toEqual([])
  })

  it('list --platform 输出按平台过滤后的文本结果', async () => {
    const result = await runCli(['list', '--platform', 'gemini'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[list] 成功')
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('- gemini-invalid (gemini)')
    expect(result.stdout).not.toContain('- claude-prod (claude)')
    expect(result.stdout).not.toContain('- codex-prod (codex)')
  })

  it('list 非法 platform 时返回 stderr 并设置 exitCode 2', async () => {
    const result = await runCli(['list', '--platform', 'openai'])

    expect(result.stdout).toBe('')
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('不支持的平台：openai')
  })


  it('current 输出文本 state 与检测结果', async () => {
    await new StateStore().markCurrent('gemini', 'gemini-prod', 'snapshot-gemini-001')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['current'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[current] 成功')
    expect(result.stdout).toContain('- gemini: gemini-prod')
    expect(result.stdout).toContain('检测结果:')
    expect(result.stdout).toContain('- 平台: gemini')
    expect(result.stdout).toContain('  托管识别: 是')
    expect(result.stdout).toContain('  匹配配置: gemini-prod')
    expect(result.stdout).toContain('  当前作用域: user')
    expect(result.stdout).toContain(`  目标文件: ${geminiSettingsPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=stored)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=effective)')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: gm-l***56 (scope=runtime, source=env, secret, shadowed)')
    expect(result.stdout).toContain('    覆盖说明:')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: 最终生效的 API key 取决于环境变量，而不是 settings.json。')
    expect(result.stdout).toContain('    被覆盖字段: GEMINI_API_KEY')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${geminiSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: enforcedAuthType')
    expect(result.stdout).toContain('    保留字段: ui')
    expect(result.stdout).toContain('    说明: Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY: gm-l***56 (source=env, present=yes)')
    expect(result.stdout).toContain('  警告: Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(result.stdout).toContain('  限制: GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('validate 成功时输出 explainable 校验详情并保持 exitCode 0', async () => {
    const result = await runCli(['validate', 'gemini-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[validate] 成功')
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=stored)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: gm-l***56 (scope=runtime, source=env, secret, shadowed)')
    expect(result.stdout).toContain('    覆盖说明:')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(result.stdout).toContain('    被覆盖字段: GEMINI_API_KEY')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${geminiSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: enforcedAuthType')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY: gm-l***56 (source=env, present=yes)')
    expect(result.stdout).toContain('  平台限制:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('validate 失败时输出 explainable 校验详情并设置 exitCode 1', async () => {
    const result = await runCli(['validate', 'gemini-invalid'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[validate] 失败')
    expect(result.stdout).toContain('- gemini-invalid (gemini)')
    expect(result.stdout).toContain('  校验结果: 失败')
    expect(result.stdout).toContain('  错误: 缺少 GEMINI_API_KEY')
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=stored)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=stored)')
    expect(result.stdout).not.toContain('    - GEMINI_API_KEY:')
    expect(result.stdout).not.toContain('    覆盖说明:')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY:  (source=env, present=no)')
    expect(result.stdout).toContain('  平台限制:')
  })

  it('export 输出名称与平台限制', async () => {
    const result = await runCli(['export'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[export] 成功')
    expect(result.stdout).toContain('- claude-prod (claude)')
    expect(result.stdout).toContain('  名称: claude-prod')
    expect(result.stdout).toContain('- codex-prod (codex)')
    expect(result.stdout).toContain('  名称: codex-prod')
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('  名称: gemini-prod')
    expect(result.stdout).toContain('  平台限制:')
    expect(result.stdout).toContain('  - 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.stdout).toContain('  - 当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.stdout).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - ANTHROPIC_AUTH_TOKEN: sk-l***56 (source=inline, present=yes)')
  })

  it('preview 输出风险、explainable 细节与附加提示', async () => {
    const result = await runCli(['preview', 'gemini-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[preview] 成功')
    expect(result.stdout).toContain('- 配置: gemini-prod (gemini)')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - enforcedAuthType: oauth-personal (scope=user, source=stored)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=effective)')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: gm-l***56 (scope=user, source=effective, secret)')
    expect(result.stdout).toContain('    覆盖说明:')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: 最终生效的 API key 取决于环境变量，而不是 settings.json。')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${geminiSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: enforcedAuthType')
    expect(result.stdout).toContain('    保留字段: ui')
    expect(result.stdout).toContain('    说明: Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY: gm-l***56 (source=inline, present=yes)')
    expect(result.stdout).toContain('  变更摘要:')
    expect(result.stdout).toContain('附加提示:')
  })

  it('preview 输出 Codex 双文件 explainable 摘要', async () => {
    const result = await runCli(['preview', 'codex-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[preview] 成功')
    expect(result.stdout).toContain('- 配置: codex-prod (codex)')
    expect(result.stdout).toContain('  校验结果: 通过')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')
    expect(result.stdout).toContain('  计划备份: 是')
    expect(result.stdout).toContain('  无变更: 否')
    expect(result.stdout).toContain('  目标文件:')
    expect(result.stdout).toContain(`  - ${codexConfigPath}`)
    expect(result.stdout).toContain(`  - ${codexAuthPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - base_url: https://old.example.com/v1 (source=stored)')
    expect(result.stdout).toContain('    - OPENAI_API_KEY: sk-o***00 (source=stored, secret)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - base_url: https://gateway.example.com/openai/v1 (source=effective)')
    expect(result.stdout).toContain('    - OPENAI_API_KEY: sk-c***56 (source=effective, secret)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain('  - 类型: multi-file-transaction')
    expect(result.stdout).toContain('    托管字段: base_url, OPENAI_API_KEY')
    expect(result.stdout).toContain('    说明: Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${codexConfigPath}`)
    expect(result.stdout).toContain('    托管字段: base_url')
    expect(result.stdout).toContain('    保留字段: default_provider')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${codexAuthPath}`)
    expect(result.stdout).toContain('    托管字段: OPENAI_API_KEY')
    expect(result.stdout).toContain('    保留字段: user_id')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - OPENAI_API_KEY: sk-c***56 (source=inline, present=yes)')
    expect(result.stdout).toContain('  变更摘要:')
    expect(result.stdout).toContain(`  - ${codexConfigPath}: base_url`)
    expect(result.stdout).toContain(`  - ${codexAuthPath}: OPENAI_API_KEY`)
    expect(result.stdout).toContain('  警告: 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  警告: 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  警告: Codex 将修改多个目标文件。')
    expect(result.stdout).toContain('  限制: 当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  - 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  - Codex 将修改多个目标文件。')
  })

  it('use 输出 Codex 双文件 explainable 摘要并写入 state', async () => {
    const result = await runCli(['use', 'codex-prod', '--force'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[use] 成功')
    expect(result.stdout).toContain('- 配置: codex-prod (codex)')
    expect(result.stdout).toContain('  备份ID: snapshot-codex-')
    expect(result.stdout).toContain('  无变更: 否')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  计划备份: 是')
    expect(result.stdout).toContain('  已变更文件:')
    expect(result.stdout).toContain(`  - ${codexConfigPath}`)
    expect(result.stdout).toContain(`  - ${codexAuthPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - base_url: https://old.example.com/v1 (source=stored)')
    expect(result.stdout).toContain('    - OPENAI_API_KEY: sk-o***00 (source=stored, secret)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - base_url: https://gateway.example.com/openai/v1 (source=effective)')
    expect(result.stdout).toContain('    - OPENAI_API_KEY: sk-c***56 (source=effective, secret)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain('  - 类型: multi-file-transaction')
    expect(result.stdout).toContain('    托管字段: base_url, OPENAI_API_KEY')
    expect(result.stdout).toContain('    说明: Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${codexConfigPath}`)
    expect(result.stdout).toContain('    保留字段: default_provider')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${codexAuthPath}`)
    expect(result.stdout).toContain('    保留字段: user_id')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - OPENAI_API_KEY: sk-c***56 (source=inline, present=yes)')
    expect(result.stdout).toContain('  变更摘要:')
    expect(result.stdout).toContain(`  - ${codexConfigPath}: base_url`)
    expect(result.stdout).toContain(`  - ${codexAuthPath}: OPENAI_API_KEY`)
    expect(result.stdout).toContain('  警告: 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  警告: 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  警告: Codex 将修改多个目标文件。')
    expect(result.stdout).toContain('  限制: 当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  - 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  - Codex 将修改多个目标文件。')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前会同时托管 Codex 的 config.toml 与 auth.json。')

    const state = await new StateStore().read()
    expect(state.current.codex).toBe('codex-prod')
  })

  it('rollback 输出 Codex 双文件恢复摘要并更新 state', async () => {
    const useResult = await runCli(['use', 'codex-prod', '--force'])
    const backupIdMatch = useResult.stdout.match(/备份ID: (snapshot-codex-[^\n]+)/)
    expect(backupIdMatch?.[1]).toBeTruthy()

    await fs.writeFile(codexConfigPath, 'default_provider = "other"\n', 'utf8')
    await fs.writeFile(codexAuthPath, JSON.stringify({ OPENAI_API_KEY: 'sk-other' }, null, 2), 'utf8')
    const result = await runCli(['rollback', backupIdMatch![1]])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[rollback] 成功')
    expect(result.stdout).toContain(`- 备份ID: ${backupIdMatch![1]}`)
    expect(result.stdout).toContain('  已恢复文件:')
    expect(result.stdout).toContain(`  - ${codexConfigPath}`)
    expect(result.stdout).toContain(`  - ${codexAuthPath}`)
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain('  - 类型: multi-file-transaction')
    expect(result.stdout).toContain('    托管字段: base_url, OPENAI_API_KEY')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${codexConfigPath}`)
    expect(result.stdout).toContain('    保留字段: default_provider')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${codexAuthPath}`)
    expect(result.stdout).toContain('    保留字段: user_id')
    expect(result.stdout).toContain('  回滚警告: 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  回滚警告: 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  回滚警告: Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(result.stdout).toContain('  回滚限制: 当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  - 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  - Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前会同时托管 Codex 的 config.toml 与 auth.json。')

    const state = await new StateStore().read()
    expect(state.current.codex).toBeUndefined()
    expect(state.lastSwitch?.status).toBe('rolled-back')
  })

  it('preview 校验失败时仍输出预览摘要并设置 exitCode 1', async () => {
    const result = await runCli(['preview', 'gemini-invalid'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[preview] 失败')
    expect(result.stdout).toContain('- 配置: gemini-invalid (gemini)')
    expect(result.stdout).toContain('  校验结果: 失败')
    expect(result.stdout).toContain('  错误: 缺少 GEMINI_API_KEY')
    expect(result.stdout).toContain('  限制: GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('preview 输出 Claude scope-aware explainable 摘要', async () => {
    const result = await runCli(['preview', 'claude-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[preview] 成功')
    expect(result.stdout).toContain('- 配置: claude-prod (claude)')
    expect(result.stdout).toContain('  校验结果: 通过')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')
    expect(result.stdout).toContain('  计划备份: 是')
    expect(result.stdout).toContain('  无变更: 否')
    expect(result.stdout).toContain('  目标文件:')
    expect(result.stdout).toContain(`  - ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-o***00 (scope=project, source=stored, secret)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-l***56 (scope=project, source=scope-project, secret)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(result.stdout).toContain('    保留字段: theme')
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - ANTHROPIC_AUTH_TOKEN: sk-l***56 (source=inline, present=yes)')
    expect(result.stdout).toContain('  变更摘要:')
    expect(result.stdout).toContain(`  - ${claudeProjectSettingsPath}: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL`)
    expect(result.stdout).toContain('  警告: 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('  限制: 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Claude 配置存在非托管字段：theme')
  })

  it('use 在 --force 下输出 explainable 摘要并写入 state', async () => {
    const result = await runCli(['use', 'claude-prod', '--force'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[use] 成功')
    expect(result.stdout).toContain('- 配置: claude-prod (claude)')
    expect(result.stdout).toContain('  备份ID: snapshot-claude-')
    expect(result.stdout).toContain('  已变更文件:')
    expect(result.stdout).toContain(`  - ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-o***00 (scope=project, source=stored, secret)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-l***56 (scope=project, source=scope-project, secret)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(result.stdout).toContain('    保留字段: theme')
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - ANTHROPIC_AUTH_TOKEN: sk-l***56 (source=inline, present=yes)')

    const state = await new StateStore().read()
    expect(state.current.claude).toBe('claude-prod')
  })

  it('use 无 --force 时对需要确认的预览返回失败与 exitCode 1', async () => {
    const result = await runCli(['use', 'gemini-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[use] 失败')
    expect(result.stdout).toContain('当前切换需要确认或 --force。')
  })

  it('rollback 输出恢复文件并更新 state', async () => {
    const useResult = await runCli(['use', 'claude-prod', '--force'])
    const backupIdMatch = useResult.stdout.match(/备份ID: (snapshot-claude-[^\n]+)/)
    expect(backupIdMatch?.[1]).toBeTruthy()

    await fs.writeFile(claudeProjectSettingsPath, JSON.stringify({ theme: 'light' }, null, 2), 'utf8')
    const result = await runCli(['rollback', backupIdMatch![1]])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[rollback] 成功')
    expect(result.stdout).toContain(`- 备份ID: ${backupIdMatch![1]}`)
    expect(result.stdout).toContain('  已恢复文件:')
    expect(result.stdout).toContain(`  - ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(result.stdout).toContain('    保留字段: theme')
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(result.stdout).toContain('  回滚警告: 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('  回滚限制: 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')

    const state = await new StateStore().read()
    expect(state.current.claude).toBeUndefined()
    expect(state.lastSwitch?.status).toBe('rolled-back')
  })
})
