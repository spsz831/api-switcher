import { isSecretLikeKey, isSecretReferenceKey } from './masking'
import { defaultSecretReferenceResolver, type SecretReferenceResolver } from './secret-reference-resolver'
import type { ValidationIssue } from '../types/adapter'
import type { Profile } from '../types/profile'
import type { ValidationResult } from '../types/adapter'
import type {
  ReferenceGovernanceDetail,
  ReferenceGovernanceFailureDetails,
  ReferenceGovernanceReasonCode,
  ReferenceSummary,
  SecretReferenceStats,
} from '../types/command'

export const INLINE_SECRET_IN_PROFILE = 'INLINE_SECRET_IN_PROFILE'
export const SECRET_REFERENCE_MISSING = 'SECRET_REFERENCE_MISSING'
export const SECRET_REFERENCE_WRITE_UNSUPPORTED = 'SECRET_REFERENCE_WRITE_UNSUPPORTED'
export const SECRET_REFERENCE_WRITE_UNSUPPORTED_MESSAGE = '当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。'

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

export function collectProfileSecretReferenceIssues(profile: Profile): ValidationIssue[] {
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

function hasAnySecretReferenceField(profile: Profile): boolean {
  const records = [profile.source, profile.apply]
  return records.some((record) => Object.keys(record).some((key) => isSecretReferenceKey(key)))
}

function collectProfileSecretReferenceValues(profile: Profile): string[] {
  const records = [profile.source, profile.apply]
  return records.flatMap((record) => Object.entries(record)
    .filter(([key]) => isSecretReferenceKey(key))
    .map(([, value]) => typeof value === 'string' ? value.trim() : '')
    .filter((value) => value.length > 0))
}

function collectReferenceGovernanceDetails(
  profile: Profile,
  resolver: SecretReferenceResolver,
): ReferenceGovernanceDetail[] {
  const records = [
    { prefix: 'source', record: profile.source },
    { prefix: 'apply', record: profile.apply },
  ]

  return records.flatMap(({ prefix, record }) => Object.entries(record).flatMap<ReferenceGovernanceDetail>(([key, value]) => {
    if (!isSecretReferenceKey(key)) {
      return []
    }

    const field = `${prefix}.${key}`
    if (typeof value !== 'string' || value.trim().length === 0) {
      return [{
        code: 'REFERENCE_VALUE_MISSING',
        field,
        status: 'missing',
        message: `profile.${field} 缺少可用的 secret 引用。`,
      }]
    }

    const reference = value.trim()
    const resolution = resolver.resolve(reference)
    if (resolution.status === 'resolved') {
      return [{
        code: 'REFERENCE_ENV_RESOLVED',
        field,
        status: 'resolved',
        reference,
        scheme: resolution.scheme,
        message: `profile.${field} 的 ${resolution.scheme ?? 'reference'} 引用已解析，但当前写入链路仍不会直接消费引用。`,
      }]
    }

    if (resolution.status === 'missing') {
      return [{
        code: 'REFERENCE_ENV_UNRESOLVED',
        field,
        status: 'missing',
        reference,
        scheme: resolution.scheme,
        message: `profile.${field} 的 ${resolution.scheme ?? 'reference'} 引用当前不可解析。`,
      }]
    }

    return [{
      code: 'REFERENCE_SCHEME_UNSUPPORTED',
      field,
      status: 'unsupported-scheme',
      reference,
      scheme: resolution.scheme,
      message: `profile.${field} 使用的引用 scheme 当前不受支持。`,
    }]
  }))
}

export function hasProfileInlineSecrets(profile: Profile): boolean {
  return inspectProfileInlineSecrets(profile).length > 0
}

export function hasProfileUsableSecretReference(profile: Profile): boolean {
  const referenceIssues = collectProfileSecretReferenceIssues(profile)
  return referenceIssues.length === 0 && hasUsableSecretReference(profile)
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
  const referenceIssues = collectProfileSecretReferenceIssues(profile)
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
        message: SECRET_REFERENCE_WRITE_UNSUPPORTED_MESSAGE,
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

export function collectProfileSecretReferenceContractLimitations(profile: Profile): string[] {
  return hasProfileUsableSecretReference(profile) ? [SECRET_REFERENCE_WRITE_UNSUPPORTED_MESSAGE] : []
}

export function buildSecretReferenceStats(
  profiles: Profile[],
  resolver: SecretReferenceResolver = defaultSecretReferenceResolver,
): SecretReferenceStats {
  const profileCount = profiles.length
  const referenceProfileCount = profiles.filter(hasProfileUsableSecretReference).length
  const resolvedReferenceProfileCount = profiles.filter((profile) => {
    const references = collectProfileSecretReferenceValues(profile)
    return references.length > 0 && references.every((reference) => resolver.resolve(reference).status === 'resolved')
  }).length
  const missingReferenceProfileCount = profiles.filter((profile) => {
    const hasMissingInput = collectProfileSecretReferenceIssues(profile).length > 0
    const references = collectProfileSecretReferenceValues(profile)
    return hasMissingInput || references.some((reference) => resolver.resolve(reference).status === 'missing')
  }).length
  const unsupportedReferenceProfileCount = profiles.filter((profile) =>
    collectProfileSecretReferenceValues(profile).some((reference) => resolver.resolve(reference).status === 'unsupported-scheme')).length
  const inlineProfileCount = profiles.filter(hasProfileInlineSecrets).length
  const writeUnsupportedProfileCount = profiles.filter((profile) =>
    collectProfileSecretReferenceContractLimitations(profile).length > 0).length

  return {
    profileCount,
    referenceProfileCount,
    resolvedReferenceProfileCount,
    missingReferenceProfileCount,
    unsupportedReferenceProfileCount,
    inlineProfileCount,
    writeUnsupportedProfileCount,
    hasReferenceProfiles: referenceProfileCount > 0,
    hasResolvedReferenceProfiles: resolvedReferenceProfileCount > 0,
    hasMissingReferenceProfiles: missingReferenceProfileCount > 0,
    hasUnsupportedReferenceProfiles: unsupportedReferenceProfileCount > 0,
    hasInlineProfiles: inlineProfileCount > 0,
    hasWriteUnsupportedProfiles: writeUnsupportedProfileCount > 0,
  }
}

export function buildProfileReferenceSummary(
  profile: Profile,
  resolver: SecretReferenceResolver = defaultSecretReferenceResolver,
): ReferenceSummary | undefined {
  const referenceDetails = collectReferenceGovernanceDetails(profile, resolver)
  const hasReferenceFields = hasAnySecretReferenceField(profile)
  const hasInlineSecrets = hasProfileInlineSecrets(profile)
  const writeUnsupported = hasProfileUsableSecretReference(profile)

  if (!hasReferenceFields && !hasInlineSecrets) {
    return undefined
  }

  const resolvedReferenceCount = referenceDetails.filter((item) => item.code === 'REFERENCE_ENV_RESOLVED').length
  const missingReferenceCount = referenceDetails.filter((item) => item.code === 'REFERENCE_ENV_UNRESOLVED').length
  const unsupportedReferenceCount = referenceDetails.filter((item) => item.code === 'REFERENCE_SCHEME_UNSUPPORTED').length
  const missingValueCount = referenceDetails.filter((item) => item.code === 'REFERENCE_VALUE_MISSING').length

  return {
    hasReferenceFields,
    hasInlineSecrets,
    writeUnsupported,
    resolvedReferenceCount,
    missingReferenceCount,
    unsupportedReferenceCount,
    missingValueCount,
    ...(referenceDetails.length > 0 ? { referenceDetails } : {}),
  }
}

const REFERENCE_GOVERNANCE_REASON_PRIORITY: ReferenceGovernanceReasonCode[] = [
  'REFERENCE_INPUT_CONFLICT',
  'REFERENCE_MISSING',
  'REFERENCE_WRITE_UNSUPPORTED',
  'INLINE_SECRET_PRESENT',
]

function collectValidationIssueCodes(validation: Pick<ValidationResult, 'errors' | 'warnings' | 'limitations'>): Set<string> {
  return new Set([
    ...validation.errors.map((issue) => issue.code),
    ...validation.warnings.map((issue) => issue.code),
    ...validation.limitations.map((issue) => issue.code),
  ])
}

function sortReferenceGovernanceReasonCodes(reasonCodes: Set<ReferenceGovernanceReasonCode>): ReferenceGovernanceReasonCode[] {
  return REFERENCE_GOVERNANCE_REASON_PRIORITY.filter((code) => reasonCodes.has(code))
}

export function buildReferenceGovernanceFailureDetails(
  profile: Profile,
  validation: Pick<ValidationResult, 'errors' | 'warnings' | 'limitations'>,
  resolver: SecretReferenceResolver = defaultSecretReferenceResolver,
): ReferenceGovernanceFailureDetails | undefined {
  const validationCodes = collectValidationIssueCodes(validation)
  const referenceIssues = collectProfileSecretReferenceIssues(profile)
  const referenceDetails = collectReferenceGovernanceDetails(profile, resolver)
  const hasReferenceProfiles = hasProfileUsableSecretReference(profile)
  const hasInlineProfiles = hasProfileInlineSecrets(profile)
  const hasWriteUnsupportedProfiles = hasReferenceProfiles
    || validationCodes.has(SECRET_REFERENCE_WRITE_UNSUPPORTED)

  const reasonCodes = new Set<ReferenceGovernanceReasonCode>()
  if (hasWriteUnsupportedProfiles) {
    reasonCodes.add('REFERENCE_WRITE_UNSUPPORTED')
  }
  if (hasInlineProfiles || validationCodes.has(INLINE_SECRET_IN_PROFILE)) {
    reasonCodes.add('INLINE_SECRET_PRESENT')
  }
  if (referenceIssues.length > 0 || validationCodes.has(SECRET_REFERENCE_MISSING)) {
    reasonCodes.add('REFERENCE_MISSING')
  }

  const sortedReasonCodes = sortReferenceGovernanceReasonCodes(reasonCodes)
  if (
    !hasReferenceProfiles
    && !hasInlineProfiles
    && !hasWriteUnsupportedProfiles
    && sortedReasonCodes.length === 0
  ) {
    return undefined
  }

  return {
    hasReferenceProfiles,
    hasInlineProfiles,
    hasWriteUnsupportedProfiles,
    primaryReason: sortedReasonCodes[0]!,
    reasonCodes: sortedReasonCodes,
    ...(referenceDetails.length > 0 ? { referenceDetails } : {}),
  }
}
