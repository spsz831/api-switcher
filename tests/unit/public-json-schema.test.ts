import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { PreviewResult, ValidationResult } from '../../src/types/adapter'
import type { PlatformScopeCapability, ScopeAvailability } from '../../src/types/capabilities'
import type {
  AddCommandOutput,
  CurrentCommandOutput,
  CurrentSummary,
  ExportCommandOutput,
  ImportApplyCommandOutput,
  ImportApplyNotReadyDetails,
  ImportApplySourceDetails,
  ImportFidelityReport,
  ImportObservation,
  ImportPreviewCommandOutput,
  ImportPreviewDecision,
  ListCommandOutput,
  ListSummary,
  PreviewCommandOutput,
  RollbackCommandOutput,
  SchemaCommandOutput,
  UseCommandOutput,
  ValidateCommandOutput,
} from '../../src/types/command'
import { COMMAND_ACTIONS } from '../../src/types/command'
import type { Profile } from '../../src/types/profile'
import type { SnapshotScopePolicy } from '../../src/types/snapshot'
import {
  currentCommandOutputFixture,
  exportCommandOutputFixture,
  listCommandOutputFixture,
  validateCommandOutputFixture,
} from '../fixtures/public-json-schema.fixtures'

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

  it('用类型断言定义 import apply 成功态共享字段矩阵', () => {
    expectTypeOf<ImportApplyCommandOutput>().toMatchTypeOf<{
      scopePolicy: SnapshotScopePolicy
      scopeCapabilities: PlatformScopeCapability[]
      scopeAvailability?: ScopeAvailability[]
      preview: PreviewResult
      risk: {
        allowed: true
        riskLevel: string
        reasons: string[]
        limitations: string[]
      }
      changedFiles: string[]
      noChanges: boolean
      summary: {
        warnings: string[]
        limitations: string[]
      }
    }>()
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

  it('用类型断言定义 import apply failure details 的共享字段边界', () => {
    expectTypeOf<ImportApplyNotReadyDetails>().toMatchTypeOf<{
      previewDecision: ImportPreviewDecision
      fidelity?: ImportFidelityReport
      localObservation?: ImportObservation
      exportedObservation?: ImportObservation
    }>()
  })

  it('用类型断言定义 import preview / observation 的最小公共 contract', () => {
    expectTypeOf<ImportObservation>().toMatchTypeOf<{
      scopeCapabilities?: PlatformScopeCapability[]
      scopeAvailability?: ScopeAvailability[]
      defaultWriteScope?: string
      observedAt?: string
    }>()

    expectTypeOf<ImportPreviewDecision>().toMatchTypeOf<{
      canProceedToApplyDesign: boolean
      recommendedScope?: string
      requiresLocalResolution: boolean
      reasonCodes: string[]
      reasons: Array<{
        code: string
        blocking: boolean
        message: string
      }>
    }>()

    expectTypeOf<{
      sourceCompatibility: ImportPreviewCommandOutput['sourceCompatibility']
      items: ImportPreviewCommandOutput['items']
    }>().toMatchTypeOf<{
      sourceCompatibility: {
        mode: 'strict' | 'schema-version-missing'
        schemaVersion?: string
        warnings: string[]
      }
      items: Array<{
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
        exportedObservation?: ImportObservation
        localObservation?: ImportObservation
        fidelity?: ImportFidelityReport
        previewDecision: ImportPreviewDecision
      }>
    }>()
  })

  it('用类型断言定义 schema commandCatalog 的最小公共 contract', () => {
    expectTypeOf<SchemaCommandOutput>().toMatchTypeOf<{
      commandCatalog?: {
        actions: Array<{
          action: string
          hasPlatformSummary: boolean
          hasPlatformStats: boolean
          hasScopeCapabilities: boolean
          hasScopeAvailability: boolean
          hasScopePolicy: boolean
          primaryFields: string[]
          primaryErrorFields: string[]
          primaryFieldSemantics: Array<{ path: string; semantic: string }>
          primaryErrorFieldSemantics: Array<{ path: string; semantic: string }>
        }>
      }
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

    expect(publicJsonSchema.$defs?.ImportApplyCommandOutput?.properties?.scopePolicy).toEqual({
      $ref: '#/$defs/SnapshotScopePolicy',
    })
    expect(publicJsonSchema.$defs?.ImportApplyCommandOutput?.properties?.platformSummary).toEqual({
      $ref: '#/$defs/PlatformExplainableSummary',
    })
    expect(publicJsonSchema.$defs?.ImportApplyCommandOutput?.properties?.scopeCapabilities).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ScopeCapability' },
    })
    expect(publicJsonSchema.$defs?.ImportApplyCommandOutput?.properties?.scopeAvailability).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ScopeAvailability' },
    })
  })

  it('machine-readable schema 覆盖 import preview / observation 稳定 defs', () => {
    expect(publicJsonSchema.$defs?.ImportObservation).toBeDefined()
    expect(publicJsonSchema.$defs?.ImportObservation?.properties?.scopeCapabilities).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ScopeCapability' },
    })
    expect(publicJsonSchema.$defs?.ImportObservation?.properties?.scopeAvailability).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ScopeAvailability' },
    })

    expect(publicJsonSchema.$defs?.ImportPreviewItem).toBeDefined()
    expect(publicJsonSchema.$defs?.ImportPreviewItem?.required).toEqual(expect.arrayContaining([
      'profile',
      'platform',
      'previewDecision',
    ]))
    expect(publicJsonSchema.$defs?.ImportPreviewItem?.properties?.exportedObservation).toEqual({
      $ref: '#/$defs/ImportObservation',
    })
    expect(publicJsonSchema.$defs?.ImportPreviewItem?.properties?.platformSummary).toEqual({
      $ref: '#/$defs/PlatformExplainableSummary',
    })
    expect(publicJsonSchema.$defs?.ImportPreviewItem?.properties?.localObservation).toEqual({
      $ref: '#/$defs/ImportObservation',
    })
    expect(publicJsonSchema.$defs?.ImportPreviewItem?.properties?.fidelity).toEqual({
      $ref: '#/$defs/ImportFidelityReport',
    })
    expect(publicJsonSchema.$defs?.ImportPreviewItem?.properties?.previewDecision).toEqual({
      $ref: '#/$defs/ImportPreviewDecision',
    })

    expect(publicJsonSchema.$defs?.ImportPreviewCommandOutput).toBeDefined()
    expect(publicJsonSchema.$defs?.ImportPreviewCommandOutput?.required).toEqual(expect.arrayContaining([
      'sourceFile',
      'sourceCompatibility',
      'items',
      'summary',
    ]))
    expect(publicJsonSchema.$defs?.ImportPreviewCommandOutput?.properties?.sourceCompatibility).toEqual({
      $ref: '#/$defs/ImportSourceCompatibility',
    })
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
    expect(publicJsonSchema.$defs?.ImportApplyNotReadyDetails?.properties?.previewDecision).toEqual({
      $ref: '#/$defs/ImportPreviewDecision',
    })
    expect(publicJsonSchema.$defs?.ImportApplyNotReadyDetails?.properties?.fidelity).toEqual({
      $ref: '#/$defs/ImportFidelityReport',
    })
    expect(publicJsonSchema.$defs?.ImportApplyNotReadyDetails?.properties?.localObservation).toEqual({
      $ref: '#/$defs/ImportObservation',
    })
    expect(publicJsonSchema.$defs?.ImportApplyNotReadyDetails?.properties?.exportedObservation).toEqual({
      $ref: '#/$defs/ImportObservation',
    })

    expect(publicJsonSchema.$defs?.ImportScopeUnavailableDetails).toBeDefined()
    expect(publicJsonSchema.$defs?.ImportScopeUnavailableDetails?.required).toEqual(expect.arrayContaining([
      'resolvedScope',
      'scopePolicy',
      'scopeCapabilities',
      'scopeAvailability',
    ]))
    expect(publicJsonSchema.$defs?.ImportScopeUnavailableDetails?.properties?.scopePolicy).toEqual({
      $ref: '#/$defs/SnapshotScopePolicy',
    })
    expect(publicJsonSchema.$defs?.ImportScopeUnavailableDetails?.properties?.scopeCapabilities).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ScopeCapability' },
    })
    expect(publicJsonSchema.$defs?.ImportScopeUnavailableDetails?.properties?.scopeAvailability).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ScopeAvailability' },
    })
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

    expectTypeOf<CurrentSummary>().toMatchTypeOf<{
      platformStats?: Array<{
        platform: string
        profileCount: number
        currentProfileId?: string
        detectedProfileId?: string
        managed: boolean
        currentScope?: string
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

    expectTypeOf<ListSummary>().toMatchTypeOf<{
      platformStats?: Array<{
        platform: string
        profileCount: number
        currentProfileId?: string
        detectedProfileId?: string
        managed: boolean
        currentScope?: string
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

  it('machine-readable schema 覆盖 schema commandCatalog defs', () => {
    expect(publicJsonSchema.$defs?.SchemaCommandOutput?.properties?.commandCatalog).toEqual({
      $ref: '#/$defs/SchemaCommandCatalog',
    })
    expect(publicJsonSchema.$defs?.SchemaCommandCatalog?.properties?.actions).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaActionCapability' },
    })
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.required).toEqual(expect.arrayContaining([
      'action',
      'hasPlatformSummary',
      'hasPlatformStats',
      'hasScopeCapabilities',
      'hasScopeAvailability',
      'hasScopePolicy',
      'primaryFields',
      'primaryErrorFields',
      'primaryFieldSemantics',
      'primaryErrorFieldSemantics',
    ]))
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.primaryFields).toEqual({
      type: 'array',
      items: { type: 'string' },
    })
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.primaryErrorFields).toEqual({
      type: 'array',
      items: { type: 'string' },
    })
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.primaryFieldSemantics).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaFieldSemanticBinding' },
    })
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.primaryErrorFieldSemantics).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaFieldSemanticBinding' },
    })
  })

  it('machine-readable schema 覆盖 current/list summary.platformStats def', () => {
    expect(publicJsonSchema.$defs?.CurrentSummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/CurrentListPlatformStat' },
    })
    expect(publicJsonSchema.$defs?.ListSummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/CurrentListPlatformStat' },
    })
    expect(publicJsonSchema.$defs?.CurrentListPlatformStat?.required).toEqual(expect.arrayContaining([
      'platform',
      'profileCount',
      'managed',
    ]))
    expect(publicJsonSchema.$defs?.CurrentListPlatformStat?.properties?.platformSummary).toEqual({
      $ref: '#/$defs/PlatformExplainableSummary',
    })
  })

  it('用类型断言定义 validate/export platformSummary 的最小公共 contract', () => {
    expectTypeOf<ValidateCommandOutput>().toMatchTypeOf<{
      items: Array<{
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

    expectTypeOf<ExportCommandOutput>().toMatchTypeOf<{
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

    expectTypeOf<ValidateCommandOutput>().toMatchTypeOf<{
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          okCount: number
          warningCount: number
          limitationCount: number
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
      }
    }>()

    expectTypeOf<ExportCommandOutput>().toMatchTypeOf<{
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          okCount: number
          warningCount: number
          limitationCount: number
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
      }
    }>()
  })

  it('machine-readable schema 覆盖 validate/export platformSummary defs', () => {
    expect(publicJsonSchema.$defs?.ValidateCommandOutput).toBeDefined()
    expect(publicJsonSchema.$defs?.ValidateCommandItem?.properties?.platformSummary).toEqual({
      $ref: '#/$defs/PlatformExplainableSummary',
    })

    expect(publicJsonSchema.$defs?.ExportCommandOutput).toBeDefined()
    expect(publicJsonSchema.$defs?.ExportedProfileItem?.properties?.platformSummary).toEqual({
      $ref: '#/$defs/PlatformExplainableSummary',
    })
  })

  it('machine-readable schema 覆盖 validate/export summary.platformStats def', () => {
    expect(publicJsonSchema.$defs?.ValidateSummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ValidateExportPlatformStat' },
    })
    expect(publicJsonSchema.$defs?.ExportSummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ValidateExportPlatformStat' },
    })
    expect(publicJsonSchema.$defs?.ValidateExportPlatformStat?.required).toEqual(expect.arrayContaining([
      'platform',
      'profileCount',
      'okCount',
      'warningCount',
      'limitationCount',
    ]))
    expect(publicJsonSchema.$defs?.ValidateExportPlatformStat?.properties?.platformSummary).toEqual({
      $ref: '#/$defs/PlatformExplainableSummary',
    })
  })

  it('用类型断言定义 use/rollback platformSummary 的最小公共 contract', () => {
    expectTypeOf<UseCommandOutput>().toMatchTypeOf<{
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
    }>()

    expectTypeOf<RollbackCommandOutput>().toMatchTypeOf<{
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
    }>()
  })

  it('用类型断言定义 preview scopePolicy 的最小公共 contract', () => {
    expectTypeOf<PreviewCommandOutput>().toMatchTypeOf<{
      scopePolicy?: SnapshotScopePolicy
    }>()
  })

  it('用类型断言定义 preview/use/rollback/import apply summary.platformStats 的最小公共 contract', () => {
    expectTypeOf<AddCommandOutput>().toMatchTypeOf<{
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          profileId?: string
          warningCount: number
          limitationCount: number
          changedFileCount?: number
          backupCreated?: boolean
          noChanges?: boolean
          platformSummary?: {
            kind: 'scope-precedence' | 'multi-file-composition'
            facts: Array<{ code: string; message: string }>
          }
        }>
      }
    }>()

    expectTypeOf<PreviewCommandOutput>().toMatchTypeOf<{
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          profileId?: string
          targetScope?: string
          warningCount: number
          limitationCount: number
          changedFileCount?: number
          restoredFileCount?: number
          backupCreated?: boolean
          noChanges?: boolean
          platformSummary?: {
            kind: 'scope-precedence' | 'multi-file-composition'
            facts: Array<{ code: string; message: string }>
          }
        }>
      }
    }>()

    expectTypeOf<UseCommandOutput>().toMatchTypeOf<{
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          warningCount: number
          limitationCount: number
        }>
      }
    }>()

    expectTypeOf<RollbackCommandOutput>().toMatchTypeOf<{
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          warningCount: number
          limitationCount: number
        }>
      }
    }>()

    expectTypeOf<ImportApplyCommandOutput>().toMatchTypeOf<{
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          warningCount: number
          limitationCount: number
        }>
      }
    }>()
  })

  it('machine-readable schema 覆盖 use/rollback platformSummary defs', () => {
    expect(publicJsonSchema.$defs?.UseCommandOutput?.properties?.platformSummary).toEqual({
      $ref: '#/$defs/PlatformExplainableSummary',
    })
    expect(publicJsonSchema.$defs?.RollbackCommandOutput?.properties?.platformSummary).toEqual({
      $ref: '#/$defs/PlatformExplainableSummary',
    })
  })

  it('machine-readable schema 覆盖 preview scopePolicy def', () => {
    expect(publicJsonSchema.$defs?.PreviewCommandOutput?.properties?.scopePolicy).toEqual({
      $ref: '#/$defs/SnapshotScopePolicy',
    })
  })

  it('machine-readable schema 覆盖单平台命令 summary.platformStats def', () => {
    expect(publicJsonSchema.$defs?.SinglePlatformStat?.properties).toEqual(expect.objectContaining({
      platform: { type: 'string' },
      profileCount: { type: 'integer', minimum: 0 },
      warningCount: { type: 'integer', minimum: 0 },
      limitationCount: { type: 'integer', minimum: 0 },
      platformSummary: { $ref: '#/$defs/PlatformExplainableSummary' },
    }))
    expect(publicJsonSchema.$defs?.PreviewSummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SinglePlatformStat' },
    })
    expect(publicJsonSchema.$defs?.AddSummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SinglePlatformStat' },
    })
    expect(publicJsonSchema.$defs?.UseSummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SinglePlatformStat' },
    })
    expect(publicJsonSchema.$defs?.RollbackSummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SinglePlatformStat' },
    })
    expect(publicJsonSchema.$defs?.ImportApplySummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SinglePlatformStat' },
    })
    expect(publicJsonSchema.$defs?.AddCommandOutput?.properties?.summary).toEqual({
      $ref: '#/$defs/AddSummary',
    })
  })

  it('current --json platformSummary 样例能通过 machine-readable schema def 校验', () => {
    expect(validatePublicSchemaDef('CurrentCommandOutput', currentCommandOutputFixture)).toBe(true)
  })

  it('list --json platformSummary 样例能通过 machine-readable schema def 校验', () => {
    expect(validatePublicSchemaDef('ListCommandOutput', listCommandOutputFixture)).toBe(true)
  })

  it('validate --json platformSummary 样例能通过 machine-readable schema def 校验', () => {
    expect(validatePublicSchemaDef('ValidateCommandOutput', validateCommandOutputFixture)).toBe(true)
  })

  it('export --json platformSummary 样例能通过 machine-readable schema def 校验', () => {
    expect(validatePublicSchemaDef('ExportCommandOutput', exportCommandOutputFixture)).toBe(true)
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
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          facts: [
            { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
            { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
          ],
        },
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
          platformStats: [
            {
              platform: 'gemini',
              profileCount: 1,
              profileId: 'gemini-prod',
              targetScope: 'project',
              warningCount: 0,
              limitationCount: 0,
              changedFileCount: 0,
              backupCreated: true,
              noChanges: false,
              platformSummary: {
                kind: 'scope-precedence',
                precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
                facts: [
                  { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
                  { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
                ],
              },
            },
          ],
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
        platformSummary: {
          kind: 'multi-file-composition',
          composedFiles: [
            'C:/Users/test/.codex/config.toml',
            'C:/Users/test/.codex/auth.json',
          ],
          facts: [
            { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
            { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
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
          platformStats: [
            {
              platform: 'codex',
              profileCount: 1,
              profileId: 'codex-prod',
              warningCount: 0,
              limitationCount: 0,
              changedFileCount: 2,
              backupCreated: true,
              noChanges: false,
              platformSummary: {
                kind: 'multi-file-composition',
                composedFiles: [
                  'C:/Users/test/.codex/config.toml',
                  'C:/Users/test/.codex/auth.json',
                ],
                facts: [
                  { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
                  { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
                ],
              },
            },
          ],
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
