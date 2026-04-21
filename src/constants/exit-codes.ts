import type { CommandResult } from '../types/command'

export const EXIT_CODES = {
  success: 0,
  businessFailure: 1,
  runtimeFailure: 2,
} as const

const BUSINESS_FAILURE_CODES = new Set([
  'VALIDATION_FAILED',
  'CONFIRMATION_REQUIRED',
  'BACKUP_NOT_FOUND',
  'APPLY_FAILED',
  'PROFILE_NOT_FOUND',
  'UNSUPPORTED_PLATFORM',
  'DUPLICATE_PROFILE_ID',
  'ADD_INPUT_CONFLICT',
  'ADD_INPUT_REQUIRED',
  'GEMINI_URL_UNSUPPORTED',
  'ADAPTER_NOT_REGISTERED',
  'INVALID_BACKUP_ID',
  'INVALID_SCOPE',
  'ROLLBACK_SCOPE_MISMATCH',
  'IMPORT_SOURCE_NOT_FOUND',
  'IMPORT_SOURCE_INVALID',
  'IMPORT_UNSUPPORTED_SCHEMA',
  'IMPORT_PROFILE_NOT_FOUND',
  'IMPORT_PLATFORM_NOT_SUPPORTED',
  'IMPORT_APPLY_NOT_READY',
  'IMPORT_SCOPE_UNAVAILABLE',
  'IMPORT_APPLY_FAILED',
])

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES]

export function mapResultToExitCode(ok: boolean, isRuntimeError = false): ExitCode {
  if (ok) {
    return EXIT_CODES.success
  }

  return isRuntimeError ? EXIT_CODES.runtimeFailure : EXIT_CODES.businessFailure
}

export function isRuntimeFailureResult(result: Pick<CommandResult, 'ok' | 'error'>): boolean {
  if (result.ok || !result.error) {
    return false
  }

  if (BUSINESS_FAILURE_CODES.has(result.error.code)) {
    return false
  }

  return true
}

export function mapCommandResultToExitCode(result: Pick<CommandResult, 'ok' | 'error'>): ExitCode {
  return mapResultToExitCode(result.ok, isRuntimeFailureResult(result))
}
