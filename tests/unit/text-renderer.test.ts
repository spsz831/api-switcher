import { describe, expect, it } from 'vitest'
import { renderText } from '../../src/renderers/text-renderer'
import type {
  AddCommandOutput,
  CommandResult,
  CurrentCommandOutput,
  ExportCommandOutput,
  ImportApplyCommandOutput,
  ImportPreviewCommandOutput,
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
): CommandResult<PreviewCommandOutput> {
  return {
    ok: true,
    action: 'preview',
    data,
  }
}

function createUseResult(data: UseCommandOutput): CommandResult<UseCommandOutput> {
  return {
    ok: true,
    action: 'use',
    data,
  }
}

function createRollbackResult(
  data: RollbackCommandOutput,
): CommandResult<RollbackCommandOutput> {
  return {
    ok: true,
    action: 'rollback',
    data,
  }
}

function createValidateResult(data: ValidateCommandOutput): CommandResult<ValidateCommandOutput> {
  return {
    ok: true,
    action: 'validate',
    data,
  }
}

function createExportResult(data: ExportCommandOutput): CommandResult<ExportCommandOutput> {
  return {
    ok: true,
    action: 'export',
    data,
  }
}

function createImportPreviewResult(data: ImportPreviewCommandOutput): CommandResult<ImportPreviewCommandOutput> {
  return {
    ok: true,
    action: 'import',
    data,
  }
}

function createImportApplyResult(data: ImportApplyCommandOutput): CommandResult<ImportApplyCommandOutput> {
  return {
    ok: true,
    action: 'import-apply',
    data,
  }
}

function createAddResult(data: AddCommandOutput): CommandResult<AddCommandOutput> {
  return {
    ok: true,
    action: 'add',
    data,
  }
}

function createListResult(data: ListCommandOutput): CommandResult<ListCommandOutput> {
  return {
    ok: true,
    action: 'list',
    data,
  }
}

function createFailureResult(action: string, message: string, warnings?: string[], limitations?: string[]): CommandResult {
  return {
    ok: false,
    action,
    warnings,
    limitations,
    error: {
      code: 'FAILED',
      message,
    },
  }
}

function expectOrderedSections(output: string, sections: string[]): void {
  let previousIndex = -1

  for (const section of sections) {
    const index = output.indexOf(section)
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeGreaterThan(previousIndex)
    previousIndex = index
  }
}

const geminiScopeCapabilities = [
  {
    scope: 'system-defaults',
    detect: true,
    preview: true,
    use: false,
    rollback: false,
    writable: false,
    risk: 'normal' as const,
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
    risk: 'normal' as const,
    confirmationRequired: false,
  },
  {
    scope: 'project',
    detect: true,
    preview: true,
    use: true,
    rollback: true,
    writable: true,
    risk: 'high' as const,
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
    risk: 'normal' as const,
    confirmationRequired: false,
    note: '只参与 Gemini effective config 检测与 precedence 推导，不允许写入或回滚。',
  },
]

const geminiScopeAvailability = [
  {
    scope: 'user',
    status: 'available' as const,
    detected: true,
    writable: true,
    path: 'C:/Users/test/.gemini/settings.json',
  },
  {
    scope: 'project',
    status: 'unresolved' as const,
    detected: false,
    writable: false,
    reasonCode: 'PROJECT_ROOT_UNRESOLVED',
    reason: 'Gemini project scope 不可用：无法解析 project root。',
    remediation: '设置有效的 Gemini project root 后再重试。',
  },
]

const claudeScopeCapabilities = [
  {
    scope: 'user',
    detect: true,
    preview: true,
    use: true,
    rollback: true,
    writable: true,
    risk: 'normal' as const,
  },
  {
    scope: 'project',
    detect: true,
    preview: true,
    use: true,
    rollback: true,
    writable: true,
    risk: 'normal' as const,
  },
  {
    scope: 'local',
    detect: true,
    preview: true,
    use: true,
    rollback: true,
    writable: true,
    risk: 'normal' as const,
  },
]

const currentPayload: CurrentCommandOutput = {
  current: {
    claude: 'claude-prod',
    codex: 'codex-prod',
    gemini: 'gemini-prod',
  },
  lastSwitch: {
    platform: 'gemini',
    profileId: 'gemini-prod',
    backupId: 'backup-001',
    time: '2026-04-04T22:00:00.000Z',
    status: 'success',
  },
  summary: {
    referenceStats: {
      profileCount: 3,
      referenceProfileCount: 1,
      resolvedReferenceProfileCount: 0,
      missingReferenceProfileCount: 0,
      unsupportedReferenceProfileCount: 1,
      inlineProfileCount: 2,
      writeUnsupportedProfileCount: 1,
      hasReferenceProfiles: true,
      hasResolvedReferenceProfiles: false,
      hasMissingReferenceProfiles: false,
      hasUnsupportedReferenceProfiles: true,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: true,
    },
    executabilityStats: {
      profileCount: 3,
      inlineReadyProfileCount: 2,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 1,
      writeUnsupportedProfileCount: 1,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: true,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: true,
      hasWriteUnsupportedProfiles: true,
      hasSourceRedactedProfiles: false,
    },
    platformStats: [
      {
        platform: 'gemini',
        profileCount: 1,
        currentProfileId: 'gemini-prod',
        detectedProfileId: 'gemini-prod',
        managed: true,
        currentScope: 'user',
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          currentScope: 'user',
          facts: [
            { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'current 汇总 Gemini precedence 摘要。' },
          ],
        },
      },
      {
        platform: 'claude',
        profileCount: 1,
        currentProfileId: 'claude-prod',
        detectedProfileId: 'claude-prod',
        managed: true,
        currentScope: 'local',
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['user', 'project', 'local'],
          currentScope: 'local',
          facts: [
            { code: 'CLAUDE_SCOPE_PRECEDENCE', message: 'current 汇总 Claude precedence 摘要。' },
          ],
        },
      },
      {
        platform: 'codex',
        profileCount: 1,
        currentProfileId: 'codex-prod',
        detectedProfileId: 'codex-prod',
        managed: true,
        platformSummary: {
          kind: 'multi-file-composition',
          composedFiles: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
          facts: [
            { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'current 汇总 Codex 双文件摘要。' },
          ],
        },
      },
    ],
    warnings: ['Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。'],
    limitations: ['GEMINI_API_KEY 仍需通过环境变量生效。'],
  },
  detections: [
    {
      platform: 'gemini',
      managed: true,
      matchedProfileId: 'gemini-prod',
      referenceSummary: {
        hasReferenceFields: false,
        hasInlineSecrets: true,
        writeUnsupported: false,
        resolvedReferenceCount: 0,
        missingReferenceCount: 0,
        unsupportedReferenceCount: 0,
        missingValueCount: 0,
      },
      targetFiles: [
        {
          path: 'C:/Users/test/.gemini/settings.json',
          format: 'json',
          exists: true,
          managedScope: 'partial-fields',
        },
      ],
      currentScope: 'user',
      platformSummary: {
        kind: 'scope-precedence',
        precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
        currentScope: 'user',
        facts: [
          { code: 'GEMINI_SCOPE_PRECEDENCE', message: '自定义 current Gemini precedence 摘要。' },
          { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: '自定义 current Gemini project 覆盖提示。' },
        ],
      },
      scopeCapabilities: geminiScopeCapabilities,
      scopeAvailability: geminiScopeAvailability,
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
    {
      platform: 'claude',
      managed: true,
      matchedProfileId: 'claude-prod',
      referenceSummary: {
        hasReferenceFields: false,
        hasInlineSecrets: true,
        writeUnsupported: false,
        resolvedReferenceCount: 0,
        missingReferenceCount: 0,
        unsupportedReferenceCount: 0,
        missingValueCount: 0,
      },
      targetFiles: [
        {
          path: 'C:/Users/test/.claude/settings.json',
          format: 'json',
          exists: true,
          managedScope: 'partial-fields',
          scope: 'project',
        },
        {
          path: 'C:/Users/test/.claude/settings.local.json',
          format: 'json',
          exists: true,
          managedScope: 'partial-fields',
          scope: 'local',
        },
      ],
      currentScope: 'local',
      platformSummary: {
        kind: 'scope-precedence',
        precedence: ['user', 'project', 'local'],
        currentScope: 'local',
        facts: [
          { code: 'CLAUDE_SCOPE_PRECEDENCE', message: '自定义 current Claude precedence 摘要。' },
          { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '自定义 current Claude local 覆盖提示。' },
        ],
      },
      scopeCapabilities: claudeScopeCapabilities,
      scopeAvailability: [
        {
          scope: 'user',
          status: 'available',
          detected: true,
          writable: true,
          path: 'C:/Users/test/.claude/settings.json',
        },
        {
          scope: 'project',
          status: 'available',
          detected: true,
          writable: true,
          path: 'E:/repo/.claude/settings.json',
        },
        {
          scope: 'local',
          status: 'available',
          detected: true,
          writable: true,
          path: 'C:/Users/test/.claude/settings.local.json',
        },
      ],
      effectiveConfig: {
        stored: [
          {
            key: 'ANTHROPIC_AUTH_TOKEN',
            value: 'sk-local-123',
            maskedValue: 'sk-l***23',
            source: 'stored',
            scope: 'local',
            secret: true,
          },
        ],
        effective: [
          {
            key: 'ANTHROPIC_AUTH_TOKEN',
            value: 'sk-local-123',
            maskedValue: 'sk-l***23',
            source: 'scope-local',
            scope: 'local',
            secret: true,
          },
        ],
        overrides: [],
        shadowedKeys: [],
      },
      managedBoundaries: [
        {
          target: 'C:/Users/test/.claude/settings.local.json',
          type: 'scope-aware',
          managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
          notes: ['当前生效来源为 Claude local scope。'],
        },
      ],
    },
    {
      platform: 'codex',
      managed: true,
      matchedProfileId: 'codex-prod',
      referenceSummary: {
        hasReferenceFields: true,
        hasInlineSecrets: false,
        writeUnsupported: true,
        resolvedReferenceCount: 0,
        missingReferenceCount: 0,
        unsupportedReferenceCount: 1,
        missingValueCount: 0,
        referenceDetails: [
          {
            code: 'REFERENCE_SCHEME_UNSUPPORTED',
            field: 'apply.auth_reference',
            status: 'unsupported-scheme',
            reference: 'vault://codex/prod',
            scheme: 'vault',
            message: 'profile.apply.auth_reference 使用的引用 scheme 当前不受支持。',
          },
        ],
      },
      targetFiles: [
        {
          path: 'C:/Users/test/.codex/config.toml',
          format: 'toml',
          exists: true,
          managedScope: 'multi-file',
          role: 'config',
          managedKeys: ['base_url'],
        },
        {
          path: 'C:/Users/test/.codex/auth.json',
          format: 'json',
          exists: true,
          managedScope: 'multi-file',
          role: 'auth',
          managedKeys: ['OPENAI_API_KEY'],
        },
      ],
      platformSummary: {
        kind: 'multi-file-composition',
        composedFiles: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
        facts: [
          { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: '自定义 current Codex 双文件摘要。' },
          { code: 'CODEX_CURRENT_REQUIRES_BOTH_FILES', message: '自定义 current Codex 双文件缺一不可提示。' },
        ],
      },
      effectiveConfig: {
        stored: [
          {
            key: 'base_url',
            value: 'https://api.openai.com/v1',
            maskedValue: 'https://api.openai.com/v1',
            source: 'stored',
            secret: false,
          },
        ],
        effective: [
          {
            key: 'base_url',
            value: 'https://api.openai.com/v1',
            maskedValue: 'https://api.openai.com/v1',
            source: 'stored',
            secret: false,
          },
          {
            key: 'OPENAI_API_KEY',
            value: '<SECRET>',
            maskedValue: 'sk-o***99',
            source: 'stored',
            secret: true,
          },
        ],
        overrides: [],
        shadowedKeys: [],
      },
      managedBoundaries: [
        {
          target: 'C:/Users/test/.codex/config.toml',
          type: 'managed-fields',
          managedKeys: ['base_url'],
        },
        {
          target: 'C:/Users/test/.codex/auth.json',
          type: 'managed-fields',
          managedKeys: ['OPENAI_API_KEY'],
        },
        {
          type: 'multi-file-transaction',
          managedKeys: [],
          notes: ['Codex current 检测需要同时结合 config.toml 与 auth.json。'],
        },
      ],
      secretReferences: [
        {
          key: 'OPENAI_API_KEY',
          source: 'inline',
          present: true,
          maskedValue: 'sk-o***99',
        },
      ],
    },
  ],
}

const emptyCurrentPayload: CurrentCommandOutput = {
  current: {},
  summary: {
    warnings: [],
    limitations: [],
  },
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
  summary: {
    platformStats: [
      {
        platform: 'gemini',
        profileCount: 1,
        profileId: 'gemini-prod',
        targetScope: 'user',
        warningCount: 1,
        limitationCount: 1,
        changedFileCount: 1,
        backupCreated: true,
        noChanges: false,
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          currentScope: 'user',
          facts: [
            { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'preview 汇总 Gemini precedence 摘要。' },
          ],
        },
      },
    ],
    referenceStats: {
      profileCount: 1,
      referenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      resolvedReferenceProfileCount: 0,
      missingReferenceProfileCount: 0,
      unsupportedReferenceProfileCount: 0,
      hasReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
      hasResolvedReferenceProfiles: false,
      hasMissingReferenceProfiles: false,
      hasUnsupportedReferenceProfiles: false,
    },
    executabilityStats: {
      profileCount: 1,
      inlineReadyProfileCount: 1,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: true,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: false,
      hasSourceRedactedProfiles: false,
    },
    warnings: ['高风险操作需要确认'],
    limitations: ['Gemini 最终认证结果仍受环境变量影响。'],
  },
  scopeCapabilities: geminiScopeCapabilities,
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

