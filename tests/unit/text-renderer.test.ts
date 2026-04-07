import { describe, expect, it } from 'vitest'
import { renderText } from '../../src/renderers/text-renderer'
import type {
  AddCommandOutput,
  CommandResult,
  CurrentCommandOutput,
  ExportCommandOutput,
  ListCommandOutput,
  PreviewCommandOutput,
  RollbackCommandOutput,
  UseCommandOutput,
  ValidateCommandOutput,
} from '../../src/types/command'

function createCurrentResult(data: CurrentCommandOutput): CommandResult<CurrentCommandOutput> {
  return {
    ok: true,
    action: 'current',
    data,
  }
}

function createPreviewResult(
  data: PreviewCommandOutput,
  warnings?: string[],
  limitations?: string[],
): CommandResult<PreviewCommandOutput> {
  return {
    ok: true,
    action: 'preview',
    data,
    warnings,
    limitations,
  }
}

function createUseResult(data: UseCommandOutput, warnings?: string[], limitations?: string[]): CommandResult<UseCommandOutput> {
  return {
    ok: true,
    action: 'use',
    data,
    warnings,
    limitations,
  }
}

function createRollbackResult(
  data: RollbackCommandOutput,
  warnings?: string[],
  limitations?: string[],
): CommandResult<RollbackCommandOutput> {
  return {
    ok: true,
    action: 'rollback',
    data,
    warnings,
    limitations,
  }
}

function createValidateResult(data: ValidateCommandOutput, limitations?: string[]): CommandResult<ValidateCommandOutput> {
  return {
    ok: true,
    action: 'validate',
    data,
    limitations,
  }
}

function createExportResult(data: ExportCommandOutput, limitations?: string[]): CommandResult<ExportCommandOutput> {
  return {
    ok: true,
    action: 'export',
    data,
    limitations,
  }
}

function createAddResult(data: AddCommandOutput, warnings?: string[], limitations?: string[]): CommandResult<AddCommandOutput> {
  return {
    ok: true,
    action: 'add',
    data,
    warnings,
    limitations,
  }
}

function createListResult(data: ListCommandOutput): CommandResult<ListCommandOutput> {
  return {
    ok: true,
    action: 'list',
    data,
  }
}

function createFailureResult(action: string, message: string): CommandResult {
  return {
    ok: false,
    action,
    error: {
      code: 'FAILED',
      message,
    },
  }
}

const currentPayload: CurrentCommandOutput = {
  current: {
    claude: 'claude-prod',
    gemini: 'gemini-prod',
  },
  lastSwitch: {
    platform: 'gemini',
    profileId: 'gemini-prod',
    backupId: 'backup-001',
    time: '2026-04-04T22:00:00.000Z',
    status: 'success',
  },
  detections: [
    {
      platform: 'gemini',
      managed: true,
      matchedProfileId: 'gemini-prod',
      targetFiles: [
        {
          path: 'C:/Users/test/.gemini/settings.json',
          format: 'json',
          exists: true,
          managedScope: 'partial-fields',
        },
      ],
      currentScope: 'user',
      effectiveConfig: {
        stored: [
          {
            key: 'enforcedAuthType',
            value: 'gemini-api-key',
            maskedValue: 'gemini-api-key',
            source: 'stored',
            scope: 'user',
            secret: false,
          },
        ],
        effective: [
          {
            key: 'enforcedAuthType',
            value: 'gemini-api-key',
            maskedValue: 'gemini-api-key',
            source: 'effective',
            scope: 'user',
            secret: false,
          },
          {
            key: 'GEMINI_API_KEY',
            value: '<SECRET>',
            maskedValue: 'gm-***1234',
            source: 'env',
            scope: 'runtime',
            secret: true,
            shadowed: true,
          },
        ],
        overrides: [
          {
            key: 'GEMINI_API_KEY',
            kind: 'env',
            source: 'env',
            message: '最终生效的 API key 取决于环境变量，而不是 settings.json。',
            shadowed: true,
          },
        ],
        shadowedKeys: ['GEMINI_API_KEY'],
      },
      managedBoundaries: [
        {
          target: 'C:/Users/test/.gemini/settings.json',
          type: 'managed-fields',
          managedKeys: ['enforcedAuthType'],
          preservedKeys: ['ui.theme'],
          notes: ['Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。'],
        },
      ],
      secretReferences: [
        {
          key: 'GEMINI_API_KEY',
          source: 'env',
          present: true,
          maskedValue: 'gm-***1234',
        },
      ],
      warnings: [
        {
          code: 'env-auth-required',
          level: 'warning',
          message: 'Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。',
        },
      ],
      limitations: [
        {
          code: 'env-first-limitation',
          level: 'limitation',
          message: 'GEMINI_API_KEY 仍需通过环境变量生效。',
        },
      ],
    },
  ],
}

const emptyCurrentPayload: CurrentCommandOutput = {
  current: {},
  detections: [],
}

