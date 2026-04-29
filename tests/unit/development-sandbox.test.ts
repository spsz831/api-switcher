import { afterEach, describe, expect, it } from 'vitest'
import { resolveCodexTargets } from '../../src/adapters/codex/codex.target-resolver'
import { resolveGeminiScopePath } from '../../src/adapters/gemini/gemini.scope-resolver'
import {
  isInsideDevelopmentSandbox,
  shouldUseDevelopmentSandbox,
} from '../../src/utils/development-sandbox'

describe('development sandbox', () => {
  const originalEnv = {
    API_SWITCHER_RUNTIME_DIR: process.env.API_SWITCHER_RUNTIME_DIR,
    API_SWITCHER_ALLOW_REAL_USER_TARGETS: process.env.API_SWITCHER_ALLOW_REAL_USER_TARGETS,
    API_SWITCHER_DISABLE_DEVELOPMENT_SANDBOX: process.env.API_SWITCHER_DISABLE_DEVELOPMENT_SANDBOX,
    API_SWITCHER_CODEX_CONFIG_PATH: process.env.API_SWITCHER_CODEX_CONFIG_PATH,
    API_SWITCHER_CODEX_AUTH_PATH: process.env.API_SWITCHER_CODEX_AUTH_PATH,
    API_SWITCHER_GEMINI_SETTINGS_PATH: process.env.API_SWITCHER_GEMINI_SETTINGS_PATH,
    API_SWITCHER_GEMINI_USER_SETTINGS_PATH: process.env.API_SWITCHER_GEMINI_USER_SETTINGS_PATH,
    API_SWITCHER_GEMINI_SYSTEM_DEFAULTS_SETTINGS_PATH: process.env.API_SWITCHER_GEMINI_SYSTEM_DEFAULTS_SETTINGS_PATH,
    API_SWITCHER_GEMINI_SYSTEM_OVERRIDES_SETTINGS_PATH: process.env.API_SWITCHER_GEMINI_SYSTEM_OVERRIDES_SETTINGS_PATH,
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key]
        continue
      }

      process.env[key] = value
    }
  })

  it('开发态默认启用目标文件沙箱', () => {
    process.env.API_SWITCHER_RUNTIME_DIR = '/tmp/api-switcher-runtime'
    delete process.env.API_SWITCHER_ALLOW_REAL_USER_TARGETS
    delete process.env.API_SWITCHER_DISABLE_DEVELOPMENT_SANDBOX

    expect(shouldUseDevelopmentSandbox()).toBe(true)

    const codexTargets = resolveCodexTargets()
    expect(isInsideDevelopmentSandbox(codexTargets.configPath)).toBe(true)
    expect(isInsideDevelopmentSandbox(codexTargets.authPath)).toBe(true)

    expect(isInsideDevelopmentSandbox(resolveGeminiScopePath('user'))).toBe(true)
    expect(isInsideDevelopmentSandbox(resolveGeminiScopePath('system-defaults'))).toBe(true)
    expect(isInsideDevelopmentSandbox(resolveGeminiScopePath('system-overrides'))).toBe(true)
  })

  it('显式放行时关闭开发态沙箱', () => {
    process.env.API_SWITCHER_RUNTIME_DIR = '/tmp/api-switcher-runtime'
    process.env.API_SWITCHER_ALLOW_REAL_USER_TARGETS = '1'

    expect(shouldUseDevelopmentSandbox()).toBe(false)

    const codexTargets = resolveCodexTargets()
    expect(isInsideDevelopmentSandbox(codexTargets.configPath)).toBe(false)
    expect(isInsideDevelopmentSandbox(codexTargets.authPath)).toBe(false)
  })
})
