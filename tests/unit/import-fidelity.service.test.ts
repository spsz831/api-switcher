import { describe, expect, it } from 'vitest'
import { ImportFidelityService } from '../../src/services/import-fidelity.service'
import type { ImportObservation } from '../../src/types/command'

function createGeminiObservation(input: Partial<ImportObservation> = {}): ImportObservation {
  return {
    defaultWriteScope: 'user',
    observedAt: '2026-04-16T00:00:00.000Z',
    scopeCapabilities: [
      { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
      { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
    ],
    scopeAvailability: [
      { scope: 'user', status: 'available', detected: true, writable: true, path: 'C:/Users/test/.gemini/settings.json' },
      { scope: 'project', status: 'available', detected: true, writable: true, path: 'E:/project/.gemini/settings.json' },
    ],
    ...input,
  }
}

describe('import fidelity service', () => {
  it('exported project available 且 local project available 时返回 match', () => {
    const result = new ImportFidelityService().evaluate({
      platform: 'gemini',
      exportedObservation: createGeminiObservation(),
      localObservation: createGeminiObservation(),
    })

    expect(result.fidelity).toEqual({
      status: 'match',
      mismatches: [],
      driftSummary: {
        blocking: 0,
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
          totalCount: 0,
          blockingCount: 0,
          warningCount: 0,
          infoCount: 0,
          mismatches: [],
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
      highlights: [],
    })
    expect(result.previewDecision).toEqual({
      canProceedToApplyDesign: true,
      recommendedScope: 'user',
      requiresLocalResolution: false,
      reasonCodes: ['READY_USING_LOCAL_OBSERVATION'],
      reasons: [
        {
          code: 'READY_USING_LOCAL_OBSERVATION',
          blocking: false,
          message: '当前本地 observation 与导出观察一致，可继续基于本地 observation 评估 apply 设计。',
        },
      ],
    })
  })

  it('exported project available 但 local project unresolved 时返回 mismatch', () => {
    const result = new ImportFidelityService().evaluate({
      platform: 'gemini',
      exportedObservation: createGeminiObservation(),
      localObservation: createGeminiObservation({
        scopeAvailability: [
          { scope: 'user', status: 'available', detected: true, writable: true, path: 'C:/Users/test/.gemini/settings.json' },
          {
            scope: 'project',
            status: 'unresolved',
            detected: false,
            writable: false,
            reasonCode: 'PROJECT_ROOT_UNRESOLVED',
            reason: 'Gemini project root is unavailable.',
            remediation: 'Set API_SWITCHER_GEMINI_PROJECT_ROOT.',
          },
        ],
      }),
    })

    expect(result.fidelity.status).toBe('mismatch')
    expect(result.fidelity.mismatches).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'scopeAvailability',
        driftKind: 'availability-drift',
        severity: 'blocking',
        scope: 'project',
        recommendedAction: '先修复本地 project scope 解析，再重新执行 import preview。',
      }),
    ]))
    expect(result.fidelity.groupedMismatches).toEqual([
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
          expect.objectContaining({
            field: 'scopeAvailability',
            scope: 'project',
            driftKind: 'availability-drift',
          }),
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
    ])
    expect(result.fidelity.highlights).toContain('当前本地 scope availability 与导出观察不一致，应以本地实时环境为准。')
    expect(result.previewDecision).toEqual({
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
    })
  })

  it('缺少 exported scopeAvailability 时返回 partial', () => {
    const result = new ImportFidelityService().evaluate({
      platform: 'gemini',
      exportedObservation: createGeminiObservation({
        scopeAvailability: undefined,
      }),
      localObservation: createGeminiObservation(),
    })

    expect(result.fidelity).toEqual({
      status: 'partial',
      mismatches: [],
      driftSummary: {
        blocking: 0,
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
          totalCount: 0,
          blockingCount: 0,
          warningCount: 0,
          infoCount: 0,
          mismatches: [],
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
      highlights: ['导出文件缺少部分 observation 字段，当前只做有限对比。'],
    })
    expect(result.previewDecision).toEqual({
      canProceedToApplyDesign: true,
      recommendedScope: 'user',
      requiresLocalResolution: false,
      reasonCodes: ['LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION'],
      reasons: [
        {
          code: 'LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION',
          blocking: false,
          message: '导出 observation 不完整，当前只适合基于本地 observation 做有限 apply 设计评估。',
        },
      ],
    })
  })

  it('scopeCapabilities 与当前平台契约不一致时返回 mismatch', () => {
    const result = new ImportFidelityService().evaluate({
      platform: 'gemini',
      exportedObservation: createGeminiObservation({
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: false, rollback: true, writable: false, risk: 'normal', confirmationRequired: false },
        ],
      }),
      localObservation: createGeminiObservation(),
    })

    expect(result.fidelity.status).toBe('mismatch')
    expect(result.fidelity.mismatches).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'scopeCapabilities',
        driftKind: 'capability-drift',
        severity: 'warning',
        scope: 'project',
        recommendedAction: '检查当前平台版本或契约是否已变化，再决定是否继续沿用导出策略。',
      }),
    ]))
    expect(result.fidelity.groupedMismatches).toEqual([
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
        totalCount: 0,
        blockingCount: 0,
        warningCount: 0,
        infoCount: 0,
        mismatches: [],
      },
      {
        driftKind: 'capability-drift',
        totalCount: 1,
        blockingCount: 0,
        warningCount: 1,
        infoCount: 0,
        mismatches: [
          expect.objectContaining({
            field: 'scopeCapabilities',
            scope: 'project',
            driftKind: 'capability-drift',
          }),
        ],
      },
    ])
    expect(result.previewDecision).toEqual({
      canProceedToApplyDesign: false,
      recommendedScope: 'user',
      requiresLocalResolution: false,
      reasonCodes: ['BLOCKED_BY_FIDELITY_MISMATCH'],
      reasons: [
        {
          code: 'BLOCKED_BY_FIDELITY_MISMATCH',
          blocking: true,
          message: '导出观察与当前本地观察存在关键漂移，当前不应继续进入 apply 设计。',
        },
      ],
    })
  })

  it('缺少 Gemini observation 时返回 insufficient-data', () => {
    const result = new ImportFidelityService().evaluate({
      platform: 'gemini',
      exportedObservation: undefined,
      localObservation: createGeminiObservation(),
    })

    expect(result.fidelity).toEqual({
      status: 'insufficient-data',
      mismatches: [],
      driftSummary: {
        blocking: 0,
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
          totalCount: 0,
          blockingCount: 0,
          warningCount: 0,
          infoCount: 0,
          mismatches: [],
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
      highlights: ['导出 observation 或本地 observation 缺失，无法建立有效 fidelity 结论。'],
    })
    expect(result.previewDecision).toEqual({
      canProceedToApplyDesign: false,
      recommendedScope: 'user',
      requiresLocalResolution: false,
      reasonCodes: ['BLOCKED_BY_INSUFFICIENT_OBSERVATION'],
      reasons: [
        {
          code: 'BLOCKED_BY_INSUFFICIENT_OBSERVATION',
          blocking: true,
          message: '导出 observation 或本地 observation 缺失，当前不能进入 apply 设计。',
        },
      ],
    })
  })
})