const previewPayload: PreviewCommandOutput = {
  profile: {
    id: 'gemini-prod',
    name: 'Gemini 生产',
    platform: 'gemini',
    source: {},
    apply: {},
  },
  validation: {
    ok: true,
    errors: [],
    warnings: [],
    limitations: [],
  },
  preview: {
    platform: 'gemini',
    profileId: 'gemini-prod',
    targetFiles: [
      {
        path: 'C:/Users/test/.gemini/settings.json',
        format: 'json',
        exists: true,
        managedScope: 'partial-fields',
      },
    ],
    effectiveFields: [],
    storedOnlyFields: [],
    effectiveConfig: {
      stored: [
        {
          key: 'enforcedAuthType',
          value: 'oauth-personal',
          maskedValue: 'oauth-personal',
          source: 'stored',
          scope: 'user',
          secret: false,
        },
      ],
      effective: [
        {
          key: 'enforcedAuthType',
          value: 'gemini-api-key',
          maskedValue: 'gemini-api-key',
          source: 'effective',
          scope: 'user',
          secret: false,
        },
        {
          key: 'GEMINI_API_KEY',
          value: 'gm-live-123456',
          maskedValue: 'gm-l***56',
          source: 'effective',
          scope: 'user',
          secret: true,
        },
      ],
      overrides: [
        {
          key: 'GEMINI_API_KEY',
          kind: 'env',
          source: 'env',
          message: '最终生效的 API key 取决于环境变量，而不是 settings.json。',
        },
      ],
      shadowedKeys: [],
    },
    managedBoundaries: [
      {
        target: 'C:/Users/test/.gemini/settings.json',
        type: 'managed-fields',
        managedKeys: ['enforcedAuthType'],
        preservedKeys: ['ui'],
        notes: ['Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。'],
      },
    ],
    secretReferences: [
      {
        key: 'GEMINI_API_KEY',
        source: 'inline',
        present: true,
        maskedValue: 'gm-l***56',
      },
    ],
    diffSummary: [
      {
        path: 'C:/Users/test/.gemini/settings.json',
        changedKeys: ['enforcedAuthType'],
        hasChanges: true,
      },
    ],
    warnings: [
      {
        code: 'env-auth-required',
        level: 'warning',
        message: 'Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。',
      },
    ],
    limitations: [
      {
        code: 'env-first-limitation',
        level: 'limitation',
        message: 'GEMINI_API_KEY 仍需通过环境变量生效。',
      },
    ],
    riskLevel: 'medium',
    requiresConfirmation: true,
    backupPlanned: true,
    noChanges: false,
  },
  risk: {
    allowed: false,
    riskLevel: 'medium',
    reasons: ['高风险操作需要确认'],
    limitations: ['Gemini 最终认证结果仍受环境变量影响。'],
  },
}

const noChangesPreviewPayload: PreviewCommandOutput = {
  ...previewPayload,
  preview: {
    ...previewPayload.preview,
    diffSummary: [
      {
        path: 'C:/Users/test/.gemini/settings.json',
        changedKeys: [],
        hasChanges: false,
      },
    ],
    noChanges: true,
  },
}

const emptyValidationPreviewPayload: PreviewCommandOutput = {
  ...previewPayload,
  validation: {
    ok: false,
    errors: [
      {
        code: 'missing-key',
        level: 'error',
        message: '缺少关键字段',
      },
    ],
    warnings: [],
    limitations: [
      {
        code: 'missing-key-limitation',
        level: 'limitation',
        message: '缺少关键字段时不会执行写入。',
      },
    ],
  },
  preview: {
    ...previewPayload.preview,
    warnings: [],
  },
}

const validationPreviewPayloadWithLimitations: PreviewCommandOutput = {
  ...previewPayload,
  validation: {
    ok: true,
    errors: [],
    warnings: [],
    limitations: [
      {
        code: 'validation-limitation',
        level: 'limitation',
        message: '当前平台能力存在 env-first 限制。',
      },
    ],
  },
}

const usePayload: UseCommandOutput = {
  profile: previewPayload.profile,
  backupId: 'snapshot-gemini-001',
  preview: previewPayload.preview,
  risk: {
    allowed: true,
    riskLevel: 'medium',
    reasons: ['Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。'],
    limitations: ['GEMINI_API_KEY 仍需通过环境变量生效。'],
  },
  changedFiles: ['C:/Users/test/.gemini/settings.json'],
  noChanges: false,
}

const noChangesUsePayload: UseCommandOutput = {
  ...usePayload,
  backupId: undefined,
  changedFiles: [],
  noChanges: true,
  preview: {
    ...previewPayload.preview,
    noChanges: true,
  },
}

