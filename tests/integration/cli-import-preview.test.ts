import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  parseJsonResult,
  runCli,
  setupCliIntegrationContext,
  teardownCliIntegrationContext,
  type CliIntegrationContext,
  type ScopeAvailabilityContract,
  writeImportSourceFile,
} from './helpers/cli-testkit'

let context: CliIntegrationContext

beforeEach(async () => {
  context = await setupCliIntegrationContext()
})

afterEach(async () => {
  await teardownCliIntegrationContext()
})

describe('cli import preview integration', () => {
  it('import --json 输出 exported/local observation、fidelity 与 decision', async () => {
    const importFile = path.join(context.runtimeDir, 'import-source.json')
    await fs.writeFile(importFile, JSON.stringify({
      schemaVersion: '2026-04-15.public-json.v1',
      ok: true,
      action: 'export',
      data: {
        profiles: [
          {
            profile: {
              id: 'gemini-prod',
              name: 'gemini-prod',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
              { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
            ],
            scopeAvailability: [
              { scope: 'user', status: 'available', detected: true, writable: true, path: context.geminiSettingsPath },
              { scope: 'project', status: 'available', detected: true, writable: true, path: context.geminiProjectSettingsPath },
            ],
          },
        ],
        summary: {
          warnings: [],
          limitations: [],
        },
      },
    }, null, 2), 'utf8')

    await fs.rm(context.geminiProjectRoot, { recursive: true, force: true })

    const result = await runCli(['import', importFile, '--json'])
    const payload = parseJsonResult<{
      sourceFile: string
      items: Array<{
        platform: string
        platformSummary?: {
          kind: string
          precedence?: string[]
          currentScope?: string
          composedFiles?: string[]
          facts: Array<{ code: string; message: string }>
        }
        exportedObservation?: { defaultWriteScope?: string; observedAt?: string }
        localObservation?: { defaultWriteScope?: string; scopeAvailability?: ScopeAvailabilityContract[] }
        fidelity?: {
          status: string
          driftSummary: { blocking: number; warning: number; info: number }
          groupedMismatches: Array<{
            driftKind: string
            totalCount: number
            blockingCount: number
            warningCount: number
            infoCount: number
            mismatches: Array<{ field: string; scope?: string }>
          }>
          highlights: string[]
          mismatches: Array<{
            field: string
            scope?: string
            driftKind?: string
            severity?: string
            recommendedAction?: string
          }>
        }
        previewDecision: {
          canProceedToApplyDesign: boolean
          recommendedScope?: string
          requiresLocalResolution: boolean
          reasonCodes: string[]
          reasons: Array<{ code: string; blocking: boolean; message: string }>
        }
      }>
      summary: {
        totalItems: number
        matchCount: number
        mismatchCount: number
        partialCount: number
        insufficientDataCount: number
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
        triageStats?: {
          totalItems: number
          buckets: Array<{
            id: string
            totalCount: number
          }>
        }
        sourceExecutability: {
          totalItems: number
          applyReadyCount: number
          previewOnlyCount: number
          blockedCount: number
          blockedByCodeStats: Array<{
            code: string
            totalCount: number
          }>
        }
        decisionCodeStats: Array<{
          code: string
          totalCount: number
          blockingCount: number
          nonBlockingCount: number
        }>
        driftKindStats: Array<{
          driftKind: string
          totalCount: number
          blockingCount: number
          warningCount: number
          infoCount: number
        }>
        platformStats: Array<{
          platform: string
          totalItems: number
          matchCount: number
          mismatchCount: number
          partialCount: number
          insufficientDataCount: number
        }>
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import')
    expect(payload.data?.sourceFile).toBe(importFile)
    expect(payload.data?.items[0]).toEqual(expect.objectContaining({
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
        scopeAvailability: expect.arrayContaining([
          expect.objectContaining({ scope: 'project', status: 'unresolved', reasonCode: 'PROJECT_ROOT_UNRESOLVED' }),
        ]),
      }),
      fidelity: expect.objectContaining({
        status: 'mismatch',
        driftSummary: {
          blocking: 1,
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
            totalCount: 1,
            blockingCount: 1,
            warningCount: 0,
            infoCount: 0,
            mismatches: [
              expect.objectContaining({
                field: 'scopeAvailability',
                scope: 'project',
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
        ],
        highlights: [
          '当前本地 scope availability 与导出观察不一致，应以本地实时环境为准。',
        ],
        mismatches: expect.arrayContaining([
          expect.objectContaining({
            field: 'scopeAvailability',
            scope: 'project',
            driftKind: 'availability-drift',
            severity: 'blocking',
            recommendedAction: '先修复本地 project scope 解析，再重新执行 import preview。',
          }),
        ]),
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
    expect(payload.data?.summary?.totalItems).toBe(1)
    expect(payload.data?.summary?.matchCount).toBe(0)
    expect(payload.data?.summary?.mismatchCount).toBe(1)
    expect(payload.data?.summary?.partialCount).toBe(0)
    expect(payload.data?.summary?.insufficientDataCount).toBe(0)
    expect(payload.data?.summary?.executabilityStats).toEqual({
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
    })
    expect(payload.data?.summary?.sourceExecutability).toEqual({
      totalItems: 1,
      applyReadyCount: 1,
      previewOnlyCount: 0,
      blockedCount: 0,
      blockedByCodeStats: [
        { code: 'REDACTED_INLINE_SECRET', totalCount: 0 },
      ],
    })
    expect(payload.data?.summary?.triageStats).toEqual({
      totalItems: 1,
      buckets: [
        {
          id: 'source-blocked',
          title: 'Source blocked bucket',
          totalCount: 0,
          summaryFields: ['summary.sourceExecutability'],
          itemFields: ['sourceCompatibility', 'items.previewDecision'],
          recommendedNextStep: 'repair-source-input',
        },
        {
          id: 'write-readiness',
          title: 'Write readiness bucket',
          totalCount: 1,
          summaryFields: ['summary.executabilityStats'],
          itemFields: ['items.previewDecision', 'items.fidelity'],
          recommendedNextStep: 'continue-to-write',
        },
        {
          id: 'platform-routing',
          title: 'Platform routing bucket',
          totalCount: 1,
          summaryFields: ['summary.platformStats'],
          itemFields: ['platformSummary'],
          recommendedNextStep: 'group-by-platform',
        },
      ],
    })
    expect(payload.data?.summary?.decisionCodeStats).toEqual([
      { code: 'READY_USING_LOCAL_OBSERVATION', totalCount: 0, blockingCount: 0, nonBlockingCount: 0 },
      { code: 'LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION', totalCount: 0, blockingCount: 0, nonBlockingCount: 0 },
      { code: 'BLOCKED_BY_INSUFFICIENT_OBSERVATION', totalCount: 0, blockingCount: 0, nonBlockingCount: 0 },
      { code: 'BLOCKED_BY_FIDELITY_MISMATCH', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
      { code: 'REQUIRES_LOCAL_SCOPE_RESOLUTION', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
    ])
    expect(payload.data?.summary?.driftKindStats).toEqual([
      { driftKind: 'default-scope-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
      { driftKind: 'availability-drift', totalCount: 1, blockingCount: 1, warningCount: 0, infoCount: 0 },
      { driftKind: 'capability-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
    ])
    expect(payload.data?.summary?.platformStats).toEqual([
      {
        platform: 'gemini',
        totalItems: 1,
        matchCount: 0,
        mismatchCount: 1,
        partialCount: 0,
        insufficientDataCount: 0,
      },
    ])
  })

  it('import --json 在混合批次下准确聚合 match、partial、mismatch 与 insufficient-data', async () => {
    const importFile = path.join(context.runtimeDir, 'import-source-mixed.json')
    await fs.writeFile(importFile, JSON.stringify({
      schemaVersion: '2026-04-15.public-json.v1',
      ok: true,
      action: 'export',
      data: {
        profiles: [
          {
            profile: {
              id: 'gemini-match',
              name: 'gemini-match',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
            ],
            scopeAvailability: [
              { scope: 'user', status: 'available', detected: true, writable: true, path: context.geminiSettingsPath },
            ],
          },
          {
            profile: {
              id: 'gemini-partial',
              name: 'gemini-partial',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
            ],
          },
          {
            profile: {
              id: 'gemini-mismatch',
              name: 'gemini-mismatch',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
            ],
            scopeAvailability: [
              { scope: 'project', status: 'available', detected: true, writable: true, path: context.geminiProjectSettingsPath },
            ],
          },
          {
            profile: {
              id: 'gemini-redacted',
              name: 'gemini-redacted',
              platform: 'gemini',
              source: { apiKey: '<redacted:inline-secret>', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: '<redacted:inline-secret>', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
            ],
            scopeAvailability: [
              { scope: 'user', status: 'available', detected: true, writable: true, path: context.geminiSettingsPath },
            ],
          },
          {
            profile: {
              id: 'gemini-insufficient',
              name: 'gemini-insufficient',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
          },
        ],
        summary: {
          warnings: [],
          limitations: [],
        },
      },
    }, null, 2), 'utf8')

    await fs.rm(context.geminiProjectRoot, { recursive: true, force: true })

    const result = await runCli(['import', importFile, '--json'])
    const payload = parseJsonResult<{
      items: Array<{
        profile: { id: string }
        fidelity?: { status: string }
        previewDecision: { reasonCodes: string[] }
      }>
      summary: {
        totalItems: number
        matchCount: number
        mismatchCount: number
        partialCount: number
        insufficientDataCount: number
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
        sourceExecutability: {
          totalItems: number
          applyReadyCount: number
          previewOnlyCount: number
          blockedCount: number
          blockedByCodeStats: Array<{
            code: string
            totalCount: number
          }>
        }
        decisionCodeStats: Array<{
          code: string
          totalCount: number
          blockingCount: number
          nonBlockingCount: number
        }>
        driftKindStats: Array<{
          driftKind: string
          totalCount: number
          blockingCount: number
          warningCount: number
          infoCount: number
        }>
        platformStats: Array<{
          platform: string
          totalItems: number
          matchCount: number
          mismatchCount: number
          partialCount: number
          insufficientDataCount: number
        }>
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.items.map((item) => [item.profile.id, item.fidelity?.status, item.previewDecision.reasonCodes])).toEqual([
      ['gemini-match', 'match', ['READY_USING_LOCAL_OBSERVATION']],
      ['gemini-partial', 'partial', ['LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION']],
      ['gemini-mismatch', 'mismatch', ['BLOCKED_BY_FIDELITY_MISMATCH', 'REQUIRES_LOCAL_SCOPE_RESOLUTION']],
      ['gemini-redacted', 'match', ['READY_USING_LOCAL_OBSERVATION']],
      ['gemini-insufficient', 'insufficient-data', ['BLOCKED_BY_INSUFFICIENT_OBSERVATION']],
    ])
    expect(payload.data?.summary).toEqual({
      totalItems: 5,
      matchCount: 2,
      mismatchCount: 1,
      partialCount: 1,
      insufficientDataCount: 1,
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
      sourceExecutability: {
        totalItems: 5,
        applyReadyCount: 4,
        previewOnlyCount: 1,
        blockedCount: 1,
        blockedByCodeStats: [
          { code: 'REDACTED_INLINE_SECRET', totalCount: 1 },
        ],
      },
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
      triageStats: {
        totalItems: 5,
        buckets: [
          {
            id: 'source-blocked',
            title: 'Source blocked bucket',
            totalCount: 1,
            summaryFields: ['summary.sourceExecutability'],
            itemFields: ['sourceCompatibility', 'items.previewDecision'],
            recommendedNextStep: 'repair-source-input',
          },
          {
            id: 'write-readiness',
            title: 'Write readiness bucket',
            totalCount: 2,
            summaryFields: ['summary.executabilityStats'],
            itemFields: ['items.previewDecision', 'items.fidelity'],
            recommendedNextStep: 'continue-to-write',
          },
          {
            id: 'platform-routing',
            title: 'Platform routing bucket',
            totalCount: 5,
            summaryFields: ['summary.platformStats'],
            itemFields: ['platformSummary'],
            recommendedNextStep: 'group-by-platform',
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

  it('import --json 在跨平台 mixed batch 下准确聚合 claude/codex/gemini 状态', async () => {
    const importFile = path.join(context.runtimeDir, 'import-source-cross-platform-mixed.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-match',
          name: 'gemini-match',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
        scopeAvailability: [
          { scope: 'user', status: 'available', detected: true, writable: true, path: context.geminiSettingsPath },
          { scope: 'project', status: 'available', detected: true, writable: true, path: context.geminiProjectSettingsPath },
        ],
      },
      {
        profile: {
          id: 'claude-mismatch',
          name: 'claude-mismatch',
          platform: 'claude',
          source: { token: 'sk-live-123456', baseURL: 'https://gateway.example.com/api' },
          apply: {
            ANTHROPIC_AUTH_TOKEN: 'sk-live-123456',
            ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
          },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'local', detect: true, preview: true, use: true, rollback: true, writable: true },
        ],
      },
      {
        profile: {
          id: 'codex-partial',
          name: 'codex-partial',
          platform: 'codex',
          source: { apiKey: 'sk-codex-live-123456', baseURL: 'https://gateway.example.com/openai/v1' },
          apply: {
            OPENAI_API_KEY: 'sk-codex-live-123456',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [],
      },
      {
        profile: {
          id: 'gemini-insufficient',
          name: 'gemini-insufficient',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
      },
    ])

    const result = await runCli(['import', importFile, '--json'])
    const payload = parseJsonResult<{
      items: Array<{
        profile: { id: string }
        platform: string
        fidelity?: { status: string }
        previewDecision: { reasonCodes: string[] }
      }>
      summary: {
        totalItems: number
        matchCount: number
        mismatchCount: number
        partialCount: number
        insufficientDataCount: number
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
        sourceExecutability: {
          totalItems: number
          applyReadyCount: number
          previewOnlyCount: number
          blockedCount: number
          blockedByCodeStats: Array<{
            code: string
            totalCount: number
          }>
        }
        decisionCodeStats: Array<{
          code: string
          totalCount: number
          blockingCount: number
          nonBlockingCount: number
        }>
        driftKindStats: Array<{
          driftKind: string
          totalCount: number
          blockingCount: number
          warningCount: number
          infoCount: number
        }>
        platformStats: Array<{
          platform: string
          totalItems: number
          matchCount: number
          mismatchCount: number
          partialCount: number
          insufficientDataCount: number
        }>
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.items.map((item) => [item.profile.id, item.platform, item.fidelity?.status, item.previewDecision.reasonCodes])).toEqual([
      ['gemini-match', 'gemini', 'match', ['READY_USING_LOCAL_OBSERVATION']],
      ['claude-mismatch', 'claude', 'mismatch', ['BLOCKED_BY_FIDELITY_MISMATCH']],
      ['codex-partial', 'codex', 'partial', ['LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION']],
      ['gemini-insufficient', 'gemini', 'insufficient-data', ['BLOCKED_BY_INSUFFICIENT_OBSERVATION']],
    ])
    expect(payload.data?.summary).toEqual({
      totalItems: 4,
      matchCount: 1,
      mismatchCount: 1,
      partialCount: 1,
      insufficientDataCount: 1,
      executabilityStats: {
        profileCount: 4,
        inlineReadyProfileCount: 4,
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
      sourceExecutability: {
        totalItems: 4,
        applyReadyCount: 4,
        previewOnlyCount: 0,
        blockedCount: 0,
        blockedByCodeStats: [
          { code: 'REDACTED_INLINE_SECRET', totalCount: 0 },
        ],
      },
      decisionCodeStats: [
        { code: 'READY_USING_LOCAL_OBSERVATION', totalCount: 1, blockingCount: 0, nonBlockingCount: 1 },
        { code: 'LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION', totalCount: 1, blockingCount: 0, nonBlockingCount: 1 },
        { code: 'BLOCKED_BY_INSUFFICIENT_OBSERVATION', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
        { code: 'BLOCKED_BY_FIDELITY_MISMATCH', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
        { code: 'REQUIRES_LOCAL_SCOPE_RESOLUTION', totalCount: 0, blockingCount: 0, nonBlockingCount: 0 },
      ],
      driftKindStats: [
        { driftKind: 'default-scope-drift', totalCount: 1, blockingCount: 0, warningCount: 1, infoCount: 0 },
        { driftKind: 'availability-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
        { driftKind: 'capability-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
      ],
      platformStats: [
        {
          platform: 'claude',
          totalItems: 1,
          matchCount: 0,
          mismatchCount: 1,
          partialCount: 0,
          insufficientDataCount: 0,
        },
        {
          platform: 'codex',
          totalItems: 1,
          matchCount: 0,
          mismatchCount: 0,
          partialCount: 1,
          insufficientDataCount: 0,
        },
        {
          platform: 'gemini',
          totalItems: 2,
          matchCount: 1,
          mismatchCount: 0,
          partialCount: 0,
          insufficientDataCount: 1,
        },
      ],
      triageStats: {
        totalItems: 4,
        buckets: [
          {
            id: 'source-blocked',
            title: 'Source blocked bucket',
            totalCount: 0,
            summaryFields: ['summary.sourceExecutability'],
            itemFields: ['sourceCompatibility', 'items.previewDecision'],
            recommendedNextStep: 'repair-source-input',
          },
          {
            id: 'write-readiness',
            title: 'Write readiness bucket',
            totalCount: 2,
            summaryFields: ['summary.executabilityStats'],
            itemFields: ['items.previewDecision', 'items.fidelity'],
            recommendedNextStep: 'continue-to-write',
          },
          {
            id: 'platform-routing',
            title: 'Platform routing bucket',
            totalCount: 4,
            summaryFields: ['summary.platformStats'],
            itemFields: ['platformSummary'],
            recommendedNextStep: 'group-by-platform',
          },
        ],
      },
      warnings: ['默认写入作用域不一致：导出时为 user，当前本地为 project。'],
      limitations: [
        '导出文件的 scope observation 不完整，当前仅能做部分 fidelity 对比。',
        '导出文件缺少足够 observation，当前无法建立完整 fidelity 结论。',
      ],
    })
  })

  it('import 文本输出会展示混合批次的整批 explainable 聚合', async () => {
    const importFile = path.join(context.runtimeDir, 'import-source-mixed-text.json')
    await fs.writeFile(importFile, JSON.stringify({
      schemaVersion: '2026-04-15.public-json.v1',
      ok: true,
      action: 'export',
      data: {
        profiles: [
          {
            profile: {
              id: 'gemini-match',
              name: 'gemini-match',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
            ],
            scopeAvailability: [
              { scope: 'user', status: 'available', detected: true, writable: true, path: context.geminiSettingsPath },
            ],
          },
          {
            profile: {
              id: 'gemini-partial',
              name: 'gemini-partial',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
            ],
          },
          {
            profile: {
              id: 'gemini-mismatch',
              name: 'gemini-mismatch',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
            ],
            scopeAvailability: [
              { scope: 'project', status: 'available', detected: true, writable: true, path: context.geminiProjectSettingsPath },
            ],
          },
          {
            profile: {
              id: 'gemini-insufficient',
              name: 'gemini-insufficient',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
          },
        ],
        summary: {
          warnings: [],
          limitations: [],
        },
      },
    }, null, 2), 'utf8')

    await fs.rm(context.geminiProjectRoot, { recursive: true, force: true })

    const result = await runCli(['import', importFile])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[import] 成功')
    expect(result.stdout).toContain('汇总: total=4, match=1, mismatch=1, partial=1, insufficient-data=1')
    expect(result.stdout).toContain('决策代码汇总:')
    expect(result.stdout).toContain('  - READY_USING_LOCAL_OBSERVATION: total=1, blocking=0, non-blocking=1')
    expect(result.stdout).toContain('  - LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION: total=1, blocking=0, non-blocking=1')
    expect(result.stdout).toContain('  - BLOCKED_BY_INSUFFICIENT_OBSERVATION: total=1, blocking=1, non-blocking=0')
    expect(result.stdout).toContain('  - BLOCKED_BY_FIDELITY_MISMATCH: total=1, blocking=1, non-blocking=0')
    expect(result.stdout).toContain('  - REQUIRES_LOCAL_SCOPE_RESOLUTION: total=1, blocking=1, non-blocking=0')
    expect(result.stdout).toContain('Drift 类型汇总:')
    expect(result.stdout).toContain('  - availability-drift: total=1, blocking=1, warning=0, info=0')
    expect(result.stdout).toContain('- 配置: gemini-match (gemini)')
    expect(result.stdout).toContain('- 配置: gemini-partial (gemini)')
    expect(result.stdout).toContain('- 配置: gemini-mismatch (gemini)')
    expect(result.stdout).toContain('- 配置: gemini-insufficient (gemini)')
  })

  it('import 文本输出明确区分导出观察与当前本地观察', async () => {
    const importFile = path.join(context.runtimeDir, 'import-source-text.json')
    await fs.writeFile(importFile, JSON.stringify({
      schemaVersion: '2026-04-15.public-json.v1',
      ok: true,
      action: 'export',
      data: {
        profiles: [
          {
            profile: {
              id: 'gemini-prod',
              name: 'gemini-prod',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeAvailability: [
              { scope: 'project', status: 'available', detected: true, writable: true, path: context.geminiProjectSettingsPath },
            ],
          },
        ],
        summary: {
          warnings: [],
          limitations: [],
        },
      },
    }, null, 2), 'utf8')

    await fs.rm(context.geminiProjectRoot, { recursive: true, force: true })

    const result = await runCli(['import', importFile])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[import] 成功')
    expect(result.stdout).toContain(`导入文件: ${importFile}`)
    expect(result.stdout).toContain('汇总: total=1, match=0, mismatch=1, partial=0, insufficient-data=0')
    expect(result.stdout).toContain('决策代码汇总:')
    expect(result.stdout).toContain('  - BLOCKED_BY_FIDELITY_MISMATCH: total=1, blocking=1, non-blocking=0')
    expect(result.stdout).toContain('导入源可执行性:')
    expect(result.stdout).toContain('  - 下一步:')
    expect(result.stdout).toContain('Drift 类型汇总:')
    expect(result.stdout).toContain('  - availability-drift: total=1, blocking=1, warning=0, info=0')
    expect(result.stdout).toContain('  导出时观察:')
    expect(result.stdout).toContain('  当前本地观察:')
    expect(result.stdout).toContain('  Fidelity: mismatch')
    expect(result.stdout).toContain('  Drift 分组: availability-drift, total=1, blocking=1, warning=0, info=0')
    expect(result.stdout).toContain('    导出值: {"status":"available","detected":true,"writable":true}')
    expect(result.stdout).toContain('    本地值: {"status":"unresolved","detected":false,"writable":false}')
    expect(result.stdout).toContain('  决策代码: BLOCKED_BY_FIDELITY_MISMATCH, REQUIRES_LOCAL_SCOPE_RESOLUTION')
    expect(result.stdout).toContain('  建议: 先修复本地作用域解析，再考虑进入 apply 设计。')
  })

  it('import 源文件不存在时返回结构化失败并设置 exitCode 1', async () => {
    const missingImportFile = path.join(context.runtimeDir, 'missing-import.json')
    const result = await runCli(['import', missingImportFile, '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('import')
    expect(payload.error).toEqual({
      code: 'IMPORT_SOURCE_NOT_FOUND',
      message: `未找到导入文件：${missingImportFile}`,
    })
  })

  it('import <file> 旧兼容路径仍会按 import preview 执行', async () => {
    const importFile = path.join(context.runtimeDir, 'import-legacy-compatible.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
      },
    ])

    const result = await runCli(['import', importFile, '--json'])
    const payload = parseJsonResult<{
      sourceFile: string
      items: Array<{ profile: { id: string } }>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import')
    expect(payload.data?.sourceFile).toBe(importFile)
    expect(payload.data?.items[0]?.profile.id).toBe('gemini-prod')
  })

  it('未知 import 子命令不会被改写成 preview', async () => {
    const result = await runCli(['import', 'foo'])

    expect(result.stdout).toBe('')
    expect(result.stderr).toContain("error: unknown command 'foo'")
    expect(result.exitCode).toBe(1)
  })
})
