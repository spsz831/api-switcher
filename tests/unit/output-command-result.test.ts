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

    expect(writeSpy).toHaveBeenCalledWith(`${JSON.stringify({
      schemaVersion: '2026-04-15.public-json.v1',
      ...result,
    }, null, 2)}\n`)
    expect(process.exitCode).toBe(EXIT_CODES.success)
  })

  it('json 模式对 import-apply 透传稳定 success fields，不扁平化 explainable', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const result: CommandResult = {
      ok: true,
      action: 'import-apply',
      data: {
        sourceFile: 'E:/tmp/export.json',
        importedProfile: {
          id: 'gemini-prod',
          name: 'Gemini 生产',
          platform: 'gemini',
          source: {},
          apply: {},
        },
        appliedScope: 'project',
        scopePolicy: {
          requestedScope: 'project',
          resolvedScope: 'project',
          defaultScope: 'user',
          explicitScope: true,
          highRisk: true,
          riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
          rollbackScopeMatchRequired: true,
        },
        scopeCapabilities: [
          {
            scope: 'project',
            detect: true,
            preview: true,
            use: true,
            rollback: true,
            writable: true,
            risk: 'high',
            confirmationRequired: true,
          },
        ],
        scopeAvailability: [
          {
            scope: 'project',
            status: 'available',
            detected: true,
            writable: true,
            path: 'E:/repo/.gemini/settings.json',
          },
        ],
        validation: {
          ok: true,
          errors: [],
          warnings: [],
          limitations: [],
        },
        preview: {
          platform: 'gemini',
          profileId: 'gemini-prod',
          targetFiles: [],
          effectiveFields: [],
          storedOnlyFields: [],
          diffSummary: [],
          warnings: [],
          limitations: [],
          riskLevel: 'medium',
          requiresConfirmation: true,
          backupPlanned: true,
          noChanges: false,
        },
        risk: {
          allowed: true,
          riskLevel: 'medium',
          reasons: ['导入结果采用当前本地 observation，project scope 会覆盖 user 同名字段。'],
          limitations: ['GEMINI_API_KEY 仍需通过环境变量生效。'],
        },
        backupId: 'snapshot-import-001',
        changedFiles: ['C:/Users/test/.gemini/settings.json'],
        noChanges: false,
        summary: {
          warnings: ['导入结果采用当前本地 observation，project scope 会覆盖 user 同名字段。'],
          limitations: ['GEMINI_API_KEY 仍需通过环境变量生效。'],
        },
      },
      warnings: ['导入结果采用当前本地 observation，project scope 会覆盖 user 同名字段。'],
      limitations: ['GEMINI_API_KEY 仍需通过环境变量生效。'],
    }

    outputCommandResult(result, true)

    expect(writeSpy).toHaveBeenCalledWith(`${JSON.stringify({
      schemaVersion: '2026-04-15.public-json.v1',
      ...result,
    }, null, 2)}\n`)

    const rendered = JSON.parse(writeSpy.mock.calls[0][0] as string)
    expect(rendered.data.sourceFile).toBe('E:/tmp/export.json')
    expect(rendered.data.importedProfile.id).toBe('gemini-prod')
    expect(rendered.data.appliedScope).toBe('project')
    expect(rendered.data.scopePolicy).toEqual({
      requestedScope: 'project',
      resolvedScope: 'project',
      defaultScope: 'user',
      explicitScope: true,
      highRisk: true,
      riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
      rollbackScopeMatchRequired: true,
    })
    expect(rendered.data.risk.reasons).toEqual(['导入结果采用当前本地 observation，project scope 会覆盖 user 同名字段。'])
    expect(rendered.scopePolicy).toBeUndefined()
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

  it('适配器未注册时设置业务失败退出码', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const result: CommandResult = {
      ok: false,
      action: 'list',
      error: {
        code: 'ADAPTER_NOT_REGISTERED',
        message: '未注册的平台适配器：claude',
      },
    }

    outputCommandResult(result)

    expect(writeSpy).toHaveBeenCalledWith('[list] 失败\n未注册的平台适配器：claude\n')
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