const rollbackPayload: RollbackCommandOutput = {
  backupId: 'snapshot-gemini-001',
  restoredFiles: ['C:/Users/test/.gemini/settings.json'],
  rollback: {
    ok: true,
    backupId: 'snapshot-gemini-001',
    restoredFiles: ['C:/Users/test/.gemini/settings.json'],
    effectiveConfig: {
      stored: [
        {
          key: 'enforcedAuthType',
          value: 'oauth-personal',
          maskedValue: 'oauth-personal',
          source: 'stored',
          scope: 'user',
          secret: false,
        },
      ],
      effective: [
        {
          key: 'enforcedAuthType',
          value: 'oauth-personal',
          maskedValue: 'oauth-personal',
          source: 'effective',
          scope: 'user',
          secret: false,
        },
        {
          key: 'GEMINI_API_KEY',
          value: '<SECRET>',
          maskedValue: 'gm-l***56',
          source: 'env',
          scope: 'runtime',
          secret: true,
          shadowed: true,
        },
      ],
      overrides: [
        {
          key: 'GEMINI_API_KEY',
          kind: 'env',
          source: 'env',
          message: 'Gemini API key 仍由环境变量决定。',
          shadowed: true,
        },
      ],
      shadowedKeys: ['GEMINI_API_KEY'],
    },
    managedBoundaries: [
      {
        target: 'C:/Users/test/.gemini/settings.json',
        type: 'managed-fields',
        managedKeys: ['enforcedAuthType'],
        preservedKeys: ['ui'],
        notes: ['回滚仅恢复 Gemini settings.json 中的托管字段。'],
      },
    ],
    warnings: [
      {
        code: 'rollback-warning',
        level: 'warning',
        message: '已按快照清单恢复托管文件。',
      },
    ],
    limitations: [
      {
        code: 'rollback-limitation',
        level: 'limitation',
        message: '回滚不会恢复环境变量。',
      },
    ],
  },
  summary: {
    warnings: ['已恢复快照中的托管文件'],
    limitations: ['回滚仅恢复快照覆盖的托管文件。'],
  },
}

const emptyRollbackPayload: RollbackCommandOutput = {
  backupId: 'snapshot-gemini-002',
  restoredFiles: [],
  summary: {
    warnings: [],
    limitations: [],
  },
}

const validatePayload: ValidateCommandOutput = {
  items: [
    {
      profileId: 'gemini-prod',
      platform: 'gemini',
      validation: {
        ok: false,
        errors: [
          {
            code: 'missing-gemini-api-key',
            level: 'error',
            message: '缺少 GEMINI_API_KEY',
            field: 'GEMINI_API_KEY',
          },
        ],
        warnings: [
          {
            code: 'unsupported-base-url',
            level: 'warning',
            message: 'Gemini base URL 当前未确认支持。',
            field: 'GEMINI_BASE_URL',
          },
        ],
        limitations: [
          {
            code: 'gemini-env-limitation',
            level: 'limitation',
            message: 'Gemini API key 仍需通过环境变量生效。',
            field: 'GEMINI_API_KEY',
          },
        ],
        effectiveConfig: {
          stored: [
            {
              key: 'enforcedAuthType',
              value: 'gemini-api-key',
              maskedValue: 'gemini-api-key',
              source: 'stored',
              scope: 'user',
              secret: false,
            },
          ],
          effective: [
            {
              key: 'enforcedAuthType',
              value: 'gemini-api-key',
              maskedValue: 'gemini-api-key',
              source: 'effective',
              scope: 'user',
              secret: false,
            },
            {
              key: 'GEMINI_API_KEY',
              value: '<SECRET>',
              maskedValue: 'gm-l***56',
              source: 'env',
              scope: 'runtime',
              secret: true,
              shadowed: true,
            },
          ],
          overrides: [
            {
              key: 'GEMINI_API_KEY',
              kind: 'env',
              source: 'env',
              message: 'Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。',
              shadowed: true,
            },
          ],
          shadowedKeys: ['GEMINI_API_KEY'],
        },
        managedBoundaries: [
          {
            target: 'C:/Users/test/.gemini/settings.json',
            type: 'managed-fields',
            managedKeys: ['enforcedAuthType'],
            preservedKeys: ['ui'],
            notes: ['Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。'],
          },
        ],
        secretReferences: [
          {
            key: 'GEMINI_API_KEY',
            source: 'env',
            present: true,
            maskedValue: 'gm-l***56',
          },
        ],
      },
    },
  ],
}

const validatePayloadWithIssueLimitations: ValidateCommandOutput = {
  items: [
    {
      profileId: 'claude-prod',
      platform: 'claude',
      validation: {
        ok: true,
        errors: [],
        warnings: [],
        limitations: [
          {
            code: 'scope-aware-limitation',
            level: 'limitation',
            message: '当前按目标作用域写入 Claude 配置文件。',
          },
        ],
      },
    },
  ],
}

const emptyValidatePayload: ValidateCommandOutput = {
  items: [],
}

const exportPayload: ExportCommandOutput = {
  profiles: [
    {
      profile: {
        id: 'claude-prod',
        name: 'Claude 生产',
        platform: 'claude',
        source: {},
        apply: {},
      },
      validation: {
        ok: true,
        errors: [],
        warnings: [],
        limitations: [
          {
            code: 'scope-aware-limitation',
            level: 'limitation',
            message: '当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。',
          },
        ],
        effectiveConfig: {
          stored: [
            {
              key: 'ANTHROPIC_AUTH_TOKEN',
              value: 'sk-old-000',
              maskedValue: 'sk-o***00',
              source: 'stored',
              scope: 'project',
              secret: true,
            },
          ],
          effective: [
            {
              key: 'ANTHROPIC_AUTH_TOKEN',
              value: 'sk-live-123456',
              maskedValue: 'sk-l***56',
              source: 'scope-project',
              scope: 'project',
              secret: true,
            },
          ],
          overrides: [],
          shadowedKeys: [],
        },
        managedBoundaries: [
          {
            target: 'C:/Users/test/.claude/settings.json',
            type: 'scope-aware',
            managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
            preservedKeys: ['theme'],
            notes: ['当前写入目标为 Claude 项目级配置文件。'],
          },
        ],
        secretReferences: [
          {
            key: 'ANTHROPIC_AUTH_TOKEN',
            source: 'inline',
            present: true,
            maskedValue: 'sk-a***z9',
          },
        ],
      },
    },
  ],
}

