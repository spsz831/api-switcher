export const CLAUDE_MANAGED_KEYS = ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'] as const

export function pickClaudeManagedFields(apply: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(CLAUDE_MANAGED_KEYS.filter((key) => key in apply).map((key) => [key, apply[key]]))
}

export function mergeClaudeSettings(current: Record<string, unknown>, apply: Record<string, unknown>): Record<string, unknown> {
  return {
    ...current,
    ...pickClaudeManagedFields(apply),
  }
}
