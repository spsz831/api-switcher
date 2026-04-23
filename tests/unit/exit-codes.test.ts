import { describe, expect, it } from 'vitest'
import type { CommandResult } from '../../src/types/command'
import { EXIT_CODES, isRuntimeFailureResult, mapCommandResultToExitCode, mapResultToExitCode } from '../../src/constants/exit-codes'

const businessFailureCodes = [
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
  'SCHEMA_CONSUMER_PROFILE_NOT_FOUND',
  'SCHEMA_ACTION_NOT_FOUND',
] as const

describe('exit codes', () => {
  it('成功结果返回 0', () => {
    expect(mapResultToExitCode(true)).toBe(EXIT_CODES.success)
  })

  it('业务失败返回 1', () => {
    expect(mapResultToExitCode(false)).toBe(EXIT_CODES.businessFailure)
  })

  it('运行异常返回 2', () => {
    expect(mapResultToExitCode(false, true)).toBe(EXIT_CODES.runtimeFailure)
  })

  it('按结果对象映射运行失败与业务失败', () => {
    const runtimeResult = {
      ok: false,
      action: 'current',
      error: {
        code: 'CURRENT_FAILED',
        message: 'EISDIR: illegal operation on a directory',
      },
    } satisfies CommandResult

    const businessResult = {
      ok: false,
      action: 'validate',
      error: {
        code: 'PROFILE_NOT_FOUND',
        message: '未找到配置档：missing-profile',
      },
    } satisfies CommandResult

    expect(isRuntimeFailureResult(runtimeResult)).toBe(true)
    expect(mapCommandResultToExitCode(runtimeResult)).toBe(EXIT_CODES.runtimeFailure)
    expect(isRuntimeFailureResult(businessResult)).toBe(false)
    expect(mapCommandResultToExitCode(businessResult)).toBe(EXIT_CODES.businessFailure)
  })

  it('所有业务错误码都映射为业务失败退出码', () => {
    for (const code of businessFailureCodes) {
      const result = {
        ok: false,
        action: 'validate',
        error: {
          code,
          message: `业务失败：${code}`,
        },
      } satisfies CommandResult

      expect(isRuntimeFailureResult(result)).toBe(false)
      expect(mapCommandResultToExitCode(result)).toBe(EXIT_CODES.businessFailure)
    }
  })
})
