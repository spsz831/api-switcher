import { isSecretLikeKey, isSecretReferenceKey } from './masking'
import type { ValidationIssue } from '../types/adapter'
import type { Profile } from '../types/profile'
import type { ValidationResult } from '../types/adapter'

export const INLINE_SECRET_IN_PROFILE = 'INLINE_SECRET_IN_PROFILE'
export const SECRET_REFERENCE_MISSING = 'SECRET_REFERENCE_MISSING'
export const SECRET_REFERENCE_WRITE_UNSUPPORTED = 'SECRET_REFERENCE_WRITE_UNSUPPORTED'

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

function collectSecretReferenceIssues(profile: Profile): ValidationIssue[] {
  const records = [
    { prefix: 'source', record: profile.source },
    { prefix: 'apply', record: profile.apply },
  ]
  const issues: ValidationIssue[] = []

  for (const { prefix, record } of records) {
    for (const [key, value] of Object.entries(record)) {
      if (!isSecretReferenceKey(key)) {
        continue
      }

      if (typeof value !== 'string' || value.trim().length === 0) {
        issues.push({
          code: SECRET_REFERENCE_MISSING,
          level: 'error',
          field: `${prefix}.${key}`,
          source: 'profile',
          message: `profile.${prefix}.${key} 缺少可用的 secret 引用。`,
        })
      }
    }
  }

  return issues
}

function hasUsableSecretReference(profile: Profile): boolean {
  const records = [profile.source, profile.apply]
  return records.some((record) => Object.entries(record).some(([key, value]) =>
    isSecretReferenceKey(key) && typeof value === 'string' && value.trim().length > 0))
}

function getPlatformMissingInlineSecretCodes(platform: Profile['platform']): string[] {
  switch (platform) {
    case 'claude':
      return ['missing-anthropic-auth-token']
    case 'codex':
      return ['missing-openai-api-key']
    case 'gemini':
      return ['missing-gemini-api-key']
    default:
      return []
  }
}

export function withProfileSecretReferenceContract(
  validation: ValidationResult,
  profile: Profile,
): ValidationResult {
  const referenceIssues = collectSecretReferenceIssues(profile)
  const hasValidReference = referenceIssues.length === 0 && hasUsableSecretReference(profile)

  let errors = [...validation.errors]
  let warnings = [...validation.warnings]
  let limitations = [...validation.limitations]

  if (referenceIssues.length > 0) {
    errors = [
      ...errors,
      ...referenceIssues,
    ]
  }

  if (hasValidReference) {
    const missingCodes = new Set(getPlatformMissingInlineSecretCodes(profile.platform))
    errors = errors.filter((item) => !missingCodes.has(item.code))
    warnings = warnings.filter((item) => !missingCodes.has(item.code))
    limitations = [
      ...limitations,
      {
        code: SECRET_REFERENCE_WRITE_UNSUPPORTED,
        level: 'limitation',
        source: 'profile',
        message: '当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。',
      },
    ]
  }

  return {
    ...validation,
    ok: errors.length === 0,
    errors,
    warnings,
    limitations,
  }
}
