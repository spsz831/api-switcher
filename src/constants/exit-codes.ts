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
  'GEMINI_URL_UNSUPPORTED',
  'ADAPTER_NOT_REGISTERED',
  'INVALID_BACKUP_ID',
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
