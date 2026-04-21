export const currentCommandOutputFixture = {
  current: {
    gemini: 'gemini-prod',
    codex: 'codex-prod',
  },
  detections: [
    {
      platform: 'gemini',
      managed: true,
      matchedProfileId: 'gemini-prod',
      referenceSummary: {
        hasReferenceFields: true,
        hasInlineSecrets: false,
        writeUnsupported: true,
        resolvedReferenceCount: 1,
        missingReferenceCount: 0,
        unsupportedReferenceCount: 0,
        missingValueCount: 0,
        referenceDetails: [
          {
            code: 'REFERENCE_ENV_RESOLVED',
            field: 'apply.auth_reference',
            status: 'resolved',
            reference: 'env://GEMINI_API_KEY',
            scheme: 'env',
            message: 'profile.apply.auth_reference 的 env 引用已解析，但当前写入链路仍不会直接消费引用。',
          },
        ],
      },
      currentScope: 'user',
      platformSummary: {
        kind: 'scope-precedence',
        precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
        currentScope: 'user',
        facts: [
          {
            code: 'GEMINI_SCOPE_PRECEDENCE',
            message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。',
          },
          {
            code: 'GEMINI_PROJECT_OVERRIDES_USER',
            message: 'project scope 会覆盖 user 中的同名字段。',
          },
        ],
      },
      targetFiles: [
        {
          path: 'C:/Users/test/.gemini/settings.json',
          scope: 'user',
        },
      ],
      scopeCapabilities: [
        {
          scope: 'user',
          detect: true,
          preview: true,
          use: true,
          rollback: true,
          writable: true,
          risk: 'normal',
        },
      ],
      scopeAvailability: [
        {
          scope: 'user',
          status: 'available',
          detected: true,
          writable: true,
          path: 'C:/Users/test/.gemini/settings.json',
        },
      ],
    },
    {
      platform: 'codex',
      managed: true,
      matchedProfileId: 'codex-prod',
      platformSummary: {
        kind: 'multi-file-composition',
        composedFiles: [
          'C:/Users/test/.codex/config.toml',
          'C:/Users/test/.codex/auth.json',
        ],
        facts: [
          {
            code: 'CODEX_MULTI_FILE_CONFIGURATION',
            message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。',
          },
          {
            code: 'CODEX_CURRENT_REQUIRES_BOTH_FILES',
            message: 'current 检测不能把单个文件视为完整状态。',
          },
        ],
      },
      targetFiles: [
        {
          path: 'C:/Users/test/.codex/config.toml',
          role: 'config',
        },
        {
          path: 'C:/Users/test/.codex/auth.json',
          role: 'auth',
        },
      ],
    },
  ],
  summary: {
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
            {
              code: 'GEMINI_SCOPE_PRECEDENCE',
              message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。',
            },
            {
              code: 'GEMINI_PROJECT_OVERRIDES_USER',
              message: 'project scope 会覆盖 user 中的同名字段。',
            },
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
          composedFiles: [
            'C:/Users/test/.codex/config.toml',
            'C:/Users/test/.codex/auth.json',
          ],
          facts: [
            {
              code: 'CODEX_MULTI_FILE_CONFIGURATION',
              message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。',
            },
            {
              code: 'CODEX_CURRENT_REQUIRES_BOTH_FILES',
              message: 'current 检测不能把单个文件视为完整状态。',
            },
          ],
        },
      },
    ],
    warnings: [],
    limitations: [],
  },
} as const

