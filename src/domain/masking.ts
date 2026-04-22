import type {
  ConfigFieldView,
  EffectiveConfigView,
  EffectiveSource,
  ManagedBoundary,
  OverrideExplanation,
  SecretReference,
  ValidationIssue,
} from '../types/adapter'

const SECRET_KEY_PATTERN = /(token|api[_-]?key|apikey|secret)/i
const SECRET_REFERENCE_PATTERN = /(secret[_-]?ref|auth[_-]?reference|reference)/i

export function isSecretLikeKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key)
}

export function isSecretReferenceKey(key: string): boolean {
  return SECRET_REFERENCE_PATTERN.test(key)
}

export function maskSecret(value: unknown): string {
  if (value === undefined || value === null) {
    return ''
  }

  if (typeof value !== 'string') {
    return '***'
  }

  if (value.length <= 6) {
    return '*'.repeat(value.length)
  }

  return `${value.slice(0, 4)}***${value.slice(-2)}`
}

export function maskValue(key: string, value: unknown): string {
  if (isSecretLikeKey(key)) {
    return maskSecret(value)
  }

  if (typeof value === 'string') {
    return value
  }

  return String(value)
}

export function maskRecord(record: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, maskValue(key, value)]))
}

export function toConfigFieldView(
  key: string,
  value: unknown,
  source: EffectiveSource | string,
  options: { scope?: string; shadowed?: boolean } = {},
): ConfigFieldView {
  return {
    key,
    value,
    maskedValue: maskValue(key, value),
    source,
    scope: options.scope,
    secret: isSecretLikeKey(key),
    shadowed: options.shadowed,
  }
}

export function toConfigFieldViews(
  record: Record<string, unknown>,
  source: EffectiveSource | string,
  options: { scope?: string; shadowedKeys?: string[] } = {},
): ConfigFieldView[] {
  const shadowedKeys = new Set(options.shadowedKeys ?? [])
  return Object.entries(record).map(([key, value]) => toConfigFieldView(key, value, source, {
    scope: options.scope,
    shadowed: shadowedKeys.has(key),
  }))
}

export function toSecretReference(key: string, value: unknown): SecretReference {
  if (isSecretReferenceKey(key) && typeof value === 'string' && value.trim()) {
    return {
      key,
      source: key.includes('auth') ? 'auth_reference' : 'secret_ref',
      reference: value,
      present: true,
      maskedValue: value,
    }
  }

  return {
    key,
    source: isSecretLikeKey(key) ? 'inline' : 'unknown',
    present: value !== undefined && value !== null && String(value).length > 0,
    maskedValue: maskValue(key, value),
  }
}

export function collectSecretReferences(record: Record<string, unknown>): SecretReference[] {
  return Object.entries(record)
    .filter(([key]) => isSecretLikeKey(key) || isSecretReferenceKey(key))
    .map(([key, value]) => toSecretReference(key, value))
}

export function buildEffectiveConfigView(input: {
  stored: Record<string, unknown>
  effective?: Record<string, unknown>
  overrides?: OverrideExplanation[]
  scope?: string
  shadowedKeys?: string[]
}): EffectiveConfigView {
  return {
    stored: toConfigFieldViews(input.stored, 'stored', { scope: input.scope, shadowedKeys: input.shadowedKeys }),
    effective: toConfigFieldViews(input.effective ?? input.stored, 'effective', { scope: input.scope, shadowedKeys: input.shadowedKeys }),
    overrides: input.overrides ?? [],
    shadowedKeys: input.shadowedKeys ?? [],
  }
}

export function collectIssueMessages(issues: ValidationIssue[] | undefined): string[] {
  return (issues ?? []).map((item) => item.message)
}

export function mergeUniqueMessages(...groups: Array<Array<string | undefined> | undefined>): string[] {
  return Array.from(new Set(
    groups.flatMap((group) => (group ?? []).filter((item): item is string => typeof item === 'string' && item.length > 0)),
  ))
}

export function collectUniqueIssueMessages(issues: ValidationIssue[] | undefined): string[] {
  return mergeUniqueMessages(collectIssueMessages(issues))
}

export function collectManagedBoundaryNotes(boundaries: ManagedBoundary[] | undefined): string[] {
  return (boundaries ?? []).flatMap((item) => item.notes ?? [])
}
