import { describe, expect, it } from 'vitest'
import type { CommandResult } from '../../src/types/command'
import { EXIT_CODES, isRuntimeFailureResult, mapCommandResultToExitCode, mapResultToExitCode } from '../../src/constants/exit-codes'

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
        code: 'VALIDATE_FAILED',
        message: '未找到配置档：missing-profile',
      },
    } satisfies CommandResult

    expect(isRuntimeFailureResult(runtimeResult)).toBe(true)
    expect(mapCommandResultToExitCode(runtimeResult)).toBe(EXIT_CODES.runtimeFailure)
    expect(isRuntimeFailureResult(businessResult)).toBe(false)
    expect(mapCommandResultToExitCode(businessResult)).toBe(EXIT_CODES.businessFailure)
  })
})
