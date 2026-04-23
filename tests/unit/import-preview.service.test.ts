import { describe, expect, it } from 'vitest'
import { ImportPreviewService } from '../../src/services/import-preview.service'

describe('import preview service', () => {
  it('Gemini profile 会同时返回 exported/local observations', async () => {
    const profile = {
      id: 'gemini-prod',
      name: 'gemini-prod',
      platform: 'gemini',
      source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
      apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
    } as const

    const result = await new ImportPreviewService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          schemaVersion: '2026-04-15.public-json.v1',
          sourceCompatibility: {
            mode: 'strict',
            schemaVersion: '2026-04-15.public-json.v1',
            warnings: [],
          },
          profiles: [
            {
              profile,
              exportedObservation: {
                defaultWriteScope: 'user',
                observedAt: '2026-04-16T00:00:00.000Z',
                scopeCapabilities: [
                  { scope: 'system-defaults', detect: true, preview: true, use: false, rollback: false, writable: false, note: 'defaults' },
                  { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
                  { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
                  { scope: 'system-overrides', detect: true, preview: true, use: false, rollback: false, writable: false, note: 'overrides' },
                ],
                scopeAvailability: [
                  { scope: 'user', status: 'available', detected: true, writable: true, path: 'C:/Users/test/.gemini/settings.json' },
                ],
              },
            },
          ],
        }),
      } as any,
      {
        get: () => ({
          detectCurrent: async () => ({
            platform: 'gemini',
            managed: true,
            targetFiles: [],
            scopeAvailability: [
              { scope: 'user', status: 'available', detected: true, writable: true, path: 'C:/Users/test/.gemini/settings.json' },
            ],
          }),
        }),
      } as any,
    ).preview('E:/tmp/export.json')

    expect(result.ok).toBe(true)
    expect(result.data?.items).toEqual([
      expect.objectContaining({
        profile,
        platform: 'gemini',
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          facts: [
            { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
            { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
          ],
        },
        exportedObservation: expect.objectContaining({
          defaultWriteScope: 'user',
          observedAt: '2026-04-16T00:00:00.000Z',
        }),
        localObservation: expect.objectContaining({
          defaultWriteScope: 'user',
          scopeAvailability: [
            { scope: 'user', status: 'available', detected: true, writable: true, path: 'C:/Users/test/.gemini/settings.json' },
          ],
        }),
        previewDecision: expect.objectContaining({
          recommendedScope: 'user',
          reasonCodes: ['READY_USING_LOCAL_OBSERVATION'],
        }),
      }),
    ])
    expect(result.data?.summary).toEqual({
      totalItems: 1,
      matchCount: 1,
      mismatchCount: 0,
      partialCount: 0,
      insufficientDataCount: 0,
      sourceExecutability: {
        totalItems: 1,
        applyReadyCount: 1,
        previewOnlyCount: 0,
        blockedCount: 0,
        blockedByCodeStats: [
          { code: 'REDACTED_INLINE_SECRET', totalCount: 0 },
        ],
      },
      executabilityStats: {
        profileCount: 1,
        inlineReadyProfileCount: 1,
        referenceReadyProfileCount: 0,
        referenceMissingProfileCount: 0,
        writeUnsupportedProfileCount: 0,
        sourceRedactedProfileCount: 0,
        hasInlineReadyProfiles: true,
        hasReferenceReadyProfiles: false,
        hasReferenceMissingProfiles: false,
        hasWriteUnsupportedProfiles: false,
        hasSourceRedactedProfiles: false,
      },
      platformStats: [
        {
          platform: 'gemini',
          totalItems: 1,
          matchCount: 1,
          mismatchCount: 0,
          partialCount: 0,
          insufficientDataCount: 0,
        },
      ],
      decisionCodeStats: [
        { code: 'READY_USING_LOCAL_OBSERVATION', totalCount: 1, blockingCount: 0, nonBlockingCount: 1 },
        { code: 'LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION', totalCount: 0, blockingCount: 0, nonBlockingCount: 0 },
        { code: 'BLOCKED_BY_INSUFFICIENT_OBSERVATION', totalCount: 0, blockingCount: 0, nonBlockingCount: 0 },
        { code: 'BLOCKED_BY_FIDELITY_MISMATCH', totalCount: 0, blockingCount: 0, nonBlockingCount: 0 },
        { code: 'REQUIRES_LOCAL_SCOPE_RESOLUTION', totalCount: 0, blockingCount: 0, nonBlockingCount: 0 },
      ],
      driftKindStats: [
        { driftKind: 'default-scope-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
        { driftKind: 'availability-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
        { driftKind: 'capability-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
      ],
      triageStats: {
        totalItems: 1,
        buckets: [
          {
            id: 'source-blocked',
            title: 'Source blocked bucket',
            summaryFields: ['summary.sourceExecutability'],
            itemFields: ['sourceCompatibility', 'items.previewDecision'],
            recommendedNextStep: 'repair-source-input',
            totalCount: 0,
          },
          {
            id: 'write-readiness',
            title: 'Write readiness bucket',
            summaryFields: ['summary.executabilityStats'],
            itemFields: ['items.previewDecision', 'items.fidelity'],
            recommendedNextStep: 'continue-to-write',
            totalCount: 0,
          },
          {
            id: 'platform-routing',
            title: 'Platform routing bucket',
            summaryFields: ['summary.platformStats'],
            itemFields: ['platformSummary'],
            recommendedNextStep: 'group-by-platform',
            totalCount: 1,
          },
        ],
      },
      warnings: [],
      limitations: [],
    })
    expect(result.data?.sourceCompatibility).toEqual({
      mode: 'strict',
      schemaVersion: '2026-04-15.public-json.v1',
      warnings: [],
    })
  })

  it('Gemini local project unresolved 时返回 mismatch 且 requiresLocalResolution=true', async () => {
    const result = await new ImportPreviewService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: {
            mode: 'strict',
            schemaVersion: '2026-04-15.public-json.v1',
            warnings: [],
          },
          profiles: [
            {
              profile: {
                id: 'gemini-prod',
                name: 'gemini-prod',
                platform: 'gemini',
                source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
                apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
              },
              exportedObservation: {
                defaultWriteScope: 'user',
                observedAt: '2026-04-16T00:00:00.000Z',
                scopeCapabilities: [
                  { scope: 'system-defaults', detect: true, preview: true, use: false, rollback: false, writable: false, note: 'defaults' },
                  { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
                  { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
                  { scope: 'system-overrides', detect: true, preview: true, use: false, rollback: false, writable: false, note: 'overrides' },
                ],
                scopeAvailability: [
                  { scope: 'project', status: 'available', detected: true, writable: true, path: 'E:/project/.gemini/settings.json' },
                ],
              },
            },
          ],
        }),
      } as any,
      {
        get: () => ({
          detectCurrent: async () => ({
            platform: 'gemini',
            managed: true,
            targetFiles: [],
            scopeAvailability: [
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
        }),
      } as any,
    ).preview('E:/tmp/export.json')

    expect(result.ok).toBe(true)
    expect(result.data?.items[0]).toEqual(expect.objectContaining({
      fidelity: expect.objectContaining({
        status: 'mismatch',
        groupedMismatches: [
          expect.objectContaining({
            driftKind: 'default-scope-drift',
            totalCount: 0,
          }),
          expect.objectContaining({
            driftKind: 'availability-drift',
            totalCount: 1,
            blockingCount: 1,
            mismatches: [
              expect.objectContaining({
                field: 'scopeAvailability',
                scope: 'project',
              }),
            ],
          }),
          expect.objectContaining({
            driftKind: 'capability-drift',
            totalCount: 0,
          }),
        ],
      }),
      previewDecision: {
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
      },
    }))
    expect(result.data?.summary).toEqual(expect.objectContaining({
      totalItems: 1,
      mismatchCount: 1,
      sourceExecutability: {
        totalItems: 1,
        applyReadyCount: 1,
        previewOnlyCount: 0,
        blockedCount: 0,
        blockedByCodeStats: [
          { code: 'REDACTED_INLINE_SECRET', totalCount: 0 },
        ],
      },
      decisionCodeStats: expect.arrayContaining([
        expect.objectContaining({ code: 'BLOCKED_BY_FIDELITY_MISMATCH', totalCount: 1, blockingCount: 1 }),
        expect.objectContaining({ code: 'REQUIRES_LOCAL_SCOPE_RESOLUTION', totalCount: 1, blockingCount: 1 }),
      ]),
      driftKindStats: expect.arrayContaining([
        expect.objectContaining({ driftKind: 'availability-drift', totalCount: 1, blockingCount: 1 }),
      ]),
      platformStats: [
        expect.objectContaining({
          platform: 'gemini',
          mismatchCount: 1,
        }),
      ],
    }))
  })

  it('非 Gemini profile 也会返回只读 preview item', async () => {
    const result = await new ImportPreviewService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: {
            mode: 'schema-version-missing',
            warnings: ['导入文件未声明 schemaVersion，当前按兼容模式解析。'],
          },
          profiles: [
            {
              profile: {
                id: 'claude-prod',
                name: 'claude-prod',
                platform: 'claude',
                source: { token: 'sk-live-123456' },
                apply: { ANTHROPIC_AUTH_TOKEN: 'sk-live-123456' },
              },
              exportedObservation: {
                defaultWriteScope: 'user',
              },
            },
          ],
        }),
      } as any,
      {
        get: () => ({
          detectCurrent: async () => ({
            platform: 'claude',
            managed: true,
            targetFiles: [],
          }),
        }),
      } as any,
    ).preview('E:/tmp/export.json')

    expect(result.ok).toBe(true)
    expect(result.data?.items[0]).toEqual(expect.objectContaining({
      platform: 'claude',
      platformSummary: {
        kind: 'scope-precedence',
        precedence: ['user', 'project', 'local'],
        facts: [
          { code: 'CLAUDE_SCOPE_PRECEDENCE', message: 'Claude 支持 user < project < local 三层 precedence。' },
          { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '如果存在 local，同名字段最终以 local 为准。' },
        ],
      },
      localObservation: expect.objectContaining({
        defaultWriteScope: 'user',
      }),
      previewDecision: expect.objectContaining({
        recommendedScope: 'user',
        reasonCodes: ['LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION'],
      }),
    }))
    expect(result.data?.summary).toEqual(expect.objectContaining({
      totalItems: 1,
      partialCount: 1,
      sourceExecutability: {
        totalItems: 1,
        applyReadyCount: 1,
        previewOnlyCount: 0,
        blockedCount: 0,
        blockedByCodeStats: [
          { code: 'REDACTED_INLINE_SECRET', totalCount: 0 },
        ],
      },
      decisionCodeStats: expect.arrayContaining([
        expect.objectContaining({ code: 'LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION', totalCount: 1, nonBlockingCount: 1 }),
      ]),
      platformStats: [
        expect.objectContaining({
          platform: 'claude',
          partialCount: 1,
        }),
      ],
    }))
  })

  it('混合批次会准确聚合 match、partial、mismatch 与 insufficient-data 的 summary explainable stats', async () => {
    const createGeminiProfile = (id: string) => ({
      id,
      name: id,
      platform: 'gemini',
      source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
      apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
    } as const)

    const result = await new ImportPreviewService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/mixed-export.json',
          sourceCompatibility: {
            mode: 'strict',
            schemaVersion: '2026-04-15.public-json.v1',
            warnings: [],
          },
          profiles: [
            {
              profile: createGeminiProfile('gemini-match'),
              exportedObservation: {
                defaultWriteScope: 'user',
                observedAt: '2026-04-16T00:00:00.000Z',
                scopeCapabilities: [
                  { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
                ],
                scopeAvailability: [
                  { scope: 'user', status: 'available', detected: true, writable: true, path: 'C:/Users/test/.gemini/settings.json' },
                ],
              },
            },
            {
              profile: createGeminiProfile('gemini-partial'),
              exportedObservation: {
                defaultWriteScope: 'user',
                observedAt: '2026-04-16T00:00:00.000Z',
                scopeCapabilities: [
                  { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
                ],
              },
            },
            {
              profile: createGeminiProfile('gemini-mismatch'),
              exportedObservation: {
                defaultWriteScope: 'user',
                observedAt: '2026-04-16T00:00:00.000Z',
                scopeCapabilities: [
                  { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
                ],
                scopeAvailability: [
                  { scope: 'project', status: 'available', detected: true, writable: true, path: 'E:/project/.gemini/settings.json' },
                ],
              },
            },
            {
              profile: createGeminiProfile('gemini-insufficient'),
              exportedObservation: undefined,
            },
            {
              profile: {
                ...createGeminiProfile('gemini-redacted'),
                source: { apiKey: '<redacted:inline-secret>', authType: 'gemini-api-key' },
                apply: { GEMINI_API_KEY: '<redacted:inline-secret>', enforcedAuthType: 'gemini-api-key' },
              },
              redactedInlineSecretFields: ['source.apiKey', 'apply.GEMINI_API_KEY'],
              exportedObservation: {
                defaultWriteScope: 'user',
                observedAt: '2026-04-16T00:00:00.000Z',
                scopeCapabilities: [
                  { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
                ],
                scopeAvailability: [
                  { scope: 'user', status: 'available', detected: true, writable: true, path: 'C:/Users/test/.gemini/settings.json' },
                ],
              },
            },
          ],
        }),
      } as any,
      {
        get: () => ({
          detectCurrent: async (profiles: Array<{ id: string }>) => {
            const profileId = profiles[0]?.id
            return {
              platform: 'gemini',
              managed: true,
              targetFiles: [],
              scopeAvailability: profileId === 'gemini-mismatch'
                ? [
                    {
                      scope: 'project',
                      status: 'unresolved',
                      detected: false,
                      writable: false,
                      reasonCode: 'PROJECT_ROOT_UNRESOLVED',
                      reason: 'Gemini project root is unavailable.',
                      remediation: 'Set API_SWITCHER_GEMINI_PROJECT_ROOT.',
                    },
                  ]
                : [
                    { scope: 'user', status: 'available', detected: true, writable: true, path: 'C:/Users/test/.gemini/settings.json' },
                  ],
            }
          },
        }),
      } as any,
    ).preview('E:/tmp/mixed-export.json')

    expect(result.ok).toBe(true)
    expect(result.data?.items.map((item) => [item.profile.id, item.fidelity?.status])).toEqual([
      ['gemini-match', 'match'],
      ['gemini-partial', 'partial'],
      ['gemini-mismatch', 'mismatch'],
      ['gemini-insufficient', 'insufficient-data'],
      ['gemini-redacted', 'match'],
    ])
    expect(result.data?.summary).toEqual({
      totalItems: 5,
      matchCount: 2,
      mismatchCount: 1,
      partialCount: 1,
      insufficientDataCount: 1,
      sourceExecutability: {
        totalItems: 5,
        applyReadyCount: 4,
        previewOnlyCount: 1,
        blockedCount: 1,
        blockedByCodeStats: [
          { code: 'REDACTED_INLINE_SECRET', totalCount: 1 },
        ],
      },
      executabilityStats: {
        profileCount: 5,
        inlineReadyProfileCount: 4,
        referenceReadyProfileCount: 0,
        referenceMissingProfileCount: 0,
        writeUnsupportedProfileCount: 0,
        sourceRedactedProfileCount: 1,
        hasInlineReadyProfiles: true,
        hasReferenceReadyProfiles: false,
        hasReferenceMissingProfiles: false,
        hasWriteUnsupportedProfiles: false,
        hasSourceRedactedProfiles: true,
      },
      platformStats: [
        {
          platform: 'gemini',
          totalItems: 5,
          matchCount: 2,
          mismatchCount: 1,
          partialCount: 1,
          insufficientDataCount: 1,
        },
      ],
      decisionCodeStats: [
        { code: 'READY_USING_LOCAL_OBSERVATION', totalCount: 2, blockingCount: 0, nonBlockingCount: 2 },
        { code: 'LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION', totalCount: 1, blockingCount: 0, nonBlockingCount: 1 },
        { code: 'BLOCKED_BY_INSUFFICIENT_OBSERVATION', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
        { code: 'BLOCKED_BY_FIDELITY_MISMATCH', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
        { code: 'REQUIRES_LOCAL_SCOPE_RESOLUTION', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
      ],
      driftKindStats: [
        { driftKind: 'default-scope-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
        { driftKind: 'availability-drift', totalCount: 1, blockingCount: 1, warningCount: 0, infoCount: 0 },
        { driftKind: 'capability-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
      ],
      triageStats: {
        totalItems: 5,
        buckets: [
          {
            id: 'source-blocked',
            title: 'Source blocked bucket',
            summaryFields: ['summary.sourceExecutability'],
            itemFields: ['sourceCompatibility', 'items.previewDecision'],
            recommendedNextStep: 'repair-source-input',
            totalCount: 1,
          },
          {
            id: 'write-readiness',
            title: 'Write readiness bucket',
            summaryFields: ['summary.executabilityStats'],
            itemFields: ['items.previewDecision', 'items.fidelity'],
            recommendedNextStep: 'continue-to-write',
            totalCount: 2,
          },
          {
            id: 'platform-routing',
            title: 'Platform routing bucket',
            summaryFields: ['summary.platformStats'],
            itemFields: ['platformSummary'],
            recommendedNextStep: 'group-by-platform',
            totalCount: 5,
          },
        ],
      },
      warnings: ['project 作用域的可用性与当前本地环境不一致。'],
      limitations: [
        '导出文件的 scope observation 不完整，当前仅能做部分 fidelity 对比。',
        '导出文件缺少足够 observation，当前无法建立完整 fidelity 结论。',
      ],
    })
  })
})
