export const CODEX_CONFIG_MANAGED_KEYS = ['base_url'] as const
export const CODEX_AUTH_MANAGED_KEYS = ['OPENAI_API_KEY'] as const

export function pickCodexConfigFields(apply: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(CODEX_CONFIG_MANAGED_KEYS.filter((key) => key in apply).map((key) => [key, apply[key]]))
}

export function pickCodexAuthFields(apply: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(CODEX_AUTH_MANAGED_KEYS.filter((key) => key in apply).map((key) => [key, apply[key]]))
}

export function mergeCodexConfig(current: Record<string, unknown>, apply: Record<string, unknown>): Record<string, unknown> {
  return {
    ...current,
    ...pickCodexConfigFields(apply),
  }
}

export function mergeCodexAuth(current: Record<string, unknown>, apply: Record<string, unknown>): Record<string, unknown> {
  return {
    ...current,
    ...pickCodexAuthFields(apply),
  }
}

export function mapCodexProfileToTargets(apply: Record<string, unknown>): { config: Record<string, unknown>; auth: Record<string, unknown> } {
  return {
    config: pickCodexConfigFields(apply),
    auth: pickCodexAuthFields(apply),
  }
}
