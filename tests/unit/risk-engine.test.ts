import { describe, expect, it } from 'vitest'
import { evaluateRisk } from '../../src/domain/risk-engine'

describe('risk engine', () => {
  it('在校验失败时阻止执行', () => {
    const result = evaluateRisk(
      {
        platform: 'claude',
        profileId: 'p1',
        targetFiles: [],
        effectiveFields: [],
        storedOnlyFields: [],
        diffSummary: [],
        warnings: [],
        limitations: [],
        riskLevel: 'low',
        requiresConfirmation: false,
        backupPlanned: false,
      },
      {
        ok: false,
        errors: [{ code: 'missing', level: 'error', message: '缺少字段' }],
        warnings: [],
        limitations: [],
      },
    )

    expect(result.allowed).toBe(false)
    expect(result.riskLevel).toBe('high')
  })
})
