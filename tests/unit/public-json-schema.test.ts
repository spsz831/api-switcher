import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { PreviewResult, ValidationResult } from '../../src/types/adapter'
import type { PlatformScopeCapability, ScopeAvailability } from '../../src/types/capabilities'
import type {
  CurrentCommandOutput,
  ImportApplyCommandOutput,
  ImportApplyNotReadyDetails,
  ImportApplySourceDetails,
  ImportFidelityReport,
  ImportObservation,
  ImportPreviewDecision,
  ListCommandOutput,
} from '../../src/types/command'
import { COMMAND_ACTIONS } from '../../src/types/command'
import type { Profile } from '../../src/types/profile'
import type { SnapshotScopePolicy } from '../../src/types/snapshot'

type JsonSchema = {
  properties?: Record<string, unknown>
  required?: string[]
  $defs?: Record<string, JsonSchema>
  allOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  anyOf?: JsonSchema[]
  if?: JsonSchema
  then?: JsonSchema
  else?: JsonSchema
  const?: unknown
  enum?: unknown[]
  type?: string
  items?: JsonSchema
  additionalProperties?: boolean
  $ref?: string
}

type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K
}[keyof T]

const schemaPath = path.resolve(__dirname, '../../docs/public-json-output.schema.json')
const publicJsonSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as JsonSchema

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveRef(root: JsonSchema, ref: string): JsonSchema {
  if (!ref.startsWith('#/')) {
    throw new Error(`unsupported ref: ${ref}`)
  }

  const parts = ref.slice(2).split('/')
  let cursor: unknown = root
  for (const part of parts) {
    if (!isRecord(cursor) || !(part in cursor)) {
      throw new Error(`invalid ref path: ${ref}`)
    }
    cursor = cursor[part]
  }

  if (!isRecord(cursor)) {
    throw new Error(`ref target is not schema object: ${ref}`)
  }

  return cursor as JsonSchema
}

function validateSchema(schema: JsonSchema, value: unknown, root: JsonSchema): boolean {
  if (schema.$ref) {
    return validateSchema(resolveRef(root, schema.$ref), value, root)
  }

  if (schema.allOf && !schema.allOf.every((branch) => validateSchema(branch, value, root))) {
    return false
  }

  if (schema.oneOf) {
    const matchCount = schema.oneOf.filter((branch) => validateSchema(branch, value, root)).length
    if (matchCount !== 1) {
      return false
    }
  }

  if (schema.anyOf && !schema.anyOf.some((branch) => validateSchema(branch, value, root))) {
    return false
  }

  if (schema.if) {
    const conditionMatched = validateSchema(schema.if, value, root)
    if (conditionMatched && schema.then && !validateSchema(schema.then, value, root)) {
      return false
    }
    if (!conditionMatched && schema.else && !validateSchema(schema.else, value, root)) {
      return false
    }
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const') && value !== schema.const) {
    return false
  }

  if (schema.enum && !schema.enum.some((item) => item === value)) {
    return false
  }

  if (schema.type) {
    if (schema.type === 'object' && !isRecord(value)) {
      return false
    }
    if (schema.type === 'array' && !Array.isArray(value)) {
      return false
    }
    if (schema.type === 'string' && typeof value !== 'string') {
      return false
    }
    if (schema.type === 'boolean' && typeof value !== 'boolean') {
      return false
    }
    if (schema.type === 'integer' && (!Number.isInteger(value) || typeof value !== 'number')) {
      return false
    }
  }

  if (isRecord(value)) {
    if (schema.required && !schema.required.every((key) => Object.prototype.hasOwnProperty.call(value, key))) {
      return false
    }

    if (schema.properties) {
      for (const [key, childSchema] of Object.entries(schema.properties)) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) {
          continue
        }
        if (!isRecord(childSchema)) {
          continue
        }
        if (!validateSchema(childSchema as JsonSchema, value[key], root)) {
          return false
        }
      }
    }

    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties))
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          return false
        }
      }
    }
  }

  if (Array.isArray(value) && schema.items && !value.every((item) => validateSchema(schema.items as JsonSchema, item, root))) {
    return false
  }

  return true
}

function validatePublicSchema(value: unknown): boolean {
  return validateSchema(publicJsonSchema, value, publicJsonSchema)
}

