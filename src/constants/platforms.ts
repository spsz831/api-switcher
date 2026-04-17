import type { PlatformCapabilities } from '../types/capabilities'
import type { PlatformName } from '../types/platform'

export const SUPPORTED_PLATFORMS: PlatformName[] = ['claude', 'codex', 'gemini']

export const DEFAULT_CAPABILITIES: Record<PlatformName, PlatformCapabilities> = {
  claude: {
    supportsMultiFileWrite: false,
    supportsRollback: true,
    supportsCurrentDetection: true,
    supportsPartialMerge: true,
    scopePolicy: {
      scopeCapabilities: [
        { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
        { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true },
        { scope: 'local', detect: true, preview: true, use: true, rollback: true, writable: true },
      ],
      defaultScope: 'user',
      envDefaultScopeVar: 'API_SWITCHER_CLAUDE_TARGET_SCOPE',
      invalidScopeMessage: 'Claude 当前仅支持 user/project/local scope。',
      rollbackRequiresScopeMatch: false,
    },
    scopeExplainable: {
      current: {
        detectionScopes: ['user', 'project', 'local'],
        precedence: ['user', 'project', 'local'],
        writeLabel: '默认写入目标',
        writePolicy: '未显式传入 --scope 时，先读取 API_SWITCHER_CLAUDE_TARGET_SCOPE，再回落到 user',
      },
      preview: {
        precedence: ['user', 'project', 'local'],
        perspective: '先按 Claude 多层 scope 合并 current/effective，再评估本次写入',
        relationships: {
          project: 'project scope 高于 user scope，但仍低于 local scope',
          local: 'local scope 高于 project 与 user，会覆盖两者中的同名字段',
        },
        reminders: {
          project: '如果 local scope 存在同名字段，project 写入后仍可能不会成为最终生效值',
          local: 'local 已是 Claude 最高优先级 scope，本次写入会直接成为最终生效值',
        },
        defaultRelationship: 'user scope 低于 project 与 local，同名字段可能继续被更高优先级覆盖',
        defaultReminder: '如果 project 或 local scope 存在同名字段，user 写入后仍可能不会成为最终生效值',
      },
    },
  },
  codex: {
    supportsMultiFileWrite: true,
    supportsRollback: true,
    supportsCurrentDetection: false,
    supportsPartialMerge: false,
  },
  gemini: {
    supportsMultiFileWrite: false,
    supportsRollback: true,
    supportsCurrentDetection: false,
    supportsPartialMerge: true,
    scopePolicy: {
      scopeCapabilities: [
        {
          scope: 'system-defaults',
          detect: true,
          preview: true,
          use: false,
          rollback: false,
          writable: false,
          note: '只参与 Gemini effective config 检测与 precedence 推导，不允许写入或回滚。',
        },
        { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
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
          note: '只参与 Gemini effective config 检测与 precedence 推导，不允许写入或回滚。',
        },
      ],
      defaultScope: 'user',
      invalidScopeMessage: 'Gemini 当前仅支持写入 user/project scope；system-defaults/system-overrides 仅用于检测。',
      highRiskScopes: ['project'],
      writeWarnings: {
        project: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
      },
      rollbackRequiresScopeMatch: true,
    },
    scopeExplainable: {
      current: {
        detectionScopes: ['system-defaults', 'user', 'project', 'system-overrides'],
        precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
        writeLabel: '当前写入策略',
        writePolicy: 'api-switcher 当前仅写入 user scope',
      },
      preview: {
        precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
        perspective: '先按四层 precedence 推导 current/effective，再评估本次写入',
        relationships: {
          project: 'project scope 高于 user scope，会覆盖 user 中的同名字段',
        },
        reminders: {
          project: 'system-overrides 仍高于 project，存在同名字段时 project 写入后仍可能不会成为最终生效值',
        },
        defaultRelationship: 'user scope 低于 project 与 system-overrides，同名字段可能继续被更高优先级覆盖',
        defaultReminder: '如果 project 或 system-overrides 存在同名字段，user 写入后仍可能不会成为最终生效值',
      },
    },
  },
}
