import { GEMINI_SETTINGS_MANAGED_KEYS } from './gemini.contract'

export { GEMINI_SETTINGS_MANAGED_KEYS } from './gemini.contract'

export function pickGeminiSettingsFields(apply: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(GEMINI_SETTINGS_MANAGED_KEYS.filter((key) => key in apply).map((key) => [key, apply[key]]))
}

export function mergeGeminiSettings(current: Record<string, unknown>, apply: Record<string, unknown>): Record<string, unknown> {
  return {
    ...current,
    ...pickGeminiSettingsFields(apply),
    ...('GEMINI_API_KEY' in apply ? { GEMINI_API_KEY: apply.GEMINI_API_KEY } : {}),
  }
}

export function mapGeminiProfileToSettings(apply: Record<string, unknown>): Record<string, unknown> {
  return mergeGeminiSettings({}, apply)
}
