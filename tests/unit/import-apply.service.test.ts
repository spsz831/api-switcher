import { describe, expect, it } from 'vitest'
import { ImportSourceError } from '../../src/services/import-source.service'
import { ImportApplyService } from '../../src/services/import-apply.service'
import type { PreviewResult, ValidationResult } from '../../src/types/adapter'
import type { ImportedProfileSource } from '../../src/services/import-source.service'
import type { Profile } from '../../src/types/profile'

function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'gemini-prod',
    name: 'gemini-prod',
    platform: 'gemini',
    source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
    apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
    ...overrides,
  }
}

function createCodexProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'codex-prod',
    name: 'codex-prod',
    platform: 'codex',
    source: { apiKey: 'sk-codex-live-123456', baseURL: 'https://gateway.example.com/openai/v1' },
    apply: {
      OPENAI_API_KEY: 'sk-codex-live-123456',
      base_url: 'https://gateway.example.com/openai/v1',
    },
    ...overrides,
  }
}

function createClaudeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'claude-prod',
    name: 'claude-prod',
    platform: 'claude',
    source: { token: 'sk-live-123456', baseURL: 'https://gateway.example.com/api' },
    apply: {
      ANTHROPIC_AUTH_TOKEN: 'sk-live-123456',
      ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
    },
    ...overrides,
  }
}

function createValidationResult(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    ok: true,
    errors: [],
    warnings: [],
    limitations: [],
    ...overrides,
  }
}

function createPreviewResult(overrides: Partial<PreviewResult> = {}): PreviewResult {
  return {
    platform: 'gemini',
    profileId: 'gemini-prod',
    targetFiles: [
      {
        path: 'C:/Users/test/.gemini/settings.json',
        format: 'json',
        exists: true,
        managedScope: 'partial-fields',
        scope: 'user',
        role: 'settings',
        managedKeys: ['enforcedAuthType'],
      },
    ],
    effectiveFields: [],
    storedOnlyFields: [],
    diffSummary: [
      {
        path: 'C:/Users/test/.gemini/settings.json',
        changedKeys: ['enforcedAuthType'],
        hasChanges: true,
      },
    ],
    warnings: [],
    limitations: [],
    riskLevel: 'low',
    requiresConfirmation: false,
    backupPlanned: true,
    noChanges: false,
    ...overrides,
  }
}