const experimentalPreviewPayload: PreviewCommandOutput = {
  ...previewPayload,
  profile: {
    ...previewPayload.profile,
    id: 'gemini-proxy',
    name: 'Gemini 代理',
  },
  preview: {
    ...previewPayload.preview,
    profileId: 'gemini-proxy',
    effectiveFields: [
      {
        key: 'enforcedAuthType',
        value: 'gemini-api-key',
        maskedValue: 'gemini-api-key',
        source: 'profile',
        scope: 'user',
        secret: false,
      },
      {
        key: 'GEMINI_API_KEY',
        value: 'gm-live-654321',
        maskedValue: 'gm-l***21',
        source: 'env',
        scope: 'runtime',
        secret: true,
      },
      {
        key: 'GEMINI_BASE_URL',
        value: 'https://proxy.example.com',
        maskedValue: 'https://proxy.example.com',
        source: 'managed-policy',
        scope: 'runtime',
        secret: false,
      },
    ],
    warnings: [
      ...previewPayload.preview.warnings,
      {
        code: 'experimental-gemini-base-url',
        level: 'warning',
        message: 'Gemini 自定义 base URL 属于实验性支持，默认不按稳定托管字段写入。',
        field: 'GEMINI_BASE_URL',
        source: 'managed-policy',
      },
    ],
  },
  summary: {
    warnings: ['高风险操作需要确认', 'Gemini 自定义 base URL 属于实验性支持，默认不按稳定托管字段写入。'],
    limitations: ['Gemini 最终认证结果仍受环境变量影响。'],
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
  platformSummary: {
    kind: 'scope-precedence',
    precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
    currentScope: 'user',
    facts: [
      { code: 'GEMINI_SCOPE_PRECEDENCE', message: '自定义 use Gemini precedence 摘要。' },
      { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: '自定义 use Gemini project 覆盖提示。' },
    ],
  },
  preview: previewPayload.preview,
  risk: {
    allowed: true,
    riskLevel: 'medium',
    reasons: ['Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。'],
    limitations: ['GEMINI_API_KEY 仍需通过环境变量生效。'],
  },
  summary: {
    platformStats: [
      {
        platform: 'gemini',
        profileCount: 1,
        profileId: 'gemini-prod',
        targetScope: 'user',
        warningCount: 1,
        limitationCount: 1,
        changedFileCount: 1,
        backupCreated: true,
        noChanges: false,
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          currentScope: 'user',
          facts: [
            { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'use 汇总 Gemini precedence 摘要。' },
          ],
        },
      },
    ],
    referenceStats: {
      profileCount: 1,
      referenceProfileCount: 0,
      resolvedReferenceProfileCount: 0,
      missingReferenceProfileCount: 0,
      unsupportedReferenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      hasReferenceProfiles: false,
      hasResolvedReferenceProfiles: false,
      hasMissingReferenceProfiles: false,
      hasUnsupportedReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
    },
    executabilityStats: {
      profileCount: 1,
      inlineReadyProfileCount: 1,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: true,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: false,
      hasSourceRedactedProfiles: false,
    },
    warnings: ['Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。'],
    limitations: ['GEMINI_API_KEY 仍需通过环境变量生效。'],
  },
  changedFiles: ['C:/Users/test/.gemini/settings.json'],
  noChanges: false,
  scopeCapabilities: geminiScopeCapabilities,
  scopeAvailability: geminiScopeAvailability,
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

const geminiProjectUsePayload: UseCommandOutput = {
  ...usePayload,
  backupId: 'snapshot-gemini-project-001',
  platformSummary: {
    kind: 'scope-precedence',
    precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
    currentScope: 'project',
    facts: [
      { code: 'GEMINI_SCOPE_PRECEDENCE', message: '自定义 use Gemini project 摘要。' },
      { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: '自定义 use Gemini project 回滚提示。' },
    ],
  },
  preview: {
    ...usePayload.preview,
    targetFiles: [
      {
        path: 'E:/repo/.gemini/settings.json',
        format: 'json',
        exists: true,
        managedScope: 'partial-fields',
        scope: 'project',
      },
    ],
    effectiveConfig: {
      stored: [
        {
          key: 'enforcedAuthType',
          value: 'oauth-personal',
          maskedValue: 'oauth-personal',
          source: 'stored',
          scope: 'project',
          secret: false,
        },
      ],
      effective: [
        {
          key: 'enforcedAuthType',
          value: 'gemini-api-key',
          maskedValue: 'gemini-api-key',
          source: 'effective',
          scope: 'project',
          secret: false,
        },
        {
          key: 'GEMINI_API_KEY',
          value: 'gm-live-123456',
          maskedValue: 'gm-l***56',
          source: 'effective',
          scope: 'project',
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
        target: 'E:/repo/.gemini/settings.json',
        type: 'managed-fields',
        managedKeys: ['enforcedAuthType'],
        preservedKeys: ['ui'],
        notes: ['当前写入目标为 Gemini project 级配置文件。'],
      },
    ],
    diffSummary: [
      {
        path: 'E:/repo/.gemini/settings.json',
        changedKeys: ['enforcedAuthType'],
        hasChanges: true,
      },
    ],
  },
  summary: {
    warnings: ['Gemini project scope 会覆盖 user 同名字段。'],
    limitations: ['project scope 快照只能按同一 scope 回滚。'],
  },
  changedFiles: ['E:/repo/.gemini/settings.json'],
}

const rollbackPayload: RollbackCommandOutput = {
  backupId: 'snapshot-gemini-001',
  restoredFiles: ['C:/Users/test/.gemini/settings.json'],
  platformSummary: {
    kind: 'scope-precedence',
    precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
    currentScope: 'project',
    facts: [
      { code: 'GEMINI_SCOPE_PRECEDENCE', message: '自定义 rollback Gemini project 摘要。' },
      { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: '自定义 rollback Gemini scope 匹配提示。' },
    ],
  },
  scopePolicy: {
    requestedScope: 'project',
    resolvedScope: 'project',
    defaultScope: 'user',
    explicitScope: true,
    highRisk: true,
    riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
    rollbackScopeMatchRequired: true,
  },
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
    referenceStats: {
      profileCount: 1,
      referenceProfileCount: 0,
      resolvedReferenceProfileCount: 0,
      missingReferenceProfileCount: 0,
      unsupportedReferenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      hasReferenceProfiles: false,
      hasResolvedReferenceProfiles: false,
      hasMissingReferenceProfiles: false,
      hasUnsupportedReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
    },
    executabilityStats: {
      profileCount: 1,
      inlineReadyProfileCount: 1,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: true,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: false,
      hasSourceRedactedProfiles: false,
    },
    platformStats: [
      {
        platform: 'gemini',
        profileCount: 1,
        targetScope: 'project',
        warningCount: 1,
        limitationCount: 1,
        restoredFileCount: 1,
        noChanges: false,
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          currentScope: 'project',
          facts: [
            { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'rollback 汇总 Gemini precedence 摘要。' },
          ],
        },
      },
    ],
    warnings: ['已恢复快照中的托管文件'],
    limitations: ['回滚仅恢复快照覆盖的托管文件。'],
  },
  scopeCapabilities: geminiScopeCapabilities,
  scopeAvailability: geminiScopeAvailability,
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
      referenceSummary: {
        hasReferenceFields: false,
        hasInlineSecrets: true,
        writeUnsupported: false,
        resolvedReferenceCount: 0,
        missingReferenceCount: 0,
        unsupportedReferenceCount: 0,
        missingValueCount: 0,
      },
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
      scopeCapabilities: geminiScopeCapabilities,
    },
  ],
  summary: {
    referenceStats: {
      profileCount: 1,
      referenceProfileCount: 0,
      resolvedReferenceProfileCount: 0,
      missingReferenceProfileCount: 0,
      unsupportedReferenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      hasReferenceProfiles: false,
      hasResolvedReferenceProfiles: false,
      hasMissingReferenceProfiles: false,
      hasUnsupportedReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
    },
    executabilityStats: {
      profileCount: 1,
      inlineReadyProfileCount: 1,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: true,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: false,
      hasSourceRedactedProfiles: false,
    },
    platformStats: [
      {
        platform: 'gemini',
        profileCount: 1,
        okCount: 0,
        warningCount: 1,
        limitationCount: 1,
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          currentScope: 'user',
          facts: [
            { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'validate 汇总 Gemini precedence 摘要。' },
          ],
        },
      },
    ],
    warnings: ['Gemini base URL 当前未确认支持。', 'Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。'],
    limitations: ['Gemini API key 仍需通过环境变量生效。'],
  },
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
      scopeCapabilities: claudeScopeCapabilities,
    },
  ],
  summary: {
    warnings: [],
    limitations: ['当前按目标作用域写入 Claude 配置文件。'],
  },
}

const importPreviewPayload: ImportPreviewCommandOutput = {
  sourceFile: 'E:/tmp/export.json',
  sourceCompatibility: {
    mode: 'schema-version-missing',
    warnings: ['导入文件未声明 schemaVersion，当前按兼容模式解析。'],
  },
  items: [
    {
      profile: {
        id: 'gemini-prod',
        name: 'Gemini 生产',
        platform: 'gemini',
        source: {},
        apply: {},
      },
      platform: 'gemini',
      platformSummary: {
        kind: 'scope-precedence',
        precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
        facts: [
          { code: 'GEMINI_SCOPE_PRECEDENCE', message: '自定义 Gemini precedence 摘要。' },
          { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: '自定义 Gemini project 覆盖 user 提示。' },
        ],
      },
      exportedObservation: {
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: geminiScopeCapabilities,
        scopeAvailability: [
          {
            scope: 'project',
            status: 'available',
            detected: true,
            writable: true,
            path: 'E:/exported/.gemini/settings.json',
          },
        ],
      },
      localObservation: {
        defaultWriteScope: 'user',
        scopeCapabilities: geminiScopeCapabilities,
        scopeAvailability: geminiScopeAvailability,
      },
      fidelity: {
        status: 'mismatch',
        mismatches: [
          {
            field: 'scopeAvailability',
            driftKind: 'availability-drift',
            severity: 'blocking',
            scope: 'project',
            exportedValue: { status: 'available', detected: true, writable: true },
            localValue: { status: 'unresolved', detected: false, writable: false },
            message: 'project 作用域的可用性与当前本地环境不一致。',
            recommendedAction: '先修复本地 project scope 解析，再重新执行 import preview。',
          },
        ],
        driftSummary: {
          blocking: 1,
          warning: 0,
          info: 0,
        },
        groupedMismatches: [
          {
            driftKind: 'default-scope-drift',
            totalCount: 0,
            blockingCount: 0,
            warningCount: 0,
            infoCount: 0,
            mismatches: [],
          },
          {
            driftKind: 'availability-drift',
            totalCount: 1,
            blockingCount: 1,
            warningCount: 0,
            infoCount: 0,
            mismatches: [
              {
                field: 'scopeAvailability',
                driftKind: 'availability-drift',
                severity: 'blocking',
                scope: 'project',
                exportedValue: { status: 'available', detected: true, writable: true },
                localValue: { status: 'unresolved', detected: false, writable: false },
                message: 'project 作用域的可用性与当前本地环境不一致。',
                recommendedAction: '先修复本地 project scope 解析，再重新执行 import preview。',
              },
            ],
          },
          {
            driftKind: 'capability-drift',
            totalCount: 0,
            blockingCount: 0,
            warningCount: 0,
            infoCount: 0,
            mismatches: [],
          },
        ],
        highlights: ['当前本地 scope availability 与导出观察不一致，应以本地实时环境为准。'],
      },
      previewDecision: {
        canProceedToApplyDesign: false,
        recommendedScope: 'user',
        requiresLocalResolution: true,
        reasonCodes: ['BLOCKED_BY_FIDELITY_MISMATCH', 'REQUIRES_LOCAL_SCOPE_RESOLUTION'],
        reasons: [
          {
            code: 'BLOCKED_BY_FIDELITY_MISMATCH',
            blocking: true,
            message: '导出观察与当前本地观察存在关键漂移，当前不应继续进入 apply 设计。',
          },
          {
            code: 'REQUIRES_LOCAL_SCOPE_RESOLUTION',
            blocking: true,
            message: '当前本地 scope 解析未完成，需先修复本地解析结果。',
          },
        ],
      },
    },
  ],
  summary: {
    totalItems: 1,
    matchCount: 0,
    mismatchCount: 1,
    partialCount: 0,
    insufficientDataCount: 0,
    sourceExecutability: {
      totalItems: 1,
      applyReadyCount: 1,
      previewOnlyCount: 0,
      blockedCount: 0,
      blockedByCodeStats: [
        { code: 'REDACTED_INLINE_SECRET', totalCount: 0 },
      ],
    },
    executabilityStats: {
      profileCount: 1,
      inlineReadyProfileCount: 0,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: false,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: false,
      hasSourceRedactedProfiles: false,
    },
    platformStats: [
      {
        platform: 'gemini',
        totalItems: 1,
        matchCount: 0,
        mismatchCount: 1,
        partialCount: 0,
        insufficientDataCount: 0,
      },
    ],
    decisionCodeStats: [
      { code: 'READY_USING_LOCAL_OBSERVATION', totalCount: 0, blockingCount: 0, nonBlockingCount: 0 },
      { code: 'LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION', totalCount: 0, blockingCount: 0, nonBlockingCount: 0 },
      { code: 'BLOCKED_BY_INSUFFICIENT_OBSERVATION', totalCount: 0, blockingCount: 0, nonBlockingCount: 0 },
      { code: 'BLOCKED_BY_FIDELITY_MISMATCH', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
      { code: 'REQUIRES_LOCAL_SCOPE_RESOLUTION', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
    ],
    driftKindStats: [
      { driftKind: 'default-scope-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
      { driftKind: 'availability-drift', totalCount: 1, blockingCount: 1, warningCount: 0, infoCount: 0 },
      { driftKind: 'capability-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
    ],
    warnings: ['project 作用域的可用性与当前本地环境不一致。'],
    limitations: ['导出文件的 scope observation 不完整，当前仅能做部分 fidelity 对比。'],
  },
}

const emptyValidatePayload: ValidateCommandOutput = {
  items: [],
  summary: {
    warnings: [],
    limitations: [],
  },
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
      defaultWriteScope: 'user',
      referenceSummary: {
        hasReferenceFields: false,
        hasInlineSecrets: true,
        writeUnsupported: false,
        resolvedReferenceCount: 0,
        missingReferenceCount: 0,
        unsupportedReferenceCount: 0,
        missingValueCount: 0,
      },
      secretExportSummary: {
        hasInlineSecrets: true,
        hasRedactedInlineSecrets: true,
        hasReferenceSecrets: false,
        redactedFieldCount: 2,
        preservedReferenceCount: 0,
        details: [
          {
            field: 'source.token',
            kind: 'inline-secret-redacted',
          },
          {
            field: 'apply.ANTHROPIC_AUTH_TOKEN',
            kind: 'inline-secret-redacted',
          },
        ],
      },
      validation: {
        ok: true,
        errors: [],
        warnings: [
          {
            code: 'scope-warning',
            level: 'warning',
            message: 'Claude 当前项目级配置会覆盖用户级同名字段。',
          },
        ],
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
      scopeCapabilities: claudeScopeCapabilities,
    },
  ],
  summary: {
    referenceStats: {
      profileCount: 1,
      referenceProfileCount: 0,
      resolvedReferenceProfileCount: 0,
      missingReferenceProfileCount: 0,
      unsupportedReferenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      hasReferenceProfiles: false,
      hasResolvedReferenceProfiles: false,
      hasMissingReferenceProfiles: false,
      hasUnsupportedReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
    },
    executabilityStats: {
      profileCount: 1,
      inlineReadyProfileCount: 1,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: true,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: false,
      hasSourceRedactedProfiles: false,
    },
    platformStats: [
      {
        platform: 'claude',
        profileCount: 1,
        okCount: 1,
        warningCount: 1,
        limitationCount: 1,
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['user', 'project', 'local'],
          currentScope: 'project',
          facts: [
            { code: 'CLAUDE_SCOPE_PRECEDENCE', message: 'export 汇总 Claude precedence 摘要。' },
          ],
        },
      },
    ],
    secretExportPolicy: {
      mode: 'redacted-by-default',
      inlineSecretsExported: 0,
      inlineSecretsRedacted: 2,
      referenceSecretsPreserved: 0,
      profilesWithRedactedSecrets: 1,
    },
    warnings: ['Claude 当前项目级配置会覆盖用户级同名字段。'],
    limitations: ['当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。'],
  },
}

const emptyExportPayload: ExportCommandOutput = {
  profiles: [],
  summary: {
    warnings: [],
    limitations: [],
  },
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
  summary: {
    platformStats: [
      {
        platform: 'claude',
        profileCount: 1,
        profileId: 'claude-prod',
        warningCount: 1,
        limitationCount: 1,
        changedFileCount: 1,
        backupCreated: true,
        noChanges: false,
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['user', 'project', 'local'],
          currentScope: 'project',
          facts: [
            {
              code: 'CLAUDE_SCOPE_PRECEDENCE',
              message: 'Claude 支持 user < project < local 三层 precedence。',
            },
          ],
        },
      },
    ],
    referenceStats: {
      profileCount: 1,
      referenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      resolvedReferenceProfileCount: 0,
      missingReferenceProfileCount: 0,
      unsupportedReferenceProfileCount: 0,
      hasReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
      hasResolvedReferenceProfiles: false,
      hasMissingReferenceProfiles: false,
      hasUnsupportedReferenceProfiles: false,
    },
    executabilityStats: {
      profileCount: 1,
      inlineReadyProfileCount: 1,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: true,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: false,
      hasSourceRedactedProfiles: false,
    },
    warnings: ['建议先执行 preview 或 validate 再确认'],
    limitations: ['新增配置后仍建议执行 preview 校验 effective config。'],
  },
  scopeCapabilities: claudeScopeCapabilities,
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
  summary: {
    platformStats: addPayload.summary.platformStats,
    referenceStats: addPayload.summary.referenceStats,
    executabilityStats: addPayload.summary.executabilityStats,
    warnings: ['建议先执行 preview 或 validate 再确认'],
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
      referenceSummary: {
        hasReferenceFields: false,
        hasInlineSecrets: true,
        writeUnsupported: false,
        resolvedReferenceCount: 0,
        missingReferenceCount: 0,
        unsupportedReferenceCount: 0,
        missingValueCount: 0,
      },
      platformSummary: {
        kind: 'scope-precedence',
        precedence: ['user', 'project', 'local'],
        currentScope: 'local',
        facts: [
          { code: 'CLAUDE_SCOPE_PRECEDENCE', message: '自定义 list Claude precedence 摘要。' },
          { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '自定义 list Claude local 覆盖提示。' },
        ],
      },
      scopeCapabilities: claudeScopeCapabilities,
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
      referenceSummary: {
        hasReferenceFields: false,
        hasInlineSecrets: true,
        writeUnsupported: false,
        resolvedReferenceCount: 0,
        missingReferenceCount: 0,
        unsupportedReferenceCount: 0,
        missingValueCount: 0,
      },
      platformSummary: {
        kind: 'scope-precedence',
        precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
        currentScope: 'user',
        facts: [
          { code: 'GEMINI_SCOPE_PRECEDENCE', message: '自定义 list Gemini precedence 摘要。' },
          { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: '自定义 list Gemini project 覆盖提示。' },
        ],
      },
      scopeCapabilities: geminiScopeCapabilities,
      scopeAvailability: geminiScopeAvailability,
    },
    {
      profile: {
        id: 'codex-prod',
        name: 'Codex 生产',
        platform: 'codex',
        source: {},
        apply: {},
      },
      current: false,
      healthStatus: 'valid',
      riskLevel: 'medium',
      referenceSummary: {
        hasReferenceFields: true,
        hasInlineSecrets: false,
        writeUnsupported: true,
        resolvedReferenceCount: 0,
        missingReferenceCount: 0,
        unsupportedReferenceCount: 1,
        missingValueCount: 0,
        referenceDetails: [
          {
            code: 'REFERENCE_SCHEME_UNSUPPORTED',
            field: 'apply.auth_reference',
            status: 'unsupported-scheme',
            reference: 'vault://codex/prod',
            scheme: 'vault',
            message: 'profile.apply.auth_reference 使用的引用 scheme 当前不受支持。',
          },
        ],
      },
      platformSummary: {
        kind: 'multi-file-composition',
        composedFiles: [],
        facts: [
          { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: '自定义 list Codex 双文件摘要。' },
          { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: '自定义 list Codex profile-level 提示。' },
        ],
      },
    },
  ],
  summary: {
    referenceStats: {
      profileCount: 3,
      referenceProfileCount: 1,
      resolvedReferenceProfileCount: 0,
      missingReferenceProfileCount: 0,
      unsupportedReferenceProfileCount: 1,
      inlineProfileCount: 2,
      writeUnsupportedProfileCount: 1,
      hasReferenceProfiles: true,
      hasResolvedReferenceProfiles: false,
      hasMissingReferenceProfiles: false,
      hasUnsupportedReferenceProfiles: true,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: true,
    },
    executabilityStats: {
      profileCount: 3,
      inlineReadyProfileCount: 2,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 1,
      writeUnsupportedProfileCount: 1,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: true,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: true,
      hasWriteUnsupportedProfiles: true,
      hasSourceRedactedProfiles: false,
    },
    platformStats: [
      {
        platform: 'claude',
        profileCount: 1,
        currentProfileId: 'claude-prod',
        managed: true,
        currentScope: 'local',
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['user', 'project', 'local'],
          currentScope: 'local',
          facts: [
            { code: 'CLAUDE_SCOPE_PRECEDENCE', message: 'list 汇总 Claude precedence 摘要。' },
          ],
        },
      },
      {
        platform: 'gemini',
        profileCount: 1,
        managed: false,
        currentScope: 'user',
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          currentScope: 'user',
          facts: [
            { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'list 汇总 Gemini precedence 摘要。' },
          ],
        },
      },
      {
        platform: 'codex',
        profileCount: 1,
        managed: false,
        platformSummary: {
          kind: 'multi-file-composition',
          composedFiles: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
          facts: [
            { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'list 汇总 Codex 双文件摘要。' },
          ],
        },
      },
    ],
    warnings: ['Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。', 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。'],
    limitations: ['GEMINI_API_KEY 仍需通过环境变量生效。'],
  },
}

