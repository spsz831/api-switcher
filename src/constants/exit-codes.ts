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
])

const BUSINESS_FAILURE_MESSAGE_PATTERNS: Partial<Record<string, RegExp[]>> = {
  ADD_FAILED: [
    /^不支持的平台：/,
    /^gemini 平台暂不支持 --url/,
    /^配置 ID 已存在：/,
  ],
  EXPORT_FAILED: [/^未注册的平台适配器：/],
  LIST_FAILED: [/^不支持的平台：/],
  PREVIEW_FAILED: [/^未找到配置档：/],
  ROLLBACK_FAILED: [/^无法从 backupId 推断平台：/],
  USE_FAILED: [/^未找到配置档：/],
  VALIDATE_FAILED: [/^未找到配置档：/],
}

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

  const patterns = BUSINESS_FAILURE_MESSAGE_PATTERNS[result.error.code]
  if (patterns?.some((pattern) => pattern.test(result.error?.message ?? ''))) {
    return false
  }

  return true
}

export function mapCommandResultToExitCode(result: Pick<CommandResult, 'ok' | 'error'>): ExitCode {
  return mapResultToExitCode(result.ok, isRuntimeFailureResult(result))
}
