import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GeminiAdapter } from '../../src/adapters/gemini/gemini.adapter'
import { resolveGeminiTargets } from '../../src/adapters/gemini/gemini.target-resolver'
import { resolveGeminiScopeTargets } from '../../src/adapters/gemini/gemini.scope-resolver'
import type { Profile } from '../../src/types/profile'

let runtimeDir: string
let settingsPath: string
let projectRoot: string
let systemDefaultsPath: string
let systemOverridesPath: string

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

const experimentalLegacyProfile: Profile = {
  id: 'gemini-proxy',
  name: 'gemini-proxy',
  platform: 'gemini',
  source: {
    apiKey: 'gm-live-654321',
    authType: 'gemini-api-key',
    baseURL: 'https://proxy.example.com',
  },
  apply: {
    GEMINI_API_KEY: 'gm-live-654321',
    enforcedAuthType: 'gemini-api-key',
    GEMINI_BASE_URL: 'https://proxy.example.com',
  },
}

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-gemini-unit-'))
  settingsPath = path.join(runtimeDir, 'settings.json')
  projectRoot = path.join(runtimeDir, 'workspace')
  systemDefaultsPath = path.join(runtimeDir, 'system-defaults.json')
  systemOverridesPath = path.join(runtimeDir, 'system-overrides.json')
  process.env.API_SWITCHER_GEMINI_SETTINGS_PATH = settingsPath
  process.env.API_SWITCHER_GEMINI_PROJECT_ROOT = projectRoot
  process.env.API_SWITCHER_GEMINI_SYSTEM_DEFAULTS_SETTINGS_PATH = systemDefaultsPath
  process.env.API_SWITCHER_GEMINI_SYSTEM_OVERRIDES_SETTINGS_PATH = systemOverridesPath
})

