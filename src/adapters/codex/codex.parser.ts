function parseTomlScalar(rawValue: string): unknown {
  const value = rawValue.trim()

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }

  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  const numberValue = Number(value)
  if (!Number.isNaN(numberValue) && value !== '') {
    return numberValue
  }

  return value
}

function stringifyTomlScalar(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return JSON.stringify(String(value))
}

export function parseCodexConfig(content: string | null): Record<string, unknown> {
  if (!content || !content.trim()) {
    return {}
  }

  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .flatMap((line) => {
        const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/)
        if (!match) {
          return []
        }

        return [[match[1], parseTomlScalar(match[2])] as const]
      }),
  )
}

export function stringifyCodexConfig(data: Record<string, unknown>): string {
  const lines = Object.entries(data).map(([key, value]) => `${key} = ${stringifyTomlScalar(value)}`)
  return `${lines.join('\n')}\n`
}

export function parseCodexAuth(content: string | null): Record<string, unknown> {
  if (!content || !content.trim()) {
    return {}
  }

  return JSON.parse(content) as Record<string, unknown>
}

export function stringifyCodexAuth(data: Record<string, unknown>): string {
  return `${JSON.stringify(data, null, 2)}\n`
}
