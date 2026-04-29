import os from 'node:os'
import path from 'node:path'
import { resolveDevelopmentSandboxPath, shouldUseDevelopmentSandbox } from '../../utils/development-sandbox'

export function resolveCodexTargets(): { configPath: string; authPath: string } {
  if (shouldUseDevelopmentSandbox()) {
    return {
      configPath: process.env.API_SWITCHER_CODEX_CONFIG_PATH || resolveDevelopmentSandboxPath('codex', 'config.toml'),
      authPath: process.env.API_SWITCHER_CODEX_AUTH_PATH || resolveDevelopmentSandboxPath('codex', 'auth.json'),
    }
  }

  return {
    configPath: process.env.API_SWITCHER_CODEX_CONFIG_PATH || path.join(os.homedir(), '.codex', 'config.toml'),
    authPath: process.env.API_SWITCHER_CODEX_AUTH_PATH || path.join(os.homedir(), '.codex', 'auth.json'),
  }
}