function validatePublicSchemaDef(defName: string, value: unknown): boolean {
  const def = publicJsonSchema.$defs?.[defName]
  if (!def) {
    throw new Error(`missing schema def: ${defName}`)
  }

  return validateSchema(def, value, publicJsonSchema)
}

describe('public JSON contract types', () => {
  it('公开 action 列表包含 import-apply', () => {
    expect(COMMAND_ACTIONS).toContain('import-apply')
  })

  it('用类型断言定义 ImportApplyCommandOutput 的最小公共 contract', () => {
    expectTypeOf<ImportApplyCommandOutput>().toMatchTypeOf<{
      sourceFile: string
      importedProfile: Profile
      appliedScope?: string
      scopePolicy: SnapshotScopePolicy
      scopeCapabilities: PlatformScopeCapability[]
      scopeAvailability?: ScopeAvailability[]
      validation: ValidationResult
      preview: PreviewResult
      backupId: string
    }>()

    expectTypeOf<Extract<
      'sourceFile' | 'importedProfile' | 'scopePolicy' | 'backupId',
      RequiredKeys<ImportApplyCommandOutput>
    >>().toEqualTypeOf<'sourceFile' | 'importedProfile' | 'scopePolicy' | 'backupId'>()
  })

  it('暴露 import apply 最小 error detail shapes', () => {
    expectTypeOf<ImportApplySourceDetails>().toMatchTypeOf<{
      sourceFile: string
      profileId?: string
    }>()

    expectTypeOf<ImportApplyNotReadyDetails>().toMatchTypeOf<{
      sourceFile: string
      profileId: string
      previewDecision: ImportPreviewDecision
      fidelity?: ImportFidelityReport
      localObservation?: ImportObservation
      exportedObservation?: ImportObservation
    }>()
  })

  it('machine-readable schema 覆盖 import-apply action 与 success contract defs', () => {
    expect(publicJsonSchema.properties?.action).toMatchObject({
      type: 'string',
      enum: expect.arrayContaining(['import-apply']),
    })

    expect(publicJsonSchema.$defs?.ImportApplyCommandOutput).toBeDefined()
    expect(publicJsonSchema.$defs?.ImportApplyRiskSummary).toBeDefined()
    expect(publicJsonSchema.$defs?.ImportApplySummary).toBeDefined()

    expect(publicJsonSchema.$defs?.ImportApplyCommandOutput?.required).toEqual(expect.arrayContaining([
      'sourceFile',
      'importedProfile',
      'scopePolicy',
      'scopeCapabilities',
      'validation',
      'preview',
      'risk',
      'backupId',
      'changedFiles',
      'noChanges',
      'summary',
    ]))
  })

  it('machine-readable schema 冻结 import-apply 稳定 failure detail defs', () => {
    expect(publicJsonSchema.$defs?.ImportApplySourceDetails).toBeDefined()
    expect(publicJsonSchema.$defs?.ImportApplySourceDetails?.required).toEqual(expect.arrayContaining([
      'sourceFile',
    ]))

    expect(publicJsonSchema.$defs?.ImportApplyNotReadyDetails).toBeDefined()
    expect(publicJsonSchema.$defs?.ImportApplyNotReadyDetails?.required).toEqual(expect.arrayContaining([
      'sourceFile',
      'profileId',
      'previewDecision',
    ]))

    expect(publicJsonSchema.$defs?.ImportScopeUnavailableDetails).toBeDefined()
    expect(publicJsonSchema.$defs?.ImportScopeUnavailableDetails?.required).toEqual(expect.arrayContaining([
      'resolvedScope',
      'scopePolicy',
      'scopeCapabilities',
      'scopeAvailability',
    ]))
  })

  it('用类型断言定义 current/list platformSummary 的最小公共 contract', () => {
    expectTypeOf<CurrentCommandOutput>().toMatchTypeOf<{
      detections: Array<{
        platformSummary?: {
          kind: 'scope-precedence' | 'multi-file-composition'
          facts: Array<{
            code: string
            message: string
          }>
          precedence?: string[]
          currentScope?: string
          composedFiles?: string[]
        }
      }>
    }>()

    expectTypeOf<ListCommandOutput>().toMatchTypeOf<{
      profiles: Array<{
        platformSummary?: {
          kind: 'scope-precedence' | 'multi-file-composition'
          facts: Array<{
            code: string
            message: string
          }>
          precedence?: string[]
          currentScope?: string
          composedFiles?: string[]
        }
      }>
    }>()
  })

  it('machine-readable schema 覆盖 current/list platformSummary defs', () => {
    expect(publicJsonSchema.$defs?.CurrentCommandOutput).toBeDefined()
    expect(publicJsonSchema.$defs?.CurrentProfileResult?.properties?.platformSummary).toEqual({
      $ref: '#/$defs/PlatformExplainableSummary',
    })

    expect(publicJsonSchema.$defs?.ListCommandOutput).toBeDefined()
    expect(publicJsonSchema.$defs?.ListCommandItem?.properties?.platformSummary).toEqual({
      $ref: '#/$defs/PlatformExplainableSummary',
    })

    expect(publicJsonSchema.$defs?.PlatformExplainableSummary?.required).toEqual(expect.arrayContaining([
      'kind',
      'facts',
    ]))
    expect(publicJsonSchema.$defs?.PlatformExplainableSummary?.properties?.kind).toMatchObject({
      enum: expect.arrayContaining(['scope-precedence', 'multi-file-composition']),
    })
  })

  it('current --json platformSummary 样例能通过 machine-readable schema def 校验', () => {
    const currentOutput = {
      current: {
        gemini: 'gemini-prod',
        codex: 'codex-prod',
      },
      detections: [
        {
          platform: 'gemini',
          managed: true,
          matchedProfileId: 'gemini-prod',
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
        warnings: [],
        limitations: [],
      },
    }

    expect(validatePublicSchemaDef('CurrentCommandOutput', currentOutput)).toBe(true)
  })

  it('list --json platformSummary 样例能通过 machine-readable schema def 校验', () => {
    const listOutput = {
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
        warnings: [],
        limitations: [],
      },
    }

    expect(validatePublicSchemaDef('ListCommandOutput', listOutput)).toBe(true)
  })

  it('action=import-apply success 样例能通过 machine-readable schema 校验', () => {
    const successResult = {
      schemaVersion: '2026-04-15.public-json.v1',
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
          requiresConfirmation: true,
          backupPlanned: true,
          noChanges: false,
          targetFiles: [],
        },
        risk: {
          allowed: true,
          riskLevel: 'medium',
          reasons: [],
          limitations: [],
        },
        backupId: 'snapshot-import-001',
        changedFiles: ['E:/repo/.gemini/settings.json'],
        noChanges: false,
        summary: {
          warnings: [],
          limitations: [],
        },
      },
      warnings: [],
      limitations: [],
    }

    expect(validatePublicSchema(successResult)).toBe(true)
  })

  it('action=import-apply codex success 样例能通过 machine-readable schema 校验', () => {
    const codexSuccessResult = {
      schemaVersion: '2026-04-15.public-json.v1',
      ok: true,
      action: 'import-apply',
      data: {
        sourceFile: 'E:/tmp/export.json',
        importedProfile: {
          id: 'codex-prod',
          name: 'Codex 生产',
          platform: 'codex',
          source: {},
          apply: {},
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
          limitations: [],
        },
        preview: {
          requiresConfirmation: false,
          backupPlanned: true,
          noChanges: false,
          targetFiles: [],
        },
        risk: {
          allowed: true,
          riskLevel: 'low',
          reasons: [],
          limitations: [],
        },
        backupId: 'snapshot-codex-001',
        changedFiles: [
          'C:/Users/test/.codex/config.toml',
          'C:/Users/test/.codex/auth.json',
        ],
        noChanges: false,
        summary: {
          warnings: [],
          limitations: [],
        },
      },
      warnings: [],
      limitations: [],
    }

    expect(validatePublicSchema(codexSuccessResult)).toBe(true)
  })

  it('action=import-apply claude success 样例能通过 machine-readable schema 校验', () => {
    const claudeSuccessResult = {
      schemaVersion: '2026-04-15.public-json.v1',
      ok: true,
      action: 'import-apply',
      data: {
        sourceFile: 'E:/tmp/export.json',
        importedProfile: {
          id: 'claude-prod',
          name: 'Claude 生产',
          platform: 'claude',
          source: {},
          apply: {},
        },
        appliedScope: 'local',
        scopePolicy: {
          requestedScope: 'local',
          resolvedScope: 'local',
          defaultScope: 'project',
          explicitScope: true,
          highRisk: true,
          rollbackScopeMatchRequired: false,
        },
        scopeCapabilities: [
          {
            scope: 'user',
            detect: true,
            preview: true,
            use: true,
            rollback: true,
            writable: true,
          },
          {
            scope: 'project',
            detect: true,
            preview: true,
            use: true,
            rollback: true,
            writable: true,
          },
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
        validation: {
          ok: true,
          errors: [],
          warnings: [],
          limitations: [],
        },
        preview: {
          requiresConfirmation: true,
          backupPlanned: true,
          noChanges: false,
          targetFiles: [
            {
              path: 'E:/repo/.claude/settings.local.json',
              format: 'json',
              exists: true,
              managedScope: 'partial-fields',
              scope: 'local',
              role: 'settings',
              managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
            },
          ],
        },
        risk: {
          allowed: true,
          riskLevel: 'high',
          reasons: [
            'Claude local scope 高于 project 与 user；同名字段写入后会直接成为当前项目的最终生效值。',
          ],
          limitations: [
            '如果你只是想共享项目级配置，优先使用 project scope，而不是 local scope。',
          ],
        },
        backupId: 'snapshot-claude-001',
        changedFiles: ['E:/repo/.claude/settings.local.json'],
        noChanges: false,
        summary: {
          warnings: [],
          limitations: [],
        },
      },
      warnings: [],
      limitations: [],
    }

    expect(validatePublicSchema(claudeSuccessResult)).toBe(true)
  })

  it('action=import-apply not-ready 失败样例能通过 machine-readable schema 校验', () => {
    const notReadyFailureResult = {
      schemaVersion: '2026-04-15.public-json.v1',
      ok: false,
      action: 'import-apply',
      error: {
        code: 'IMPORT_APPLY_NOT_READY',
        message: '当前 import preview 结果不允许进入 apply。',
        details: {
          sourceFile: 'E:/tmp/export.json',
          profileId: 'gemini-prod',
          previewDecision: {
            canProceedToApplyDesign: false,
            requiresLocalResolution: false,
            reasonCodes: ['BLOCKED_BY_FIDELITY_MISMATCH'],
            reasons: [
              {
                code: 'BLOCKED_BY_FIDELITY_MISMATCH',
                blocking: true,
                message: '当前本地 scope availability 与导出观察不一致。',
              },
            ],
          },
        },
      },
    }

    expect(validatePublicSchema(notReadyFailureResult)).toBe(true)
  })

  it('action=import-apply scope-unavailable 失败样例能通过 machine-readable schema 校验', () => {
    const scopeUnavailableFailureResult = {
      schemaVersion: '2026-04-15.public-json.v1',
      ok: false,
      action: 'import-apply',
      error: {
        code: 'IMPORT_SCOPE_UNAVAILABLE',
        message: '无法定位 Gemini project scope 所需的项目根目录。',
        details: {
          requestedScope: 'project',
          resolvedScope: 'project',
          scopePolicy: {
            requestedScope: 'project',
            resolvedScope: 'project',
            defaultScope: 'user',
            explicitScope: true,
            highRisk: true,
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
            },
          ],
          scopeAvailability: [
            {
              scope: 'project',
              status: 'unresolved',
              detected: false,
              writable: false,
              reasonCode: 'PROJECT_ROOT_UNRESOLVED',
            },
          ],
        },
      },
    }

    expect(validatePublicSchema(scopeUnavailableFailureResult)).toBe(true)
  })

  it('明显错误的 import-apply success 实例会被 machine-readable schema 拒绝', () => {
    const invalidSuccessResult = {
      schemaVersion: '2026-04-15.public-json.v1',
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
        appliedScope: 'user',
        scopePolicy: {
          explicitScope: false,
          highRisk: false,
          rollbackScopeMatchRequired: true,
        },
        scopeCapabilities: [],
        validation: {},
        preview: {},
        risk: {
          allowed: true,
          riskLevel: 'low',
          reasons: [],
          limitations: [],
        },
        changedFiles: [],
        noChanges: true,
        summary: {
          warnings: [],
          limitations: [],
        },
      },
    }

    expect(validatePublicSchema(invalidSuccessResult)).toBe(false)
  })
})