afterEach(async () => {
  delete process.env.API_SWITCHER_GEMINI_SETTINGS_PATH
  delete process.env.API_SWITCHER_GEMINI_PROJECT_ROOT
  delete process.env.API_SWITCHER_GEMINI_SYSTEM_DEFAULTS_SETTINGS_PATH
  delete process.env.API_SWITCHER_GEMINI_SYSTEM_OVERRIDES_SETTINGS_PATH
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

describe('gemini adapter', () => {
  describe('scope availability', () => {
    it('marks user scope as available', async () => {
      const targets = await resolveGeminiScopeTargets()
      const userTarget = targets.find((item) => item.scope === 'user')

      expect(userTarget).toEqual(expect.objectContaining({
        scope: 'user',
        status: 'available',
        detected: true,
        writable: true,
      }))
    })

    it('marks project scope as unresolved when configured project root is missing or unusable', async () => {
      process.env.API_SWITCHER_GEMINI_PROJECT_ROOT = path.join(runtimeDir, 'missing-project-root')

      const targets = await resolveGeminiScopeTargets()
      const projectTarget = targets.find((item) => item.scope === 'project')

      expect(projectTarget).toEqual(expect.objectContaining({
        scope: 'project',
        status: 'unresolved',
        detected: false,
        writable: false,
        reasonCode: 'PROJECT_ROOT_UNRESOLVED',
      }))
      expect(projectTarget?.reason).toBe('当前无法解析 Gemini project scope 的 project root。')
      expect(projectTarget?.remediation).toContain('API_SWITCHER_GEMINI_PROJECT_ROOT')
      expect(projectTarget?.path).toBeUndefined()
    })

    it('marks project scope path as unavailable when .gemini is not a directory', async () => {
      await fs.mkdir(projectRoot, { recursive: true })
      await fs.writeFile(path.join(projectRoot, '.gemini'), 'not-a-directory', 'utf8')

      const targets = await resolveGeminiScopeTargets()
      const projectTarget = targets.find((item) => item.scope === 'project')

      expect(projectTarget).toEqual(expect.objectContaining({
        scope: 'project',
        status: 'unresolved',
        detected: false,
        writable: false,
        reasonCode: 'PROJECT_SCOPE_PATH_UNAVAILABLE',
      }))
      expect(projectTarget?.reason).toBe('Gemini project scope 的 settings.json 路径当前不可用。')
      expect(projectTarget?.remediation).toContain('.gemini/settings.json')
      expect(projectTarget?.path).toBeUndefined()
    })

    it('marks project scope as available with path and writable when project root resolves', async () => {
      await fs.mkdir(projectRoot, { recursive: true })

      const targets = await resolveGeminiScopeTargets()
      const projectTarget = targets.find((item) => item.scope === 'project')

      expect(projectTarget).toEqual(expect.objectContaining({
        scope: 'project',
        status: 'available',
        detected: true,
        writable: true,
        path: path.join(projectRoot, '.gemini', 'settings.json'),
      }))
    })
  })

  it('target resolver 会返回四层 Gemini scope，并兼容 legacy user settings env', async () => {
    await fs.mkdir(projectRoot, { recursive: true })
    const targets = await resolveGeminiTargets()

    expect(targets).toEqual([
      expect.objectContaining({
        scope: 'system-defaults',
        path: systemDefaultsPath,
        role: 'settings',
      }),
      expect.objectContaining({
        scope: 'user',
        path: settingsPath,
        role: 'settings',
      }),
      expect.objectContaining({
        scope: 'project',
        path: path.join(projectRoot, '.gemini', 'settings.json'),
        role: 'settings',
      }),
      expect.objectContaining({
        scope: 'system-overrides',
        path: systemOverridesPath,
        role: 'settings',
      }),
    ])
  })

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

  it('validate 会返回 env-first explainable 元数据', async () => {
    await fs.writeFile(settingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'oauth-personal' }, null, 2), 'utf8')

    const result = await new GeminiAdapter().validate(baseProfile)

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.limitations).toEqual([
      expect.objectContaining({
        code: 'gemini-limitation-1',
        message: 'GEMINI_API_KEY 仍需通过环境变量生效。',
      }),
      expect.objectContaining({
        code: 'gemini-limitation-2',
        message: '当前仅稳定托管 settings.json 中已确认字段 enforcedAuthType。',
      }),
      expect.objectContaining({
        code: 'gemini-limitation-3',
        message: '官方文档当前未确认自定义 base URL 的稳定写入契约。',
      }),
    ])
    expect(result.effectiveConfig?.stored).toEqual([
      expect.objectContaining({
        key: 'enforcedAuthType',
        maskedValue: 'gemini-api-key',
        source: 'stored',
        scope: 'user',
      }),
    ])
    expect(result.effectiveConfig?.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'enforcedAuthType',
        maskedValue: 'gemini-api-key',
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
    expect(result.effectiveConfig?.overrides).toEqual([
      expect.objectContaining({
        key: 'GEMINI_API_KEY',
        kind: 'env',
        source: 'env',
        message: 'Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。',
        shadowed: true,
      }),
    ])
    expect(result.effectiveConfig?.shadowedKeys).toEqual(['GEMINI_API_KEY'])
    expect(result.secretReferences).toEqual([
      {
        key: 'GEMINI_API_KEY',
        source: 'env',
        present: true,
        maskedValue: 'gm-l***56',
      },
    ])
    expect(result.managedBoundaries).toEqual([
      expect.objectContaining({
        type: 'managed-fields',
        managedKeys: ['enforcedAuthType'],
        preservedKeys: ['ui'],
      }),
    ])
  })

  it('detectCurrent 会返回 env-first 当前态 explainable 结果', async () => {
    await fs.writeFile(settingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await new GeminiAdapter().detectCurrent([baseProfile])

    expect(result).toEqual(expect.objectContaining({
      platform: 'gemini',
      matchedProfileId: 'gemini-prod',
      managed: true,
      currentScope: 'user',
    }))
    expect(result?.effectiveConfig?.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'enforcedAuthType',
        maskedValue: 'gemini-api-key',
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
    expect(result?.effectiveConfig?.overrides).toEqual([
      expect.objectContaining({
        key: 'GEMINI_API_KEY',
        kind: 'env',
        source: 'env',
        message: '最终生效的 API key 取决于环境变量，而不是 settings.json。',
        shadowed: true,
      }),
    ])
    expect(result?.effectiveConfig?.shadowedKeys).toEqual(['GEMINI_API_KEY'])
    expect(result?.secretReferences).toEqual([
      {
        key: 'GEMINI_API_KEY',
        source: 'env',
        present: true,
        maskedValue: 'gm-l***56',
      },
    ])
    expect(result?.warnings).toEqual([
      expect.objectContaining({
        code: 'env-auth-required',
        message: 'Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。',
      }),
    ])
    expect(result?.limitations).toEqual([
      expect.objectContaining({
        code: 'gemini-limitation-1',
        message: 'GEMINI_API_KEY 仍需通过环境变量生效。',
      }),
      expect.objectContaining({
        code: 'gemini-limitation-2',
        message: '当前仅稳定托管 settings.json 中已确认字段 enforcedAuthType。',
      }),
      expect.objectContaining({
        code: 'gemini-limitation-3',
        message: '官方文档当前未确认自定义 base URL 的稳定写入契约。',
      }),
    ])
  })

  it('detectCurrent 不会把带实验性 base URL 的 profile 误判为完整匹配', async () => {
    await fs.writeFile(settingsPath, JSON.stringify({ enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await new GeminiAdapter().detectCurrent([experimentalLegacyProfile])

    expect(result).toEqual(expect.objectContaining({
      platform: 'gemini',
      managed: false,
      matchedProfileId: undefined,
    }))
    expect(result?.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'experimental-current-state-undetectable',
        message: 'Gemini 实验性 base URL 当前无法可靠检测，当前态不会标记为完整匹配。',
      }),
    ]))
  })

  it('preview 会把 legacy GEMINI_BASE_URL 标记为实验性配置而不是稳定托管字段', async () => {
    await fs.writeFile(settingsPath, JSON.stringify({ enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await new GeminiAdapter().preview(experimentalLegacyProfile)

    expect(result.effectiveFields).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'GEMINI_BASE_URL',
        maskedValue: 'https://proxy.example.com',
        source: 'managed-policy',
      }),
      expect.objectContaining({
        key: 'GEMINI_API_KEY',
        maskedValue: 'gm-l***21',
        source: 'env',
        scope: 'runtime',
        secret: true,
      }),
    ]))
    expect(result.diffSummary[0]?.changedKeys).toEqual([])
    expect(result.backupPlanned).toBe(false)
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'experimental-gemini-base-url',
        message: 'Gemini 自定义 base URL 属于实验性支持，默认不按稳定托管字段写入。',
      }),
      expect.objectContaining({
        code: 'legacy-gemini-base-url',
        message: '检测到 legacy apply.GEMINI_BASE_URL，已按实验性配置解释。',
      }),
    ]))
  })

  it('detectCurrent 会按 system-defaults < user < project < system-overrides 合并 Gemini 配置', async () => {
    await fs.mkdir(path.join(projectRoot, '.gemini'), { recursive: true })
    await fs.writeFile(systemDefaultsPath, JSON.stringify({ enforcedAuthType: 'oauth-personal' }, null, 2), 'utf8')
    await fs.writeFile(settingsPath, JSON.stringify({ enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')
    await fs.writeFile(path.join(projectRoot, '.gemini', 'settings.json'), JSON.stringify({ enforcedAuthType: 'vertex-ai' }, null, 2), 'utf8')
    await fs.writeFile(systemOverridesPath, JSON.stringify({ enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await new GeminiAdapter().detectCurrent([baseProfile])

    expect(result).toEqual(expect.objectContaining({
      platform: 'gemini',
      managed: true,
      matchedProfileId: 'gemini-prod',
      currentScope: 'system-overrides',
    }))
    expect(result?.targetFiles.map((item) => item.scope)).toEqual([
      'system-defaults',
      'user',
      'project',
      'system-overrides',
    ])
    expect(result?.effectiveConfig?.stored).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'enforcedAuthType',
        maskedValue: 'gemini-api-key',
        source: 'stored',
        scope: 'system-overrides',
      }),
    ]))
    expect(result?.effectiveConfig?.overrides).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'enforcedAuthType',
        kind: 'scope',
        source: 'scope-system-overrides',
        targetScope: 'system-overrides',
      }),
    ]))
    expect(result?.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'scope-aware',
      }),
    ]))
  })

  it('apply 在仅请求实验性 base URL 且缺少稳定写入目标时不会伪装成已应用文件变更', async () => {
    await fs.writeFile(settingsPath, JSON.stringify({ enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await new GeminiAdapter().apply(experimentalLegacyProfile, { backupId: 'snapshot-gemini-test' })

    expect(result.ok).toBe(true)
    expect(result.noChanges).toBe(true)
    expect(result.changedFiles).toEqual([])
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'experimental-gemini-base-url-not-applied',
        message: 'Gemini 实验性 base URL 当前没有可靠写入目标，本次不会落盘。',
      }),
    ]))
  })
})
