import { describe, expect, it } from 'vitest'
import { getReadonlySummarySections } from '../../src/constants/readonly-summary-sections'
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

  it('public schema 为 commandCatalog.summarySections 提供稳定定义', () => {
    const schema = loadPublicJsonSchema()
    const capability = schema.$defs?.SchemaActionCapability
    const summarySection = schema.$defs?.SchemaSummarySection

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
  })
})
