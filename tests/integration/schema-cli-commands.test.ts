import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../../src/constants/public-json-schema'
import {
  parseJsonResult,
  runCli,
  setupCliIntegrationContext,
  teardownCliIntegrationContext,
  type CliIntegrationContext,
} from './helpers/cli-testkit'

let context: CliIntegrationContext

beforeEach(async () => {
  context = await setupCliIntegrationContext()
})

afterEach(async () => {
  await teardownCliIntegrationContext()
})

describe('schema cli commands integration', () => {
  it('schema --json --catalog-summary 只返回轻量 catalog 索引', async () => {
    const result = await runCli(['schema', '--json', '--catalog-summary'])
    const payload = parseJsonResult<{
      catalogSummary?: {
        counts: {
          consumerProfiles: number
          actions: number
          recommendedActions: number
        }
        consumerProfiles: Array<{
          id: string
          bestEntryAction: string
          defaultConsumerActionId?: string
          defaultCommandExample?: string
          defaultCommandPurpose?: string
          hasStarterTemplate?: boolean
          starterTemplateId?: string
          recommendedEntryMode?: 'starter-template' | 'full-consumer-profile'
        }>
        actions: Array<{ action: string }>
        recommendedActions: Array<{ code: string; family: string }>
      }
      commandCatalog?: unknown
      schema?: unknown
      schemaId?: string
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')
    expect(payload.data?.catalogSummary).toEqual({
      counts: {
        consumerProfiles: 3,
        actions: 11,
        recommendedActions: 15,
      },
      consumerProfiles: [
        {
          id: 'readonly-state-audit',
          bestEntryAction: 'current',
          defaultConsumerActionId: 'inspect-overview',
          defaultCommandExample: 'api-switcher current --json',
          defaultCommandPurpose: '先读取当前状态与平台级聚合，再决定是否进入 list / validate / export。',
          hasStarterTemplate: true,
          starterTemplateId: 'readonly-state-audit-minimal-reader',
          recommendedEntryMode: 'starter-template',
        },
        {
          id: 'single-platform-write',
          bestEntryAction: 'preview',
          recommendedEntryMode: 'full-consumer-profile',
        },
        {
          id: 'readonly-import-batch',
          bestEntryAction: 'import',
          defaultConsumerActionId: 'repair-source-blockers',
          defaultCommandExample: 'api-switcher import <file> --json',
          defaultCommandPurpose: '先做导入源分流与可执行性判断，再决定是否修复源数据或继续 apply。',
          hasStarterTemplate: true,
          starterTemplateId: 'readonly-import-batch-minimal-reader',
          recommendedEntryMode: 'starter-template',
        },
      ],
      actions: [
        { action: 'add' },
        { action: 'current' },
        { action: 'export' },
        { action: 'import' },
        { action: 'import-apply' },
        { action: 'list' },
        { action: 'preview' },
        { action: 'rollback' },
        { action: 'schema' },
        { action: 'use' },
        { action: 'validate' },
      ],
      recommendedActions: [
        { code: 'inspect-items', family: 'inspect' },
        { code: 'review-reference-details', family: 'inspect' },
        { code: 'repair-source-input', family: 'repair' },
        { code: 'group-by-platform', family: 'route' },
        { code: 'continue-to-write', family: 'execute' },
        { code: 'fix-input-and-retry', family: 'repair' },
        { code: 'select-existing-resource', family: 'repair' },
        { code: 'resolve-scope-before-retry', family: 'repair' },
        { code: 'confirm-before-write', family: 'execute' },
        { code: 'check-platform-support', family: 'repair' },
        { code: 'inspect-runtime-details', family: 'inspect' },
        { code: 'check-import-source', family: 'repair' },
        { code: 'fix-reference-input', family: 'repair' },
        { code: 'resolve-reference-support', family: 'repair' },
        { code: 'migrate-inline-secret', family: 'repair' },
      ],
    })
    expect(payload.data?.commandCatalog).toBeUndefined()
    expect(payload.data?.schema).toBeUndefined()
    expect(payload.data?.schemaId).toBeUndefined()
  })

  it('schema --json 暴露 use/import-apply 失败态 referenceGovernance 消费入口', async () => {
    const result = await runCli(['schema', '--json'])
    const payload = parseJsonResult<{
      commandCatalog: {
        actions: Array<{
          action: string
          primaryErrorFields: string[]
          failureCodes: Array<{
            code: string
            priority: number
            category: string
            recommendedHandling: string
            appliesWhen?: string
            triggerFields?: string[]
          }>
          fieldPresence: Array<{ path: string; channel: string; presence: string; conditionCode?: string }>
          fieldSources: Array<{ path: string; channel: string; source: string }>
          fieldStability: Array<{ path: string; channel: string; stabilityTier: string }>
          readOrderGroups: { failure: Array<{ stage: string; fields: string[] }> }
          primaryErrorFieldSemantics: Array<{ path: string; semantic: string }>
          referenceGovernanceCodes?: Array<{
            code: string
            priority: number
            category: string
            recommendedHandling: string
            appliesWhen: string
            triggerFields: string[]
          }>
        }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)

    for (const actionName of ['use', 'import-apply']) {
      const action = payload.data?.commandCatalog.actions.find((item) => item.action === actionName)
      expect(action?.primaryErrorFields).toContain('error.details.referenceGovernance')
      expect(action?.fieldPresence).toContainEqual({
        path: 'error.details.referenceGovernance',
        channel: 'failure',
        presence: 'conditional',
        conditionCode: 'WHEN_REFERENCE_GOVERNANCE_FAILURE_IS_DETECTED',
      })
      expect(action?.fieldSources).toContainEqual({
        path: 'error.details.referenceGovernance',
        channel: 'failure',
        source: 'command-service',
      })
      expect(action?.fieldStability).toContainEqual({
        path: 'error.details.referenceGovernance',
        channel: 'failure',
        stabilityTier: 'stable',
      })
      expect(action?.readOrderGroups.failure.find((group) => group.stage === 'error-details')?.fields).toContain('error.details.referenceGovernance')
      expect(action?.primaryErrorFieldSemantics).toContainEqual({
        path: 'error.details.referenceGovernance',
        semantic: 'reference-governance',
      })

      if (actionName === 'import-apply') {
        expect(action?.failureCodes).toEqual(expect.arrayContaining([
          expect.objectContaining({
            code: 'IMPORT_APPLY_BATCH_PLATFORM_MISMATCH',
            priority: 5,
            category: 'platform',
            recommendedHandling: 'group-by-platform',
          }),
          expect.objectContaining({
            code: 'IMPORT_SOURCE_REDACTED_INLINE_SECRETS',
            priority: 6,
            category: 'source',
            recommendedHandling: 'check-import-source',
            appliesWhen: '当错误来自导入源文件、schema 或 profile 选择问题时优先使用。',
            triggerFields: ['error.code', 'error.details.sourceFile'],
          }),
          expect.objectContaining({
            code: 'IMPORT_APPLY_BATCH_PARTIAL_FAILURE',
            priority: 14,
            category: 'runtime',
            recommendedHandling: 'inspect-runtime-details',
          }),
        ]))
      }

      expect(action?.referenceGovernanceCodes).toEqual([
        {
          code: 'REFERENCE_INPUT_CONFLICT',
          priority: 1,
          category: 'input',
          recommendedHandling: 'fix-reference-input',
          appliesWhen: '当 reference 输入彼此冲突，必须先统一输入来源时优先使用。',
          triggerFields: ['error.details.referenceGovernance.primaryReason', 'error.details.referenceGovernance.reasonCodes', 'error.details.referenceGovernance.referenceDetails'],
        },
        {
          code: 'REFERENCE_MISSING',
          priority: 2,
          category: 'reference',
          recommendedHandling: 'fix-reference-input',
          appliesWhen: '当 reference 缺少必需值，必须先补齐缺失引用或环境来源时优先使用。',
          triggerFields: ['error.details.referenceGovernance.primaryReason', 'error.details.referenceGovernance.reasonCodes', 'error.details.referenceGovernance.referenceDetails'],
        },
        {
          code: 'REFERENCE_WRITE_UNSUPPORTED',
          priority: 3,
          category: 'reference',
          recommendedHandling: 'resolve-reference-support',
          appliesWhen: '当平台已识别 reference，但当前写入目标不支持该形态时优先使用。',
          triggerFields: ['error.details.referenceGovernance.primaryReason', 'error.details.referenceGovernance.reasonCodes', 'error.details.referenceGovernance.referenceDetails'],
        },
        {
          code: 'INLINE_SECRET_PRESENT',
          priority: 4,
          category: 'inline-secret',
          recommendedHandling: 'migrate-inline-secret',
          appliesWhen: '当写入链路检测到 inline secret，必须先迁移到受支持治理形态时优先使用。',
          triggerFields: ['error.details.referenceGovernance.primaryReason', 'error.details.referenceGovernance.reasonCodes', 'error.details.referenceGovernance.referenceDetails'],
        },
      ])
    }
  })

  it('schema --json 暴露 preview 成功态 blocked reference 的消费入口', async () => {
    const result = await runCli(['schema', '--json'])
    const payload = parseJsonResult<{
      commandCatalog: {
        actions: Array<{
          action: string
          primaryFields: string[]
          primaryErrorFields: string[]
          successTextEntries?: Array<{ path: string; textEntryPoint: string; note?: string }>
          fieldPresence: Array<{ path: string; channel: string; presence: string; conditionCode?: string }>
          fieldSources: Array<{ path: string; channel: string; source: string }>
          fieldStability: Array<{ path: string; channel: string; stabilityTier: string }>
          readOrderGroups: {
            success: Array<{ stage: string; fields: string[] }>
            failure: Array<{ stage: string; fields: string[] }>
          }
          primaryFieldSemantics: Array<{ path: string; semantic: string }>
        }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)

    const action = payload.data?.commandCatalog.actions.find((item) => item.action === 'preview')
    expect(action?.primaryFields).toEqual(expect.arrayContaining([
      'referenceReadiness',
      'referenceDecision',
      'referenceGovernance',
    ]))
    expect(action?.successTextEntries).toEqual(expect.arrayContaining([
      {
        path: 'referenceReadiness',
        textEntryPoint: 'reference-stats-summary',
        note: 'preview 文本模式当前没有独立的 referenceReadiness 区块；先看“referenceStats 摘要”，再进入 preview 细节与限制说明。',
      },
    ]))
    expect(action?.primaryErrorFields).not.toContain('error.details.referenceGovernance')
    expect(action?.fieldPresence).toContainEqual({
      path: 'referenceReadiness',
      channel: 'success',
      presence: 'conditional',
      conditionCode: 'WHEN_REFERENCE_DECISION_IS_DETECTED',
    })
    expect(action?.fieldPresence).toContainEqual({
      path: 'referenceDecision',
      channel: 'success',
      presence: 'conditional',
      conditionCode: 'WHEN_REFERENCE_DECISION_IS_DETECTED',
    })
    expect(action?.fieldPresence).toContainEqual({
      path: 'referenceGovernance',
      channel: 'success',
      presence: 'conditional',
      conditionCode: 'WHEN_REFERENCE_GOVERNANCE_IS_EMITTED_IN_SUCCESS_PAYLOAD',
    })
    expect(action?.fieldSources).toContainEqual({
      path: 'referenceReadiness',
      channel: 'success',
      source: 'command-service',
    })
    expect(action?.fieldSources).toContainEqual({
      path: 'referenceDecision',
      channel: 'success',
      source: 'command-service',
    })
    expect(action?.fieldSources).toContainEqual({
      path: 'referenceGovernance',
      channel: 'success',
      source: 'command-service',
    })
    expect(action?.fieldStability).toContainEqual({
      path: 'referenceReadiness',
      channel: 'success',
      stabilityTier: 'stable',
    })
    expect(action?.fieldStability).toContainEqual({
      path: 'referenceDecision',
      channel: 'success',
      stabilityTier: 'stable',
    })
    expect(action?.fieldStability).toContainEqual({
      path: 'referenceGovernance',
      channel: 'success',
      stabilityTier: 'stable',
    })
    expect(action?.readOrderGroups.success.find((group) => group.stage === 'detail')?.fields).toEqual(expect.arrayContaining([
      'referenceReadiness',
      'referenceDecision',
      'referenceGovernance',
    ]))
    expect(action?.readOrderGroups.failure.find((group) => group.stage === 'error-details')?.fields).not.toContain('error.details.referenceGovernance')
    expect(action?.primaryFieldSemantics).toContainEqual({
      path: 'referenceReadiness',
      semantic: 'reference-governance',
    })
    expect(action?.primaryFieldSemantics).toContainEqual({
      path: 'referenceDecision',
      semantic: 'reference-governance',
    })
    expect(action?.primaryFieldSemantics).toContainEqual({
      path: 'referenceGovernance',
      semantic: 'reference-governance',
    })
  })

  it('schema --json 暴露 use 与 rollback 成功态到非 JSON 文本入口的稳定映射', async () => {
    const result = await runCli(['schema', '--json'])
    const payload = parseJsonResult<{
      commandCatalog: {
        actions: Array<{
          action: string
          successTextEntries?: Array<{ path: string; textEntryPoint: string; note?: string }>
        }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)

    const useAction = payload.data?.commandCatalog.actions.find((item) => item.action === 'use')
    expect(useAction?.successTextEntries).toEqual(expect.arrayContaining([
      {
        path: 'platformSummary',
        textEntryPoint: 'platform-summary',
      },
      {
        path: 'scopeAvailability',
        textEntryPoint: 'scope-availability',
      },
      {
        path: 'preview',
        textEntryPoint: 'preview-detail',
      },
    ]))

    const rollbackAction = payload.data?.commandCatalog.actions.find((item) => item.action === 'rollback')
    expect(rollbackAction?.successTextEntries).toEqual(expect.arrayContaining([
      {
        path: 'platformSummary',
        textEntryPoint: 'platform-summary',
      },
      {
        path: 'scopeAvailability',
        textEntryPoint: 'scope-availability',
      },
    ]))

    const importApplyAction = payload.data?.commandCatalog.actions.find((item) => item.action === 'import-apply')
    expect(importApplyAction?.successTextEntries).toEqual(expect.arrayContaining([
      {
        path: 'summary.platformStats',
        textEntryPoint: 'platform-summary',
      },
      {
        path: 'summary.referenceStats',
        textEntryPoint: 'reference-stats-summary',
      },
      {
        path: 'summary.executabilityStats',
        textEntryPoint: 'executability-stats-summary',
      },
      {
        path: 'platformSummary',
        textEntryPoint: 'platform-summary',
      },
      {
        path: 'scopeAvailability',
        textEntryPoint: 'scope-availability',
      },
      {
        path: 'preview',
        textEntryPoint: 'preview-detail',
      },
    ]))

    const addAction = payload.data?.commandCatalog.actions.find((item) => item.action === 'add')
    expect(addAction?.successTextEntries).toEqual(expect.arrayContaining([
      {
        path: 'summary.platformStats',
        textEntryPoint: 'platform-summary',
      },
      {
        path: 'summary.referenceStats',
        textEntryPoint: 'reference-stats-summary',
      },
      {
        path: 'summary.executabilityStats',
        textEntryPoint: 'executability-stats-summary',
      },
      {
        path: 'preview',
        textEntryPoint: 'preview-detail',
      },
    ]))

    const previewAction = payload.data?.commandCatalog.actions.find((item) => item.action === 'preview')
    expect(previewAction?.successTextEntries).toEqual(expect.arrayContaining([
      {
        path: 'summary.platformStats',
        textEntryPoint: 'platform-summary',
      },
      {
        path: 'summary.referenceStats',
        textEntryPoint: 'reference-stats-summary',
      },
      {
        path: 'summary.executabilityStats',
        textEntryPoint: 'executability-stats-summary',
      },
    ]))

    expect(useAction?.successTextEntries).toEqual(expect.arrayContaining([
      {
        path: 'summary.platformStats',
        textEntryPoint: 'platform-summary',
      },
      {
        path: 'summary.referenceStats',
        textEntryPoint: 'reference-stats-summary',
      },
      {
        path: 'summary.executabilityStats',
        textEntryPoint: 'executability-stats-summary',
      },
    ]))

    expect(rollbackAction?.successTextEntries).toEqual(expect.arrayContaining([
      {
        path: 'summary.platformStats',
        textEntryPoint: 'platform-summary',
      },
      {
        path: 'summary.referenceStats',
        textEntryPoint: 'reference-stats-summary',
      },
      {
        path: 'summary.executabilityStats',
        textEntryPoint: 'executability-stats-summary',
      },
    ]))
  })

  it('schema 文本输出当前 public JSON schema 摘要', async () => {
    const result = await runCli(['schema'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[schema] 成功')
    expect(result.stdout).toContain(`Schema Version: ${PUBLIC_JSON_SCHEMA_VERSION}`)
    expect(result.stdout).toContain('Schema ID: https://api-switcher.local/schemas/public-json-output.schema.json')
  })

  it('schema --catalog-summary 文本输出会给出 consumer profile 推荐入口提示', async () => {
    const result = await runCli(['schema', '--catalog-summary'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[schema] 成功')
    expect(result.stdout).toContain('Catalog Summary:')
    expect(result.stdout).toContain('readonly-state-audit')
    expect(result.stdout).toContain('recommended=starter-template')
    expect(result.stdout).toContain('starterTemplate=readonly-state-audit-minimal-reader')
    expect(result.stdout).toContain('defaultAction=inspect-overview')
    expect(result.stdout).toContain('command=api-switcher current --json')
    expect(result.stdout).toContain('next=api-switcher schema --json --consumer-profile readonly-state-audit')
    expect(result.stdout).toContain('single-platform-write')
    expect(result.stdout).toContain('recommended=full-consumer-profile')
    expect(result.stdout).toContain('next=api-switcher schema --json --consumer-profile single-platform-write')
    expect(result.stdout).toContain('readonly-import-batch')
    expect(result.stdout).toContain('starterTemplate=readonly-import-batch-minimal-reader')
    expect(result.stdout).toContain('defaultAction=repair-source-blockers')
    expect(result.stdout).toContain('command=api-switcher import <file> --json')
  })

  it('schema 命令在顶层 help 和子命令 help 中可发现', async () => {
    const root = await runCli(['--help'])
    const schema = await runCli(['schema', '--help'])

    expect(root.stderr).toBe('')
    expect(root.exitCode).toBe(0)
    expect(root.stdout).toContain('schema')
    expect(root.stdout).toContain('输出 public JSON schema')
    expect(root.stdout).toContain('consumerProfiles[].defaultConsumerFlowId')
    expect(root.stdout).toContain('consumerFlow[]')

    expect(schema.stderr).toBe('')
    expect(schema.exitCode).toBe(0)
    expect(schema.stdout).toContain('Usage:')
    expect(schema.stdout).toContain('consumerProfiles[].defaultConsumerFlowId')
    expect(schema.stdout).toContain('consumerFlow[]')
    expect(schema.stdout).toContain('--json')
    expect(schema.stdout).toContain('使用 JSON 输出')
    expect(schema.stdout).toContain('--schema-version')
    expect(schema.stdout).toContain('--consumer-profile <id>')
    expect(schema.stdout).toContain('--action <action>')
    expect(schema.stdout).toContain('--recommended-action <code>')
    expect(schema.stdout).toContain('--catalog-summary')
    expect(schema.stdout).toContain('先用 --catalog-summary')
    expect(schema.stdout).toContain('完整 catalog')
  })
})
