import os from 'node:os'
import path from 'node:path'

export function resolveGeminiSettingsPath(): string {
  return process.env.API_SWITCHER_GEMINI_SETTINGS_PATH || path.join(os.homedir(), '.gemini', 'settings.json')
}
