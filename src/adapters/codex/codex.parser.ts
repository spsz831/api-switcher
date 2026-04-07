const TOML_ASSIGNMENT_PATTERN = /^(\s*)([A-Za-z0-9_]+)(\s*=\s*)(.+?)(\s+#.*)?$/

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

function renderTomlAssignment(
  key: string,
  value: unknown,
  options?: { indent?: string; separator?: string; trailingComment?: string },
): string {
  return `${options?.indent ?? ''}${key}${options?.separator ?? ' = '}${stringifyTomlScalar(value)}${options?.trailingComment ?? ''}`
}

export function parseCodexConfig(content: string | null): Record<string, unknown> {
  if (!content || !content.trim()) {
    return {}
  }

  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .flatMap((line) => {
        const match = line.match(TOML_ASSIGNMENT_PATTERN)
        if (!match) {
          return []
        }

        return [[match[2], parseTomlScalar(match[4])] as const]
      }),
  )
}

export function stringifyCodexConfig(data: Record<string, unknown>, originalContent?: string | null): string {
  if (!originalContent || !originalContent.trim()) {
    const lines = Object.entries(data).map(([key, value]) => renderTomlAssignment(key, value))
    return `${lines.join('\n')}\n`
  }

  const renderedLines: string[] = []
  const handledKeys = new Set<string>()
  const originalLines = originalContent.split(/\r?\n/)

  if (originalContent.endsWith('\n')) {
    originalLines.pop()
  }

  for (const line of originalLines) {
    const match = line.match(TOML_ASSIGNMENT_PATTERN)
    if (!match) {
      renderedLines.push(line)
      continue
    }

    const [, indent, key, separator, , trailingComment] = match
    handledKeys.add(key)

    if (!(key in data)) {
      renderedLines.push(line)
      continue
    }

    renderedLines.push(renderTomlAssignment(key, data[key], { indent, separator, trailingComment }))
  }

  const missingEntries = Object.entries(data).filter(([key]) => !handledKeys.has(key))
  if (missingEntries.length > 0 && renderedLines.length > 0 && renderedLines[renderedLines.length - 1] !== '') {
    renderedLines.push('')
  }

  renderedLines.push(...missingEntries.map(([key, value]) => renderTomlAssignment(key, value)))

  return `${renderedLines.join('\n')}\n`
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
