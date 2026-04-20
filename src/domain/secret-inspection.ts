import { isSecretLikeKey, isSecretReferenceKey } from './masking'
import type { ValidationIssue } from '../types/adapter'
import type { Profile } from '../types/profile'

export const INLINE_SECRET_IN_PROFILE = 'INLINE_SECRET_IN_PROFILE'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasInlineSecretValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim().length > 0
}

function inspectRecord(record: Record<string, unknown>, prefix: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const [key, value] of Object.entries(record)) {
    const field = `${prefix}.${key}`
    if (isRecord(value)) {
      issues.push(...inspectRecord(value, field))
      continue
    }

    if (isSecretLikeKey(key) && !isSecretReferenceKey(key) && hasInlineSecretValue(value)) {
      issues.push({
        code: INLINE_SECRET_IN_PROFILE,
        level: 'warning',
        field,
        source: 'profile',
        message: `profile.${field} 当前以明文 secret 存储；后续版本建议迁移到 secret_ref 或环境变量引用。`,
      })
    }
  }

  return issues
}

export function inspectProfileInlineSecrets(profile: Profile): ValidationIssue[] {
  return [
    ...inspectRecord(profile.source, 'source'),
    ...inspectRecord(profile.apply, 'apply'),
  ]
}

export function withProfileSecretWarnings<T extends { warnings: ValidationIssue[] }>(
  validation: T,
  profile: Profile,
): T {
  const warnings = inspectProfileInlineSecrets(profile)
  if (warnings.length === 0) {
    return validation
  }

  return {
    ...validation,
    warnings: [
      ...validation.warnings,
      ...warnings,
    ],
  }
}