function createImportedSource(
  overrides: Partial<ImportedProfileSource> & { profile?: Profile } = {},
): ImportedProfileSource {
  return {
    profile: overrides.profile ?? createProfile(),
    exportedObservation: overrides.exportedObservation ?? {
      defaultWriteScope: 'user',
      observedAt: '2026-04-16T00:00:00.000Z',
      scopeCapabilities: [
        { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
        { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
      ],
      scopeAvailability: [
        { scope: 'user', status: 'available', detected: true, writable: true, path: 'C:/Users/test/.gemini/settings.json' },
      ],
    },
    redactedInlineSecretFields: overrides.redactedInlineSecretFields,
  }
}

describe('import apply service', () => {
  it('source file 不存在时返回 IMPORT_SOURCE_NOT_FOUND', async () => {
    const service = new ImportApplyService({
      load: async () => {
        throw new ImportSourceError('IMPORT_SOURCE_NOT_FOUND', '未找到导入文件：E:/tmp/missing.json')
      },
    } as any)

    const result = await service.apply('E:/tmp/missing.json', { profile: 'gemini-prod' })

    expect(result).toEqual({
      ok: false,
      action: 'import-apply',
      error: {
        code: 'IMPORT_SOURCE_NOT_FOUND',
        message: '未找到导入文件：E:/tmp/missing.json',
      },
    })
  })

  it('--profile 未命中时返回 IMPORT_PROFILE_NOT_FOUND', async () => {
    const service = new ImportApplyService({
      load: async () => ({
        sourceFile: 'E:/tmp/export.json',
        sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
        profiles: [createImportedSource({ profile: createProfile({ id: 'other-profile', name: 'other-profile' }) })],
      }),
    } as any)

    const result = await service.apply('E:/tmp/export.json', { profile: 'gemini-prod' })

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      action: 'import-apply',
      warnings: [],
      error: {
        code: 'IMPORT_PROFILE_NOT_FOUND',
        message: '导入文件中未找到配置档：gemini-prod',
        details: {
          sourceFile: 'E:/tmp/export.json',
          profileId: 'gemini-prod',
        },
      },
    }))
  })

  it('命中 redacted inline secret 导入源时，import apply 会直接阻断', async () => {
    const service = new ImportApplyService({
      load: async () => ({
        sourceFile: 'E:/tmp/export.json',
        sourceCompatibility: {
          mode: 'strict',
          schemaVersion: '2026-04-15.public-json.v1',
          warnings: ['导入文件包含 2 个 redacted inline secret 占位值；import preview 会保留字段位置，但不会把它当作真实 secret 明文。'],
        },
        profiles: [
          createImportedSource({
            profile: createProfile(),
            redactedInlineSecretFields: ['source.apiKey', 'apply.GEMINI_API_KEY'],
          }),
        ],
      }),
    } as any)

    const result = await service.apply('E:/tmp/export.json', { profile: 'gemini-prod' })

    expect(result).toEqual({
      ok: false,
      action: 'import-apply',
      warnings: ['导入文件包含 2 个 redacted inline secret 占位值；import preview 会保留字段位置，但不会把它当作真实 secret 明文。'],
      error: {
        code: 'IMPORT_SOURCE_REDACTED_INLINE_SECRETS',
        message: '导入文件中的 inline secret 已被 redacted；当前不能直接进入 import apply。',
        details: {
          sourceFile: 'E:/tmp/export.json',
          profileId: 'gemini-prod',
          redactedInlineSecretFields: ['source.apiKey', 'apply.GEMINI_API_KEY'],
        },
      },
    })
  })

  it('选中的 imported profile 不是受支持的平台时返回 IMPORT_PLATFORM_NOT_SUPPORTED', async () => {
    const service = new ImportApplyService({
      load: async () => ({
        sourceFile: 'E:/tmp/export.json',
        sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
        profiles: [
          createImportedSource({
            profile: createProfile({
              id: 'unsupported-prod',
              name: 'unsupported-prod',
              platform: 'unsupported' as any,
              source: { apiKey: 'unsupported-key-123456' },
              apply: { UNSUPPORTED_API_KEY: 'unsupported-key-123456' } as any,
            }),
          }),
        ],
      }),
    } as any)

    const result = await service.apply('E:/tmp/export.json', { profile: 'unsupported-prod' })

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      action: 'import-apply',
      warnings: [],
      error: {
        code: 'IMPORT_PLATFORM_NOT_SUPPORTED',
        message: '当前仅支持导入应用 Gemini、Codex 或 Claude profile。',
      },
    }))
  })

  it('选中的 imported profile 是 Codex 时不会返回 IMPORT_PLATFORM_NOT_SUPPORTED', async () => {
    const importedProfile = createCodexProfile()
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [createImportedSource({ profile: importedProfile, exportedObservation: {} })],
        }),
      } as any,
      {
        evaluate: () => ({
          fidelity: {
            status: 'insufficient-data',
            mismatches: [],
            driftSummary: { blocking: 0, warning: 0, info: 0 },
            groupedMismatches: [],
            highlights: [],
          },
          previewDecision: {
            canProceedToApplyDesign: true,
            requiresLocalResolution: false,
            reasonCodes: ['READY_USING_LOCAL_OBSERVATION'],
            reasons: [],
          },
        }),
      } as any,
      {
        get: () => ({
          detectCurrent: async () => ({
            platform: 'codex',
            managed: true,
            targetFiles: [],
          }),
          validate: async () => createValidationResult(),
          preview: async () => createPreviewResult({
            platform: 'codex',
            profileId: importedProfile.id,
            targetFiles: [
              {
                path: 'C:/Users/test/.codex/config.toml',
                format: 'toml',
                exists: true,
                managedScope: 'multi-file',
                role: 'config',
                managedKeys: ['base_url'],
              },
              {
                path: 'C:/Users/test/.codex/auth.json',
                format: 'json',
                exists: true,
                managedScope: 'multi-file',
                role: 'auth',
                managedKeys: ['OPENAI_API_KEY'],
              },
            ],
            diffSummary: [
              {
                path: 'C:/Users/test/.codex/config.toml',
                changedKeys: ['base_url'],
                hasChanges: true,
              },
              {
                path: 'C:/Users/test/.codex/auth.json',
                changedKeys: ['OPENAI_API_KEY'],
                hasChanges: true,
              },
            ],
          }),
          apply: async () => ({
            ok: true,
            changedFiles: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
            noChanges: false,
            diffSummary: [],
          }),
        }),
      } as any,
      {
        createBeforeApply: async () => ({
          backupId: 'snapshot-codex-20260418120000-abcdef',
          manifestPath: 'backups/codex/snapshot-codex-20260418120000-abcdef/manifest.json',
          targetFiles: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
          warnings: [],
          limitations: [],
        }),
      } as any,
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id })

    expect(result.ok).toBe(true)
    expect(result.action).toBe('import-apply')
    expect(result.data?.importedProfile.platform).toBe('codex')
    expect(result.data?.platformSummary).toEqual({
      kind: 'multi-file-composition',
      composedFiles: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
      facts: [
        { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
        { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
      ],
    })
  })

  it('Codex apply 不进入 Gemini 的 project scope availability gate', async () => {
    const importedProfile = createCodexProfile()
    let validationCalled = false
    let applyCalled = false
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [createImportedSource({ profile: importedProfile, exportedObservation: {} })],
        }),
      } as any,
      {
        evaluate: () => ({
          fidelity: {
            status: 'insufficient-data',
            mismatches: [],
            driftSummary: { blocking: 0, warning: 0, info: 0 },
            groupedMismatches: [],
            highlights: [],
          },
          previewDecision: {
            canProceedToApplyDesign: true,
            requiresLocalResolution: false,
            reasonCodes: ['READY_USING_LOCAL_OBSERVATION'],
            reasons: [],
          },
        }),
      } as any,
      {
        get: () => ({
          detectCurrent: async () => ({
            platform: 'codex',
            managed: true,
            targetFiles: [],
          }),
          validate: async () => {
            validationCalled = true
            return createValidationResult()
          },
          preview: async () => createPreviewResult({
            platform: 'codex',
            profileId: importedProfile.id,
            targetFiles: [],
            diffSummary: [],
          }),
          apply: async () => {
            applyCalled = true
            return {
              ok: true,
              changedFiles: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
              noChanges: false,
              diffSummary: [],
            }
          },
        }),
      } as any,
      {
        createBeforeApply: async () => ({
          backupId: 'snapshot-codex-20260418120000-abcdef',
          manifestPath: 'backups/codex/snapshot-codex-20260418120000-abcdef/manifest.json',
          targetFiles: ['C:/Users/test/.codex/config.toml', 'C:/Users/test/.codex/auth.json'],
          warnings: [],
          limitations: [],
        }),
      } as any,
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id })

    expect(result.error?.code).not.toBe('IMPORT_SCOPE_UNAVAILABLE')
    expect(validationCalled).toBe(true)
    expect(applyCalled).toBe(true)
    expect(result.ok).toBe(true)
  })

  it('选中的 imported profile 是 Claude 时不会返回 IMPORT_PLATFORM_NOT_SUPPORTED', async () => {
    const importedProfile = createClaudeProfile()
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [createImportedSource({ profile: importedProfile, exportedObservation: {} })],
        }),
      } as any,
      {
        evaluate: () => ({
          fidelity: {
            status: 'partial',
            mismatches: [],
            driftSummary: { blocking: 0, warning: 0, info: 0 },
            groupedMismatches: [],
            highlights: [],
          },
          previewDecision: {
            canProceedToApplyDesign: true,
            recommendedScope: 'project',
            requiresLocalResolution: false,
            reasonCodes: ['LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION'],
            reasons: [],
          },
        }),
      } as any,
      {
        get: () => ({
          detectCurrent: async () => ({
            platform: 'claude',
            managed: true,
            targetFiles: [],
          }),
          validate: async () => createValidationResult(),
          preview: async () => createPreviewResult({
            platform: 'claude',
            profileId: importedProfile.id,
            targetFiles: [
              {
                path: 'C:/Users/test/.claude/settings.json',
                format: 'json',
                exists: true,
                managedScope: 'partial-fields',
                scope: 'project',
                role: 'settings',
                managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
              },
            ],
            diffSummary: [
              {
                path: 'C:/Users/test/.claude/settings.json',
                changedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
                hasChanges: true,
              },
            ],
            riskLevel: 'low',
            requiresConfirmation: false,
          }),
          apply: async () => ({
            ok: true,
            changedFiles: ['C:/Users/test/.claude/settings.json'],
            noChanges: false,
            diffSummary: [],
          }),
        }),
      } as any,
      {
        createBeforeApply: async () => ({
          backupId: 'snapshot-claude-20260419120000-abcdef',
          manifestPath: 'backups/claude/snapshot-claude-20260419120000-abcdef/manifest.json',
          targetFiles: ['C:/Users/test/.claude/settings.json'],
          warnings: [],
          limitations: [],
        }),
      } as any,
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id, scope: 'project' })

    expect(result.ok).toBe(true)
    expect(result.data?.importedProfile.platform).toBe('claude')
    expect(result.data?.appliedScope).toBe('project')
  })

  it('Claude imported profile 缺少 exportedObservation 时，不会直接被 IMPORT_APPLY_NOT_READY 阻断', async () => {
    const importedProfile = createClaudeProfile()
    let validationCalled = false
    let applyCalled = false
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [createImportedSource({ profile: importedProfile, exportedObservation: undefined })],
        }),
      } as any,
      {
        evaluate: () => ({
          fidelity: {
            status: 'partial',
            mismatches: [],
            driftSummary: { blocking: 0, warning: 0, info: 0 },
            groupedMismatches: [],
            highlights: [],
          },
          previewDecision: {
            canProceedToApplyDesign: true,
            recommendedScope: 'project',
            requiresLocalResolution: false,
            reasonCodes: ['LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION'],
            reasons: [],
          },
        }),
      } as any,
      {
        get: () => ({
          detectCurrent: async () => ({
            platform: 'claude',
            managed: true,
            targetFiles: [],
          }),
          validate: async () => {
            validationCalled = true
            return createValidationResult()
          },
          preview: async () => createPreviewResult({
            platform: 'claude',
            profileId: importedProfile.id,
            targetFiles: [],
            diffSummary: [],
          }),
          apply: async () => {
            applyCalled = true
            return {
              ok: true,
              changedFiles: ['C:/Users/test/.claude/settings.json'],
              noChanges: false,
              diffSummary: [],
            }
          }
        }),
      } as any,
      {
        createBeforeApply: async () => ({
          backupId: 'snapshot-claude-20260419120000-abcdef',
          manifestPath: 'backups/claude/snapshot-claude-20260419120000-abcdef/manifest.json',
          targetFiles: ['C:/Users/test/.claude/settings.json'],
          warnings: [],
          limitations: [],
        }),
      } as any,
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id, scope: 'project' })

    expect(result.error?.code).not.toBe('IMPORT_APPLY_NOT_READY')
    expect(validationCalled).toBe(true)
    expect(applyCalled).toBe(true)
    expect(result.ok).toBe(true)
  })

  it('Claude local scope 未 --force 时返回 CONFIRMATION_REQUIRED', async () => {
    const importedProfile = createClaudeProfile()
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [createImportedSource({ profile: importedProfile, exportedObservation: {} })],
        }),
      } as any,
      {
        evaluate: () => ({
          fidelity: {
            status: 'partial',
            mismatches: [],
            driftSummary: { blocking: 0, warning: 0, info: 0 },
            groupedMismatches: [],
            highlights: [],
          },
          previewDecision: {
            canProceedToApplyDesign: true,
            recommendedScope: 'local',
            requiresLocalResolution: false,
            reasonCodes: ['LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION'],
            reasons: [],
          },
        }),
      } as any,
      {
        get: () => ({
          detectCurrent: async () => ({
            platform: 'claude',
            managed: true,
            targetFiles: [],
          }),
          validate: async () => createValidationResult(),
          preview: async () => createPreviewResult({
            platform: 'claude',
            profileId: importedProfile.id,
            targetFiles: [
              {
                path: 'C:/Users/test/.claude/settings.local.json',
                format: 'json',
                exists: true,
                managedScope: 'partial-fields',
                scope: 'local',
                role: 'settings',
                managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
              },
            ],
            diffSummary: [
              {
                path: 'C:/Users/test/.claude/settings.local.json',
                changedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
                hasChanges: true,
              },
            ],
            riskLevel: 'low',
            requiresConfirmation: false,
          }),
        }),
      } as any,
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id, scope: 'local' })

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CONFIRMATION_REQUIRED')
    expect(result.error?.message).toBe('当前导入应用需要确认或 --force。')
    expect(result.error?.details).toEqual(expect.objectContaining({
      referenceGovernance: {
        hasReferenceProfiles: false,
        hasInlineProfiles: true,
        hasWriteUnsupportedProfiles: false,
        primaryReason: 'INLINE_SECRET_PRESENT',
        reasonCodes: ['INLINE_SECRET_PRESENT'],
      },
    }))
  })

  it('Claude local scope 带 --force 时可以成功 apply', async () => {
    const importedProfile = createClaudeProfile()
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [createImportedSource({ profile: importedProfile, exportedObservation: {} })],
        }),
      } as any,
      {
        evaluate: () => ({
          fidelity: {
            status: 'partial',
            mismatches: [],
            driftSummary: { blocking: 0, warning: 0, info: 0 },
            groupedMismatches: [],
            highlights: [],
          },
          previewDecision: {
            canProceedToApplyDesign: true,
            recommendedScope: 'local',
            requiresLocalResolution: false,
            reasonCodes: ['LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION'],
            reasons: [],
          },
        }),
      } as any,
      {
        get: () => ({
          detectCurrent: async () => ({
            platform: 'claude',
            managed: true,
            targetFiles: [],
          }),
          validate: async () => createValidationResult(),
          preview: async () => createPreviewResult({
            platform: 'claude',
            profileId: importedProfile.id,
            targetFiles: [
              {
                path: 'C:/Users/test/.claude/settings.local.json',
                format: 'json',
                exists: true,
                managedScope: 'partial-fields',
                scope: 'local',
                role: 'settings',
                managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
              },
            ],
            diffSummary: [
              {
                path: 'C:/Users/test/.claude/settings.local.json',
                changedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
                hasChanges: true,
              },
            ],
            riskLevel: 'low',
            requiresConfirmation: false,
          }),
          apply: async () => ({
            ok: true,
            changedFiles: ['C:/Users/test/.claude/settings.local.json'],
            noChanges: false,
            diffSummary: [],
          }),
        }),
      } as any,
      {
        createBeforeApply: async () => ({
          backupId: 'snapshot-claude-20260419120000-abcdef',
          manifestPath: 'backups/claude/snapshot-claude-20260419120000-abcdef/manifest.json',
          targetFiles: ['C:/Users/test/.claude/settings.local.json'],
          warnings: [],
          limitations: [],
        }),
      } as any,
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id, scope: 'local', force: true })

    expect(result.ok).toBe(true)
    expect(result.data?.importedProfile.platform).toBe('claude')
    expect(result.data?.appliedScope).toBe('local')
    expect(result.data?.backupId).toBe('snapshot-claude-20260419120000-abcdef')
    expect(result.data?.changedFiles).toEqual(['C:/Users/test/.claude/settings.local.json'])
  })

  it('import apply 的 referenceGovernance 会输出 resolver-aware referenceDetails', async () => {
    const importedProfile = createClaudeProfile({
      source: { secret_ref: 'env://API_SWITCHER_MISSING_SECRET' },
      apply: { auth_reference: 'vault://claude/prod' } as any,
    })

    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [createImportedSource({ profile: importedProfile, exportedObservation: {} })],
        }),
      } as any,
      {
        evaluate: () => ({
          previewDecision: {
            canProceedToApplyDesign: true,
            requiresLocalResolution: false,
            reasonCodes: ['READY_USING_LOCAL_OBSERVATION'],
            reasons: [{ code: 'READY_USING_LOCAL_OBSERVATION', blocking: false, message: 'ready' }],
          },
        }),
      } as any,
      {
        get: () => ({
          detectCurrent: async () => null,
          validate: async () => createValidationResult(),
          preview: async () => createPreviewResult({
            platform: 'claude',
            profileId: importedProfile.id,
            targetFiles: [
              {
                path: 'C:/Users/test/.claude/settings.json',
                format: 'json',
                exists: true,
                managedScope: 'partial-fields',
                scope: 'project',
                role: 'settings',
                managedKeys: ['auth_reference'],
              },
            ],
            diffSummary: [
              {
                path: 'C:/Users/test/.claude/settings.json',
                changedKeys: ['auth_reference'],
                hasChanges: true,
              },
            ],
            riskLevel: 'medium',
            requiresConfirmation: true,
          }),
        }),
      } as any,
      {
        createBeforeApply: async () => {
          throw new Error('should not snapshot before confirmation')
        },
      } as any,
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id })

    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('CONFIRMATION_REQUIRED')
    expect(result.error?.details).toEqual(expect.objectContaining({
      referenceGovernance: {
        hasReferenceProfiles: true,
        hasInlineProfiles: false,
        hasWriteUnsupportedProfiles: true,
        primaryReason: 'REFERENCE_WRITE_UNSUPPORTED',
        reasonCodes: ['REFERENCE_WRITE_UNSUPPORTED'],
        referenceDetails: [
          {
            code: 'REFERENCE_ENV_UNRESOLVED',
            field: 'source.secret_ref',
            status: 'missing',
            reference: 'env://API_SWITCHER_MISSING_SECRET',
            scheme: 'env',
            message: 'profile.source.secret_ref 的 env 引用当前不可解析。',
          },
          {
            code: 'REFERENCE_SCHEME_UNSUPPORTED',
            field: 'apply.auth_reference',
            status: 'unsupported-scheme',
            reference: 'vault://claude/prod',
            scheme: 'vault',
            message: 'profile.apply.auth_reference 使用的引用 scheme 当前不受支持。',
          },
        ],
      },
    }))
  })

  it('previewDecision 阻止 apply design 时返回 IMPORT_APPLY_NOT_READY', async () => {
    const importedProfile = createProfile()
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [createImportedSource({ profile: importedProfile })],
        }),
      } as any,
      {
        evaluate: () => ({
          fidelity: {
            status: 'mismatch',
            mismatches: [],
            driftSummary: { blocking: 1, warning: 0, info: 0 },
            groupedMismatches: [],
            highlights: ['drift'],
          },
          previewDecision: {
            canProceedToApplyDesign: false,
            recommendedScope: 'user',
            requiresLocalResolution: true,
            reasonCodes: ['BLOCKED_BY_FIDELITY_MISMATCH'],
            reasons: [
              {
                code: 'BLOCKED_BY_FIDELITY_MISMATCH',
                blocking: true,
                message: 'blocked',
              },
            ],
          },
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
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id })

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      action: 'import-apply',
      error: {
        code: 'IMPORT_APPLY_NOT_READY',
        message: '当前 import preview 结果不允许进入 apply。',
        details: expect.objectContaining({
          sourceFile: 'E:/tmp/export.json',
          profileId: importedProfile.id,
          previewDecision: {
            canProceedToApplyDesign: false,
            recommendedScope: 'user',
            requiresLocalResolution: true,
            reasonCodes: ['BLOCKED_BY_FIDELITY_MISMATCH'],
            reasons: [
              {
                code: 'BLOCKED_BY_FIDELITY_MISMATCH',
                blocking: true,
                message: 'blocked',
              },
            ],
          },
          fidelity: {
            status: 'mismatch',
            mismatches: [],
            driftSummary: { blocking: 1, warning: 0, info: 0 },
            groupedMismatches: [],
            highlights: ['drift'],
          },
        }),
      },
    }))
  })

  it('project scope availability 不可用时返回 IMPORT_SCOPE_UNAVAILABLE，且优先于 confirmation failure', async () => {
    const importedProfile = createProfile()
    let previewCalled = false
    let validationCalled = false
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [createImportedSource({ profile: importedProfile })],
        }),
      } as any,
      {
        evaluate: () => {
          previewCalled = true
          return {
            fidelity: {
              status: 'partial',
              mismatches: [],
              driftSummary: { blocking: 0, warning: 0, info: 0 },
              groupedMismatches: [],
              highlights: [],
            },
            previewDecision: {
              canProceedToApplyDesign: true,
              recommendedScope: 'project',
              requiresLocalResolution: false,
              reasonCodes: ['LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION'],
              reasons: [],
            },
          }
        },
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
              },
            ],
          }),
          validate: async () => {
            validationCalled = true
            return createValidationResult()
          },
        }),
      } as any,
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id, scope: 'project' })

    expect(previewCalled).toBe(true)
    expect(validationCalled).toBe(false)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('IMPORT_SCOPE_UNAVAILABLE')
    expect(result.error?.message).toBe('Gemini project root is unavailable.')
  })

  it('project scope availability 可用但未 force 时返回 CONFIRMATION_REQUIRED', async () => {
    const importedProfile = createProfile()
    let applyCalled = false
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [createImportedSource({ profile: importedProfile })],
        }),
      } as any,
      {
        evaluate: () => ({
          fidelity: {
            status: 'partial',
            mismatches: [],
            driftSummary: { blocking: 0, warning: 0, info: 0 },
            groupedMismatches: [],
            highlights: [],
          },
          previewDecision: {
            canProceedToApplyDesign: true,
            recommendedScope: 'project',
            requiresLocalResolution: false,
            reasonCodes: ['LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION'],
            reasons: [],
          },
        }),
      } as any,
      {
        get: () => ({
          detectCurrent: async () => ({
            platform: 'gemini',
            managed: true,
            targetFiles: [],
            scopeAvailability: [
              { scope: 'project', status: 'available', detected: true, writable: true, path: 'E:/project/.gemini/settings.json' },
            ],
          }),
          validate: async () => createValidationResult({
            warnings: [
              {
                code: 'validation-warning',
                level: 'warning',
                message: 'validation warning',
              },
            ],
          }),
          preview: async () => createPreviewResult({
            targetFiles: [
              {
                path: 'E:/project/.gemini/settings.json',
                format: 'json',
                exists: true,
                managedScope: 'partial-fields',
                scope: 'project',
                role: 'settings',
                managedKeys: ['enforcedAuthType'],
              },
            ],
            diffSummary: [
              {
                path: 'E:/project/.gemini/settings.json',
                changedKeys: ['enforcedAuthType'],
                hasChanges: true,
              },
            ],
            warnings: [
              {
                code: 'preview-warning',
                level: 'warning',
                message: 'preview warning',
              },
            ],
            limitations: [
              {
                code: 'preview-limitation',
                level: 'limitation',
                message: 'preview limitation',
              },
            ],
            riskLevel: 'medium',
            requiresConfirmation: true,
          }),
          apply: async () => {
            applyCalled = true
            return {
              ok: true,
              changedFiles: [],
              noChanges: true,
              diffSummary: [],
            }
          },
        }),
      } as any,
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id, scope: 'project' })

    expect(applyCalled).toBe(false)
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      action: 'import-apply',
      warnings: ['validation warning', 'preview warning'],
      limitations: ['preview limitation'],
      error: expect.objectContaining({
        code: 'CONFIRMATION_REQUIRED',
        message: '当前导入应用需要确认或 --force。',
        details: expect.objectContaining({
          risk: {
            allowed: false,
            riskLevel: 'medium',
            reasons: ['validation warning', 'preview warning'],
            limitations: ['preview limitation'],
          },
        }),
      }),
    }))
  })

  it('validation.ok = false 时返回 VALIDATION_FAILED，并停止后续 preview/snapshot/apply', async () => {
    const importedProfile = createProfile()
    let adapterPreviewCalled = false
    let snapshotCalled = false
    let applyCalled = false
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [createImportedSource({ profile: importedProfile })],
        }),
      } as any,
      {
        evaluate: () => ({
          fidelity: {
            status: 'match',
            mismatches: [],
            driftSummary: { blocking: 0, warning: 0, info: 0 },
            groupedMismatches: [],
            highlights: [],
          },
          previewDecision: {
            canProceedToApplyDesign: true,
            recommendedScope: 'user',
            requiresLocalResolution: false,
            reasonCodes: ['READY_USING_LOCAL_OBSERVATION'],
            reasons: [],
          },
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
          validate: async () => createValidationResult({
            ok: false,
            errors: [
              {
                code: 'missing-auth',
                level: 'error',
                message: 'missing auth',
              },
            ],
            warnings: [
              {
                code: 'validation-warning',
                level: 'warning',
                message: 'validation warning',
              },
            ],
            limitations: [
              {
                code: 'validation-limitation',
                level: 'limitation',
                message: 'validation limitation',
              },
            ],
          }),
          preview: async () => {
            adapterPreviewCalled = true
            return createPreviewResult()
          },
          apply: async () => {
            applyCalled = true
            return {
              ok: true,
              changedFiles: [],
              noChanges: true,
              diffSummary: [],
            }
          },
        }),
      } as any,
      {
        createBeforeApply: async () => {
          snapshotCalled = true
          return {
            backupId: 'snapshot-gemini-20260417120000-abcdef',
            manifestPath: 'backups/gemini/snapshot-gemini-20260417120000-abcdef/manifest.json',
            targetFiles: [],
            warnings: [],
            limitations: [],
          }
        },
      } as any,
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id })

    expect(adapterPreviewCalled).toBe(false)
    expect(snapshotCalled).toBe(false)
    expect(applyCalled).toBe(false)
    expect(result).toEqual({
      ok: false,
      action: 'import-apply',
      warnings: ['validation warning'],
      limitations: ['validation limitation'],
      error: {
        code: 'VALIDATION_FAILED',
        message: '配置校验失败',
        details: {
          ok: false,
          errors: [
            {
              code: 'missing-auth',
              level: 'error',
              message: 'missing auth',
            },
          ],
          warnings: [
            {
              code: 'validation-warning',
              level: 'warning',
              message: 'validation warning',
            },
          ],
          limitations: [
            {
              code: 'validation-limitation',
              level: 'limitation',
              message: 'validation limitation',
            },
          ],
          referenceGovernance: {
            hasReferenceProfiles: false,
            hasInlineProfiles: true,
            hasWriteUnsupportedProfiles: false,
            primaryReason: 'INLINE_SECRET_PRESENT',
            reasonCodes: ['INLINE_SECRET_PRESENT'],
          },
        },
      },
    })
  })

  it('导出默认 scope 漂移，但显式 --scope project 且 project 可用时，仍可继续进入后续 gate', async () => {
    const importedProfile = createProfile()
    let validationCalled = false
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [
            createImportedSource({
              profile: importedProfile,
              exportedObservation: {
                defaultWriteScope: 'project',
                observedAt: '2026-04-16T00:00:00.000Z',
                scopeCapabilities: [
                  { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
                  { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
                ],
                scopeAvailability: [
                  { scope: 'project', status: 'available', detected: true, writable: true, path: 'E:/project/.gemini/settings.json' },
                ],
              },
            }),
          ],
        }),
      } as any,
      {
        evaluate: ({ localObservation }: any) => ({
          fidelity: {
            status: localObservation?.defaultWriteScope === 'project' ? 'match' : 'mismatch',
            mismatches: [],
            driftSummary: { blocking: 0, warning: 0, info: 0 },
            groupedMismatches: [],
            highlights: [],
          },
          previewDecision: {
            canProceedToApplyDesign: localObservation?.defaultWriteScope === 'project',
            recommendedScope: localObservation?.defaultWriteScope,
            requiresLocalResolution: false,
            reasonCodes: localObservation?.defaultWriteScope === 'project'
              ? ['READY_USING_LOCAL_OBSERVATION']
              : ['BLOCKED_BY_FIDELITY_MISMATCH'],
            reasons: [],
          },
        }),
      } as any,
      {
        get: () => ({
          detectCurrent: async () => ({
            platform: 'gemini',
            managed: true,
            targetFiles: [],
            scopeAvailability: [
              { scope: 'project', status: 'available', detected: true, writable: true, path: 'E:/project/.gemini/settings.json' },
            ],
          }),
          validate: async () => {
            validationCalled = true
            return createValidationResult({
              ok: false,
              errors: [
                {
                  code: 'validation-error',
                  level: 'error',
                  message: 'validation error',
                },
              ],
            })
          },
        }),
      } as any,
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id, scope: 'project' })

    expect(validationCalled).toBe(true)
    expect(result.error?.code).toBe('VALIDATION_FAILED')
    expect(result.error?.code).not.toBe('IMPORT_APPLY_NOT_READY')
  })

  it('真实 fidelity 下，导出默认 scope 为 user 但显式 --scope project 时不会被 IMPORT_APPLY_NOT_READY 提前拦截', async () => {
    const importedProfile = createProfile()
    let validationCalled = false
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [
            createImportedSource({
              profile: importedProfile,
              exportedObservation: {
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
              },
            }),
          ],
        }),
      } as any,
      undefined,
      {
        get: () => ({
          detectCurrent: async () => ({
            platform: 'gemini',
            managed: true,
            targetFiles: [],
            scopeAvailability: [
              { scope: 'project', status: 'available', detected: true, writable: true, path: 'E:/project/.gemini/settings.json' },
            ],
          }),
          validate: async () => {
            validationCalled = true
            return createValidationResult({
              ok: false,
              errors: [
                {
                  code: 'validation-error',
                  level: 'error',
                  message: 'validation error',
                },
              ],
            })
          },
        }),
      } as any,
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id, scope: 'project' })

    expect(validationCalled).toBe(true)
    expect(result.error?.code).toBe('VALIDATION_FAILED')
    expect(result.error?.code).not.toBe('IMPORT_APPLY_NOT_READY')
  })

  it('成功执行 user-scope apply，并把 provenance 传给 snapshot service', async () => {
    const importedProfile = createProfile()
    let capturedSnapshotInput: any
    let capturedApplyContext: any
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [createImportedSource({ profile: importedProfile })],
        }),
      } as any,
      {
        evaluate: () => ({
          fidelity: {
            status: 'match',
            mismatches: [],
            driftSummary: { blocking: 0, warning: 0, info: 0 },
            groupedMismatches: [],
            highlights: [],
          },
          previewDecision: {
            canProceedToApplyDesign: true,
            recommendedScope: 'user',
            requiresLocalResolution: false,
            reasonCodes: ['READY_USING_LOCAL_OBSERVATION'],
            reasons: [],
          },
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
          validate: async () => createValidationResult(),
          preview: async () => createPreviewResult({ noChanges: false }),
          apply: async (_profile: Profile, context: unknown) => {
            capturedApplyContext = context
            return {
              ok: true,
              changedFiles: ['C:/Users/test/.gemini/settings.json'],
              noChanges: false,
              diffSummary: [
                {
                  path: 'C:/Users/test/.gemini/settings.json',
                  changedKeys: ['enforcedAuthType'],
                  hasChanges: true,
                },
              ],
              warnings: [],
              limitations: [],
            }
          },
        }),
      } as any,
      {
        createBeforeApply: async (_adapter: unknown, _profile: Profile, input: unknown) => {
          capturedSnapshotInput = input
          return {
            backupId: 'snapshot-gemini-20260417120000-abcdef',
            manifestPath: 'backups/gemini/snapshot-gemini-20260417120000-abcdef/manifest.json',
            targetFiles: ['C:/Users/test/.gemini/settings.json'],
            warnings: [],
            limitations: [],
          }
        },
      } as any,
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id, force: true })

    expect(capturedSnapshotInput).toEqual(expect.objectContaining({
      requestedScope: undefined,
      provenance: {
        origin: 'import-apply',
        sourceFile: 'E:/tmp/export.json',
        importedProfileId: importedProfile.id,
      },
    }))
    expect(capturedApplyContext).toEqual({
      backupId: 'snapshot-gemini-20260417120000-abcdef',
      targetScope: 'user',
    })
    expect(result).toEqual({
      ok: true,
      action: 'import-apply',
      data: expect.objectContaining({
        sourceFile: 'E:/tmp/export.json',
        importedProfile,
        appliedScope: 'user',
        scopePolicy: expect.objectContaining({
          requestedScope: undefined,
          resolvedScope: 'user',
          explicitScope: false,
        }),
        backupId: 'snapshot-gemini-20260417120000-abcdef',
      }),
      warnings: [],
      limitations: [],
    })
  })

  it('成功 apply 会透传 applyResult.warnings 与 limitations', async () => {
    const importedProfile = createProfile()
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [createImportedSource({ profile: importedProfile })],
        }),
      } as any,
      {
        evaluate: () => ({
          fidelity: {
            status: 'match',
            mismatches: [],
            driftSummary: { blocking: 0, warning: 0, info: 0 },
            groupedMismatches: [],
            highlights: [],
          },
          previewDecision: {
            canProceedToApplyDesign: true,
            recommendedScope: 'user',
            requiresLocalResolution: false,
            reasonCodes: ['READY_USING_LOCAL_OBSERVATION'],
            reasons: [],
          },
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
          validate: async () => createValidationResult(),
          preview: async () => createPreviewResult(),
          apply: async () => ({
            ok: true,
            changedFiles: ['C:/Users/test/.gemini/settings.json'],
            noChanges: false,
            diffSummary: [],
            warnings: [
              {
                code: 'apply-warning',
                level: 'warning',
                message: 'apply warning',
              },
            ],
            limitations: [
              {
                code: 'apply-limitation',
                level: 'limitation',
                message: 'apply limitation',
              },
            ],
          }),
        }),
      } as any,
      {
        createBeforeApply: async () => ({
          backupId: 'snapshot-gemini-20260417120000-abcdef',
          manifestPath: 'backups/gemini/snapshot-gemini-20260417120000-abcdef/manifest.json',
          targetFiles: ['C:/Users/test/.gemini/settings.json'],
          warnings: [],
          limitations: [],
        }),
      } as any,
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id, force: true })

    expect(result.ok).toBe(true)
    expect(result.warnings).toContain('apply warning')
    expect(result.limitations).toContain('apply limitation')
    expect(result.data?.summary).toEqual(expect.objectContaining({
      warnings: ['apply warning'],
      limitations: ['apply limitation'],
    }))
  })

  it('sourceCompatibility.mode = schema-version-missing 时 warning 会透传到结果', async () => {
    const importedProfile = createProfile()
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/legacy-export.json',
          sourceCompatibility: {
            mode: 'schema-version-missing',
            schemaVersion: undefined,
            warnings: ['导入文件未声明 schemaVersion，当前按兼容模式解析。'],
          },
          profiles: [createImportedSource({ profile: importedProfile })],
        }),
      } as any,
      {
        evaluate: () => ({
          fidelity: {
            status: 'match',
            mismatches: [],
            driftSummary: { blocking: 0, warning: 0, info: 0 },
            groupedMismatches: [],
            highlights: [],
          },
          previewDecision: {
            canProceedToApplyDesign: true,
            recommendedScope: 'user',
            requiresLocalResolution: false,
            reasonCodes: ['READY_USING_LOCAL_OBSERVATION'],
            reasons: [],
          },
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
          validate: async () => createValidationResult(),
          preview: async () => createPreviewResult(),
          apply: async () => ({
            ok: true,
            changedFiles: ['C:/Users/test/.gemini/settings.json'],
            noChanges: false,
            diffSummary: [],
          }),
        }),
      } as any,
      {
        createBeforeApply: async () => ({
          backupId: 'snapshot-gemini-20260417120000-abcdef',
          manifestPath: 'backups/gemini/snapshot-gemini-20260417120000-abcdef/manifest.json',
          targetFiles: ['C:/Users/test/.gemini/settings.json'],
          warnings: [],
          limitations: [],
        }),
      } as any,
    )

    const result = await service.apply('E:/tmp/legacy-export.json', { profile: importedProfile.id, force: true })

    expect(result.ok).toBe(true)
    expect(result.warnings).toContain('导入文件未声明 schemaVersion，当前按兼容模式解析。')
  })

  it('同一导入文件里存在无关 profile 时，不会因为整批 preview 耦合阻断目标 profile apply', async () => {
    const importedProfile = createProfile()
    let evaluateCalls = 0
    let applyCalled = false
    const service = new ImportApplyService(
      {
        load: async () => ({
          sourceFile: 'E:/tmp/export.json',
          sourceCompatibility: { mode: 'strict', schemaVersion: '2026-04-15.public-json.v1', warnings: [] },
          profiles: [
            createImportedSource({
              profile: createProfile({
                id: 'broken-other',
                name: 'broken-other',
              }),
            }),
            createImportedSource({ profile: importedProfile }),
          ],
        }),
      } as any,
      {
        evaluate: ({ exportedObservation }: any) => {
          evaluateCalls += 1
          if (exportedObservation?.defaultWriteScope !== 'user') {
            throw new Error('unexpected profile')
          }

          return {
            fidelity: {
              status: 'match',
              mismatches: [],
              driftSummary: { blocking: 0, warning: 0, info: 0 },
              groupedMismatches: [],
              highlights: [],
            },
            previewDecision: {
              canProceedToApplyDesign: true,
              recommendedScope: 'user',
              requiresLocalResolution: false,
              reasonCodes: ['READY_USING_LOCAL_OBSERVATION'],
              reasons: [],
            },
          }
        },
      } as any,
      {
        get: () => ({
          detectCurrent: async (profiles: Array<{ id: string }>) => {
            if (profiles[0]?.id !== importedProfile.id) {
              throw new Error('unexpected detectCurrent profile')
            }

            return {
              platform: 'gemini',
              managed: true,
              targetFiles: [],
              scopeAvailability: [
                { scope: 'user', status: 'available', detected: true, writable: true, path: 'C:/Users/test/.gemini/settings.json' },
              ],
            }
          },
          validate: async () => createValidationResult(),
          preview: async () => createPreviewResult(),
          apply: async () => {
            applyCalled = true
            return {
              ok: true,
              changedFiles: ['C:/Users/test/.gemini/settings.json'],
              noChanges: false,
              diffSummary: [],
            }
          },
        }),
      } as any,
      {
        createBeforeApply: async () => ({
          backupId: 'snapshot-gemini-20260417120000-abcdef',
          manifestPath: 'backups/gemini/snapshot-gemini-20260417120000-abcdef/manifest.json',
          targetFiles: ['C:/Users/test/.gemini/settings.json'],
          warnings: [],
          limitations: [],
        }),
      } as any,
    )

    const result = await service.apply('E:/tmp/export.json', { profile: importedProfile.id, force: true })

    expect(evaluateCalls).toBe(1)
    expect(applyCalled).toBe(true)
    expect(result.ok).toBe(true)
    expect(result.data?.importedProfile.id).toBe(importedProfile.id)
  })
})
