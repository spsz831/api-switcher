export const PLATFORM_NAMES = ['claude', 'codex', 'gemini'] as const

export type PlatformName = (typeof PLATFORM_NAMES)[number]

export type RiskLevel = 'low' | 'medium' | 'high'

export type HealthStatus = 'unknown' | 'valid' | 'warning' | 'invalid'
