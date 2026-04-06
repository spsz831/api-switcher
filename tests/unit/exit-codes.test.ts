import { describe, expect, it } from 'vitest'
import { EXIT_CODES, mapResultToExitCode } from '../../src/constants/exit-codes'

describe('exit codes', () => {
  it('成功结果返回 0', () => {
    expect(mapResultToExitCode(true)).toBe(EXIT_CODES.success)
  })

  it('运行异常返回 2', () => {
    expect(mapResultToExitCode(false, true)).toBe(EXIT_CODES.runtimeFailure)
  })
})
