import { afterEach, describe, expect, it } from 'vitest'
import {
  assertTargetScope,
  buildSnapshotScopePolicy,
  formatScopeCapabilityMatrix,
  formatScopeSupportSummary,
  getScopeCapabilityMatrix,
  getScopeOptionDescription,
  getTargetScopeWarning,
  isHighRiskTargetScope,
  requiresRollbackScopeMatch,
  resolveTargetScope,
} from '../../src/services/scope-options'

describe('scope options', () => {
  const originalEnv = {
    API_SWITCHER_CLAUDE_TARGET_SCOPE: process.env.API_SWITCHER_CLAUDE_TARGET_SCOPE,
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key]
        continue
      }

      process.env[key] = value
    }
  })

  it('Claude 未显式传入 scope 时会先读取环境变量默认值', () => {
    process.env.API_SWITCHER_CLAUDE_TARGET_SCOPE = 'local'

    expect(resolveTargetScope('claude')).toBe('local')
    expect(resolveTargetScope('claude', 'project')).toBe('project')
  })

  it('Claude 非法环境默认 scope 会回退到 user', () => {
    process.env.API_SWITCHER_CLAUDE_TARGET_SCOPE = 'workspace'

    expect(resolveTargetScope('claude')).toBe('user')
  })

  it('Gemini 默认写入 user，project 属于高风险 scope', () => {
    expect(resolveTargetScope('gemini')).toBe('user')
    expect(resolveTargetScope('gemini', 'project')).toBe('project')
    expect(isHighRiskTargetScope('gemini', 'project')).toBe(true)
    expect(isHighRiskTargetScope('gemini', 'user')).toBe(false)
    expect(getTargetScopeWarning('gemini', 'project')).toBe(
      'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
    )
  })

  it('Gemini rollback 需要匹配 target scope，而 Claude 不需要', () => {
    expect(requiresRollbackScopeMatch('gemini')).toBe(true)
    expect(requiresRollbackScopeMatch('claude')).toBe(false)
  })

  it('会按平台校验允许的 scope', () => {
    expect(() => assertTargetScope('claude', 'local')).not.toThrow()
    expect(() => assertTargetScope('gemini', 'local')).toThrow(
      'Gemini 当前仅支持写入 user/project scope；system-defaults/system-overrides 仅用于检测。收到：local',
    )
  })

  it('会从平台 policy 生成 CLI scope 帮助文案', () => {
    expect(formatScopeSupportSummary()).toBe('Claude: user/project/local; Codex: 不使用 --scope; Gemini: user/project')
    expect(getScopeOptionDescription()).toBe(
      '目标作用域（Claude: user/project/local; Codex: 不使用 --scope; Gemini: user/project）',
    )
    expect(getScopeOptionDescription('期望回滚的目标作用域')).toBe(
      '期望回滚的目标作用域（Claude: user/project/local; Codex: 不使用 --scope; Gemini: user/project）',
    )
  })

  it('会从平台 policy 生成 scope capability matrix', () => {
    expect(getScopeCapabilityMatrix('gemini')).toEqual([
      {
        scope: 'system-defaults',
        detect: true,
        preview: true,
        use: false,
        rollback: false,
        writable: false,
        risk: 'normal',
        confirmationRequired: false,
        note: '只参与 Gemini effective config 检测与 precedence 推导，不允许写入或回滚。',
      },
      {
        scope: 'user',
        detect: true,
        preview: true,
        use: true,
        rollback: true,
        writable: true,
        risk: 'normal',
        confirmationRequired: false,
      },
      {
        scope: 'project',
        detect: true,
        preview: true,
        use: true,
        rollback: true,
        writable: true,
        risk: 'high',
        confirmationRequired: true,
        note: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
      },
      {
        scope: 'system-overrides',
        detect: true,
        preview: true,
        use: false,
        rollback: false,
        writable: false,
        risk: 'normal',
        confirmationRequired: false,
        note: '只参与 Gemini effective config 检测与 precedence 推导，不允许写入或回滚。',
      },
    ])

    expect(getScopeCapabilityMatrix('claude').map((item) => item.scope)).toEqual(['user', 'project', 'local'])
    expect(getScopeCapabilityMatrix('codex')).toEqual([])
  })

  it('会格式化 scope capability matrix 供文档复用', () => {
    expect(formatScopeCapabilityMatrix('gemini')).toBe([
      '| Scope | Detect/current | Preview/effective | Use/write | Rollback | Risk | Notes |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| `system-defaults` | yes | yes | no | no | normal | 只参与 Gemini effective config 检测与 precedence 推导，不允许写入或回滚。 |',
      '| `user` | yes | yes | yes | yes | normal |  |',
      '| `project` | yes | yes | yes | yes | high, requires `--force` | Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。 |',
      '| `system-overrides` | yes | yes | no | no | normal | 只参与 Gemini effective config 检测与 precedence 推导，不允许写入或回滚。 |',
    ].join('\n'))
  })

  it('会从平台 policy 生成 snapshot scope 元数据', () => {
    expect(buildSnapshotScopePolicy('gemini', {
      requestedScope: 'project',
      resolvedScope: 'project',
    })).toEqual({
      requestedScope: 'project',
      resolvedScope: 'project',
      defaultScope: 'user',
      explicitScope: true,
      highRisk: true,
      riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
      rollbackScopeMatchRequired: true,
    })

    expect(buildSnapshotScopePolicy('claude', {
      resolvedScope: 'project',
    })).toEqual({
      requestedScope: undefined,
      resolvedScope: 'project',
      defaultScope: 'user',
      explicitScope: false,
      highRisk: false,
      riskWarning: undefined,
      rollbackScopeMatchRequired: false,
    })
  })
})