export const listCommandOutputFixture = {
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
          {
            code: 'CLAUDE_SCOPE_PRECEDENCE',
            message: 'Claude 支持 user < project < local 三层 precedence。',
          },
          {
            code: 'CLAUDE_LOCAL_SCOPE_HIGHEST',
            message: '如果存在 local，同名字段最终以 local 为准。',
          },
        ],
      },
      scopeCapabilities: [
        {
          scope: 'local',
          detect: true,
          preview: true,
          use: true,
          rollback: true,
          writable: true,
          risk: 'high',
          confirmationRequired: true,
        },
      ],
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
      healthStatus: 'unknown',
      riskLevel: 'low',
      platformSummary: {
        kind: 'multi-file-composition',
        composedFiles: [],
        facts: [
          {
            code: 'CODEX_MULTI_FILE_CONFIGURATION',
            message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。',
          },
          {
            code: 'CODEX_LIST_IS_PROFILE_LEVEL',
            message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。',
          },
        ],
      },
    },
  ],
  summary: {
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
            {
              code: 'CLAUDE_SCOPE_PRECEDENCE',
              message: 'Claude 支持 user < project < local 三层 precedence。',
            },
            {
              code: 'CLAUDE_LOCAL_SCOPE_HIGHEST',
              message: '如果存在 local，同名字段最终以 local 为准。',
            },
          ],
        },
      },
      {
        platform: 'codex',
        profileCount: 1,
        managed: false,
        platformSummary: {
          kind: 'multi-file-composition',
          composedFiles: [],
          facts: [
            {
              code: 'CODEX_MULTI_FILE_CONFIGURATION',
              message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。',
            },
            {
              code: 'CODEX_LIST_IS_PROFILE_LEVEL',
              message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。',
            },
          ],
        },
      },
    ],
    warnings: [],
    limitations: [],
  },
} as const

export const validateCommandOutputFixture = {
  items: [
    {
      profileId: 'gemini-prod',
      platform: 'gemini',
      platformSummary: {
        kind: 'scope-precedence',
        precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
        facts: [
          {
            code: 'GEMINI_SCOPE_PRECEDENCE',
            message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。',
          },
          {
            code: 'GEMINI_PROJECT_OVERRIDES_USER',
            message: 'project scope 会覆盖 user 中的同名字段。',
          },
        ],
      },
      validation: {
        ok: true,
        errors: [],
        warnings: [],
        limitations: [],
      },
      referenceSummary: {
        hasReferenceFields: true,
        hasInlineSecrets: false,
        writeUnsupported: true,
        resolvedReferenceCount: 0,
        missingReferenceCount: 1,
        unsupportedReferenceCount: 0,
        missingValueCount: 0,
        referenceDetails: [
          {
            code: 'REFERENCE_ENV_UNRESOLVED',
            field: 'source.secret_ref',
            status: 'missing',
            reference: 'env://GEMINI_API_KEY',
            scheme: 'env',
            message: 'profile.source.secret_ref 的 env 引用当前不可解析。',
          },
        ],
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
    },
  ],
  summary: {
    platformStats: [
      {
        platform: 'gemini',
        profileCount: 1,
        okCount: 1,
        warningCount: 0,
        limitationCount: 0,
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          facts: [
            {
              code: 'GEMINI_SCOPE_PRECEDENCE',
              message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。',
            },
            {
              code: 'GEMINI_PROJECT_OVERRIDES_USER',
              message: 'project scope 会覆盖 user 中的同名字段。',
            },
          ],
        },
      },
    ],
    warnings: [],
    limitations: [],
  },
} as const

export const exportCommandOutputFixture = {
  profiles: [
    {
      profile: {
        id: 'codex-prod',
        name: 'Codex 生产',
        platform: 'codex',
        source: {},
        apply: {},
      },
      platformSummary: {
        kind: 'multi-file-composition',
        composedFiles: [],
        facts: [
          {
            code: 'CODEX_MULTI_FILE_CONFIGURATION',
            message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。',
          },
          {
            code: 'CODEX_LIST_IS_PROFILE_LEVEL',
            message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。',
          },
        ],
      },
      validation: {
        ok: true,
        errors: [],
        warnings: [],
        limitations: [],
      },
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
    },
  ],
  summary: {
    platformStats: [
      {
        platform: 'codex',
        profileCount: 1,
        okCount: 1,
        warningCount: 0,
        limitationCount: 0,
        platformSummary: {
          kind: 'multi-file-composition',
          composedFiles: [],
          facts: [
            {
              code: 'CODEX_MULTI_FILE_CONFIGURATION',
              message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。',
            },
            {
              code: 'CODEX_LIST_IS_PROFILE_LEVEL',
              message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。',
            },
          ],
        },
      },
    ],
    warnings: [],
    limitations: [],
  },
} as const