const emptyListPayload: ListCommandOutput = {
  profiles: [],
  summary: {
    warnings: [],
    limitations: [],
  },
}

const importApplyPayload: ImportApplyCommandOutput = {
  sourceFile: 'E:/tmp/export.json',
  importedProfile: previewPayload.profile,
  appliedScope: 'project',
  platformSummary: {
    kind: 'scope-precedence',
    precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
    facts: [
      { code: 'GEMINI_SCOPE_PRECEDENCE', message: '自定义 Gemini project apply 摘要。' },
      { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: '自定义 Gemini rollback scope 提示。' },
    ],
  },
  scopePolicy: {
    requestedScope: 'project',
    resolvedScope: 'project',
    defaultScope: 'user',
    explicitScope: true,
    highRisk: true,
    riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
    rollbackScopeMatchRequired: true,
  },
  scopeCapabilities: geminiScopeCapabilities,
  scopeAvailability: geminiScopeAvailability,
  validation: previewPayload.validation,
  preview: {
    ...previewPayload.preview,
    requiresConfirmation: true,
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
    platformStats: [
      {
        platform: 'gemini',
        profileCount: 1,
        profileId: 'gemini-prod',
        targetScope: 'project',
        warningCount: 1,
        limitationCount: 1,
        changedFileCount: 1,
        backupCreated: true,
        noChanges: false,
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          currentScope: 'project',
          facts: [
            { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'import apply 汇总 Gemini precedence 摘要。' },
          ],
        },
      },
    ],
    referenceStats: {
      profileCount: 1,
      referenceProfileCount: 0,
      resolvedReferenceProfileCount: 0,
      missingReferenceProfileCount: 0,
      unsupportedReferenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      hasReferenceProfiles: false,
      hasResolvedReferenceProfiles: false,
      hasMissingReferenceProfiles: false,
      hasUnsupportedReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
    },
    executabilityStats: {
      profileCount: 1,
      inlineReadyProfileCount: 1,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: true,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: false,
      hasSourceRedactedProfiles: false,
    },
    warnings: ['导入结果采用当前本地 observation，project scope 会覆盖 user 同名字段。'],
    limitations: ['GEMINI_API_KEY 仍需通过环境变量生效。'],
  },
}