const emptyExportPayload: ExportCommandOutput = {
  profiles: [],
}

const addPayload: AddCommandOutput = {
  profile: {
    id: 'claude-prod',
    name: 'Claude 生产',
    platform: 'claude',
    source: {},
    apply: {},
  },
  validation: {
    ok: true,
    errors: [],
    warnings: [],
    limitations: [],
  },
  preview: {
    platform: 'claude',
    profileId: 'claude-prod',
    targetFiles: [
      {
        path: 'C:/Users/test/.claude/settings.json',
        format: 'json',
        exists: true,
        managedScope: 'partial-fields',
      },
    ],
    effectiveFields: [],
    storedOnlyFields: [],
    effectiveConfig: {
      stored: [
        {
          key: 'ANTHROPIC_AUTH_TOKEN',
          value: 'sk-old-000',
          maskedValue: 'sk-o***00',
          source: 'stored',
          scope: 'project',
          secret: true,
        },
      ],
      effective: [
        {
          key: 'ANTHROPIC_AUTH_TOKEN',
          value: 'sk-new-123',
          maskedValue: 'sk-n***23',
          source: 'scope-project',
          scope: 'project',
          secret: true,
        },
      ],
      overrides: [],
      shadowedKeys: [],
    },
    managedBoundaries: [
      {
        target: 'C:/Users/test/.claude/settings.json',
        type: 'scope-aware',
        managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
        preservedKeys: ['theme'],
        notes: ['当前写入目标为 Claude 项目级配置文件。'],
      },
    ],
    secretReferences: [
      {
        key: 'ANTHROPIC_AUTH_TOKEN',
        source: 'inline',
        present: true,
        maskedValue: 'sk-n***23',
      },
    ],
    diffSummary: [
      {
        path: 'C:/Users/test/.claude/settings.json',
        changedKeys: ['ANTHROPIC_AUTH_TOKEN'],
        hasChanges: true,
      },
    ],
    warnings: [],
    limitations: [],
    riskLevel: 'low',
    requiresConfirmation: false,
    backupPlanned: true,
    noChanges: false,
  },
  risk: {
    allowed: true,
    riskLevel: 'low',
    reasons: [],
    limitations: [],
  },
}

const addPayloadWithLimitations: AddCommandOutput = {
  ...addPayload,
  validation: {
    ...addPayload.validation,
    limitations: [
      {
        code: 'add-validation-limitation',
        level: 'limitation',
        message: '新增配置不会自动验证所有运行时覆盖源。',
      },
    ],
  },
  preview: {
    ...addPayload.preview,
    limitations: [
      {
        code: 'add-preview-limitation',
        level: 'limitation',
        message: '预览阶段无法确认运行时 CLI 参数覆盖。',
      },
    ],
  },
  risk: {
    allowed: false,
    riskLevel: 'medium',
    reasons: ['建议先执行 preview 或 validate 再确认'],
    limitations: ['新增配置后仍建议执行 preview 校验 effective config。'],
  },
}

const listPayload: ListCommandOutput = {
  profiles: [
    {
      profile: {
        id: 'claude-prod',
        name: 'Claude 生产',
        platform: 'claude',
        source: {},
        apply: {},
      },
      current: true,
      healthStatus: 'valid',
      riskLevel: 'low',
    },
    {
      profile: {
        id: 'gemini-prod',
        name: 'Gemini 生产',
        platform: 'gemini',
        source: {},
        apply: {},
      },
      current: false,
      healthStatus: 'warning',
      riskLevel: 'medium',
    },
  ],
}

const emptyListPayload: ListCommandOutput = {
  profiles: [],
}

const genericSuccessResult: CommandResult<{ foo: string }> = {
  ok: true,
  action: 'other',
  data: { foo: 'bar' },
}

const genericSuccessWithoutData: CommandResult = {
  ok: true,
  action: 'other',
}

const genericFailureResult = createFailureResult('preview', '配置校验失败')
const previewFailureWithDataResult: CommandResult<PreviewCommandOutput> = {
  ok: false,
  action: 'preview',
  data: emptyValidationPreviewPayload,
}
const validateCommandLimitations = ['validate 只校验当前已实现的平台写入契约。']
const validateFailureWithDataResult: CommandResult<ValidateCommandOutput> = {
  ok: false,
  action: 'validate',
  data: validatePayload,
  limitations: validateCommandLimitations,
}

