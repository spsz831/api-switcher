export function parseClaudeSettings(content: string | null): Record<string, unknown> {
  if (!content || !content.trim()) {
    return {}
  }

  return JSON.parse(content) as Record<string, unknown>
}

export function stringifyClaudeSettings(data: Record<string, unknown>): string {
  return `${JSON.stringify(data, null, 2)}\n`
}
