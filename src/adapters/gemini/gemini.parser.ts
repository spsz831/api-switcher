export function parseGeminiSettings(content: string | null): Record<string, unknown> {
  if (!content || !content.trim()) {
    return {}
  }

  return JSON.parse(content) as Record<string, unknown>
}

export function stringifyGeminiSettings(data: Record<string, unknown>): string {
  return `${JSON.stringify(data, null, 2)}\n`
}