const codexImportApplyPayload: ImportApplyCommandOutput = {
  sourceFile: 'E:/tmp/codex-export.json',
  importedProfile: {
    id: 'codex-prod',
    name: 'Codex 生产',
    platform: 'codex',
    source: {},
    apply: {},
  },
  platformSummary: {
    kind: 'multi-file-composition',
    composedFiles: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
    facts: [
      { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: '自定义 Codex 双文件摘要。' },
      { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: '自定义 Codex profile-level 提示。' },
    ],
  },
  scopePolicy: {
    explicitScope: false,
    highRisk: false,
    rollbackScopeMatchRequired: false,
  },
  scopeCapabilities: [],
  validation: {
    ok: true,
    errors: [],
    warnings: [],
    limitations: [{ code: 'CODEX_MULTI_FILE_MANAGED', level: 'limitation', message: '当前会同时托管 Codex 的 config.toml 与 auth.json。' }],
    managedBoundaries: [
      {
        type: 'managed-fields',
        target: 'C:/Users/test/.codex/config.toml',
        managedKeys: ['base_url'],
      },
      {
        type: 'managed-fields',
        target: 'C:/Users/test/.codex/auth.json',
        managedKeys: ['OPENAI_API_KEY'],
      },
      {
        type: 'multi-file-transaction',
        targets: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
        managedKeys: [],
        notes: ['Codex 导入应用会同时更新 config.toml 与 auth.json。'],
      },
    ],
  },
  preview: {
    platform: 'codex',
    profileId: 'codex-prod',
    targetFiles: [
      {
        path: 'C:/Users/test/.codex/config.toml',
        format: 'toml',
        exists: true,
        managedScope: 'multi-file',
        role: 'config',
        managedKeys: ['base_url'],
      },
      {
        path: 'C:/Users/test/.codex/auth.json',
        format: 'json',
        exists: true,
        managedScope: 'multi-file',
        role: 'auth',
        managedKeys: ['OPENAI_API_KEY'],
      },
    ],
    effectiveFields: [],
    storedOnlyFields: [],
    diffSummary: [
      {
        path: 'C:/Users/test/.codex/config.toml',
        changedKeys: ['base_url'],
        hasChanges: true,
      },
      {
        path: 'C:/Users/test/.codex/auth.json',
        changedKeys: ['OPENAI_API_KEY'],
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
  backupId: 'snapshot-codex-001',
  changedFiles: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
  noChanges: false,
  summary: {
    warnings: [],
    limitations: ['当前会同时托管 Codex 的 config.toml 与 auth.json。'],
  },
}

const claudeImportApplyPayload: ImportApplyCommandOutput = {
  sourceFile: 'E:/tmp/claude-export.json',
  importedProfile: {
    id: 'claude-prod',
    name: 'Claude 生产',
    platform: 'claude',
    source: {},
    apply: {},
  },
  appliedScope: 'local',
  platformSummary: {
    kind: 'scope-precedence',
    precedence: ['user', 'project', 'local'],
    facts: [
      { code: 'CLAUDE_SCOPE_PRECEDENCE', message: '自定义 Claude precedence 摘要。' },
      { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '自定义 Claude local 最高优先级提示。' },
    ],
  },
  scopePolicy: {
    requestedScope: 'local',
    resolvedScope: 'local',
    defaultScope: 'project',
    explicitScope: true,
    highRisk: true,
    rollbackScopeMatchRequired: false,
  },
  scopeCapabilities: claudeScopeCapabilities,
  validation: {
    ok: true,
    errors: [],
    warnings: [],
    limitations: [{ code: 'CLAUDE_MANAGED_FIELDS_ONLY', level: 'limitation', message: '当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。' }],
    managedBoundaries: [
      {
        type: 'scope-aware',
        target: 'C:/Users/test/.claude/settings.local.json',
        managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
        notes: ['当前写入目标为 Claude 本地级配置文件。'],
      },
    ],
  },
  preview: {
    platform: 'claude',
    profileId: 'claude-prod',
    targetFiles: [
      {
        path: 'C:/Users/test/.claude/settings.local.json',
        format: 'json',
        exists: true,
        managedScope: 'partial-fields',
        scope: 'local',
        role: 'settings',
        managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
      },
    ],
    effectiveFields: [],
    storedOnlyFields: [],
    diffSummary: [
      {
        path: 'C:/Users/test/.claude/settings.local.json',
        changedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
        hasChanges: true,
      },
    ],
    warnings: [],
    limitations: [],
    riskLevel: 'high',
    requiresConfirmation: true,
    backupPlanned: true,
    noChanges: false,
  },
  risk: {
    allowed: true,
    riskLevel: 'high',
    reasons: [],
    limitations: [],
  },
  backupId: 'snapshot-claude-001',
  changedFiles: ['C:/Users/test/.claude/settings.local.json'],
  noChanges: false,
  summary: {
    warnings: [],
    limitations: ['当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。'],
  },
}

const codexUsePayload: UseCommandOutput = {
  profile: codexImportApplyPayload.importedProfile,
  backupId: 'snapshot-codex-use-001',
  platformSummary: {
    kind: 'multi-file-composition',
    composedFiles: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
    facts: [
      { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: '自定义 use Codex 双文件摘要。' },
      { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: '自定义 use Codex 成组写入提示。' },
    ],
  },
  preview: codexImportApplyPayload.preview,
  risk: codexImportApplyPayload.risk,
  summary: codexImportApplyPayload.summary,
  changedFiles: codexImportApplyPayload.changedFiles,
  noChanges: false,
}

const claudeUsePayload: UseCommandOutput = {
  profile: claudeImportApplyPayload.importedProfile,
  backupId: 'snapshot-claude-use-001',
  platformSummary: {
    kind: 'scope-precedence',
    precedence: ['user', 'project', 'local'],
    currentScope: 'local',
    facts: [
      { code: 'CLAUDE_SCOPE_PRECEDENCE', message: '自定义 use Claude precedence 摘要。' },
      { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '自定义 use Claude local 提示。' },
    ],
  },
  preview: claudeImportApplyPayload.preview,
  risk: claudeImportApplyPayload.risk,
  summary: claudeImportApplyPayload.summary,
  changedFiles: claudeImportApplyPayload.changedFiles,
  noChanges: false,
  scopeCapabilities: claudeImportApplyPayload.scopeCapabilities,
}

const codexRollbackPayload: RollbackCommandOutput = {
  backupId: 'snapshot-codex-001',
  restoredFiles: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
  platformSummary: {
    kind: 'multi-file-composition',
    composedFiles: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
    facts: [
      { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: '自定义 rollback Codex 双文件摘要。' },
      { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: '自定义 rollback Codex 成组恢复提示。' },
    ],
  },
  rollback: {
    ok: true,
    backupId: 'snapshot-codex-001',
    restoredFiles: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
    managedBoundaries: [
      {
        type: 'managed-fields',
        target: 'C:/Users/test/.codex/config.toml',
        managedKeys: ['base_url'],
      },
      {
        type: 'managed-fields',
        target: 'C:/Users/test/.codex/auth.json',
        managedKeys: ['OPENAI_API_KEY'],
      },
      {
        type: 'multi-file-transaction',
        targets: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
        managedKeys: [],
        notes: ['Codex 回滚会同时恢复 config.toml 与 auth.json。'],
      },
    ],
    warnings: [
      {
        code: 'rollback-warning',
        level: 'warning',
        message: '已按快照同时恢复 Codex 双文件。',
      },
    ],
    limitations: [
      {
        code: 'rollback-limitation',
        level: 'limitation',
        message: '回滚仅恢复快照覆盖的双文件。',
      },
    ],
  },
  summary: {
    referenceStats: {
      profileCount: 1,
      referenceProfileCount: 0,
      resolvedReferenceProfileCount: 0,
      missingReferenceProfileCount: 0,
      unsupportedReferenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      hasReferenceProfiles: false,
      hasResolvedReferenceProfiles: false,
      hasMissingReferenceProfiles: false,
      hasUnsupportedReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
    },
    executabilityStats: {
      profileCount: 1,
      inlineReadyProfileCount: 1,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: true,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: false,
      hasSourceRedactedProfiles: false,
    },
    warnings: ['已按快照同时恢复 Codex 双文件。'],
    limitations: ['回滚仅恢复快照覆盖的双文件。'],
  },
}

const claudeRollbackPayload: RollbackCommandOutput = {
  backupId: 'snapshot-claude-001',
  restoredFiles: ['C:/Users/test/.claude/settings.local.json'],
  platformSummary: {
    kind: 'scope-precedence',
    precedence: ['user', 'project', 'local'],
    currentScope: 'local',
    facts: [
      { code: 'CLAUDE_SCOPE_PRECEDENCE', message: '自定义 rollback Claude precedence 摘要。' },
      { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '自定义 rollback Claude local 提示。' },
    ],
  },
  scopePolicy: {
    requestedScope: 'local',
    resolvedScope: 'local',
    defaultScope: 'project',
    explicitScope: true,
    highRisk: false,
    rollbackScopeMatchRequired: false,
  },
  rollback: {
    ok: true,
    backupId: 'snapshot-claude-001',
    restoredFiles: ['C:/Users/test/.claude/settings.local.json'],
    managedBoundaries: [
      {
        type: 'scope-aware',
        target: 'C:/Users/test/.claude/settings.local.json',
        managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
        notes: ['当前恢复目标为 Claude 本地级配置文件。'],
      },
    ],
    warnings: [
      {
        code: 'rollback-warning',
        level: 'warning',
        message: '已恢复 Claude local scope 快照。',
      },
    ],
    limitations: [
      {
        code: 'rollback-limitation',
        level: 'limitation',
        message: '回滚仅恢复该 scope 下的托管字段。',
      },
    ],
  },
  summary: {
    referenceStats: {
      profileCount: 1,
      referenceProfileCount: 0,
      resolvedReferenceProfileCount: 0,
      missingReferenceProfileCount: 0,
      unsupportedReferenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      hasReferenceProfiles: false,
      hasResolvedReferenceProfiles: false,
      hasMissingReferenceProfiles: false,
      hasUnsupportedReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
    },
    executabilityStats: {
      profileCount: 1,
      inlineReadyProfileCount: 1,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: true,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: false,
      hasSourceRedactedProfiles: false,
    },
    warnings: ['已恢复 Claude local scope 快照。'],
    limitations: ['回滚仅恢复该 scope 下的托管字段。'],
  },
  scopeCapabilities: claudeScopeCapabilities,
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

const genericFailureResult = createFailureResult('preview', '配置校验失败', ['高风险操作需要确认'], ['Gemini 最终认证结果仍受环境变量影响。'])
const confirmationFailureResult: CommandResult = {
  ok: false,
  action: 'use',
  warnings: ['Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。'],
  limitations: ['GEMINI_API_KEY 仍需通过环境变量生效。'],
  error: {
    code: 'CONFIRMATION_REQUIRED',
    message: '当前切换需要确认或 --force。',
    details: {
      risk: {
        allowed: false,
        riskLevel: 'high',
        reasons: ['Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。'],
        limitations: ['GEMINI_API_KEY 仍需通过环境变量生效。'],
      },
      referenceGovernance: {
        hasReferenceProfiles: true,
        hasInlineProfiles: false,
        hasWriteUnsupportedProfiles: true,
        primaryReason: 'REFERENCE_WRITE_UNSUPPORTED',
        reasonCodes: ['REFERENCE_WRITE_UNSUPPORTED'],
        referenceDetails: [
          {
            code: 'REFERENCE_ENV_UNRESOLVED',
            field: 'source.secret_ref',
            status: 'missing',
            reference: 'env://GEMINI_API_KEY',
            scheme: 'env',
            message: 'profile.source.secret_ref 的 env 引用当前不可解析。',
          },
          {
            code: 'REFERENCE_ENV_RESOLVED',
            field: 'apply.secondary_auth_reference',
            status: 'resolved',
            reference: 'env://GEMINI_SECONDARY_API_KEY',
            scheme: 'env',
            message: 'profile.apply.secondary_auth_reference 的 env 引用已解析，但当前写入链路仍不会直接消费引用。',
          },
          {
            code: 'REFERENCE_SCHEME_UNSUPPORTED',
            field: 'apply.auth_reference',
            status: 'unsupported-scheme',
            reference: 'vault://gemini/prod',
            scheme: 'vault',
            message: 'profile.apply.auth_reference 使用的引用 scheme 当前不受支持。',
          },
        ],
      },
      scopePolicy: {
        requestedScope: 'project',
        resolvedScope: 'project',
        defaultScope: 'user',
        explicitScope: true,
        highRisk: true,
        riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
        rollbackScopeMatchRequired: true,
      },
      scopeCapabilities: geminiScopeCapabilities,
      scopeAvailability: geminiScopeAvailability,
    },
  },
}
const codexConfirmationFailureResult: CommandResult = {
  ok: false,
  action: 'use',
  warnings: ['Codex 将以双文件事务方式同时更新 config.toml 与 auth.json。'],
  limitations: ['当前失败后不会只保留单文件部分写入。'],
  error: {
    code: 'CONFIRMATION_REQUIRED',
    message: 'Codex 切换需要确认。将同时写入 config.toml 与 auth.json。',
    details: {
      risk: {
        allowed: false,
        riskLevel: 'medium',
        reasons: ['Codex 当前会成组写入 config.toml 与 auth.json。'],
        limitations: ['当前失败后不会只保留单文件部分写入。'],
      },
      targetFiles: codexImportApplyPayload.preview.targetFiles,
    },
  },
}
const useValidationFailureResult: CommandResult = {
  ok: false,
  action: 'use',
  warnings: ['Gemini 首版仅稳定支持 enforcedAuthType = gemini-api-key。'],
  limitations: ['GEMINI_API_KEY 仍需通过环境变量生效。'],
  error: {
    code: 'VALIDATION_FAILED',
    message: '配置校验失败',
  },
}
const previewFailureWithDataResult: CommandResult<PreviewCommandOutput> = {
  ok: false,
  action: 'preview',
  data: emptyValidationPreviewPayload,
}
const validateFailureWithDataResult: CommandResult<ValidateCommandOutput> = {
  ok: false,
  action: 'validate',
  data: validatePayload,
}
const claudeRollbackFailureResult: CommandResult = {
  ok: false,
  action: 'rollback',
  warnings: ['Claude local scope 恢复失败后，当前项目仍可能继续沿用原有更高优先级配置。'],
  limitations: ['请先确认本地级配置文件可写后再重试。'],
  error: {
    code: 'ROLLBACK_FAILED',
    message: 'Claude local scope 快照恢复失败。',
    details: {
      scopePolicy: {
        requestedScope: 'local',
        resolvedScope: 'local',
        defaultScope: 'project',
        explicitScope: true,
        highRisk: false,
        rollbackScopeMatchRequired: false,
      },
      scopeCapabilities: claudeScopeCapabilities,
      managedBoundaries: [
        {
          type: 'scope-aware',
          target: 'C:/Users/test/.claude/settings.local.json',
          managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
        },
      ],
    },
  },
}
const malformedConfirmationFailureResult: CommandResult = {
  ok: false,
  action: 'use',
  warnings: ['仍保留原始 warning。'],
  limitations: ['仍保留原始 limitation。'],
  error: {
    code: 'CONFIRMATION_REQUIRED',
    message: '当前切换需要确认或 --force。',
    details: {
      risk: {
        allowed: false,
        riskLevel: 'high',
        reasons: 'not-an-array',
        limitations: null,
      },
      scopePolicy: {
        requestedScope: 'project',
        resolvedScope: 'project',
        defaultScope: 'user',
        explicitScope: true,
        highRisk: true,
        rollbackScopeMatchRequired: true,
      },
      scopeCapabilities: {
        scope: 'project',
      },
      scopeAvailability: {
        scope: 'project',
      },
    },
  },
}
const malformedImportApplyNotReadyFailureResult: CommandResult = {
  ok: false,
  action: 'import-apply',
  warnings: ['仍保留 import apply warning。'],
  limitations: ['仍保留 import apply limitation。'],
  error: {
    code: 'IMPORT_APPLY_NOT_READY',
    message: '当前 import preview 结果不允许进入 apply。',
    details: {
      sourceFile: 'E:/tmp/export.json',
      profileId: 'gemini-prod',
      previewDecision: {
        canProceedToApplyDesign: false,
        reasons: 'not-an-array',
      },
      localObservation: {
        defaultWriteScope: 'user',
        scopeAvailability: {
          scope: 'project',
        },
      },
    },
  },
}
const malformedImportApplyScopeUnavailableFailureResult: CommandResult = {
  ok: false,
  action: 'import-apply',
  warnings: ['仍保留 import scope warning。'],
  error: {
    code: 'IMPORT_SCOPE_UNAVAILABLE',
    message: 'Gemini project scope 不可用：无法解析 project root。',
    details: {
      scopePolicy: importApplyPayload.scopePolicy,
      scopeCapabilities: {
        scope: 'project',
      },
      scopeAvailability: 'not-an-array',
    },
  },
}
const importApplyNotReadyFailureResult: CommandResult = {
  ok: false,
  action: 'import-apply',
  warnings: ['导入文件按兼容模式解析；apply 设计必须以当前本地 observation 为准。'],
  error: {
    code: 'IMPORT_APPLY_NOT_READY',
    message: '当前 import preview 结果不允许进入 apply。',
    details: {
      sourceFile: 'E:/tmp/export.json',
      profileId: 'gemini-prod',
      previewDecision: {
        canProceedToApplyDesign: false,
        recommendedScope: 'project',
        requiresLocalResolution: true,
        reasonCodes: ['BLOCKED_BY_FIDELITY_MISMATCH', 'REQUIRES_LOCAL_SCOPE_RESOLUTION'],
        reasons: [
          {
            code: 'BLOCKED_BY_FIDELITY_MISMATCH',
            blocking: true,
            message: '导出观察与当前本地观察存在关键漂移，当前不应继续进入 apply 设计。',
          },
          {
            code: 'REQUIRES_LOCAL_SCOPE_RESOLUTION',
            blocking: true,
            message: '当前本地 scope 解析未完成，需先修复本地解析结果。',
          },
        ],
      },
      fidelity: {
        status: 'mismatch',
        mismatches: [
          {
            field: 'scopeAvailability',
            driftKind: 'availability-drift',
            severity: 'blocking',
            scope: 'project',
            exportedValue: { status: 'available', detected: true, writable: true },
            localValue: { status: 'unresolved', detected: false, writable: false },
            message: 'project 作用域的可用性与当前本地环境不一致。',
            recommendedAction: '先修复本地 project scope 解析，再重新执行 import preview。',
          },
        ],
        driftSummary: { blocking: 1, warning: 0, info: 0 },
        groupedMismatches: [
          {
            driftKind: 'availability-drift',
            totalCount: 1,
            blockingCount: 1,
            warningCount: 0,
            infoCount: 0,
            mismatches: [
              {
                field: 'scopeAvailability',
                driftKind: 'availability-drift',
                severity: 'blocking',
                scope: 'project',
                exportedValue: { status: 'available', detected: true, writable: true },
                localValue: { status: 'unresolved', detected: false, writable: false },
                message: 'project 作用域的可用性与当前本地环境不一致。',
                recommendedAction: '先修复本地 project scope 解析，再重新执行 import preview。',
              },
            ],
          },
        ],
        highlights: ['当前本地 scope availability 与导出观察不一致，应以本地实时环境为准。'],
      },
      localObservation: {
        defaultWriteScope: 'user',
        scopeCapabilities: geminiScopeCapabilities,
        scopeAvailability: geminiScopeAvailability,
      },
      exportedObservation: {
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: geminiScopeCapabilities,
        scopeAvailability: [
          {
            scope: 'project',
            status: 'available',
            detected: true,
            writable: true,
            path: 'E:/repo/.gemini/settings.json',
          },
        ],
      },
    },
  },
}
const importApplyScopeUnavailableFailureResult: CommandResult = {
  ok: false,
  action: 'import-apply',
  warnings: ['导入文件按兼容模式解析；当前以本地实时 environment 为准。'],
  error: {
    code: 'IMPORT_SCOPE_UNAVAILABLE',
    message: 'Gemini project scope 不可用：无法解析 project root。',
    details: {
      requestedScope: 'project',
      resolvedScope: 'project',
      scopePolicy: importApplyPayload.scopePolicy,
      scopeCapabilities: geminiScopeCapabilities,
      scopeAvailability: geminiScopeAvailability,
    },
  },
}
const importApplyRedactedSecretFailureResult: CommandResult = {
  ok: false,
  action: 'import-apply',
  warnings: ['导入文件包含 2 个 redacted inline secret 占位值；import preview 会保留字段位置，但不会把它当作真实 secret 明文。'],
  error: {
    code: 'IMPORT_SOURCE_REDACTED_INLINE_SECRETS',
    message: '导入文件中的 inline secret 已被 redacted；当前不能直接进入 import apply。',
    details: {
      sourceFile: 'E:/tmp/export.json',
      profileId: 'gemini-prod',
      redactedInlineSecretFields: ['source.apiKey', 'apply.GEMINI_API_KEY'],
    },
  },
}
const importApplyConfirmationFailureResult: CommandResult = {
  ok: false,
  action: 'import-apply',
  warnings: ['导入结果采用当前本地 observation，project scope 会覆盖 user 同名字段。'],
  limitations: ['GEMINI_API_KEY 仍需通过环境变量生效。'],
  error: {
    code: 'CONFIRMATION_REQUIRED',
    message: '当前导入应用需要确认或 --force。',
    details: {
      risk: {
        allowed: false,
        riskLevel: 'high',
        reasons: ['导入结果采用当前本地 observation，project scope 会覆盖 user 同名字段。'],
        limitations: ['GEMINI_API_KEY 仍需通过环境变量生效。'],
      },
      referenceGovernance: {
        hasReferenceProfiles: true,
        hasInlineProfiles: false,
        hasWriteUnsupportedProfiles: true,
        primaryReason: 'REFERENCE_WRITE_UNSUPPORTED',
        reasonCodes: ['REFERENCE_WRITE_UNSUPPORTED'],
        referenceDetails: [
          {
            code: 'REFERENCE_ENV_UNRESOLVED',
            field: 'source.secret_ref',
            status: 'missing',
            reference: 'env://GEMINI_API_KEY',
            scheme: 'env',
            message: 'profile.source.secret_ref 的 env 引用当前不可解析。',
          },
          {
            code: 'REFERENCE_SCHEME_UNSUPPORTED',
            field: 'apply.auth_reference',
            status: 'unsupported-scheme',
            reference: 'keychain://gemini/session-token',
            scheme: 'keychain',
            message: 'profile.apply.auth_reference 使用的引用 scheme 当前不受支持。',
          },
        ],
      },
      scopePolicy: importApplyPayload.scopePolicy,
      scopeCapabilities: geminiScopeCapabilities,
      scopeAvailability: [
        {
          scope: 'user',
          status: 'available',
          detected: true,
          writable: true,
          path: 'C:/Users/test/.gemini/settings.json',
        },
        {
          scope: 'project',
          status: 'available',
          detected: true,
          writable: true,
          path: 'E:/repo/.gemini/settings.json',
        },
      ],
    },
  },
}
const codexImportApplyConfirmationFailureResult: CommandResult = {
  ok: false,
  action: 'import-apply',
  warnings: ['Codex 导入应用会以双文件事务同时写入 config.toml 与 auth.json。'],
  limitations: ['需要把这两个文件视为同一组变更。'],
  error: {
    code: 'CONFIRMATION_REQUIRED',
    message: 'Codex 导入应用需要确认。',
    details: {
      risk: {
        allowed: false,
        riskLevel: 'medium',
        reasons: ['Codex 导入应用会成组写入 config.toml 与 auth.json。'],
        limitations: ['需要把这两个文件视为同一组变更。'],
      },
      targetFiles: codexImportApplyPayload.preview.targetFiles,
    },
  },
}
const claudeImportApplyScopeUnavailableFailureResult: CommandResult = {
  ok: false,
  action: 'import-apply',
  warnings: ['当前本地 observation 显示目标 local scope 不可写。'],
  limitations: ['请先修复 local 配置文件路径或权限后再重试。'],
  error: {
    code: 'IMPORT_SCOPE_UNAVAILABLE',
    message: 'Claude local scope 不可用：目标配置文件不可写。',
    details: {
      scopePolicy: {
        requestedScope: 'local',
        resolvedScope: 'local',
        defaultScope: 'project',
        explicitScope: true,
        highRisk: false,
        rollbackScopeMatchRequired: false,
      },
      scopeCapabilities: claudeScopeCapabilities,
      scopeAvailability: [
        {
          scope: 'local',
          status: 'unavailable',
          detected: true,
          writable: false,
          path: 'C:/Users/test/.claude/settings.local.json',
          reasonCode: 'TARGET_NOT_WRITABLE',
          reason: 'Claude local scope 不可用：目标配置文件不可写。',
        },
      ],
    },
  },
}

const outputCurrent = renderText(createCurrentResult(currentPayload))
const outputEmptyCurrent = renderText(createCurrentResult(emptyCurrentPayload))
const outputPreview = renderText(createPreviewResult(previewPayload))
const outputPreviewNoChanges = renderText(createPreviewResult(noChangesPreviewPayload))
const outputExperimentalPreview = renderText(createPreviewResult(experimentalPreviewPayload))
const outputPreviewValidationError = renderText(createPreviewResult(emptyValidationPreviewPayload))
const outputPreviewValidationLimitations = renderText(createPreviewResult(validationPreviewPayloadWithLimitations))
const outputUse = renderText(createUseResult(usePayload))
const outputUseNoChanges = renderText(createUseResult(noChangesUsePayload))
const outputGeminiProjectUse = renderText(createUseResult(geminiProjectUsePayload))
const outputCodexUse = renderText(createUseResult(codexUsePayload))
const outputClaudeUse = renderText(createUseResult(claudeUsePayload))
const outputRollback = renderText(createRollbackResult(rollbackPayload))
const outputRollbackEmpty = renderText(createRollbackResult(emptyRollbackPayload))
const outputCodexRollback = renderText(createRollbackResult(codexRollbackPayload))
const outputClaudeRollback = renderText(createRollbackResult(claudeRollbackPayload))
const outputValidate = renderText(createValidateResult(validatePayload))
const outputValidateItemLimitations = renderText(createValidateResult(validatePayloadWithIssueLimitations))
const outputEmptyValidate = renderText(createValidateResult(emptyValidatePayload))
const outputExport = renderText(createExportResult(exportPayload))
const outputImportPreview = renderText(createImportPreviewResult(importPreviewPayload))
const outputImportApply = renderText(createImportApplyResult(importApplyPayload))
const outputCodexImportApply = renderText(createImportApplyResult(codexImportApplyPayload))
const outputClaudeImportApply = renderText(createImportApplyResult(claudeImportApplyPayload))
const outputEmptyExport = renderText(createExportResult(emptyExportPayload))
const outputAdd = renderText(createAddResult(addPayload))
const outputAddWithLimitations = renderText(createAddResult(addPayloadWithLimitations))
const outputList = renderText(createListResult(listPayload))
const outputEmptyList = renderText(createListResult(emptyListPayload))
const outputGenericSuccess = renderText(genericSuccessResult)
const outputGenericSuccessWithoutData = renderText(genericSuccessWithoutData)
const outputGenericFailure = renderText(genericFailureResult)
const outputConfirmationFailure = renderText(confirmationFailureResult)
const outputCodexConfirmationFailure = renderText(codexConfirmationFailureResult)
const outputUseValidationFailure = renderText(useValidationFailureResult)
const outputPreviewFailureWithData = renderText(previewFailureWithDataResult)
const outputValidateFailureWithData = renderText(validateFailureWithDataResult)
const outputClaudeRollbackFailure = renderText(claudeRollbackFailureResult)
const outputImportApplyNotReadyFailure = renderText(importApplyNotReadyFailureResult)
const outputImportApplyScopeUnavailableFailure = renderText(importApplyScopeUnavailableFailureResult)
const outputImportApplyRedactedSecretFailure = renderText(importApplyRedactedSecretFailureResult)
const outputImportApplyConfirmationFailure = renderText(importApplyConfirmationFailureResult)
const outputCodexImportApplyConfirmationFailure = renderText(codexImportApplyConfirmationFailureResult)
const outputClaudeImportApplyScopeUnavailableFailure = renderText(claudeImportApplyScopeUnavailableFailureResult)
const outputMalformedConfirmationFailure = renderText(malformedConfirmationFailureResult)
const outputMalformedImportApplyNotReadyFailure = renderText(malformedImportApplyNotReadyFailureResult)
const outputMalformedImportApplyScopeUnavailableFailure = renderText(malformedImportApplyScopeUnavailableFailureResult)

describe('text renderer', () => {
  it('渲染 current 结果时输出 state、最近切换与检测结果', () => {
    expect(outputCurrent).toContain('[current] 成功')
    expect(outputCurrent).toContain('当前 state:')
    expect(outputCurrent).toContain('- claude: claude-prod')
    expect(outputCurrent).toContain('- codex: codex-prod')
    expect(outputCurrent).toContain('- gemini: gemini-prod')
    expect(outputCurrent).toContain('最近切换: gemini / gemini-prod / success')
    expect(outputCurrent).toContain('按平台汇总:')
    expect(outputCurrent).toContain('  - gemini: profiles=1, current=gemini-prod, detected=gemini-prod, managed=yes, scope=user')
    expect(outputCurrent).toContain('    - current 汇总 Gemini precedence 摘要。')
    expect(outputCurrent).toContain('  - claude: profiles=1, current=claude-prod, detected=claude-prod, managed=yes, scope=local')
    expect(outputCurrent).toContain('    - current 汇总 Claude precedence 摘要。')
    expect(outputCurrent).toContain('  - codex: profiles=1, current=codex-prod, detected=codex-prod, managed=yes')
    expect(outputCurrent).toContain('    - current 汇总 Codex 双文件摘要。')
    expect(outputCurrent).toContain('referenceStats 摘要:')
    expect(outputCurrent).toContain('  - profiles=3, reference=1, inline=2, writeUnsupported=1')
    expect(outputCurrent).toContain('  - hasReferenceProfiles=yes, hasInlineProfiles=yes, hasWriteUnsupportedProfiles=yes')
    expect(outputCurrent).toContain('  - 提示: 当前仍有 inline profiles，可优先迁移到 secret reference。')
    expect(outputCurrent).toContain('  - 提示: 当前有 write unsupported profiles，preview/use/import apply 仍不会直接消费 reference-only profiles。')
    expect(outputCurrent).toContain('executabilityStats 摘要:')
    expect(outputCurrent).toContain('  - profiles=3, inlineReady=2, referenceReady=0, referenceMissing=1, writeUnsupported=1, sourceRedacted=0')
    expect(outputCurrent).toContain('  - hasInlineReadyProfiles=yes, hasReferenceReadyProfiles=no, hasReferenceMissingProfiles=yes, hasWriteUnsupportedProfiles=yes, hasSourceRedactedProfiles=no')
    expect(outputCurrent).toContain('  - 提示: 当前存在未解析或不受支持的 reference profiles，后续写入不可直接执行。')
    expect(outputCurrent).toContain('  - 提示: 当前有 write unsupported profiles，现有写入链路仍不会直接消费这些 profiles。')
    expect(outputCurrent).toContain('检测结果:')
    expect(outputCurrent).toContain('- 平台: gemini')
    expect(outputCurrent).toContain('  托管识别: 是')
    expect(outputCurrent).toContain('  匹配配置: gemini-prod')
    expect(outputCurrent).toContain('  当前作用域: user')
    expect(outputCurrent).toContain('  作用域说明:')
    expect(outputCurrent).toContain('  - 检测范围: system-defaults, user, project, system-overrides')
    expect(outputCurrent).toContain('  - 生效优先级: system-defaults < user < project < system-overrides')
    expect(outputCurrent).toContain('  - 当前生效来源: user')
    expect(outputCurrent).toContain('  - 当前写入策略: api-switcher 当前仅写入 user scope')
    expect(outputCurrent).toContain('  作用域能力:')
    expect(outputCurrent).toContain('  - system-defaults: detect/current=yes, preview/effective=yes, use/write=no, rollback=no, risk=normal')
    expect(outputCurrent).toContain('  - user: detect/current=yes, preview/effective=yes, use/write=yes, rollback=yes, risk=normal')
    expect(outputCurrent).toContain('  - project: detect/current=yes, preview/effective=yes, use/write=yes, rollback=yes, risk=high, requires --force')
    expect(outputCurrent).toContain('  作用域可用性:')
    expect(outputCurrent).toContain('  - user: status=available, detected=yes, writable=yes')
    expect(outputCurrent).toContain('    路径: C:/Users/test/.gemini/settings.json')
    expect(outputCurrent).toContain('  - project: status=unresolved, detected=no, writable=no')
    expect(outputCurrent).toContain('    原因代码: PROJECT_ROOT_UNRESOLVED')
    expect(outputCurrent).toContain('    建议: 设置有效的 Gemini project root 后再重试。')
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
    expect(outputCurrent).toContain('  reference 摘要:')
    expect(outputCurrent).toContain('  - hasReferenceFields=no, hasInlineSecrets=yes, writeUnsupported=no')
    expect(outputCurrent).toContain('- 平台: claude')
    expect(outputCurrent).toContain('  当前作用域: local')
    expect(outputCurrent).toContain('  - 生效优先级: user < project < local')
    expect(outputCurrent).toContain('  - 当前生效作用域: local scope')
    expect(outputCurrent).toContain('  - 自定义 current Claude precedence 摘要。')
    expect(outputCurrent).toContain('  - 自定义 current Claude local 覆盖提示。')
    expect(outputCurrent).toContain('- 平台: codex')
    expect(outputCurrent).toContain('  - 类型: multi-file-transaction')
    expect(outputCurrent).toContain('    说明: Codex current 检测需要同时结合 config.toml 与 auth.json。')
    expect(outputCurrent).toContain('  - OPENAI_API_KEY: sk-o***99 (source=inline, present=yes)')
    expect(outputCurrent).toContain('  - 组成文件: C:/Users/test/.codex/config.toml, C:/Users/test/.codex/auth.json')
    expect(outputCurrent).toContain('  - 自定义 current Codex 双文件摘要。')
    expect(outputCurrent).toContain('  - 自定义 current Codex 双文件缺一不可提示。')
    expect(outputCurrent).toContain('  - hasReferenceFields=yes, hasInlineSecrets=no, writeUnsupported=yes')
    expect(outputCurrent).toContain('  reference 解析摘要:')
    expect(outputCurrent).toContain('    - apply.auth_reference -> vault://codex/prod')
    expect(outputCurrent).toContain('附加提示:')
    expect(outputCurrent).toContain('  - Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(outputCurrent).toContain('限制说明:')
    expect(outputCurrent).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('渲染空 current 结果时提示无已标记配置', () => {
    expect(outputEmptyCurrent).toContain('[current] 成功')
    expect(outputEmptyCurrent).toContain('- 当前无已标记配置')
    expect(outputEmptyCurrent).not.toContain('检测结果:')
  })

  it('current 文本 summary 顺序与 summarySections 对齐', () => {
    expectOrderedSections(outputCurrent, ['按平台汇总:', 'referenceStats 摘要:', 'executabilityStats 摘要:'])
  })

  it('渲染 preview 结果时输出校验、风险、文件、提示与限制说明', () => {
    expect(outputPreview).toContain('[preview] 成功')
    expect(outputPreview).toContain('按平台汇总:')
    expect(outputPreview).toContain('  - gemini: profiles=1, profile=gemini-prod, scope=user, warnings=1, limitations=1, changedFiles=1, backup=yes, noChanges=no')
    expect(outputPreview).toContain('    - preview 汇总 Gemini precedence 摘要。')
    expect(outputPreview).toContain('referenceStats 摘要:')
    expect(outputPreview).toContain('  - profiles=1, reference=0, inline=1, writeUnsupported=0')
    expect(outputPreview).toContain('  - hasReferenceProfiles=no, hasInlineProfiles=yes, hasWriteUnsupportedProfiles=no')
    expect(outputPreview).toContain('  - 提示: 当前仍有 inline profiles，可优先迁移到 secret reference。')
    expect(outputPreview).toContain('executabilityStats 摘要:')
    expect(outputPreview).toContain('  - profiles=1, inlineReady=1, referenceReady=0, referenceMissing=0, writeUnsupported=0, sourceRedacted=0')
    expect(outputPreview).toContain('  - hasInlineReadyProfiles=yes, hasReferenceReadyProfiles=no, hasReferenceMissingProfiles=no, hasWriteUnsupportedProfiles=no, hasSourceRedactedProfiles=no')
    expect(outputPreview).toContain('- 配置: gemini-prod (gemini)')
    expect(outputPreview).toContain('  校验结果: 通过')
    expect(outputPreview).toContain('  风险等级: medium')
    expect(outputPreview).toContain('  需要确认: 是')
    expect(outputPreview).toContain('  计划备份: 是')
    expect(outputPreview).toContain('  无变更: 否')
    expect(outputPreview).toContain('  作用域能力:')
    expect(outputPreview).toContain('  - system-defaults: detect/current=yes, preview/effective=yes, use/write=no, rollback=no, risk=normal')
    expect(outputPreview).toContain('    说明: 只参与 Gemini effective config 检测与 precedence 推导，不允许写入或回滚。')
    expect(outputPreview).toContain('  - project: detect/current=yes, preview/effective=yes, use/write=yes, rollback=yes, risk=high, requires --force')
    expect(outputPreview).toContain('  作用域说明:')
    expect(outputPreview).toContain('  - 生效优先级: system-defaults < user < project < system-overrides')
    expect(outputPreview).toContain('  - 预览视角: 先按四层 precedence 推导 current/effective，再评估本次写入')
    expect(outputPreview).toContain('  - 本次写入目标: user scope')
    expect(outputPreview).toContain('  - 覆盖提醒: 如果 project 或 system-overrides 存在同名字段，user 写入后仍可能不会成为最终生效值')
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

  it('preview 文本 summary 顺序与单平台写入命令读取顺序对齐', () => {
    expectOrderedSections(outputPreview, ['按平台汇总:', 'referenceStats 摘要:', 'executabilityStats 摘要:', '- 配置: gemini-prod (gemini)'])
  })

  it('preview 无变化时显示无变化摘要', () => {
    expect(outputPreviewNoChanges).toContain('  无变更: 是')
    expect(outputPreviewNoChanges).toContain('  - C:/Users/test/.gemini/settings.json: 无变化')
  })

  it('preview 会单独渲染实验性 Gemini 字段', () => {
    expect(outputExperimentalPreview).toContain('- 配置: gemini-proxy (gemini)')
    expect(outputExperimentalPreview).toContain('  生效字段:')
    expect(outputExperimentalPreview).toContain('  - enforcedAuthType: gemini-api-key (scope=user, source=profile)')
    expect(outputExperimentalPreview).toContain('  - GEMINI_API_KEY: gm-l***21 (scope=runtime, source=env, secret)')
    expect(outputExperimentalPreview).toContain('  - GEMINI_BASE_URL: https://proxy.example.com (scope=runtime, source=managed-policy)')
    expect(outputExperimentalPreview).toContain('  警告: Gemini 自定义 base URL 属于实验性支持，默认不按稳定托管字段写入。')
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
    expect(outputUse).toContain('按平台汇总:')
    expect(outputUse).toContain('  - gemini: profiles=1, profile=gemini-prod, scope=user, warnings=1, limitations=1, changedFiles=1, backup=yes, noChanges=no')
    expect(outputUse).toContain('    - use 汇总 Gemini precedence 摘要。')
    expect(outputUse).toContain('referenceStats 摘要:')
    expect(outputUse).toContain('  - profiles=1, reference=0, inline=1, writeUnsupported=0')
    expect(outputUse).toContain('executabilityStats 摘要:')
    expect(outputUse).toContain('  - profiles=1, inlineReady=1, referenceReady=0, referenceMissing=0, writeUnsupported=0, sourceRedacted=0')
    expect(outputUse).toContain('- 配置: gemini-prod (gemini)')
    expect(outputUse).toContain('  备份ID: snapshot-gemini-001')
    expect(outputUse).toContain('  无变更: 否')
    expect(outputUse).toContain('  风险等级: medium')
    expect(outputUse).toContain('  已变更文件:')
    expect(outputUse).toContain('  - C:/Users/test/.gemini/settings.json')
    expect(outputUse).toContain('  作用域能力:')
    expect(outputUse).toContain('  - project: detect/current=yes, preview/effective=yes, use/write=yes, rollback=yes, risk=high, requires --force')
    expect(outputUse).toContain('  作用域可用性:')
    expect(outputUse).toContain('  - project: status=unresolved, detected=no, writable=no')
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

  it('use 成功文本先读 summary 聚合，再进入写入细节', () => {
    expectOrderedSections(outputUse, ['按平台汇总:', 'referenceStats 摘要:', 'executabilityStats 摘要:', '- 配置: gemini-prod (gemini)'])
  })

  it('渲染 use 结果时会为 Gemini success 输出 project 覆盖与回滚约束摘要', () => {
    expect(outputGeminiProjectUse).toContain('[use] 成功')
    expect(outputGeminiProjectUse).toContain('- 配置: gemini-prod (gemini)')
    expect(outputGeminiProjectUse).toContain('平台摘要:')
    expect(outputGeminiProjectUse).toContain('  - 当前生效作用域: project scope')
    expect(outputGeminiProjectUse).toContain('  - 自定义 use Gemini project 摘要。')
    expect(outputGeminiProjectUse).toContain('  - 自定义 use Gemini project 回滚提示。')
  })

  it('渲染 use 结果时会为 Codex success 输出双文件事务摘要', () => {
    expect(outputCodexUse).toContain('[use] 成功')
    expect(outputCodexUse).toContain('- 配置: codex-prod (codex)')
    expect(outputCodexUse).toContain('平台摘要:')
    expect(outputCodexUse).toContain('  - 组成文件: C:/Users/test/.codex/config.toml, C:/Users/test/.codex/auth.json')
    expect(outputCodexUse).toContain('  - 自定义 use Codex 双文件摘要。')
    expect(outputCodexUse).toContain('  - 自定义 use Codex 成组写入提示。')
  })

  it('渲染 use 结果时会为 Claude local success 输出最高优先级作用域摘要', () => {
    expect(outputClaudeUse).toContain('[use] 成功')
    expect(outputClaudeUse).toContain('- 配置: claude-prod (claude)')
    expect(outputClaudeUse).toContain('平台摘要:')
    expect(outputClaudeUse).toContain('  - 当前生效作用域: local scope')
    expect(outputClaudeUse).toContain('  - 自定义 use Claude precedence 摘要。')
    expect(outputClaudeUse).toContain('  - 自定义 use Claude local 提示。')
  })

  it('use 无变化时显示未创建备份与无变更文件', () => {
    expect(outputUseNoChanges).toContain('  备份ID: 未创建')
    expect(outputUseNoChanges).toContain('  无变更: 是')
    expect(outputUseNoChanges).toContain('  已变更文件: 无')
  })

  it('渲染 rollback 结果时输出备份、恢复文件与限制说明', () => {
    expect(outputRollback).toContain('[rollback] 成功')
    expect(outputRollback).toContain('按平台汇总:')
    expect(outputRollback).toContain('  - gemini: profiles=1, scope=project, warnings=1, limitations=1, restoredFiles=1, noChanges=no')
    expect(outputRollback).toContain('    - rollback 汇总 Gemini precedence 摘要。')
    expect(outputRollback).toContain('referenceStats 摘要:')
    expect(outputRollback).toContain('  - profiles=1, reference=0, inline=1, writeUnsupported=0')
    expect(outputRollback).toContain('executabilityStats 摘要:')
    expect(outputRollback).toContain('  - profiles=1, inlineReady=1, referenceReady=0, referenceMissing=0, writeUnsupported=0, sourceRedacted=0')
    expect(outputRollback).toContain('- 备份ID: snapshot-gemini-001')
    expect(outputRollback).toContain('  已恢复文件:')
    expect(outputRollback).toContain('  - C:/Users/test/.gemini/settings.json')
    expect(outputRollback).toContain('作用域策略:')
    expect(outputRollback).toContain('  - 默认目标: user scope')
    expect(outputRollback).toContain('  - 显式指定: 是')
    expect(outputRollback).toContain('  - 请求作用域: project scope')
    expect(outputRollback).toContain('  - 实际目标: project scope')
    expect(outputRollback).toContain('  - 高风险: 是')
    expect(outputRollback).toContain('  - 回滚约束: 必须匹配快照 scope')
    expect(outputRollback).toContain('作用域能力:')
    expect(outputRollback).toContain('  - system-defaults: detect/current=yes, preview/effective=yes, use/write=no, rollback=no, risk=normal')
    expect(outputRollback).toContain('  作用域可用性:')
    expect(outputRollback).toContain('  - project: status=unresolved, detected=no, writable=no')
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

  it('渲染 rollback 结果时会为 Gemini project success 输出 scope 匹配约束摘要', () => {
    expect(outputRollback).toContain('平台摘要:')
    expect(outputRollback).toContain('  - 当前生效作用域: project scope')
    expect(outputRollback).toContain('  - 自定义 rollback Gemini project 摘要。')
    expect(outputRollback).toContain('  - 自定义 rollback Gemini scope 匹配提示。')
  })

  it('渲染 rollback 结果时会为 Codex success 输出双文件恢复摘要', () => {
    expect(outputCodexRollback).toContain('[rollback] 成功')
    expect(outputCodexRollback).toContain('- 备份ID: snapshot-codex-001')
    expect(outputCodexRollback).toContain('平台摘要:')
    expect(outputCodexRollback).toContain('  - 组成文件: C:/Users/test/.codex/config.toml, C:/Users/test/.codex/auth.json')
    expect(outputCodexRollback).toContain('  - 自定义 rollback Codex 双文件摘要。')
    expect(outputCodexRollback).toContain('  - 自定义 rollback Codex 成组恢复提示。')
  })

  it('渲染 rollback 结果时会为 Claude local success 输出 local 恢复语义摘要', () => {
    expect(outputClaudeRollback).toContain('[rollback] 成功')
    expect(outputClaudeRollback).toContain('- 备份ID: snapshot-claude-001')
    expect(outputClaudeRollback).toContain('平台摘要:')
    expect(outputClaudeRollback).toContain('  - 当前生效作用域: local scope')
    expect(outputClaudeRollback).toContain('  - 自定义 rollback Claude precedence 摘要。')
    expect(outputClaudeRollback).toContain('  - 自定义 rollback Claude local 提示。')
  })

  it('rollback 无恢复文件时输出无', () => {
    expect(outputRollbackEmpty).toContain('- 备份ID: snapshot-gemini-002')
    expect(outputRollbackEmpty).toContain('  已恢复文件: 无')
  })

  it('rollback 成功文本先读 summary 聚合，再进入恢复细节', () => {
    expectOrderedSections(outputRollback, ['按平台汇总:', 'referenceStats 摘要:', 'executabilityStats 摘要:', '- 备份ID: snapshot-gemini-001'])
  })

  it('渲染 validate 结果时输出 explainable 校验细节与平台限制', () => {
    expect(outputValidate).toContain('[validate] 成功')
    expect(outputValidate).toContain('- gemini-prod (gemini)')
    expect(outputValidate).toContain('按平台汇总:')
    expect(outputValidate).toContain('  - gemini: profiles=1, ok=0, warnings=1, limitations=1')
    expect(outputValidate).toContain('    - validate 汇总 Gemini precedence 摘要。')
    expect(outputValidate).toContain('referenceStats 摘要:')
    expect(outputValidate).toContain('  - profiles=1, reference=0, inline=1, writeUnsupported=0')
    expect(outputValidate).toContain('  - hasReferenceProfiles=no, hasInlineProfiles=yes, hasWriteUnsupportedProfiles=no')
    expect(outputValidate).toContain('  - 提示: 当前仍有 inline profiles，可优先迁移到 secret reference。')
    expect(outputValidate).toContain('executabilityStats 摘要:')
    expect(outputValidate).toContain('  - profiles=1, inlineReady=1, referenceReady=0, referenceMissing=0, writeUnsupported=0, sourceRedacted=0')
    expect(outputValidate).toContain('  - hasInlineReadyProfiles=yes, hasReferenceReadyProfiles=no, hasReferenceMissingProfiles=no, hasWriteUnsupportedProfiles=no, hasSourceRedactedProfiles=no')
    expect(outputValidate).toContain('  reference 摘要:')
    expect(outputValidate).toContain('  - hasReferenceFields=no, hasInlineSecrets=yes, writeUnsupported=no')
    expect(outputValidate).toContain('  校验结果: 失败')
    expect(outputValidate).toContain('  错误: 缺少 GEMINI_API_KEY')
    expect(outputValidate).toContain('  警告: Gemini base URL 当前未确认支持。')
    expect(outputValidate).toContain('  限制: Gemini API key 仍需通过环境变量生效。')
    expect(outputValidate).toContain('  作用域能力:')
    expect(outputValidate).toContain('  - system-defaults: detect/current=yes, preview/effective=yes, use/write=no, rollback=no, risk=normal')
    expect(outputValidate).toContain('  - project: detect/current=yes, preview/effective=yes, use/write=yes, rollback=yes, risk=high, requires --force')
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
    expect(outputValidate).toContain('附加提示:')
    expect(outputValidate).toContain('  - Gemini base URL 当前未确认支持。')
    expect(outputValidate).toContain('  - Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(outputValidate).toContain('限制说明:')
    expect(outputValidate).toContain('  - Gemini API key 仍需通过环境变量生效。')
  })

  it('validate 会渲染 validation 自身的 limitations', () => {
    expect(outputValidateItemLimitations).toContain('  限制: 当前按目标作用域写入 Claude 配置文件。')
  })

  it('空 validate 结果返回空正文', () => {
    expect(outputEmptyValidate).toBe('[validate] 成功\n')
  })

  it('validate 文本 summary 顺序与 summarySections 对齐', () => {
    expectOrderedSections(outputValidate, ['按平台汇总:', 'referenceStats 摘要:', 'executabilityStats 摘要:'])
  })

  it('渲染 export 结果时输出名称与校验摘要说明', () => {
    expect(outputExport).toContain('[export] 成功')
    expect(outputExport).toContain('按平台汇总:')
    expect(outputExport).toContain('  - claude: profiles=1, ok=1, warnings=1, limitations=1')
    expect(outputExport).toContain('    - export 汇总 Claude precedence 摘要。')
    expect(outputExport).toContain('referenceStats 摘要:')
    expect(outputExport).toContain('  - profiles=1, reference=0, inline=1, writeUnsupported=0')
    expect(outputExport).toContain('  - hasReferenceProfiles=no, hasInlineProfiles=yes, hasWriteUnsupportedProfiles=no')
    expect(outputExport).toContain('  - 提示: 当前仍有 inline profiles，可优先迁移到 secret reference。')
    expect(outputExport).toContain('executabilityStats 摘要:')
    expect(outputExport).toContain('  - profiles=1, inlineReady=1, referenceReady=0, referenceMissing=0, writeUnsupported=0, sourceRedacted=0')
    expect(outputExport).toContain('  - hasInlineReadyProfiles=yes, hasReferenceReadyProfiles=no, hasReferenceMissingProfiles=no, hasWriteUnsupportedProfiles=no, hasSourceRedactedProfiles=no')
    expect(outputExport).toContain('secret 导出策略:')
    expect(outputExport).toContain('  - mode=redacted-by-default')
    expect(outputExport).toContain('  - inline secrets: redacted=2, exported=0')
    expect(outputExport).toContain('  - reference secrets: preserved=0')
    expect(outputExport).toContain('- claude-prod (claude)')
    expect(outputExport).toContain('  reference 摘要:')
    expect(outputExport).toContain('  - hasReferenceFields=no, hasInlineSecrets=yes, writeUnsupported=no')
    expect(outputExport).toContain('  secret 导出摘要:')
    expect(outputExport).toContain('  - hasInlineSecrets=yes, hasRedactedInlineSecrets=yes, hasReferenceSecrets=no')
    expect(outputExport).toContain('  - redacted=2, referencePreserved=0')
    expect(outputExport).toContain('  - inline secrets 已脱敏导出:')
    expect(outputExport).toContain('    - source.token')
    expect(outputExport).toContain('    - apply.ANTHROPIC_AUTH_TOKEN')
    expect(outputExport).toContain('  名称: Claude 生产')
    expect(outputExport).toContain('  默认写入作用域: user scope')
    expect(outputExport).toContain('  作用域能力:')
    expect(outputExport).toContain('  - local: detect/current=yes, preview/effective=yes, use/write=yes, rollback=yes, risk=normal')
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
    expect(outputExport).toContain('附加提示:')
    expect(outputExport).toContain('  - Claude 当前项目级配置会覆盖用户级同名字段。')
    expect(outputExport).toContain('限制说明:')
    expect(outputExport).toContain('  - 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
  })

  it('渲染 import preview 结果时明确区分导出观察与当前本地观察', () => {
    expect(outputImportPreview).toContain('[import] 成功')
    expect(outputImportPreview).toContain('导入文件: E:/tmp/export.json')
    expect(outputImportPreview).toContain('源兼容性: schema-version-missing')
    expect(outputImportPreview).toContain('  - 导入文件未声明 schemaVersion，当前按兼容模式解析。')
    expect(outputImportPreview).toContain('汇总: total=1, match=0, mismatch=1, partial=0, insufficient-data=0')
    expect(outputImportPreview).toContain('导入源可执行性:')
    expect(outputImportPreview).toContain('  - total=1, apply-ready=1, preview-only=0, blocked=0')
    expect(outputImportPreview).toContain('  - REDACTED_INLINE_SECRET: total=0')
    expect(outputImportPreview).toContain('executabilityStats 摘要:')
    expect(outputImportPreview).toContain('  - profiles=1, inlineReady=0, referenceReady=0, referenceMissing=0, writeUnsupported=0, sourceRedacted=0')
    expect(outputImportPreview).toContain('  - hasInlineReadyProfiles=no, hasReferenceReadyProfiles=no, hasReferenceMissingProfiles=no, hasWriteUnsupportedProfiles=no, hasSourceRedactedProfiles=no')
    expect(outputImportPreview).toContain('按平台汇总:')
    expect(outputImportPreview).toContain('  - gemini: total=1, match=0, mismatch=1, partial=0, insufficient-data=0')
    expect(outputImportPreview).toContain('决策代码汇总:')
    expect(outputImportPreview).toContain('  - BLOCKED_BY_FIDELITY_MISMATCH: total=1, blocking=1, non-blocking=0')
    expect(outputImportPreview).toContain('  - REQUIRES_LOCAL_SCOPE_RESOLUTION: total=1, blocking=1, non-blocking=0')
    expect(outputImportPreview).toContain('Drift 类型汇总:')
    expect(outputImportPreview).toContain('  - availability-drift: total=1, blocking=1, warning=0, info=0')
    expect(outputImportPreview).toContain('- 配置: gemini-prod (gemini)')
    expect(outputImportPreview).toContain('  导出时观察:')
    expect(outputImportPreview).toContain('    默认写入作用域: user scope')
    expect(outputImportPreview).toContain('    导出观测时间: 2026-04-16T00:00:00.000Z')
    expect(outputImportPreview).toContain('    作用域可用性:')
    expect(outputImportPreview).toContain('    - project: status=available, detected=yes, writable=yes')
    expect(outputImportPreview).toContain('  当前本地观察:')
    expect(outputImportPreview).toContain('    默认写入作用域: user scope')
    expect(outputImportPreview).toContain('    - project: status=unresolved, detected=no, writable=no')
    expect(outputImportPreview).toContain('  Fidelity: mismatch')
    expect(outputImportPreview).toContain('  Drift 汇总: blocking=1, warning=0, info=0')
    expect(outputImportPreview).toContain('  Drift 分组: availability-drift, total=1, blocking=1, warning=0, info=0')
    expect(outputImportPreview).toContain('  Highlight: 当前本地 scope availability 与导出观察不一致，应以本地实时环境为准。')
    expect(outputImportPreview).toContain('  - project 作用域的可用性与当前本地环境不一致。')
    expect(outputImportPreview).toContain('    drift=availability-drift, severity=blocking')
    expect(outputImportPreview).toContain('    导出值: {"status":"available","detected":true,"writable":true}')
    expect(outputImportPreview).toContain('    本地值: {"status":"unresolved","detected":false,"writable":false}')
    expect(outputImportPreview).toContain('    建议动作: 先修复本地 project scope 解析，再重新执行 import preview。')
    expect(outputImportPreview).toContain('  决策代码: BLOCKED_BY_FIDELITY_MISMATCH, REQUIRES_LOCAL_SCOPE_RESOLUTION')
    expect(outputImportPreview).toContain('  决策原因: [BLOCKED_BY_FIDELITY_MISMATCH] blocking / 导出观察与当前本地观察存在关键漂移，当前不应继续进入 apply 设计。')
    expect(outputImportPreview).toContain('  决策原因: [REQUIRES_LOCAL_SCOPE_RESOLUTION] blocking / 当前本地 scope 解析未完成，需先修复本地解析结果。')
    expect(outputImportPreview).toContain('  平台摘要:')
    expect(outputImportPreview).toContain('  - 自定义 Gemini precedence 摘要。')
    expect(outputImportPreview).toContain('  - 自定义 Gemini project 覆盖 user 提示。')
    expect(outputImportPreview).toContain('  建议: 先修复本地作用域解析，再考虑进入 apply 设计。')
  })

  it('import preview 文本 summary 顺序与 summarySections 对齐', () => {
    expectOrderedSections(outputImportPreview, ['导入源可执行性:', 'executabilityStats 摘要:', '按平台汇总:'])
  })

  it('渲染 import apply 结果时输出稳定成功字段与 explainable 摘要', () => {
    expect(outputImportApply).toContain('[import-apply] 成功')
    expect(outputImportApply).toContain('按平台汇总:')
    expect(outputImportApply).toContain('  - gemini: profiles=1, profile=gemini-prod, scope=project, warnings=1, limitations=1, changedFiles=1, backup=yes, noChanges=no')
    expect(outputImportApply).toContain('    - import apply 汇总 Gemini precedence 摘要。')
    expect(outputImportApply).toContain('referenceStats 摘要:')
    expect(outputImportApply).toContain('  - profiles=1, reference=0, inline=1, writeUnsupported=0')
    expect(outputImportApply).toContain('executabilityStats 摘要:')
    expect(outputImportApply).toContain('  - profiles=1, inlineReady=1, referenceReady=0, referenceMissing=0, writeUnsupported=0, sourceRedacted=0')
    expect(outputImportApply).toContain('导入文件: E:/tmp/export.json')
    expect(outputImportApply).toContain('导入配置: gemini-prod (gemini)')
    expect(outputImportApply).toContain('应用作用域: project scope')
    expect(outputImportApply).toContain('备份ID: snapshot-import-001')
    expect(outputImportApply).toContain('作用域策略:')
    expect(outputImportApply).toContain('  - 默认目标: user scope')
    expect(outputImportApply).toContain('  - 请求作用域: project scope')
    expect(outputImportApply).toContain('  - 实际目标: project scope')
    expect(outputImportApply).toContain('  - 风险原因: Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。')
    expect(outputImportApply).toContain('  作用域能力:')
    expect(outputImportApply).toContain('  - project: detect/current=yes, preview/effective=yes, use/write=yes, rollback=yes, risk=high, requires --force')
    expect(outputImportApply).toContain('  作用域可用性:')
    expect(outputImportApply).toContain('  - project: status=unresolved, detected=no, writable=no')
    expect(outputImportApply).toContain('  校验结果: 通过')
    expect(outputImportApply).toContain('  风险等级: medium')
    expect(outputImportApply).toContain('  计划备份: 是')
    expect(outputImportApply).toContain('  无变更: 否')
    expect(outputImportApply).toContain('  已变更文件:')
    expect(outputImportApply).toContain('  - C:/Users/test/.gemini/settings.json')
    expect(outputImportApply).toContain('附加提示:')
    expect(outputImportApply).toContain('  - 导入结果采用当前本地 observation，project scope 会覆盖 user 同名字段。')
    expect(outputImportApply).toContain('限制说明:')
    expect(outputImportApply).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('import apply 成功文本先读 summary 聚合，再进入 apply 细节', () => {
    expectOrderedSections(outputImportApply, ['按平台汇总:', 'referenceStats 摘要:', 'executabilityStats 摘要:', '导入配置: gemini-prod (gemini)'])
  })

  it('渲染 import apply 结果时会为 Gemini success 输出 project 回滚约束与目标作用域语义', () => {
    expect(outputImportApply).toContain('平台摘要:')
    expect(outputImportApply).toContain('  - 自定义 Gemini project apply 摘要。')
    expect(outputImportApply).toContain('  - 自定义 Gemini rollback scope 提示。')
  })

  it('渲染 import apply 结果时会为 Codex success 输出双文件事务摘要', () => {
    expect(outputCodexImportApply).toContain('[import-apply] 成功')
    expect(outputCodexImportApply).toContain('导入配置: codex-prod (codex)')
    expect(outputCodexImportApply).not.toContain('应用作用域:')
    expect(outputCodexImportApply).toContain('平台摘要:')
    expect(outputCodexImportApply).toContain('  - 自定义 Codex 双文件摘要。')
    expect(outputCodexImportApply).toContain('  - 自定义 Codex profile-level 提示。')
  })

  it('渲染 import apply 结果时会为 Claude local success 输出最高优先级作用域摘要', () => {
    expect(outputClaudeImportApply).toContain('[import-apply] 成功')
    expect(outputClaudeImportApply).toContain('导入配置: claude-prod (claude)')
    expect(outputClaudeImportApply).toContain('应用作用域: local scope')
    expect(outputClaudeImportApply).toContain('平台摘要:')
    expect(outputClaudeImportApply).toContain('  - 自定义 Claude precedence 摘要。')
    expect(outputClaudeImportApply).toContain('  - 自定义 Claude local 最高优先级提示。')
  })

  it('空 export 结果返回空正文', () => {
    expect(outputEmptyExport).toBe('[export] 成功\n')
  })

  it('export 文本 summary 顺序与 summarySections 对齐', () => {
    expectOrderedSections(outputExport, ['按平台汇总:', 'referenceStats 摘要:', 'executabilityStats 摘要:'])
  })

  it('渲染 add 结果时输出配置、摘要、提示与限制说明', () => {
    expect(outputAdd).toContain('[add] 成功')
    expect(outputAdd).toContain('按平台汇总:')
    expect(outputAdd).toContain('  - claude: profiles=1, profile=claude-prod, warnings=1, limitations=1, changedFiles=1, backup=yes, noChanges=no')
    expect(outputAdd).toContain('    - Claude 支持 user < project < local 三层 precedence。')
    expect(outputAdd).toContain('referenceStats 摘要:')
    expect(outputAdd).toContain('  - profiles=1, reference=0, inline=1, writeUnsupported=0')
    expect(outputAdd).toContain('  - hasReferenceProfiles=no, hasInlineProfiles=yes, hasWriteUnsupportedProfiles=no')
    expect(outputAdd).toContain('  - 提示: 当前仍有 inline profiles，可优先迁移到 secret reference。')
    expect(outputAdd).toContain('executabilityStats 摘要:')
    expect(outputAdd).toContain('  - profiles=1, inlineReady=1, referenceReady=0, referenceMissing=0, writeUnsupported=0, sourceRedacted=0')
    expect(outputAdd).toContain('  - hasInlineReadyProfiles=yes, hasReferenceReadyProfiles=no, hasReferenceMissingProfiles=no, hasWriteUnsupportedProfiles=no, hasSourceRedactedProfiles=no')
    expect(outputAdd).toContain('- 配置: claude-prod (claude)')
    expect(outputAdd).toContain('  名称: Claude 生产')
    expect(outputAdd).toContain('  校验结果: 通过')
    expect(outputAdd).toContain('  风险等级: low')
    expect(outputAdd).toContain('  需要确认: 否')
    expect(outputAdd).toContain('  计划备份: 是')
    expect(outputAdd).toContain('  无变更: 否')
    expect(outputAdd).toContain('  作用域能力:')
    expect(outputAdd).toContain('  - local: detect/current=yes, preview/effective=yes, use/write=yes, rollback=yes, risk=normal')
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

  it('add 文本 summary 顺序与单平台写入命令读取顺序对齐', () => {
    expectOrderedSections(outputAdd, ['按平台汇总:', 'referenceStats 摘要:', 'executabilityStats 摘要:', '- 配置: claude-prod (claude)'])
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
    expect(outputList).toContain('按平台汇总:')
    expect(outputList).toContain('  - claude: profiles=1, current=claude-prod, managed=yes, scope=local')
    expect(outputList).toContain('    - list 汇总 Claude precedence 摘要。')
    expect(outputList).toContain('  - gemini: profiles=1, managed=no, scope=user')
    expect(outputList).toContain('    - list 汇总 Gemini precedence 摘要。')
    expect(outputList).toContain('  - codex: profiles=1, managed=no')
    expect(outputList).toContain('    - list 汇总 Codex 双文件摘要。')
    expect(outputList).toContain('referenceStats 摘要:')
    expect(outputList).toContain('  - profiles=3, reference=1, inline=2, writeUnsupported=1')
    expect(outputList).toContain('  - hasReferenceProfiles=yes, hasInlineProfiles=yes, hasWriteUnsupportedProfiles=yes')
    expect(outputList).toContain('  - 提示: 当前仍有 inline profiles，可优先迁移到 secret reference。')
    expect(outputList).toContain('  - 提示: 当前有 write unsupported profiles，preview/use/import apply 仍不会直接消费 reference-only profiles。')
    expect(outputList).toContain('executabilityStats 摘要:')
    expect(outputList).toContain('  - profiles=3, inlineReady=2, referenceReady=0, referenceMissing=1, writeUnsupported=1, sourceRedacted=0')
    expect(outputList).toContain('  - hasInlineReadyProfiles=yes, hasReferenceReadyProfiles=no, hasReferenceMissingProfiles=yes, hasWriteUnsupportedProfiles=yes, hasSourceRedactedProfiles=no')
    expect(outputList).toContain('  - 提示: 当前存在未解析或不受支持的 reference profiles，后续写入不可直接执行。')
    expect(outputList).toContain('  - 提示: 当前有 write unsupported profiles，现有写入链路仍不会直接消费这些 profiles。')
    expect(outputList).toContain('- claude-prod (claude)')
    expect(outputList).toContain('  reference 摘要:')
    expect(outputList).toContain('  - hasReferenceFields=no, hasInlineSecrets=yes, writeUnsupported=no')
    expect(outputList).toContain('  名称: Claude 生产')
    expect(outputList).toContain('  当前生效: 是')
    expect(outputList).toContain('  健康状态: valid')
    expect(outputList).toContain('  风险等级: low')
    expect(outputList).toContain('  - local: detect/current=yes, preview/effective=yes, use/write=yes, rollback=yes, risk=normal')
    expect(outputList).toContain('- gemini-prod (gemini)')
    expect(outputList).toContain('  名称: Gemini 生产')
    expect(outputList).toContain('  当前生效: 否')
    expect(outputList).toContain('  健康状态: warning')
    expect(outputList).toContain('  风险等级: medium')
    expect(outputList).toContain('  - system-overrides: detect/current=yes, preview/effective=yes, use/write=no, rollback=no, risk=normal')
    expect(outputList).toContain('  - project: detect/current=yes, preview/effective=yes, use/write=yes, rollback=yes, risk=high, requires --force')
    expect(outputList).toContain('  作用域可用性:')
    expect(outputList).toContain('  - project: status=unresolved, detected=no, writable=no')
    expect(outputList).toContain('  - 当前生效作用域: local scope')
    expect(outputList).toContain('  - 自定义 list Claude precedence 摘要。')
    expect(outputList).toContain('  - 自定义 list Claude local 覆盖提示。')
    expect(outputList).toContain('- codex-prod (codex)')
    expect(outputList).toContain('  - hasReferenceFields=yes, hasInlineSecrets=no, writeUnsupported=yes')
    expect(outputList).toContain('    - apply.auth_reference -> vault://codex/prod')
    expect(outputList).toContain('  名称: Codex 生产')
    expect(outputList).toContain('  - 自定义 list Codex 双文件摘要。')
    expect(outputList).toContain('  - 自定义 list Codex profile-level 提示。')
    expect(outputList).toContain('附加提示:')
    expect(outputList).toContain('  - Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(outputList).toContain('  - Codex 当前由 config.toml 与 auth.json 共同组成有效配置。')
    expect(outputList).toContain('限制说明:')
    expect(outputList).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('list 文本 summary 顺序与 summarySections 对齐', () => {
    expectOrderedSections(outputList, ['按平台汇总:', 'referenceStats 摘要:', 'executabilityStats 摘要:'])
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

  it('失败结果输出错误信息与 explainable 摘要', () => {
    expect(outputGenericFailure).toContain('[preview] 失败')
    expect(outputGenericFailure).toContain('配置校验失败')
    expect(outputGenericFailure).toContain('附加提示:')
    expect(outputGenericFailure).toContain('  - 高风险操作需要确认')
    expect(outputGenericFailure).toContain('限制说明:')
    expect(outputGenericFailure).toContain('  - Gemini 最终认证结果仍受环境变量影响。')
  })

  it('确认门槛失败会输出结构化作用域策略', () => {
    expect(outputConfirmationFailure).toContain('[use] 失败')
    expect(outputConfirmationFailure).toContain('当前切换需要确认或 --force。')
    expect(outputConfirmationFailure).toContain('reference 解析摘要:')
    expect(outputConfirmationFailure).toContain('  - 未解析 env 引用:')
    expect(outputConfirmationFailure).toContain('    - source.secret_ref -> env://GEMINI_API_KEY')
    expect(outputConfirmationFailure).toContain('  - 已解析但当前不会写入:')
    expect(outputConfirmationFailure).toContain('    - apply.secondary_auth_reference -> env://GEMINI_SECONDARY_API_KEY')
    expect(outputConfirmationFailure).toContain('  - 不支持的引用 scheme:')
    expect(outputConfirmationFailure).toContain('    - apply.auth_reference -> vault://gemini/prod')
    expect(outputConfirmationFailure).toContain('作用域策略:')
    expect(outputConfirmationFailure).toContain('  - 默认目标: user scope')
    expect(outputConfirmationFailure).toContain('  - 显式指定: 是')
    expect(outputConfirmationFailure).toContain('  - 请求作用域: project scope')
    expect(outputConfirmationFailure).toContain('  - 实际目标: project scope')
    expect(outputConfirmationFailure).toContain('  - 高风险: 是')
    expect(outputConfirmationFailure).toContain('  - 风险原因: Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。')
    expect(outputConfirmationFailure).toContain('  - 回滚约束: 必须匹配快照 scope')
    expect(outputConfirmationFailure).toContain('作用域能力:')
    expect(outputConfirmationFailure).toContain('  - project: detect/current=yes, preview/effective=yes, use/write=yes, rollback=yes, risk=high, requires --force')
    expect(outputConfirmationFailure).toContain('作用域可用性:')
    expect(outputConfirmationFailure).toContain('  - project: status=unresolved, detected=no, writable=no')
  })

  it('use confirmation 失败会为 Gemini project 输出平台风险摘要', () => {
    expect(outputConfirmationFailure).toContain('平台摘要:')
    expect(outputConfirmationFailure).toContain('  - Gemini project scope 会覆盖 user 的同名字段。')
    expect(outputConfirmationFailure).toContain('  - 当前操作要求先确认高风险 project scope 写入。')
  })

  it('use confirmation 失败会为 Codex 输出双文件事务失败摘要', () => {
    expect(outputCodexConfirmationFailure).toContain('[use] 失败')
    expect(outputCodexConfirmationFailure).toContain('Codex 切换需要确认。将同时写入 config.toml 与 auth.json。')
    expect(outputCodexConfirmationFailure).toContain('平台摘要:')
    expect(outputCodexConfirmationFailure).toContain('  - Codex 当前会成组写入 config.toml 与 auth.json。')
    expect(outputCodexConfirmationFailure).toContain('  - 任一文件失败都不应被理解为单文件独立成功。')
  })

  it('rollback 失败会为 Claude local 输出恢复语义摘要', () => {
    expect(outputClaudeRollbackFailure).toContain('[rollback] 失败')
    expect(outputClaudeRollbackFailure).toContain('Claude local scope 快照恢复失败。')
    expect(outputClaudeRollbackFailure).toContain('平台摘要:')
    expect(outputClaudeRollbackFailure).toContain('  - Claude 当前恢复目标是 local scope。')
    expect(outputClaudeRollbackFailure).toContain('  - local 恢复失败后，当前项目不会获得这层预期覆盖。')
  })

  it('import apply not ready 失败会输出 previewDecision 与本地 observation 语境', () => {
    expect(outputImportApplyNotReadyFailure).toContain('[import-apply] 失败')
    expect(outputImportApplyNotReadyFailure).toContain('当前 import preview 结果不允许进入 apply。')
    expect(outputImportApplyNotReadyFailure).toContain('导入文件: E:/tmp/export.json')
    expect(outputImportApplyNotReadyFailure).toContain('导入配置: gemini-prod')
    expect(outputImportApplyNotReadyFailure).toContain('当前本地观察:')
    expect(outputImportApplyNotReadyFailure).toContain('  默认写入作用域: user scope')
    expect(outputImportApplyNotReadyFailure).toContain('  作用域可用性:')
    expect(outputImportApplyNotReadyFailure).toContain('  - project: status=unresolved, detected=no, writable=no')
    expect(outputImportApplyNotReadyFailure).toContain('导出时观察:')
    expect(outputImportApplyNotReadyFailure).toContain('  导出观测时间: 2026-04-16T00:00:00.000Z')
    expect(outputImportApplyNotReadyFailure).toContain('Preview 决策:')
    expect(outputImportApplyNotReadyFailure).toContain('  推荐作用域: project scope')
    expect(outputImportApplyNotReadyFailure).toContain('  可进入 apply 设计: 否')
    expect(outputImportApplyNotReadyFailure).toContain('  需要先修复本地解析: 是')
    expect(outputImportApplyNotReadyFailure).toContain('  决策代码: BLOCKED_BY_FIDELITY_MISMATCH, REQUIRES_LOCAL_SCOPE_RESOLUTION')
    expect(outputImportApplyNotReadyFailure).toContain('  决策原因: [BLOCKED_BY_FIDELITY_MISMATCH] blocking / 导出观察与当前本地观察存在关键漂移，当前不应继续进入 apply 设计。')
    expect(outputImportApplyNotReadyFailure).toContain('  决策原因: [REQUIRES_LOCAL_SCOPE_RESOLUTION] blocking / 当前本地 scope 解析未完成，需先修复本地解析结果。')
    expect(outputImportApplyNotReadyFailure).toContain('Fidelity:')
    expect(outputImportApplyNotReadyFailure).toContain('  状态: mismatch')
    expect(outputImportApplyNotReadyFailure).toContain('  Highlight: 当前本地 scope availability 与导出观察不一致，应以本地实时环境为准。')
    expect(outputImportApplyNotReadyFailure).toContain('  - project 作用域的可用性与当前本地环境不一致。')
    expect(outputImportApplyNotReadyFailure).toContain('    建议动作: 先修复本地 project scope 解析，再重新执行 import preview。')
  })

  it('import apply scope unavailable 失败会先输出作用域策略与可用性，不误导提示 --force', () => {
    expect(outputImportApplyScopeUnavailableFailure).toContain('[import-apply] 失败')
    expect(outputImportApplyScopeUnavailableFailure).toContain('Gemini project scope 不可用：无法解析 project root。')
    expect(outputImportApplyScopeUnavailableFailure).toContain('作用域策略:')
    expect(outputImportApplyScopeUnavailableFailure).toContain('  - 请求作用域: project scope')
    expect(outputImportApplyScopeUnavailableFailure).toContain('  - 实际目标: project scope')
    expect(outputImportApplyScopeUnavailableFailure).toContain('作用域可用性:')
    expect(outputImportApplyScopeUnavailableFailure).toContain('  - project: status=unresolved, detected=no, writable=no')
    expect(outputImportApplyScopeUnavailableFailure).toContain('    原因代码: PROJECT_ROOT_UNRESOLVED')
    expect(outputImportApplyScopeUnavailableFailure).not.toContain('--force')
  })

  it('import apply redacted secret 失败会输出导入源阻断原因与字段列表', () => {
    expect(outputImportApplyRedactedSecretFailure).toContain('[import-apply] 失败')
    expect(outputImportApplyRedactedSecretFailure).toContain('导入文件中的 inline secret 已被 redacted；当前不能直接进入 import apply。')
    expect(outputImportApplyRedactedSecretFailure).toContain('导入文件: E:/tmp/export.json')
    expect(outputImportApplyRedactedSecretFailure).toContain('导入配置: gemini-prod')
    expect(outputImportApplyRedactedSecretFailure).toContain('阻断原因:')
    expect(outputImportApplyRedactedSecretFailure).toContain('  - 导入源中的 inline secret 只有 redacted placeholder，没有可执行明文。')
    expect(outputImportApplyRedactedSecretFailure).toContain('  - 当前 import apply 不会从 redacted export 反推真实 secret。')
    expect(outputImportApplyRedactedSecretFailure).toContain('redacted 字段:')
    expect(outputImportApplyRedactedSecretFailure).toContain('  - source.apiKey')
    expect(outputImportApplyRedactedSecretFailure).toContain('  - apply.GEMINI_API_KEY')
  })

  it('import apply Gemini confirmation 失败会输出 project 风险平台摘要', () => {
    expect(outputImportApplyConfirmationFailure).toContain('[import-apply] 失败')
    expect(outputImportApplyConfirmationFailure).toContain('平台摘要:')
    expect(outputImportApplyConfirmationFailure).toContain('  - Gemini project scope 会覆盖 user 的同名字段。')
    expect(outputImportApplyConfirmationFailure).toContain('  - 当前导入应用要求先确认高风险 project scope 写入。')
  })

  it('import apply Codex confirmation 失败会输出双文件事务平台摘要', () => {
    expect(outputCodexImportApplyConfirmationFailure).toContain('[import-apply] 失败')
    expect(outputCodexImportApplyConfirmationFailure).toContain('Codex 导入应用需要确认。')
    expect(outputCodexImportApplyConfirmationFailure).toContain('平台摘要:')
    expect(outputCodexImportApplyConfirmationFailure).toContain('  - Codex 当前会成组写入 config.toml 与 auth.json。')
    expect(outputCodexImportApplyConfirmationFailure).toContain('  - 任一文件失败都不应被理解为单文件独立成功。')
  })

  it('import apply Claude scope unavailable 失败会输出目标作用域平台摘要', () => {
    expect(outputClaudeImportApplyScopeUnavailableFailure).toContain('[import-apply] 失败')
    expect(outputClaudeImportApplyScopeUnavailableFailure).toContain('Claude local scope 不可用：目标配置文件不可写。')
    expect(outputClaudeImportApplyScopeUnavailableFailure).toContain('平台摘要:')
    expect(outputClaudeImportApplyScopeUnavailableFailure).toContain('  - Claude 当前写入目标是 local scope。')
    expect(outputClaudeImportApplyScopeUnavailableFailure).toContain('  - local scope 不可用时，本次导入不会获得这层预期覆盖。')
  })

  it('import apply confirmation required 失败会输出 risk 与作用域细节', () => {
    expect(outputImportApplyConfirmationFailure).toContain('[import-apply] 失败')
    expect(outputImportApplyConfirmationFailure).toContain('当前导入应用需要确认或 --force。')
    expect(outputImportApplyConfirmationFailure).toContain('风险摘要:')
    expect(outputImportApplyConfirmationFailure).toContain('  - 风险等级: high')
    expect(outputImportApplyConfirmationFailure).toContain('  - 原因: 导入结果采用当前本地 observation，project scope 会覆盖 user 同名字段。')
    expect(outputImportApplyConfirmationFailure).toContain('reference 解析摘要:')
    expect(outputImportApplyConfirmationFailure).toContain('  - 未解析 env 引用:')
    expect(outputImportApplyConfirmationFailure).toContain('    - source.secret_ref -> env://GEMINI_API_KEY')
    expect(outputImportApplyConfirmationFailure).toContain('  - 不支持的引用 scheme:')
    expect(outputImportApplyConfirmationFailure).toContain('    - apply.auth_reference -> keychain://gemini/session-token')
    expect(outputImportApplyConfirmationFailure).toContain('作用域策略:')
    expect(outputImportApplyConfirmationFailure).toContain('  - 请求作用域: project scope')
    expect(outputImportApplyConfirmationFailure).toContain('  - 实际目标: project scope')
    expect(outputImportApplyConfirmationFailure).toContain('作用域可用性:')
    expect(outputImportApplyConfirmationFailure).toContain('  - project: status=available, detected=yes, writable=yes')
    expect(outputImportApplyConfirmationFailure).toContain('限制说明:')
    expect(outputImportApplyConfirmationFailure).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('malformed confirmation details 不会导致 renderer 二次抛错，并优雅降级', () => {
    expect(outputMalformedConfirmationFailure).toContain('[use] 失败')
    expect(outputMalformedConfirmationFailure).toContain('当前切换需要确认或 --force。')
    expect(outputMalformedConfirmationFailure).toContain('附加提示:')
    expect(outputMalformedConfirmationFailure).toContain('  - 仍保留原始 warning。')
    expect(outputMalformedConfirmationFailure).toContain('限制说明:')
    expect(outputMalformedConfirmationFailure).toContain('  - 仍保留原始 limitation。')
    expect(outputMalformedConfirmationFailure).not.toContain('风险摘要:')
    expect(outputMalformedConfirmationFailure).not.toContain('作用域能力:')
    expect(outputMalformedConfirmationFailure).not.toContain('作用域可用性:')
  })

  it('malformed import apply not ready details 不会崩溃，并降级为普通错误文本', () => {
    expect(outputMalformedImportApplyNotReadyFailure).toContain('[import-apply] 失败')
    expect(outputMalformedImportApplyNotReadyFailure).toContain('当前 import preview 结果不允许进入 apply。')
    expect(outputMalformedImportApplyNotReadyFailure).toContain('附加提示:')
    expect(outputMalformedImportApplyNotReadyFailure).toContain('  - 仍保留 import apply warning。')
    expect(outputMalformedImportApplyNotReadyFailure).toContain('限制说明:')
    expect(outputMalformedImportApplyNotReadyFailure).toContain('  - 仍保留 import apply limitation。')
    expect(outputMalformedImportApplyNotReadyFailure).not.toContain('导入文件: E:/tmp/export.json')
    expect(outputMalformedImportApplyNotReadyFailure).not.toContain('Preview 决策:')
    expect(outputMalformedImportApplyNotReadyFailure).not.toContain('当前本地观察:')
  })

  it('malformed import scope unavailable details 会保留可用的 scope policy，并跳过坏数组字段', () => {
    expect(outputMalformedImportApplyScopeUnavailableFailure).toContain('[import-apply] 失败')
    expect(outputMalformedImportApplyScopeUnavailableFailure).toContain('Gemini project scope 不可用：无法解析 project root。')
    expect(outputMalformedImportApplyScopeUnavailableFailure).toContain('作用域策略:')
    expect(outputMalformedImportApplyScopeUnavailableFailure).toContain('  - 请求作用域: project scope')
    expect(outputMalformedImportApplyScopeUnavailableFailure).toContain('附加提示:')
    expect(outputMalformedImportApplyScopeUnavailableFailure).toContain('  - 仍保留 import scope warning。')
    expect(outputMalformedImportApplyScopeUnavailableFailure).not.toContain('作用域能力:')
    expect(outputMalformedImportApplyScopeUnavailableFailure).not.toContain('作用域可用性:')
  })

  it('use 校验失败结果输出 explainable 摘要', () => {
    expect(outputUseValidationFailure).toContain('[use] 失败')
    expect(outputUseValidationFailure).toContain('配置校验失败')
    expect(outputUseValidationFailure).toContain('附加提示:')
    expect(outputUseValidationFailure).toContain('  - Gemini 首版仅稳定支持 enforcedAuthType = gemini-api-key。')
    expect(outputUseValidationFailure).toContain('限制说明:')
    expect(outputUseValidationFailure).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
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
    expect(outputValidateFailureWithData).toContain('附加提示:')
    expect(outputValidateFailureWithData).toContain('  - Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(outputValidateFailureWithData).toContain('限制说明:')
    expect(outputValidateFailureWithData).toContain('  - Gemini API key 仍需通过环境变量生效。')
  })
})
