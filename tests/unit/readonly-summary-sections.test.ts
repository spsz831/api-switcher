import { describe, expect, it } from 'vitest'
import {
  getReadonlyConsumerProfileSummarySectionGuidance,
  getReadonlySummarySections,
} from '../../src/constants/readonly-summary-sections'
import { SchemaService } from '../../src/services/schema.service'
import { loadPublicJsonSchema } from '../helpers/public-json-schema'

describe('readonly summary sections', () => {
  it('为只读命令暴露稳定的 summary section 顺序', () => {
    expect(getReadonlySummarySections('current').map((section) => section.id)).toEqual([
      'platform',
      'reference',
      'executability',
    ])
    expect(getReadonlySummarySections('list').map((section) => section.id)).toEqual([
      'platform',
      'reference',
      'executability',
    ])
    expect(getReadonlySummarySections('validate').map((section) => section.id)).toEqual([
      'platform',
      'reference',
      'executability',
    ])
    expect(getReadonlySummarySections('export').map((section) => section.id)).toEqual([
      'platform',
      'reference',
      'executability',
    ])
    expect(getReadonlySummarySections('import').map((section) => section.id)).toEqual([
      'source-executability',
      'executability',
      'platform',
    ])
  })

  it('schema commandCatalog 为只读命令公开相同的 summarySections', () => {
    const result = new SchemaService().getPublicJsonSchema()
    expect(result.ok).toBe(true)
    if (!result.ok || !result.data || !result.data.commandCatalog) {
      throw new Error('schema commandCatalog is unavailable')
    }

    const actions = result.data.commandCatalog.actions

    for (const action of ['current', 'list', 'validate', 'export', 'import'] as const) {
      const capability = actions.find((item) => item.action === action)
      expect(capability?.summarySections).toEqual(getReadonlySummarySections(action))
    }

    expect(actions.find((item) => item.action === 'preview')?.summarySections).toBeUndefined()
    expect(actions.find((item) => item.action === 'use')?.summarySections).toBeUndefined()
  })

  it('schema consumerProfiles 为只读画像公开共享 summary guidance', () => {
    const result = new SchemaService().getPublicJsonSchema()
    expect(result.ok).toBe(true)
    if (!result.ok || !result.data || !result.data.commandCatalog?.consumerProfiles) {
      throw new Error('schema consumerProfiles are unavailable')
    }

    const profiles = result.data.commandCatalog.consumerProfiles

    expect(profiles.find((item) => item.id === 'readonly-state-audit')?.summarySectionGuidance).toEqual(
      getReadonlyConsumerProfileSummarySectionGuidance('readonly-state-audit'),
    )
    expect(profiles.find((item) => item.id === 'readonly-import-batch')?.summarySectionGuidance).toEqual(
      getReadonlyConsumerProfileSummarySectionGuidance('readonly-import-batch'),
    )
    expect(profiles.find((item) => item.id === 'readonly-state-audit')?.followUpHints).toEqual([
      {
        use: 'overview',
        nextStep: 'inspect-items',
        primaryFields: ['detections', 'platformSummary'],
        purpose: '看完平台级概览后，继续展开检测项或 profile 项，确认具体命中与平台 explainable。',
      },
      {
        use: 'governance',
        nextStep: 'review-reference-details',
        primaryFields: ['detections.referenceSummary', 'profiles.referenceSummary'],
        purpose: '当 summary 暴露出 reference / inline / unsupported 治理信号后，继续展开 item 级 reference explainable。',
      },
      {
        use: 'gating',
        nextStep: 'continue-to-write',
        primaryFields: ['summary.executabilityStats', 'detections.referenceSummary', 'profiles.referenceSummary'],
        purpose: '当只读结果需要决定能否继续进入 use/import apply 时，先结合 executability 聚合与 item 级 reference 细节判断。',
      },
    ])
    expect(profiles.find((item) => item.id === 'readonly-import-batch')?.followUpHints).toEqual([
      {
        use: 'gating',
        nextStep: 'repair-source-input',
        primaryFields: ['summary.sourceExecutability', 'sourceCompatibility', 'items.previewDecision'],
        purpose: '当导入源本身被 redacted inline secret 或 schema 兼容性阻断时，先回到 source 侧修复。',
      },
      {
        use: 'gating',
        nextStep: 'continue-to-write',
        primaryFields: ['summary.executabilityStats', 'items.previewDecision', 'items.fidelity'],
        purpose: '当需要决定是否继续进入 import apply 时，继续展开 item 级 previewDecision 与 fidelity 证据。',
      },
      {
        use: 'routing',
        nextStep: 'group-by-platform',
        primaryFields: ['summary.platformStats', 'platformSummary'],
        purpose: '当 mixed-batch 需要拆分处理时，先按平台聚合与 item 级 platform explainable 分组。',
      },
    ])
    expect(profiles.find((item) => item.id === 'single-platform-write')?.summarySectionGuidance).toBeUndefined()
    expect(profiles.find((item) => item.id === 'single-platform-write')?.followUpHints).toBeUndefined()
  })

  it('public schema 为 commandCatalog.summarySections 提供稳定定义', () => {
    const schema = loadPublicJsonSchema()
    const capability = schema.$defs?.SchemaActionCapability
    const summarySection = schema.$defs?.SchemaSummarySection
    const consumerProfile = schema.$defs?.SchemaConsumerProfile
    const consumerProfileSummarySectionGuidance = schema.$defs?.SchemaConsumerProfileSummarySectionGuidance
    const consumerProfileFollowUpHint = schema.$defs?.SchemaConsumerProfileFollowUpHint

    expect(capability?.properties?.summarySections).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaSummarySection' },
    })
    expect(summarySection?.required).toEqual(expect.arrayContaining([
      'id',
      'title',
      'priority',
      'fields',
      'purpose',
    ]))
    expect(consumerProfile?.properties?.summarySectionGuidance).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaConsumerProfileSummarySectionGuidance' },
    })
    expect(consumerProfileSummarySectionGuidance?.required).toEqual(expect.arrayContaining([
      'id',
      'title',
      'priority',
      'fields',
      'purpose',
      'recommendedUses',
    ]))
    expect(consumerProfile?.properties?.followUpHints).toEqual({
      type: 'array',
      items: { $ref: '#/$defs/SchemaConsumerProfileFollowUpHint' },
    })
    expect(consumerProfileFollowUpHint?.required).toEqual(expect.arrayContaining([
      'use',
      'nextStep',
      'primaryFields',
      'purpose',
    ]))
  })
})
