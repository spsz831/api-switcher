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
  ImportApplyRedactedSecretDetails,
  ImportApplySourceDetails,
  ImportFidelityReport,
  ImportObservation,
  ImportPreviewCommandOutput,
  ImportPreviewDecision,
  ListCommandOutput,
  ListSummary,
  PreviewCommandOutput,
  ReferenceGovernanceFailureDetails,
  RollbackCommandOutput,
  SchemaCommandOutput,
  UseCommandOutput,
  ValidationFailureDetails,
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
import {
  loadPublicJsonSchema,
  type JsonSchema,
  validatePublicJsonSchema,
  validatePublicJsonSchemaDef,
  validateSchema,
} from '../helpers/public-json-schema'

type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K
}[keyof T]

const publicJsonSchema = loadPublicJsonSchema()
const validatePublicSchema = validatePublicJsonSchema
const validatePublicSchemaDef = validatePublicJsonSchemaDef

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
      scopePolicy?: SnapshotScopePolicy
      scopeCapabilities: PlatformScopeCapability[]
      scopeAvailability?: ScopeAvailability[]
      validation: ValidationResult
      preview: PreviewResult
      backupId: string
    }>()

    expectTypeOf<Extract<
      'sourceFile' | 'importedProfile' | 'backupId',
      RequiredKeys<ImportApplyCommandOutput>
    >>().toEqualTypeOf<'sourceFile' | 'importedProfile' | 'backupId'>()
  })

  it('用类型断言定义 import apply 成功态共享字段矩阵', () => {
    expectTypeOf<ImportApplyCommandOutput>().toMatchTypeOf<{
      scopePolicy?: SnapshotScopePolicy
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
    } | undefined>()
  })

  it('暴露 import apply 最小 error detail shapes', () => {
    expectTypeOf<ImportApplySourceDetails>().toMatchTypeOf<{
      sourceFile: string
      profileId?: string
    }>()

    expectTypeOf<ImportApplyRedactedSecretDetails>().toMatchTypeOf<{
      sourceFile: string
      profileId: string
      redactedInlineSecretFields: string[]
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
      summary: ImportPreviewCommandOutput['summary']
      items: ImportPreviewCommandOutput['items']
    }>().toMatchTypeOf<{
      sourceCompatibility: {
        mode: 'strict' | 'schema-version-missing'
        schemaVersion?: string
        warnings: string[]
      }
      summary: {
        sourceExecutability: {
          totalItems: number
          applyReadyCount: number
          previewOnlyCount: number
          blockedCount: number
          blockedByCodeStats: Array<{
            code: 'REDACTED_INLINE_SECRET'
            totalCount: number
          }>
        }
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
          hasInlineReadyProfiles: boolean
          hasReferenceReadyProfiles: boolean
          hasReferenceMissingProfiles: boolean
          hasWriteUnsupportedProfiles: boolean
          hasSourceRedactedProfiles: boolean
        }
        triageStats?: {
          totalItems: number
          buckets: Array<{
            id: string
            title: string
            totalCount: number
            summaryFields: string[]
            itemFields?: string[]
            recommendedNextStep: string
          }>
        }
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
    expectTypeOf<NonNullable<SchemaCommandOutput['commandCatalog']>>().toMatchTypeOf<{
        recommendedActions?: Array<{
          code:
            | 'inspect-items'
            | 'review-reference-details'
            | 'repair-source-input'
            | 'group-by-platform'
            | 'continue-to-write'
            | 'fix-input-and-retry'
            | 'select-existing-resource'
            | 'resolve-scope-before-retry'
            | 'confirm-before-write'
            | 'check-platform-support'
            | 'inspect-runtime-details'
            | 'check-import-source'
            | 'fix-reference-input'
            | 'resolve-reference-support'
            | 'migrate-inline-secret'
          title: string
          family: 'inspect' | 'repair' | 'route' | 'execute'
          availability: Array<'readonly' | 'failure'>
          purpose: string
        }>
        actions: Array<{
          action: string
          hasPlatformSummary: boolean
          hasPlatformStats: boolean
          hasScopeCapabilities: boolean
          hasScopeAvailability: boolean
          hasScopePolicy: boolean
          primaryFields: string[]
          primaryErrorFields: string[]
          failureCodes: Array<{
            code: string
            priority: number
            category: 'input' | 'state' | 'scope' | 'confirmation' | 'platform' | 'runtime' | 'source'
            recommendedHandling:
              | 'inspect-items'
              | 'review-reference-details'
              | 'repair-source-input'
              | 'group-by-platform'
              | 'continue-to-write'
              | 'fix-input-and-retry'
              | 'select-existing-resource'
              | 'resolve-scope-before-retry'
              | 'confirm-before-write'
              | 'check-platform-support'
              | 'inspect-runtime-details'
              | 'check-import-source'
              | 'fix-reference-input'
              | 'resolve-reference-support'
              | 'migrate-inline-secret'
          }>
          fieldPresence: Array<{
            path: string
            channel: 'success' | 'failure'
            presence: 'always' | 'conditional'
            conditionCode?: string
          }>
          fieldSources: Array<{
            path: string
            channel: 'success' | 'failure'
            source:
              | 'command-service'
              | 'platform-adapter'
              | 'schema-service'
              | 'write-pipeline'
              | 'import-analysis'
              | 'error-envelope'
          }>
          fieldStability: Array<{
            path: string
            channel: 'success' | 'failure'
            stabilityTier: 'stable' | 'bounded' | 'expandable'
          }>
          readOrderGroups: {
            success: Array<{
              stage: 'summary' | 'selection' | 'items' | 'detail' | 'artifacts'
              fields: string[]
              purpose?: string
            }>
            failure: Array<{
              stage: 'error-core' | 'error-details' | 'error-recovery'
              fields: string[]
              purpose?: string
            }>
          }
          summarySections?: Array<{
            id: 'platform' | 'reference' | 'executability' | 'source-executability'
            title: string
            priority: number
            fields: string[]
            purpose: string
            recommendedWhen?: string[]
          }>
          primaryFieldSemantics: Array<{ path: string; semantic: string }>
          primaryErrorFieldSemantics: Array<{ path: string; semantic: string }>
          referenceGovernanceCodes?: Array<{
            code:
              | 'REFERENCE_INPUT_CONFLICT'
              | 'REFERENCE_MISSING'
              | 'REFERENCE_WRITE_UNSUPPORTED'
              | 'INLINE_SECRET_PRESENT'
            priority: number
            category: 'reference' | 'inline-secret' | 'input'
            recommendedHandling:
              | 'inspect-items'
              | 'review-reference-details'
              | 'repair-source-input'
              | 'group-by-platform'
              | 'continue-to-write'
              | 'fix-input-and-retry'
              | 'select-existing-resource'
              | 'resolve-scope-before-retry'
              | 'confirm-before-write'
              | 'check-platform-support'
              | 'inspect-runtime-details'
              | 'check-import-source'
              | 'fix-reference-input'
              | 'resolve-reference-support'
              | 'migrate-inline-secret'
          }>
        }>
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
    expect(publicJsonSchema.$defs?.ImportSourceExecutabilityCodeStat).toBeDefined()
    expect(publicJsonSchema.$defs?.ImportSourceExecutabilitySummary).toBeDefined()
    expect(publicJsonSchema.$defs?.ImportSourceExecutabilitySummary?.required).toEqual(expect.arrayContaining([
      'totalItems',
      'applyReadyCount',
      'previewOnlyCount',
      'blockedCount',
      'blockedByCodeStats',
    ]))

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
    expect(publicJsonSchema.$defs?.ImportPreviewSummary?.properties?.sourceExecutability).toEqual({
      $ref: '#/$defs/ImportSourceExecutabilitySummary',
    })
    expect(publicJsonSchema.$defs?.ImportPreviewSummary?.properties?.executabilityStats).toEqual({
      $ref: '#/$defs/ExecutabilityStats',
    })
    expect(publicJsonSchema.$defs?.ImportPreviewSummary?.properties?.triageStats).toEqual({
      $ref: '#/$defs/ReadonlyTriageStats',
    })
  })

  it('machine-readable schema 冻结 import-apply 稳定 failure detail defs', () => {
    expect(publicJsonSchema.$defs?.ImportApplySourceDetails).toBeDefined()
    expect(publicJsonSchema.$defs?.ImportApplySourceDetails?.required).toEqual(expect.arrayContaining([
      'sourceFile',
    ]))

    expect(publicJsonSchema.$defs?.ImportApplyRedactedSecretDetails).toBeDefined()
    expect(publicJsonSchema.$defs?.ImportApplyRedactedSecretDetails?.required).toEqual(expect.arrayContaining([
      'sourceFile',
      'profileId',
      'redactedInlineSecretFields',
    ]))
    expect(publicJsonSchema.$defs?.ImportApplyRedactedSecretDetails?.properties?.redactedInlineSecretFields).toEqual({
      type: 'array',
      items: { type: 'string' },
    })

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
        referenceSummary?: {
          hasReferenceFields: boolean
          hasInlineSecrets: boolean
          writeUnsupported: boolean
          resolvedReferenceCount: number
          missingReferenceCount: number
          unsupportedReferenceCount: number
          missingValueCount: number
        }
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
        referenceSummary?: {
          hasReferenceFields: boolean
          hasInlineSecrets: boolean
          writeUnsupported: boolean
          resolvedReferenceCount: number
          missingReferenceCount: number
          unsupportedReferenceCount: number
          missingValueCount: number
        }
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
      referenceStats?: {
        profileCount: number
        referenceProfileCount: number
        inlineProfileCount: number
        writeUnsupportedProfileCount: number
        hasReferenceProfiles: boolean
        hasInlineProfiles: boolean
        hasWriteUnsupportedProfiles: boolean
      }
      executabilityStats?: {
        profileCount: number
        inlineReadyProfileCount: number
        referenceReadyProfileCount: number
        referenceMissingProfileCount: number
        writeUnsupportedProfileCount: number
        sourceRedactedProfileCount: number
        hasInlineReadyProfiles: boolean
        hasReferenceReadyProfiles: boolean
        hasReferenceMissingProfiles: boolean
        hasWriteUnsupportedProfiles: boolean
        hasSourceRedactedProfiles: boolean
      }
      triageStats?: {
        totalItems: number
        buckets: Array<{
          id: string
          title: string
          totalCount: number
          summaryFields: string[]
          itemFields?: string[]
          recommendedNextStep: string
        }>
      }
      platformStats?: Array<{
        platform: string
        profileCount: number
        currentProfileId?: string
        detectedProfileId?: string
        managed: boolean
        currentScope?: string
        referenceStats?: {
          profileCount: number
          referenceProfileCount: number
          inlineProfileCount: number
          writeUnsupportedProfileCount: number
          hasReferenceProfiles: boolean
          hasInlineProfiles: boolean
          hasWriteUnsupportedProfiles: boolean
        }
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
      referenceStats?: {
        profileCount: number
        referenceProfileCount: number
        inlineProfileCount: number
        writeUnsupportedProfileCount: number
        hasReferenceProfiles: boolean
        hasInlineProfiles: boolean
        hasWriteUnsupportedProfiles: boolean
      }
      executabilityStats?: {
        profileCount: number
        inlineReadyProfileCount: number
        referenceReadyProfileCount: number
        referenceMissingProfileCount: number
        writeUnsupportedProfileCount: number
        sourceRedactedProfileCount: number
        hasInlineReadyProfiles: boolean
        hasReferenceReadyProfiles: boolean
        hasReferenceMissingProfiles: boolean
        hasWriteUnsupportedProfiles: boolean
        hasSourceRedactedProfiles: boolean
      }
      triageStats?: {
        totalItems: number
        buckets: Array<{
          id: string
          title: string
          totalCount: number
          summaryFields: string[]
          itemFields?: string[]
          recommendedNextStep: string
        }>
      }
      platformStats?: Array<{
        platform: string
        profileCount: number
        currentProfileId?: string
        detectedProfileId?: string
        managed: boolean
        currentScope?: string
        referenceStats?: {
          profileCount: number
          referenceProfileCount: number
          inlineProfileCount: number
          writeUnsupportedProfileCount: number
          hasReferenceProfiles: boolean
          hasInlineProfiles: boolean
          hasWriteUnsupportedProfiles: boolean
        }
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
    expect(publicJsonSchema.$defs?.CurrentProfileResult?.properties?.referenceSummary).toEqual({
      $ref: '#/$defs/ReferenceSummary',
    })

    expect(publicJsonSchema.$defs?.ListCommandOutput).toBeDefined()
    expect(publicJsonSchema.$defs?.ListCommandItem?.properties?.platformSummary).toEqual({
      $ref: '#/$defs/PlatformExplainableSummary',
    })
    expect(publicJsonSchema.$defs?.ListCommandItem?.properties?.referenceSummary).toEqual({
      $ref: '#/$defs/ReferenceSummary',
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
    expect(publicJsonSchema.$defs?.SchemaCommandCatalog?.properties?.consumerProfiles).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaConsumerProfile' },
    })
    expect(publicJsonSchema.$defs?.SchemaCommandCatalog?.properties?.recommendedActions).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaRecommendedAction' },
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
      'failureCodes',
      'fieldPresence',
      'fieldSources',
      'fieldStability',
      'readOrderGroups',
      'primaryFieldSemantics',
      'primaryErrorFieldSemantics',
    ]))
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.primaryFields).toEqual({
      type: 'array',
      items: { type: 'string' },
    })
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.consumerProfileIds).toEqual({
      type: 'array',
      items: { type: 'string', enum: ['single-platform-write', 'readonly-import-batch', 'readonly-state-audit'] },
    })
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.primaryErrorFields).toEqual({
      type: 'array',
      items: { type: 'string' },
    })
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.failureCodes).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaActionFailureCode' },
    })
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.fieldPresence).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaActionFieldPresence' },
    })
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.fieldSources).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaActionFieldSource' },
    })
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.fieldStability).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaActionFieldStability' },
    })
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.readOrderGroups).toEqual({
      $ref: '#/$defs/SchemaReadOrderGroups',
    })
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.summarySections).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaSummarySection' },
    })
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.primaryFieldSemantics).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaFieldSemanticBinding' },
    })
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.primaryErrorFieldSemantics).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaFieldSemanticBinding' },
    })
    expect(publicJsonSchema.$defs?.SchemaActionCapability?.properties?.referenceGovernanceCodes).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaReferenceGovernanceCode' },
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfile?.required).toEqual(expect.arrayContaining([
      'id',
      'title',
      'appliesToActions',
      'exampleActions',
      'bestEntryAction',
      'sharedSummaryFields',
      'sharedItemFields',
      'sharedFailureFields',
      'optionalScopeFields',
      'optionalItemFields',
      'optionalFailureFields',
      'optionalArtifactFields',
      'recommendedStages',
    ]))
    expect(publicJsonSchema.$defs?.SchemaConsumerProfile?.properties?.summarySectionGuidance).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaConsumerProfileSummarySectionGuidance' },
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfile?.properties?.followUpHints).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaConsumerProfileFollowUpHint' },
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfile?.properties?.triageBuckets).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaConsumerProfileTriageBucket' },
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfile?.properties?.consumerActions).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaConsumerProfileAction' },
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfile?.properties?.consumerFlow).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaConsumerProfileFlowStep' },
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileSummarySectionGuidance?.required).toEqual(expect.arrayContaining([
      'id',
      'title',
      'priority',
      'fields',
      'purpose',
      'recommendedUses',
    ]))
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileSummarySectionGuidance?.properties?.recommendedUses).toEqual({
      type: 'array',
      items: {
        type: 'string',
        enum: ['overview', 'governance', 'gating', 'routing'],
      },
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileFollowUpHint?.required).toEqual(expect.arrayContaining([
      'use',
      'nextStep',
      'primaryFields',
      'purpose',
    ]))
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileFollowUpHint?.properties?.nextStep).toEqual({
      type: 'string',
      enum: ['inspect-items', 'review-reference-details', 'repair-source-input', 'group-by-platform', 'continue-to-write'],
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileTriageBucket?.required).toEqual(expect.arrayContaining([
      'id',
      'title',
      'summaryFields',
      'purpose',
      'recommendedNextStep',
    ]))
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileTriageBucket?.properties?.id).toEqual({
      type: 'string',
      enum: ['overview', 'reference-governance', 'write-readiness', 'source-blocked', 'platform-routing'],
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileAction?.required).toEqual(expect.arrayContaining([
      'id',
      'title',
      'priority',
      'use',
      'appliesWhen',
      'triggerFields',
      'summarySectionIds',
      'nextStep',
      'primaryFields',
      'purpose',
    ]))
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileAction?.properties?.use).toEqual({
      type: 'string',
      enum: ['overview', 'governance', 'gating', 'routing'],
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileAction?.properties?.summarySectionIds).toEqual({
      type: 'array',
      items: {
        type: 'string',
        enum: ['platform', 'reference', 'executability', 'source-executability'],
      },
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileAction?.properties?.triageBucketIds).toEqual({
      type: 'array',
      items: {
        type: 'string',
        enum: ['overview', 'reference-governance', 'write-readiness', 'source-blocked', 'platform-routing'],
      },
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileAction?.properties?.nextStep).toEqual({
      type: 'string',
      enum: ['inspect-items', 'review-reference-details', 'repair-source-input', 'group-by-platform', 'continue-to-write'],
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileAction?.properties?.appliesWhen).toEqual({
      type: 'string',
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileAction?.properties?.triggerFields).toEqual({
      type: 'array',
      items: { type: 'string' },
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileFlowStep?.required).toEqual(expect.arrayContaining([
      'id',
      'title',
      'priority',
      'defaultEntry',
      'defaultOnBucket',
      'selectionReason',
      'summarySectionIds',
      'readFields',
      'consumerActionId',
      'nextStep',
      'purpose',
    ]))
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileFlowStep?.properties?.defaultEntry).toEqual({
      type: 'boolean',
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileFlowStep?.properties?.defaultOnBucket).toEqual({
      type: 'boolean',
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileFlowStep?.properties?.selectionReason).toEqual({
      type: 'string',
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileFlowStep?.properties?.summarySectionIds).toEqual({
      type: 'array',
      items: {
        type: 'string',
        enum: ['platform', 'reference', 'executability', 'source-executability'],
      },
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileFlowStep?.properties?.triageBucketIds).toEqual({
      type: 'array',
      items: {
        type: 'string',
        enum: ['overview', 'reference-governance', 'write-readiness', 'source-blocked', 'platform-routing'],
      },
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileFlowStep?.properties?.readFields).toEqual({
      type: 'array',
      items: { type: 'string' },
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileFlowStep?.properties?.consumerActionId).toEqual({
      type: 'string',
    })
    expect(publicJsonSchema.$defs?.SchemaConsumerProfileFlowStep?.properties?.nextStep).toEqual({
      type: 'string',
      enum: ['inspect-items', 'review-reference-details', 'repair-source-input', 'group-by-platform', 'continue-to-write'],
    })
    expect(publicJsonSchema.$defs?.SchemaActionFailureCode?.required).toEqual(expect.arrayContaining([
      'code',
      'priority',
      'category',
      'recommendedHandling',
      'appliesWhen',
      'triggerFields',
    ]))
    expect(publicJsonSchema.$defs?.SchemaActionFailureCode?.properties?.code).toEqual({
      type: 'string',
    })
    expect(publicJsonSchema.$defs?.SchemaActionFailureCode?.properties?.priority).toEqual({
      type: 'integer',
      minimum: 1,
    })
    expect(publicJsonSchema.$defs?.SchemaActionFailureCode?.properties?.category).toEqual({
      type: 'string',
      enum: ['input', 'state', 'scope', 'confirmation', 'platform', 'runtime', 'source'],
    })
    expect(publicJsonSchema.$defs?.SchemaActionFailureCode?.properties?.recommendedHandling).toEqual({
      type: 'string',
      enum: [
        'inspect-items',
        'review-reference-details',
        'repair-source-input',
        'group-by-platform',
        'continue-to-write',
        'fix-input-and-retry',
        'select-existing-resource',
        'resolve-scope-before-retry',
        'confirm-before-write',
        'check-platform-support',
        'inspect-runtime-details',
        'check-import-source',
        'fix-reference-input',
        'resolve-reference-support',
        'migrate-inline-secret',
      ],
    })
    expect(publicJsonSchema.$defs?.SchemaActionFailureCode?.properties?.appliesWhen).toEqual({
      type: 'string',
    })
    expect(publicJsonSchema.$defs?.SchemaActionFailureCode?.properties?.triggerFields).toEqual({
      type: 'array',
      items: { type: 'string' },
    })
    expect(publicJsonSchema.$defs?.SchemaReferenceGovernanceCode?.required).toEqual(expect.arrayContaining([
      'code',
      'priority',
      'category',
      'recommendedHandling',
      'appliesWhen',
      'triggerFields',
    ]))
    expect(publicJsonSchema.$defs?.SchemaReferenceGovernanceCode?.properties?.code).toEqual({
      type: 'string',
      enum: [
        'REFERENCE_INPUT_CONFLICT',
        'REFERENCE_MISSING',
        'REFERENCE_WRITE_UNSUPPORTED',
        'INLINE_SECRET_PRESENT',
      ],
    })
    expect(publicJsonSchema.$defs?.SchemaReferenceGovernanceCode?.properties?.priority).toEqual({
      type: 'integer',
      minimum: 1,
    })
    expect(publicJsonSchema.$defs?.SchemaReferenceGovernanceCode?.properties?.category).toEqual({
      type: 'string',
      enum: ['reference', 'inline-secret', 'input'],
    })
    expect(publicJsonSchema.$defs?.SchemaReferenceGovernanceCode?.properties?.recommendedHandling).toEqual({
      type: 'string',
      enum: [
        'inspect-items',
        'review-reference-details',
        'repair-source-input',
        'group-by-platform',
        'continue-to-write',
        'fix-input-and-retry',
        'select-existing-resource',
        'resolve-scope-before-retry',
        'confirm-before-write',
        'check-platform-support',
        'inspect-runtime-details',
        'check-import-source',
        'resolve-reference-support',
        'migrate-inline-secret',
        'fix-reference-input',
      ],
    })
    expect(publicJsonSchema.$defs?.SchemaReferenceGovernanceCode?.properties?.appliesWhen).toEqual({
      type: 'string',
    })
    expect(publicJsonSchema.$defs?.SchemaReferenceGovernanceCode?.properties?.triggerFields).toEqual({
      type: 'array',
      items: { type: 'string' },
    })
    expect(publicJsonSchema.$defs?.SchemaRecommendedAction?.required).toEqual(expect.arrayContaining([
      'code',
      'title',
      'family',
      'availability',
      'purpose',
    ]))
    expect(publicJsonSchema.$defs?.SchemaRecommendedAction?.properties?.code).toEqual({
      type: 'string',
      enum: [
        'inspect-items',
        'review-reference-details',
        'repair-source-input',
        'group-by-platform',
        'continue-to-write',
        'fix-input-and-retry',
        'select-existing-resource',
        'resolve-scope-before-retry',
        'confirm-before-write',
        'check-platform-support',
        'inspect-runtime-details',
        'check-import-source',
        'fix-reference-input',
        'resolve-reference-support',
        'migrate-inline-secret',
      ],
    })
    expect(publicJsonSchema.$defs?.SchemaActionFieldPresence?.required).toEqual(expect.arrayContaining([
      'path',
      'channel',
      'presence',
    ]))
    expect(publicJsonSchema.$defs?.SchemaActionFieldPresence?.properties?.path).toEqual({
      type: 'string',
    })
    expect(publicJsonSchema.$defs?.SchemaActionFieldPresence?.properties?.channel).toEqual({
      type: 'string',
      enum: ['success', 'failure'],
    })
    expect(publicJsonSchema.$defs?.SchemaActionFieldPresence?.properties?.presence).toEqual({
      type: 'string',
      enum: ['always', 'conditional'],
    })
    expect(publicJsonSchema.$defs?.SchemaActionFieldPresence?.properties?.conditionCode).toEqual({
      type: 'string',
    })
    expect(publicJsonSchema.$defs?.SchemaActionFieldSource?.required).toEqual(expect.arrayContaining([
      'path',
      'channel',
      'source',
    ]))
    expect(publicJsonSchema.$defs?.SchemaActionFieldSource?.properties?.path).toEqual({
      type: 'string',
    })
    expect(publicJsonSchema.$defs?.SchemaActionFieldSource?.properties?.channel).toEqual({
      type: 'string',
      enum: ['success', 'failure'],
    })
    expect(publicJsonSchema.$defs?.SchemaActionFieldSource?.properties?.source).toEqual({
      type: 'string',
      enum: [
        'command-service',
        'platform-adapter',
        'schema-service',
        'write-pipeline',
        'import-analysis',
        'error-envelope',
      ],
    })
    expect(publicJsonSchema.$defs?.SchemaActionFieldStability?.required).toEqual(expect.arrayContaining([
      'path',
      'channel',
      'stabilityTier',
    ]))
    expect(publicJsonSchema.$defs?.SchemaActionFieldStability?.properties?.path).toEqual({
      type: 'string',
    })
    expect(publicJsonSchema.$defs?.SchemaActionFieldStability?.properties?.channel).toEqual({
      type: 'string',
      enum: ['success', 'failure'],
    })
    expect(publicJsonSchema.$defs?.SchemaActionFieldStability?.properties?.stabilityTier).toEqual({
      type: 'string',
      enum: ['stable', 'bounded', 'expandable'],
    })
    expect(publicJsonSchema.$defs?.SchemaReadOrderGroups?.required).toEqual(expect.arrayContaining([
      'success',
      'failure',
    ]))
    expect(publicJsonSchema.$defs?.SchemaReadOrderGroups?.properties?.success).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaSuccessReadOrderGroup' },
    })
    expect(publicJsonSchema.$defs?.SchemaReadOrderGroups?.properties?.failure).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaFailureReadOrderGroup' },
    })
    expect(publicJsonSchema.$defs?.SchemaSummarySection?.required).toEqual(expect.arrayContaining([
      'id',
      'title',
      'priority',
      'fields',
      'purpose',
    ]))
    expect(publicJsonSchema.$defs?.SchemaSummarySection?.properties?.id).toEqual({
      type: 'string',
      enum: ['platform', 'reference', 'executability', 'source-executability'],
    })
    expect(publicJsonSchema.$defs?.SchemaSummarySection?.properties?.title).toEqual({
      type: 'string',
    })
    expect(publicJsonSchema.$defs?.SchemaSummarySection?.properties?.priority).toEqual({
      type: 'integer',
      minimum: 1,
    })
    expect(publicJsonSchema.$defs?.SchemaSummarySection?.properties?.fields).toEqual({
      type: 'array',
      items: { type: 'string' },
    })
    expect(publicJsonSchema.$defs?.SchemaSummarySection?.properties?.purpose).toEqual({
      type: 'string',
    })
    expect(publicJsonSchema.$defs?.SchemaSummarySection?.properties?.recommendedWhen).toEqual({
      type: 'array',
      items: { type: 'string' },
    })
    expect(publicJsonSchema.$defs?.SchemaSuccessReadOrderGroup?.required).toEqual(expect.arrayContaining([
      'stage',
      'fields',
    ]))
    expect(publicJsonSchema.$defs?.SchemaSuccessReadOrderGroup?.properties?.stage).toEqual({
      type: 'string',
      enum: ['summary', 'selection', 'items', 'detail', 'artifacts'],
    })
    expect(publicJsonSchema.$defs?.SchemaFailureReadOrderGroup?.required).toEqual(expect.arrayContaining([
      'stage',
      'fields',
    ]))
    expect(publicJsonSchema.$defs?.SchemaFailureReadOrderGroup?.properties?.stage).toEqual({
      type: 'string',
      enum: ['error-core', 'error-details', 'error-recovery'],
    })
  })

  it('machine-readable schema 覆盖 current/list summary.platformStats def', () => {
    expect(publicJsonSchema.$defs?.ExecutabilityStats).toBeDefined()
    expect(publicJsonSchema.$defs?.CurrentSummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/CurrentListPlatformStat' },
    })
    expect(publicJsonSchema.$defs?.CurrentSummary?.properties?.referenceStats).toEqual({
      $ref: '#/$defs/SecretReferenceStats',
    })
    expect(publicJsonSchema.$defs?.CurrentSummary?.properties?.executabilityStats).toEqual({
      $ref: '#/$defs/ExecutabilityStats',
    })
    expect(publicJsonSchema.$defs?.CurrentSummary?.properties?.triageStats).toEqual({
      $ref: '#/$defs/ReadonlyTriageStats',
    })
    expect(publicJsonSchema.$defs?.ListSummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/CurrentListPlatformStat' },
    })
    expect(publicJsonSchema.$defs?.ListSummary?.properties?.referenceStats).toEqual({
      $ref: '#/$defs/SecretReferenceStats',
    })
    expect(publicJsonSchema.$defs?.ListSummary?.properties?.executabilityStats).toEqual({
      $ref: '#/$defs/ExecutabilityStats',
    })
    expect(publicJsonSchema.$defs?.ListSummary?.properties?.triageStats).toEqual({
      $ref: '#/$defs/ReadonlyTriageStats',
    })
    expect(publicJsonSchema.$defs?.CurrentListPlatformStat?.required).toEqual(expect.arrayContaining([
      'platform',
      'profileCount',
      'managed',
    ]))
    expect(publicJsonSchema.$defs?.CurrentListPlatformStat?.properties?.referenceStats).toEqual({
      $ref: '#/$defs/SecretReferenceStats',
    })
    expect(publicJsonSchema.$defs?.CurrentListPlatformStat?.properties?.platformSummary).toEqual({
      $ref: '#/$defs/PlatformExplainableSummary',
    })
  })

  it('用类型断言定义 validate/export platformSummary 的最小公共 contract', () => {
    expectTypeOf<ValidateCommandOutput>().toMatchTypeOf<{
      items: Array<{
        referenceSummary?: {
          hasReferenceFields: boolean
          hasInlineSecrets: boolean
          writeUnsupported: boolean
          resolvedReferenceCount: number
          missingReferenceCount: number
          unsupportedReferenceCount: number
          missingValueCount: number
        }
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
        referenceSummary?: {
          hasReferenceFields: boolean
          hasInlineSecrets: boolean
          writeUnsupported: boolean
          resolvedReferenceCount: number
          missingReferenceCount: number
          unsupportedReferenceCount: number
          missingValueCount: number
        }
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
        secretExportSummary?: {
          hasInlineSecrets: boolean
          hasRedactedInlineSecrets: boolean
          hasReferenceSecrets: boolean
          redactedFieldCount: number
          preservedReferenceCount: number
          details?: Array<{
            field: string
            kind: 'inline-secret-redacted' | 'inline-secret-exported' | 'reference-preserved'
          }>
        }
      }>
    }>()

    expectTypeOf<ValidateCommandOutput>().toMatchTypeOf<{
      summary: {
        referenceStats?: {
          profileCount: number
          referenceProfileCount: number
          inlineProfileCount: number
          writeUnsupportedProfileCount: number
          hasReferenceProfiles: boolean
          hasInlineProfiles: boolean
          hasWriteUnsupportedProfiles: boolean
        }
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
          hasInlineReadyProfiles: boolean
          hasReferenceReadyProfiles: boolean
          hasReferenceMissingProfiles: boolean
          hasWriteUnsupportedProfiles: boolean
          hasSourceRedactedProfiles: boolean
        }
        triageStats?: {
          totalItems: number
          buckets: Array<{
            id: string
            title: string
            totalCount: number
            summaryFields: string[]
            itemFields?: string[]
            recommendedNextStep: string
          }>
        }
        platformStats?: Array<{
          platform: string
          profileCount: number
          okCount: number
          warningCount: number
          limitationCount: number
          referenceStats?: {
            profileCount: number
            referenceProfileCount: number
            inlineProfileCount: number
            writeUnsupportedProfileCount: number
            hasReferenceProfiles: boolean
            hasInlineProfiles: boolean
            hasWriteUnsupportedProfiles: boolean
          }
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
        referenceStats?: {
          profileCount: number
          referenceProfileCount: number
          inlineProfileCount: number
          writeUnsupportedProfileCount: number
          hasReferenceProfiles: boolean
          hasInlineProfiles: boolean
          hasWriteUnsupportedProfiles: boolean
        }
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
          hasInlineReadyProfiles: boolean
          hasReferenceReadyProfiles: boolean
          hasReferenceMissingProfiles: boolean
          hasWriteUnsupportedProfiles: boolean
          hasSourceRedactedProfiles: boolean
        }
        triageStats?: {
          totalItems: number
          buckets: Array<{
            id: string
            title: string
            totalCount: number
            summaryFields: string[]
            itemFields?: string[]
            recommendedNextStep: string
          }>
        }
        platformStats?: Array<{
          platform: string
          profileCount: number
          okCount: number
          warningCount: number
          limitationCount: number
          referenceStats?: {
            profileCount: number
            referenceProfileCount: number
            inlineProfileCount: number
            writeUnsupportedProfileCount: number
            hasReferenceProfiles: boolean
            hasInlineProfiles: boolean
            hasWriteUnsupportedProfiles: boolean
          }
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
        secretExportPolicy?: {
          mode: 'redacted-by-default' | 'include-secrets'
          inlineSecretsExported: number
          inlineSecretsRedacted: number
          referenceSecretsPreserved: number
          profilesWithRedactedSecrets: number
        }
      }
    }>()
  })

  it('machine-readable schema 覆盖 validate/export platformSummary defs', () => {
    expect(publicJsonSchema.$defs?.ValidateCommandOutput).toBeDefined()
    expect(publicJsonSchema.$defs?.ValidateCommandItem?.properties?.platformSummary).toEqual({
      $ref: '#/$defs/PlatformExplainableSummary',
    })
    expect(publicJsonSchema.$defs?.ValidateCommandItem?.properties?.referenceSummary).toEqual({
      $ref: '#/$defs/ReferenceSummary',
    })

    expect(publicJsonSchema.$defs?.ExportCommandOutput).toBeDefined()
    expect(publicJsonSchema.$defs?.ExportedProfileItem?.properties?.platformSummary).toEqual({
      $ref: '#/$defs/PlatformExplainableSummary',
    })
    expect(publicJsonSchema.$defs?.ExportedProfileItem?.properties?.referenceSummary).toEqual({
      $ref: '#/$defs/ReferenceSummary',
    })
    expect(publicJsonSchema.$defs?.ExportedProfileItem?.properties?.secretExportSummary).toEqual({
      $ref: '#/$defs/SecretExportItemSummary',
    })
  })

  it('machine-readable schema 覆盖 validate/export summary.platformStats def', () => {
    expect(publicJsonSchema.$defs?.ValidateSummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ValidateExportPlatformStat' },
    })
    expect(publicJsonSchema.$defs?.ValidateSummary?.properties?.referenceStats).toEqual({
      $ref: '#/$defs/SecretReferenceStats',
    })
    expect(publicJsonSchema.$defs?.ValidateSummary?.properties?.executabilityStats).toEqual({
      $ref: '#/$defs/ExecutabilityStats',
    })
    expect(publicJsonSchema.$defs?.ValidateSummary?.properties?.triageStats).toEqual({
      $ref: '#/$defs/ReadonlyTriageStats',
    })
    expect(publicJsonSchema.$defs?.ExportSummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ValidateExportPlatformStat' },
    })
    expect(publicJsonSchema.$defs?.ExportSummary?.properties?.referenceStats).toEqual({
      $ref: '#/$defs/SecretReferenceStats',
    })
    expect(publicJsonSchema.$defs?.ExportSummary?.properties?.executabilityStats).toEqual({
      $ref: '#/$defs/ExecutabilityStats',
    })
    expect(publicJsonSchema.$defs?.ExportSummary?.properties?.triageStats).toEqual({
      $ref: '#/$defs/ReadonlyTriageStats',
    })
    expect(publicJsonSchema.$defs?.ExportSummary?.properties?.secretExportPolicy).toEqual({
      $ref: '#/$defs/SecretExportPolicySummary',
    })
    expect(publicJsonSchema.$defs?.ValidateExportPlatformStat?.required).toEqual(expect.arrayContaining([
      'platform',
      'profileCount',
      'okCount',
      'warningCount',
      'limitationCount',
    ]))
    expect(publicJsonSchema.$defs?.ValidateExportPlatformStat?.properties?.referenceStats).toEqual({
      $ref: '#/$defs/SecretReferenceStats',
    })
    expect(publicJsonSchema.$defs?.ValidateExportPlatformStat?.properties?.platformSummary).toEqual({
      $ref: '#/$defs/PlatformExplainableSummary',
    })
  })

  it('machine-readable schema 覆盖 export secret redaction defs', () => {
    expect(publicJsonSchema.$defs?.SecretExportPolicySummary?.required).toEqual([
      'mode',
      'inlineSecretsExported',
      'inlineSecretsRedacted',
      'referenceSecretsPreserved',
      'profilesWithRedactedSecrets',
    ])
    expect(publicJsonSchema.$defs?.SecretExportPolicySummary?.properties?.mode).toEqual({
      type: 'string',
      enum: ['redacted-by-default', 'include-secrets'],
    })
    expect(publicJsonSchema.$defs?.SecretExportItemSummary?.required).toEqual([
      'hasInlineSecrets',
      'hasRedactedInlineSecrets',
      'hasReferenceSecrets',
      'redactedFieldCount',
      'preservedReferenceCount',
    ])
    expect(publicJsonSchema.$defs?.SecretExportItemSummary?.properties?.details).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SecretExportItemDetail' },
    })
    expect(publicJsonSchema.$defs?.SecretExportItemDetail?.properties?.kind).toEqual({
      type: 'string',
      enum: ['inline-secret-redacted', 'inline-secret-exported', 'reference-preserved'],
    })
  })

  it('machine-readable schema 覆盖 SecretReferenceStats def', () => {
    expect(publicJsonSchema.$defs?.SecretReferenceStats?.required).toEqual([
      'profileCount',
      'referenceProfileCount',
      'resolvedReferenceProfileCount',
      'missingReferenceProfileCount',
      'unsupportedReferenceProfileCount',
      'inlineProfileCount',
      'writeUnsupportedProfileCount',
      'hasReferenceProfiles',
      'hasResolvedReferenceProfiles',
      'hasMissingReferenceProfiles',
      'hasUnsupportedReferenceProfiles',
      'hasInlineProfiles',
      'hasWriteUnsupportedProfiles',
    ])
    expect(publicJsonSchema.$defs?.SecretReferenceStats?.properties?.referenceProfileCount).toEqual({ type: 'integer', minimum: 0 })
    expect(publicJsonSchema.$defs?.SecretReferenceStats?.properties?.resolvedReferenceProfileCount).toEqual({ type: 'integer', minimum: 0 })
    expect(publicJsonSchema.$defs?.SecretReferenceStats?.properties?.missingReferenceProfileCount).toEqual({ type: 'integer', minimum: 0 })
    expect(publicJsonSchema.$defs?.SecretReferenceStats?.properties?.unsupportedReferenceProfileCount).toEqual({ type: 'integer', minimum: 0 })
    expect(publicJsonSchema.$defs?.SecretReferenceStats?.properties?.inlineProfileCount).toEqual({ type: 'integer', minimum: 0 })
    expect(publicJsonSchema.$defs?.SecretReferenceStats?.properties?.writeUnsupportedProfileCount).toEqual({ type: 'integer', minimum: 0 })
    expect(publicJsonSchema.$defs?.SecretReferenceStats?.properties?.hasReferenceProfiles).toEqual({ type: 'boolean' })
    expect(publicJsonSchema.$defs?.SecretReferenceStats?.properties?.hasResolvedReferenceProfiles).toEqual({ type: 'boolean' })
    expect(publicJsonSchema.$defs?.SecretReferenceStats?.properties?.hasMissingReferenceProfiles).toEqual({ type: 'boolean' })
    expect(publicJsonSchema.$defs?.SecretReferenceStats?.properties?.hasUnsupportedReferenceProfiles).toEqual({ type: 'boolean' })
    expect(publicJsonSchema.$defs?.SecretReferenceStats?.properties?.hasInlineProfiles).toEqual({ type: 'boolean' })
    expect(publicJsonSchema.$defs?.SecretReferenceStats?.properties?.hasWriteUnsupportedProfiles).toEqual({ type: 'boolean' })
  })

  it('machine-readable schema 覆盖 readonly triage defs', () => {
    expect(publicJsonSchema.$defs?.ReadonlyTriageStats?.required).toEqual([
      'totalItems',
      'buckets',
    ])
    expect(publicJsonSchema.$defs?.ReadonlyTriageBucketStat?.required).toEqual([
      'id',
      'title',
      'totalCount',
      'summaryFields',
      'recommendedNextStep',
    ])
    expect(publicJsonSchema.$defs?.ReadonlyTriageBucketStat?.properties?.id).toEqual({
      type: 'string',
      enum: ['overview', 'reference-governance', 'write-readiness', 'source-blocked', 'platform-routing'],
    })
  })

  it('machine-readable schema 覆盖 ReferenceSummary def', () => {
    expect(publicJsonSchema.$defs?.ReferenceSummary?.required).toEqual([
      'hasReferenceFields',
      'hasInlineSecrets',
      'writeUnsupported',
      'resolvedReferenceCount',
      'missingReferenceCount',
      'unsupportedReferenceCount',
      'missingValueCount',
    ])
    expect(publicJsonSchema.$defs?.ReferenceSummary?.properties?.hasReferenceFields).toEqual({ type: 'boolean' })
    expect(publicJsonSchema.$defs?.ReferenceSummary?.properties?.hasInlineSecrets).toEqual({ type: 'boolean' })
    expect(publicJsonSchema.$defs?.ReferenceSummary?.properties?.writeUnsupported).toEqual({ type: 'boolean' })
    expect(publicJsonSchema.$defs?.ReferenceSummary?.properties?.resolvedReferenceCount).toEqual({ type: 'integer', minimum: 0 })
    expect(publicJsonSchema.$defs?.ReferenceSummary?.properties?.missingReferenceCount).toEqual({ type: 'integer', minimum: 0 })
    expect(publicJsonSchema.$defs?.ReferenceSummary?.properties?.unsupportedReferenceCount).toEqual({ type: 'integer', minimum: 0 })
    expect(publicJsonSchema.$defs?.ReferenceSummary?.properties?.missingValueCount).toEqual({ type: 'integer', minimum: 0 })
    expect(publicJsonSchema.$defs?.ReferenceSummary?.properties?.referenceDetails).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ReferenceGovernanceDetail' },
    })
  })

  it('machine-readable schema 覆盖 reference governance failure def', () => {
    expectTypeOf<ReferenceGovernanceFailureDetails>().toMatchTypeOf<{
      hasReferenceProfiles: boolean
      hasInlineProfiles: boolean
      hasWriteUnsupportedProfiles: boolean
      primaryReason?: 'REFERENCE_WRITE_UNSUPPORTED' | 'INLINE_SECRET_PRESENT' | 'REFERENCE_MISSING' | 'REFERENCE_INPUT_CONFLICT'
      reasonCodes: Array<'REFERENCE_WRITE_UNSUPPORTED' | 'INLINE_SECRET_PRESENT' | 'REFERENCE_MISSING' | 'REFERENCE_INPUT_CONFLICT'>
      referenceDetails?: Array<{
        code: 'REFERENCE_VALUE_MISSING' | 'REFERENCE_ENV_RESOLVED' | 'REFERENCE_ENV_UNRESOLVED' | 'REFERENCE_SCHEME_UNSUPPORTED'
        field: string
        status: 'resolved' | 'missing' | 'unsupported-scheme'
        reference?: string
        scheme?: string
        message: string
      }>
    }>()
    expectTypeOf<ValidationFailureDetails>().toMatchTypeOf<{
      referenceGovernance?: ReferenceGovernanceFailureDetails
    }>()

    expect(publicJsonSchema.$defs?.ReferenceGovernanceFailureDetails?.required).toEqual([
      'hasReferenceProfiles',
      'hasInlineProfiles',
      'hasWriteUnsupportedProfiles',
      'reasonCodes',
    ])
    expect(publicJsonSchema.$defs?.ReferenceGovernanceFailureDetails?.properties?.primaryReason).toMatchObject({
      enum: expect.arrayContaining([
        'REFERENCE_WRITE_UNSUPPORTED',
        'INLINE_SECRET_PRESENT',
        'REFERENCE_MISSING',
        'REFERENCE_INPUT_CONFLICT',
      ]),
    })
    expect(publicJsonSchema.$defs?.ReferenceGovernanceFailureDetails?.properties?.reasonCodes).toEqual({
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'REFERENCE_WRITE_UNSUPPORTED',
          'INLINE_SECRET_PRESENT',
          'REFERENCE_MISSING',
          'REFERENCE_INPUT_CONFLICT',
        ],
      },
    })
    expect(publicJsonSchema.$defs?.ReferenceGovernanceFailureDetails?.properties?.referenceDetails).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/ReferenceGovernanceDetail' },
    })
    expect(publicJsonSchema.$defs?.ReferenceGovernanceDetail?.required).toEqual([
      'code',
      'field',
      'status',
      'message',
    ])
    expect(publicJsonSchema.$defs?.ReferenceGovernanceDetail?.properties?.code).toEqual({
      type: 'string',
      enum: [
        'REFERENCE_VALUE_MISSING',
        'REFERENCE_ENV_RESOLVED',
        'REFERENCE_ENV_UNRESOLVED',
        'REFERENCE_SCHEME_UNSUPPORTED',
      ],
    })
    expect(publicJsonSchema.$defs?.ReferenceGovernanceDetail?.properties?.status).toEqual({
      type: 'string',
      enum: ['resolved', 'missing', 'unsupported-scheme'],
    })
    expect(publicJsonSchema.$defs?.ValidationFailureDetails?.properties?.referenceGovernance).toEqual({
      $ref: '#/$defs/ReferenceGovernanceFailureDetails',
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
        referenceStats?: {
          profileCount: number
          referenceProfileCount: number
          inlineProfileCount: number
          writeUnsupportedProfileCount: number
        }
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
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
        referenceStats?: {
          profileCount: number
          referenceProfileCount: number
          inlineProfileCount: number
          writeUnsupportedProfileCount: number
        }
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
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
        referenceStats?: {
          profileCount: number
          referenceProfileCount: number
          inlineProfileCount: number
          writeUnsupportedProfileCount: number
        }
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
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
    expect(publicJsonSchema.$defs?.PreviewSummary?.properties?.referenceStats).toEqual({
      $ref: '#/$defs/SecretReferenceStats',
    })
    expect(publicJsonSchema.$defs?.PreviewSummary?.properties?.executabilityStats).toEqual({
      $ref: '#/$defs/ExecutabilityStats',
    })
    expect(publicJsonSchema.$defs?.AddSummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SinglePlatformStat' },
    })
    expect(publicJsonSchema.$defs?.AddSummary?.properties?.referenceStats).toEqual({
      $ref: '#/$defs/SecretReferenceStats',
    })
    expect(publicJsonSchema.$defs?.AddSummary?.properties?.executabilityStats).toEqual({
      $ref: '#/$defs/ExecutabilityStats',
    })
    expect(publicJsonSchema.$defs?.UseSummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SinglePlatformStat' },
    })
    expect(publicJsonSchema.$defs?.UseSummary?.properties?.referenceStats).toEqual({
      $ref: '#/$defs/SecretReferenceStats',
    })
    expect(publicJsonSchema.$defs?.UseSummary?.properties?.executabilityStats).toEqual({
      $ref: '#/$defs/ExecutabilityStats',
    })
    expect(publicJsonSchema.$defs?.RollbackSummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SinglePlatformStat' },
    })
    expect(publicJsonSchema.$defs?.RollbackSummary?.properties?.referenceStats).toEqual({
      $ref: '#/$defs/SecretReferenceStats',
    })
    expect(publicJsonSchema.$defs?.RollbackSummary?.properties?.executabilityStats).toEqual({
      $ref: '#/$defs/ExecutabilityStats',
    })
    expect(publicJsonSchema.$defs?.ImportApplySummary?.properties?.platformStats).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SinglePlatformStat' },
    })
    expect(publicJsonSchema.$defs?.ImportApplySummary?.properties?.referenceStats).toEqual({
      $ref: '#/$defs/SecretReferenceStats',
    })
    expect(publicJsonSchema.$defs?.ImportApplySummary?.properties?.executabilityStats).toEqual({
      $ref: '#/$defs/ExecutabilityStats',
    })
    expect(publicJsonSchema.$defs?.AddCommandOutput?.properties?.summary).toEqual({
      $ref: '#/$defs/AddSummary',
    })
    expect(publicJsonSchema.$defs?.UseCommandOutput?.properties?.summary).toEqual({
      $ref: '#/$defs/UseSummary',
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

  it('action=import-apply redacted inline secret 失败样例能通过 machine-readable schema 校验', () => {
    const redactedSourceFailureResult = {
      schemaVersion: '2026-04-15.public-json.v1',
      ok: false,
      action: 'import-apply',
      warnings: [
        '导入文件包含 2 个 redacted inline secret 占位值；import preview 会保留字段位置，但不会把它当作真实 secret 明文。',
      ],
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

    expect(validatePublicSchema(redactedSourceFailureResult)).toBe(true)
  })

  it('action=import-apply validation 失败样例支持 referenceGovernance 索引', () => {
    const validationFailureResult = {
      schemaVersion: '2026-04-15.public-json.v1',
      ok: false,
      action: 'import-apply',
      warnings: [],
      limitations: [],
      error: {
        code: 'VALIDATION_FAILED',
        message: '配置校验失败',
        details: {
          ok: false,
          errors: [
            {
              code: 'SECRET_REFERENCE_MISSING',
              level: 'error',
              message: 'profile.source.secret_ref 缺少可用的 secret 引用。',
            },
          ],
          warnings: [],
          limitations: [],
          referenceGovernance: {
            hasReferenceProfiles: false,
            hasInlineProfiles: false,
            hasWriteUnsupportedProfiles: false,
            primaryReason: 'REFERENCE_MISSING',
            reasonCodes: ['REFERENCE_MISSING'],
            referenceDetails: [
              {
                code: 'REFERENCE_VALUE_MISSING',
                field: 'source.secret_ref',
                status: 'missing',
                message: 'profile.source.secret_ref 缺少可用的 secret 引用。',
              },
            ],
          },
        },
      },
    }

    expect(validatePublicSchema(validationFailureResult)).toBe(true)
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