const previewCommandLimitations = ['Gemini 最终认证结果仍受环境变量影响。']
const useCommandLimitations = ['切换完成后请确认运行环境中的 GEMINI_API_KEY。']
const rollbackCommandLimitations = ['回滚仅恢复快照覆盖的托管文件。']
const exportCommandLimitations = ['export 输出中的敏感值均为脱敏结果。']
const addCommandLimitations = ['新增配置后仍建议执行 preview 校验 effective config。']

const outputCurrent = renderText(createCurrentResult(currentPayload))
const outputEmptyCurrent = renderText(createCurrentResult(emptyCurrentPayload))
const outputPreview = renderText(createPreviewResult(previewPayload))
const outputPreviewNoChanges = renderText(createPreviewResult(noChangesPreviewPayload))
const outputPreviewValidationError = renderText(createPreviewResult(emptyValidationPreviewPayload))
const outputPreviewValidationLimitations = renderText(createPreviewResult(validationPreviewPayloadWithLimitations))
const outputUse = renderText(createUseResult(usePayload, ['切换后建议核对环境变量'], useCommandLimitations))
const outputUseNoChanges = renderText(createUseResult(noChangesUsePayload))
const outputRollback = renderText(createRollbackResult(rollbackPayload, ['已恢复快照中的托管文件'], rollbackCommandLimitations))
const outputRollbackEmpty = renderText(createRollbackResult(emptyRollbackPayload))
const outputValidate = renderText(createValidateResult(validatePayload, validateCommandLimitations))
const outputValidateItemLimitations = renderText(createValidateResult(validatePayloadWithIssueLimitations))
const outputEmptyValidate = renderText(createValidateResult(emptyValidatePayload))
const outputExport = renderText(createExportResult(exportPayload, exportCommandLimitations))
const outputEmptyExport = renderText(createExportResult(emptyExportPayload))
const outputAdd = renderText(createAddResult(addPayload, ['建议先执行 preview 或 validate 再确认'], addCommandLimitations))
const outputAddWithLimitations = renderText(createAddResult(addPayloadWithLimitations))
const outputList = renderText(createListResult(listPayload))
const outputEmptyList = renderText(createListResult(emptyListPayload))
const outputGenericSuccess = renderText(genericSuccessResult)
const outputGenericSuccessWithoutData = renderText(genericSuccessWithoutData)
const outputGenericFailure = renderText(genericFailureResult)
const outputPreviewFailureWithData = renderText(previewFailureWithDataResult)
const outputValidateFailureWithData = renderText(validateFailureWithDataResult)

