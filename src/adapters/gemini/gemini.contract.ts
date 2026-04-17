import type { Profile } from '../../types/profile'

export const GEMINI_SETTINGS_MANAGED_KEYS = ['enforcedAuthType'] as const

export type GeminiExperimentalConfig = {
  geminiBaseUrl?: string
  legacyApplyBaseUrl?: boolean
}

export type GeminiContractView = {
  stableSettings: Record<string, unknown>
  runtimeApiKey?: unknown
  experimental: GeminiExperimentalConfig
}

export function normalizeGeminiContract(profile: Profile): GeminiContractView {
  const stableSettings = Object.fromEntries(
    GEMINI_SETTINGS_MANAGED_KEYS
      .filter((key) => key in profile.apply)
      .map((key) => [key, profile.apply[key]]),
  )

  const legacyApplyBaseUrl = typeof profile.apply.GEMINI_BASE_URL === 'string' && profile.apply.GEMINI_BASE_URL.trim().length > 0
  const metaExperimentalBaseUrl = typeof profile.meta?.experimental?.geminiBaseUrl === 'string'
    && profile.meta.experimental.geminiBaseUrl.trim().length > 0
    ? profile.meta.experimental.geminiBaseUrl
    : undefined
  const legacyBaseUrl = legacyApplyBaseUrl ? String(profile.apply.GEMINI_BASE_URL) : undefined

  return {
    stableSettings,
    runtimeApiKey: profile.apply.GEMINI_API_KEY,
    experimental: {
      geminiBaseUrl: metaExperimentalBaseUrl ?? legacyBaseUrl,
      legacyApplyBaseUrl,
    },
  }
}
