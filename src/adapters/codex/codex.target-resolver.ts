import os from 'node:os'
import path from 'node:path'

export function resolveCodexTargets(): { configPath: string; authPath: string } {
  return {
    configPath: process.env.API_SWITCHER_CODEX_CONFIG_PATH || path.join(os.homedir(), '.codex', 'config.toml'),
    authPath: process.env.API_SWITCHER_CODEX_AUTH_PATH || path.join(os.homedir(), '.codex', 'auth.json'),
  }
}