describe('text renderer', () => {
  it('渲染 current 结果时输出 state、最近切换与检测结果', () => {
    expect(outputCurrent).toContain('[current] 成功')
    expect(outputCurrent).toContain('当前 state:')
    expect(outputCurrent).toContain('- claude: claude-prod')
    expect(outputCurrent).toContain('- gemini: gemini-prod')
    expect(outputCurrent).toContain('最近切换: gemini / gemini-prod / success')
    expect(outputCurrent).toContain('检测结果:')
    expect(outputCurrent).toContain('- 平台: gemini')
    expect(outputCurrent).toContain('  托管识别: 是')
    expect(outputCurrent).toContain('  匹配配置: gemini-prod')
    expect(outputCurrent).toContain('  当前作用域: user')
    expect(outputCurrent).toContain('  目标文件: C:/Users/test/.gemini/settings.json')
    expect(outputCurrent).toContain('  生效配置:')
    expect(outputCurrent).toContain('    已写入:')
    expect(outputCurrent).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=stored)')
    expect(outputCurrent).toContain('    最终生效:')
    expect(outputCurrent).toContain('    - GEMINI_API_KEY: gm-***1234 (scope=runtime, source=env, secret, shadowed)')
    expect(outputCurrent).toContain('    覆盖说明:')
    expect(outputCurrent).toContain('    - GEMINI_API_KEY: 最终生效的 API key 取决于环境变量，而不是 settings.json。')
    expect(outputCurrent).toContain('    被覆盖字段: GEMINI_API_KEY')
    expect(outputCurrent).toContain('  托管边界:')
    expect(outputCurrent).toContain('  - 类型: managed-fields / 目标: C:/Users/test/.gemini/settings.json')
    expect(outputCurrent).toContain('    托管字段: enforcedAuthType')
    expect(outputCurrent).toContain('    保留字段: ui.theme')
    expect(outputCurrent).toContain('    说明: Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。')
    expect(outputCurrent).toContain('  敏感字段引用:')
    expect(outputCurrent).toContain('  - GEMINI_API_KEY: gm-***1234 (source=env, present=yes)')
    expect(outputCurrent).toContain('  警告: Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(outputCurrent).toContain('  限制: GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('渲染空 current 结果时提示无已标记配置', () => {
    expect(outputEmptyCurrent).toContain('[current] 成功')
    expect(outputEmptyCurrent).toContain('- 当前无已标记配置')
    expect(outputEmptyCurrent).not.toContain('检测结果:')
  })

  it('渲染 preview 结果时输出校验、风险、文件、提示与限制说明', () => {
    expect(outputPreview).toContain('[preview] 成功')
    expect(outputPreview).toContain('- 配置: gemini-prod (gemini)')
    expect(outputPreview).toContain('  校验结果: 通过')
    expect(outputPreview).toContain('  风险等级: medium')
    expect(outputPreview).toContain('  需要确认: 是')
    expect(outputPreview).toContain('  计划备份: 是')
    expect(outputPreview).toContain('  无变更: 否')
    expect(outputPreview).toContain('  目标文件:')
    expect(outputPreview).toContain('  - C:/Users/test/.gemini/settings.json')
    expect(outputPreview).toContain('  生效配置:')
    expect(outputPreview).toContain('    已写入:')
    expect(outputPreview).toContain('    - enforcedAuthType: oauth-personal (scope=user, source=stored)')
    expect(outputPreview).toContain('    最终生效:')
    expect(outputPreview).toContain('    - GEMINI_API_KEY: gm-l***56 (scope=user, source=effective, secret)')
    expect(outputPreview).toContain('    覆盖说明:')
    expect(outputPreview).toContain('    - GEMINI_API_KEY: 最终生效的 API key 取决于环境变量，而不是 settings.json。')
    expect(outputPreview).toContain('  托管边界:')
    expect(outputPreview).toContain('  - 类型: managed-fields / 目标: C:/Users/test/.gemini/settings.json')
    expect(outputPreview).toContain('    托管字段: enforcedAuthType')
    expect(outputPreview).toContain('    保留字段: ui')
    expect(outputPreview).toContain('    说明: Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。')
    expect(outputPreview).toContain('  敏感字段引用:')
    expect(outputPreview).toContain('  - GEMINI_API_KEY: gm-l***56 (source=inline, present=yes)')
    expect(outputPreview).toContain('  变更摘要:')
    expect(outputPreview).toContain('  - C:/Users/test/.gemini/settings.json: enforcedAuthType')
    expect(outputPreview).toContain('  警告: Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(outputPreview).toContain('  限制: GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(outputPreview).toContain('附加提示:')
    expect(outputPreview).toContain('  - 高风险操作需要确认')
    expect(outputPreview).toContain('限制说明:')
    expect(outputPreview).toContain('  - Gemini 最终认证结果仍受环境变量影响。')
  })

  it('preview 无变化时显示无变化摘要', () => {
    expect(outputPreviewNoChanges).toContain('  无变更: 是')
    expect(outputPreviewNoChanges).toContain('  - C:/Users/test/.gemini/settings.json: 无变化')
  })

  it('preview 校验失败时输出错误与限制信息', () => {
    expect(outputPreviewValidationError).toContain('  校验结果: 失败')
    expect(outputPreviewValidationError).toContain('  错误: 缺少关键字段')
    expect(outputPreviewValidationError).toContain('  限制: 缺少关键字段时不会执行写入。')
  })

  it('preview 会渲染 validation limitations', () => {
    expect(outputPreviewValidationLimitations).toContain('  限制: 当前平台能力存在 env-first 限制。')
  })

  it('渲染 use 结果时输出备份、变更文件、提示与限制说明', () => {
    expect(outputUse).toContain('[use] 成功')
    expect(outputUse).toContain('- 配置: gemini-prod (gemini)')
    expect(outputUse).toContain('  备份ID: snapshot-gemini-001')
    expect(outputUse).toContain('  无变更: 否')
    expect(outputUse).toContain('  风险等级: medium')
    expect(outputUse).toContain('  已变更文件:')
    expect(outputUse).toContain('  - C:/Users/test/.gemini/settings.json')
    expect(outputUse).toContain('  生效配置:')
    expect(outputUse).toContain('    已写入:')
    expect(outputUse).toContain('    - enforcedAuthType: oauth-personal (scope=user, source=stored)')
    expect(outputUse).toContain('    最终生效:')
    expect(outputUse).toContain('    - GEMINI_API_KEY: gm-l***56 (scope=user, source=effective, secret)')
    expect(outputUse).toContain('    覆盖说明:')
    expect(outputUse).toContain('    - GEMINI_API_KEY: 最终生效的 API key 取决于环境变量，而不是 settings.json。')
    expect(outputUse).toContain('  托管边界:')
    expect(outputUse).toContain('    保留字段: ui')
    expect(outputUse).toContain('  敏感字段引用:')
    expect(outputUse).toContain('  - GEMINI_API_KEY: gm-l***56 (source=inline, present=yes)')
    expect(outputUse).toContain('  警告: Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(outputUse).toContain('  限制: GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(outputUse).toContain('附加提示:')
    expect(outputUse).toContain('  - Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(outputUse).toContain('限制说明:')
    expect(outputUse).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('use 无变化时显示未创建备份与无变更文件', () => {
    expect(outputUseNoChanges).toContain('  备份ID: 未创建')
    expect(outputUseNoChanges).toContain('  无变更: 是')
    expect(outputUseNoChanges).toContain('  已变更文件: 无')
  })

  it('渲染 rollback 结果时输出备份、恢复文件与限制说明', () => {
    expect(outputRollback).toContain('[rollback] 成功')
    expect(outputRollback).toContain('- 备份ID: snapshot-gemini-001')
    expect(outputRollback).toContain('  已恢复文件:')
    expect(outputRollback).toContain('  - C:/Users/test/.gemini/settings.json')
    expect(outputRollback).toContain('  生效配置:')
    expect(outputRollback).toContain('    已写入:')
    expect(outputRollback).toContain('    - enforcedAuthType: oauth-personal (scope=user, source=stored)')
    expect(outputRollback).toContain('    最终生效:')
    expect(outputRollback).toContain('    - GEMINI_API_KEY: gm-l***56 (scope=runtime, source=env, secret, shadowed)')
    expect(outputRollback).toContain('    覆盖说明:')
    expect(outputRollback).toContain('    - GEMINI_API_KEY: Gemini API key 仍由环境变量决定。')
    expect(outputRollback).toContain('    被覆盖字段: GEMINI_API_KEY')
    expect(outputRollback).toContain('  托管边界:')
    expect(outputRollback).toContain('  - 类型: managed-fields / 目标: C:/Users/test/.gemini/settings.json')
    expect(outputRollback).toContain('    托管字段: enforcedAuthType')
    expect(outputRollback).toContain('    说明: 回滚仅恢复 Gemini settings.json 中的托管字段。')
    expect(outputRollback).toContain('  回滚警告: 已按快照清单恢复托管文件。')
    expect(outputRollback).toContain('  回滚限制: 回滚不会恢复环境变量。')
    expect(outputRollback).toContain('附加提示:')
    expect(outputRollback).toContain('  - 已恢复快照中的托管文件')
    expect(outputRollback).toContain('限制说明:')
    expect(outputRollback).toContain('  - 回滚仅恢复快照覆盖的托管文件。')
  })

  it('rollback 无恢复文件时输出无', () => {
    expect(outputRollbackEmpty).toContain('- 备份ID: snapshot-gemini-002')
    expect(outputRollbackEmpty).toContain('  已恢复文件: 无')
  })

  it('渲染 validate 结果时输出 explainable 校验细节与平台限制', () => {
    expect(outputValidate).toContain('[validate] 成功')
    expect(outputValidate).toContain('- gemini-prod (gemini)')
    expect(outputValidate).toContain('  校验结果: 失败')
    expect(outputValidate).toContain('  错误: 缺少 GEMINI_API_KEY')
    expect(outputValidate).toContain('  警告: Gemini base URL 当前未确认支持。')
    expect(outputValidate).toContain('  限制: Gemini API key 仍需通过环境变量生效。')
    expect(outputValidate).toContain('  生效配置:')
    expect(outputValidate).toContain('    已写入:')
    expect(outputValidate).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=stored)')
    expect(outputValidate).toContain('    最终生效:')
    expect(outputValidate).toContain('    - GEMINI_API_KEY: gm-l***56 (scope=runtime, source=env, secret, shadowed)')
    expect(outputValidate).toContain('    覆盖说明:')
    expect(outputValidate).toContain('    - GEMINI_API_KEY: Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(outputValidate).toContain('    被覆盖字段: GEMINI_API_KEY')
    expect(outputValidate).toContain('  托管边界:')
    expect(outputValidate).toContain('  - 类型: managed-fields / 目标: C:/Users/test/.gemini/settings.json')
    expect(outputValidate).toContain('    托管字段: enforcedAuthType')
    expect(outputValidate).toContain('    保留字段: ui')
    expect(outputValidate).toContain('    说明: Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。')
    expect(outputValidate).toContain('  敏感字段引用:')
    expect(outputValidate).toContain('  - GEMINI_API_KEY: gm-l***56 (source=env, present=yes)')
    expect(outputValidate).not.toContain('  平台限制:')
    expect(outputValidate).toContain('限制说明:')
    expect(outputValidate).toContain('  - validate 只校验当前已实现的平台写入契约。')
  })

  it('validate 会渲染 validation 自身的 limitations', () => {
    expect(outputValidateItemLimitations).toContain('  限制: 当前按目标作用域写入 Claude 配置文件。')
  })

  it('空 validate 结果返回空正文', () => {
    expect(outputEmptyValidate).toBe('[validate] 成功\n')
  })

  it('渲染 export 结果时输出名称与校验摘要说明', () => {
    expect(outputExport).toContain('[export] 成功')
    expect(outputExport).toContain('- claude-prod (claude)')
    expect(outputExport).toContain('  名称: Claude 生产')
    expect(outputExport).toContain('  校验结果: 通过')
    expect(outputExport).toContain('  限制: 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(outputExport).toContain('  生效配置:')
    expect(outputExport).toContain('    已写入:')
    expect(outputExport).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-o***00 (scope=project, source=stored, secret)')
    expect(outputExport).toContain('    最终生效:')
    expect(outputExport).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-l***56 (scope=project, source=scope-project, secret)')
    expect(outputExport).toContain('  托管边界:')
    expect(outputExport).toContain('  - 类型: scope-aware / 目标: C:/Users/test/.claude/settings.json')
    expect(outputExport).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(outputExport).toContain('    保留字段: theme')
    expect(outputExport).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(outputExport).toContain('  敏感字段引用:')
    expect(outputExport).toContain('  - ANTHROPIC_AUTH_TOKEN: sk-a***z9 (source=inline, present=yes)')
    expect(outputExport).toContain('限制说明:')
    expect(outputExport).toContain('  - export 输出中的敏感值均为脱敏结果。')
  })

  it('空 export 结果返回空正文', () => {
    expect(outputEmptyExport).toBe('[export] 成功\n')
  })

  it('渲染 add 结果时输出配置、摘要、提示与限制说明', () => {
    expect(outputAdd).toContain('[add] 成功')
    expect(outputAdd).toContain('- 配置: claude-prod (claude)')
    expect(outputAdd).toContain('  名称: Claude 生产')
    expect(outputAdd).toContain('  校验结果: 通过')
    expect(outputAdd).toContain('  风险等级: low')
    expect(outputAdd).toContain('  需要确认: 否')
    expect(outputAdd).toContain('  计划备份: 是')
    expect(outputAdd).toContain('  无变更: 否')
    expect(outputAdd).toContain('  目标文件:')
    expect(outputAdd).toContain('  - C:/Users/test/.claude/settings.json')
    expect(outputAdd).toContain('  生效配置:')
    expect(outputAdd).toContain('    已写入:')
    expect(outputAdd).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-o***00 (scope=project, source=stored, secret)')
    expect(outputAdd).toContain('    最终生效:')
    expect(outputAdd).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-n***23 (scope=project, source=scope-project, secret)')
    expect(outputAdd).toContain('  托管边界:')
    expect(outputAdd).toContain('  - 类型: scope-aware / 目标: C:/Users/test/.claude/settings.json')
    expect(outputAdd).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(outputAdd).toContain('    保留字段: theme')
    expect(outputAdd).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(outputAdd).toContain('  敏感字段引用:')
    expect(outputAdd).toContain('  - ANTHROPIC_AUTH_TOKEN: sk-n***23 (source=inline, present=yes)')
    expect(outputAdd).toContain('  变更摘要:')
    expect(outputAdd).toContain('  - C:/Users/test/.claude/settings.json: ANTHROPIC_AUTH_TOKEN')
    expect(outputAdd).toContain('附加提示:')
    expect(outputAdd).toContain('  - 建议先执行 preview 或 validate 再确认')
    expect(outputAdd).toContain('限制说明:')
    expect(outputAdd).toContain('  - 新增配置后仍建议执行 preview 校验 effective config。')
  })

  it('add 会渲染 validation 与 preview 的 limitations', () => {
    expect(outputAddWithLimitations).toContain('  限制: 新增配置不会自动验证所有运行时覆盖源。')
    expect(outputAddWithLimitations).toContain('  预览限制: 预览阶段无法确认运行时 CLI 参数覆盖。')
    expect(outputAddWithLimitations).toContain('附加提示:')
    expect(outputAddWithLimitations).toContain('  - 建议先执行 preview 或 validate 再确认')
    expect(outputAddWithLimitations).toContain('限制说明:')
    expect(outputAddWithLimitations).toContain('  - 新增配置后仍建议执行 preview 校验 effective config。')
  })

  it('渲染 list 结果时输出配置列表与状态摘要', () => {
    expect(outputList).toContain('[list] 成功')
    expect(outputList).toContain('- claude-prod (claude)')
    expect(outputList).toContain('  名称: Claude 生产')
    expect(outputList).toContain('  当前生效: 是')
    expect(outputList).toContain('  健康状态: valid')
    expect(outputList).toContain('  风险等级: low')
    expect(outputList).toContain('- gemini-prod (gemini)')
    expect(outputList).toContain('  名称: Gemini 生产')
    expect(outputList).toContain('  当前生效: 否')
    expect(outputList).toContain('  健康状态: warning')
    expect(outputList).toContain('  风险等级: medium')
  })

  it('空 list 结果返回空正文', () => {
    expect(outputEmptyList).toBe('[list] 成功\n')
  })

  it('未知成功结果回退为 JSON 文本', () => {
    expect(outputGenericSuccess).toContain('[other] 成功')
    expect(outputGenericSuccess).toContain('"foo": "bar"')
  })

  it('无 data 的未知成功结果返回默认文案', () => {
    expect(outputGenericSuccessWithoutData).toBe('[other] 成功\n执行成功')
  })

  it('失败结果输出错误信息', () => {
    expect(outputGenericFailure).toBe('[preview] 失败\n配置校验失败')
  })

  it('preview 在失败但携带数据时仍渲染摘要', () => {
    expect(outputPreviewFailureWithData).toContain('[preview] 失败')
    expect(outputPreviewFailureWithData).toContain('  校验结果: 失败')
    expect(outputPreviewFailureWithData).toContain('  错误: 缺少关键字段')
    expect(outputPreviewFailureWithData).toContain('  限制: 缺少关键字段时不会执行写入。')
  })

  it('validate 在失败但携带数据时仍渲染校验详情', () => {
    expect(outputValidateFailureWithData).toContain('[validate] 失败')
    expect(outputValidateFailureWithData).toContain('  校验结果: 失败')
    expect(outputValidateFailureWithData).toContain('  错误: 缺少 GEMINI_API_KEY')
    expect(outputValidateFailureWithData).toContain('限制说明:')
    expect(outputValidateFailureWithData).toContain('  - validate 只校验当前已实现的平台写入契约。')
  })
})
