import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXIT_CODES } from '../../src/constants/exit-codes'
import { outputCommandResult } from '../../src/commands/output-command-result'
import type { CommandResult } from '../../src/types/command'

describe('output command result', () => {
  beforeEach(() => {
    process.exitCode = undefined
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  it('text 模式输出文本并设置成功退出码', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const result: CommandResult = {
      ok: true,
      action: 'other',
    }

    outputCommandResult(result)

    expect(writeSpy).toHaveBeenCalledWith('[other] 成功\n执行成功\n')
    expect(process.exitCode).toBe(EXIT_CODES.success)
  })

  it('json 模式输出 JSON 并设置成功退出码', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const result: CommandResult = {
      ok: true,
      action: 'other',
      data: { foo: 'bar' },
    }

    outputCommandResult(result, true)

    expect(writeSpy).toHaveBeenCalledWith(`${JSON.stringify(result, null, 2)}\n`)
    expect(process.exitCode).toBe(EXIT_CODES.success)
  })

  it('业务失败时设置业务失败退出码', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const result: CommandResult = {
      ok: false,
      action: 'validate',
      error: {
        code: 'PROFILE_NOT_FOUND',
        message: '未找到配置档：missing-profile',
      },
    }

    outputCommandResult(result)

    expect(writeSpy).toHaveBeenCalledWith('[validate] 失败\n未找到配置档：missing-profile\n')
    expect(process.exitCode).toBe(EXIT_CODES.businessFailure)
  })

  it('运行失败时设置运行失败退出码', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const result: CommandResult = {
      ok: false,
      action: 'current',
      error: {
        code: 'CURRENT_FAILED',
        message: 'EISDIR: illegal operation on a directory',
      },
    }

    outputCommandResult(result)

    expect(writeSpy).toHaveBeenCalledWith('[current] 失败\nEISDIR: illegal operation on a directory\n')
    expect(process.exitCode).toBe(EXIT_CODES.runtimeFailure)
  })
})
