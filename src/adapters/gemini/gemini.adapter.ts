import { diffManagedFields } from '../../domain/diff-engine'
import {
  collectSecretReferences,
  maskRecord,
  toConfigFieldView,
  toConfigFieldViews,
} from '../../domain/masking'
import type {
  ApplyContext,
  ApplyResult,
  CurrentProfileResult,
  EffectiveConfigView,
  ManagedBoundary,
  PreviewContext,
  PreviewResult,
  RollbackContext,
  RollbackResult,
  SecretReference,
  TargetFileInfo,
  ValidationContext,
  ValidationIssue,
  ValidationResult,
} from '../../types/adapter'
import type { Profile } from '../../types/profile'
import { atomicWrite } from '../../utils/atomic-write'
import { pathExists, readTextFile, removeFile } from '../../utils/file-system'
import { SnapshotStore } from '../../stores/snapshot.store'
import { getPlatformLimitationIssues } from '../../domain/platform-limitations'
import { BasePlatformAdapter } from '../base/platform-adapter'
import { normalizeGeminiContract } from './gemini.contract'
import { loadGeminiScopeState } from './gemini.scope-loader'
import { GEMINI_SETTINGS_MANAGED_KEYS, mergeGeminiSettings, pickGeminiSettingsFields } from './gemini.mapper'
import { parseGeminiSettings, stringifyGeminiSettings } from './gemini.parser'
import { resolveGeminiWritableScope, resolveGeminiWritableScopePath, type GeminiScope, type GeminiWritableScope } from './gemini.scope-resolver'
import { getTargetScopeWarning, isHighRiskTargetScope, requiresRollbackScopeMatch } from '../../services/scope-options'

function toIssues(messages: string[] | undefined, prefix: string, level: ValidationIssue['level']): ValidationIssue[] {
  return (messages ?? []).map((message, index) => ({
    code: `${prefix}-${index + 1}`,
    level,
    message,
  }))
}

type GeminiState = {
  scope: GeminiWritableScope
  settingsPath: string
  currentSettings: Record<string, unknown>
  currentManaged: Record<string, unknown>
  unmanagedKeys: string[]
}

export class GeminiAdapter extends BasePlatformAdapter {
  readonly platform = 'gemini' as const

  constructor(private readonly snapshotStore = new SnapshotStore()) {
    super()
  }

  private async buildTargetFiles(): Promise<TargetFileInfo[]> {
    const scopeState = await loadGeminiScopeState()
    return scopeState.targets
      .filter((target): target is typeof target & { path: string } => typeof target.path === 'string')
      .map((target) => ({
      path: target.path,
      format: 'json' as const,
      exists: target.exists,
      managedScope: 'partial-fields' as const,
      scope: target.scope,
      role: target.role,
      managedKeys: [...GEMINI_SETTINGS_MANAGED_KEYS],
      }))
  }

  private async buildWriteTargetFile(scope: GeminiWritableScope = 'user'): Promise<TargetFileInfo[]> {
    const { path: settingsPath } = await resolveGeminiWritableScopePath(scope)
    return [{
      path: settingsPath,
      format: 'json' as const,
      exists: await pathExists(settingsPath),
      managedScope: 'partial-fields' as const,
      scope,
      role: 'settings',
      managedKeys: [...GEMINI_SETTINGS_MANAGED_KEYS],
    }]
  }

  private buildManagedBoundaries(settingsPath: string, preservedKeys: string[] = [], note?: string): ManagedBoundary[] {
    return [
      {
        target: settingsPath,
        type: 'managed-fields',
        managedKeys: [...GEMINI_SETTINGS_MANAGED_KEYS],
        preservedKeys,
        notes: [note ?? 'Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。'],
      },
    ]
  }

  private async readState(scope: GeminiWritableScope = 'user'): Promise<GeminiState> {
    const { path: settingsPath } = await resolveGeminiWritableScopePath(scope)
    const currentSettings = parseGeminiSettings(await readTextFile(settingsPath))
    const currentManaged = pickGeminiSettingsFields(currentSettings)

    return {
      scope,
      settingsPath,
      currentSettings,
      currentManaged,
      unmanagedKeys: Object.keys(currentSettings).filter((key) => !(key in currentManaged)),
    }
  }

  private buildScopeSwitchWarning(targetScope: GeminiWritableScope): ValidationIssue[] {
    const message = getTargetScopeWarning(this.platform, targetScope)
    return message
      ? [{
          code: 'gemini-project-scope-confirmation',
          level: 'warning',
          message,
          source: `scope-${targetScope}`,
        }]
      : []
  }

  private mergeManagedWithTarget(input: {
    targetScope: GeminiWritableScope
    nextSettings: Record<string, unknown>
  }): Promise<{ effectiveManaged: Record<string, unknown>; contributors: Partial<Record<string, GeminiScope>> }> {
    return loadGeminiScopeState().then((scopeState) => {
      const mergedManaged: Record<string, unknown> = {}
      const contributors: Partial<Record<string, GeminiScope>> = {}
      const scopeOrder: GeminiScope[] = ['system-defaults', 'user', 'project', 'system-overrides']

      for (const scope of scopeOrder) {
        const managed = scope === input.targetScope
          ? pickGeminiSettingsFields(input.nextSettings)
          : scopeState.layers.find((item) => item.scope === scope)?.managed ?? {}

        for (const [key, value] of Object.entries(managed)) {
          mergedManaged[key] = value
          contributors[key] = scope
        }
      }

      return {
        effectiveManaged: mergedManaged,
        contributors,
      }
    })
  }

  private buildEnvWarning(): ValidationIssue {
    return {
      code: 'env-auth-required',
      level: 'warning',
      message: 'Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。',
    }
  }

  private buildExperimentalWarnings(profile: Profile): ValidationIssue[] {
    const contract = normalizeGeminiContract(profile)
    const issues: ValidationIssue[] = []

    if (contract.experimental.legacyApplyBaseUrl) {
      issues.push({
        code: 'legacy-gemini-base-url',
        level: 'warning',
        message: '检测到 legacy apply.GEMINI_BASE_URL，已按实验性配置解释。',
        field: 'GEMINI_BASE_URL',
        source: 'managed-policy',
      })
    }

    if (contract.experimental.geminiBaseUrl) {
      issues.push({
        code: 'experimental-gemini-base-url',
        level: 'warning',
        message: 'Gemini 自定义 base URL 属于实验性支持，默认不按稳定托管字段写入。',
        field: 'GEMINI_BASE_URL',
        source: 'managed-policy',
      })
    }

    return issues
  }

  private buildSecretReferences(apiKey: unknown, source: SecretReference['source']): SecretReference[] {
    return [{
      key: 'GEMINI_API_KEY',
      source,
      present: apiKey !== undefined && apiKey !== null && String(apiKey).length > 0,
      maskedValue: maskRecord({ GEMINI_API_KEY: apiKey }).GEMINI_API_KEY,
    }]
  }

  private buildEffectiveConfig(input: {
    stored: Record<string, unknown>
    effectiveManaged?: Record<string, unknown>
    apiKey?: unknown
    apiKeySource?: 'effective' | 'env'
    apiKeyScope?: string
    overrideMessage?: string
    shadowedApiKey?: boolean
    managedOverrides?: Array<{ key: string; source: string; targetScope: string; message: string }>
    storedScope?: string
    effectiveScope?: string
  }): EffectiveConfigView {
    const effectiveManaged = input.effectiveManaged ?? input.stored
    const shadowedKeys = input.shadowedApiKey && input.apiKey ? ['GEMINI_API_KEY'] : []

    return {
      stored: toConfigFieldViews(input.stored, 'stored', { scope: input.storedScope ?? 'user' }),
      effective: [
        ...Object.entries(effectiveManaged).map(([key, value]) => toConfigFieldView(key, value, 'effective', { scope: input.effectiveScope ?? 'user' })),
        ...(input.apiKey
          ? [toConfigFieldView(
              'GEMINI_API_KEY',
              input.apiKey,
              input.apiKeySource ?? 'effective',
              {
                scope: input.apiKeyScope ?? (input.apiKeySource === 'env' ? 'runtime' : 'user'),
                shadowed: shadowedKeys.includes('GEMINI_API_KEY'),
              },
            )]
          : []),
      ],
      overrides: [
        ...(input.managedOverrides ?? []).map((item) => ({
          key: item.key,
          kind: 'scope' as const,
          source: item.source,
          targetScope: item.targetScope,
          message: item.message,
        })),
        ...(input.overrideMessage && input.apiKey
          ? [{
              key: 'GEMINI_API_KEY',
              kind: 'env' as const,
              source: 'env',
              message: input.overrideMessage,
              shadowed: input.shadowedApiKey,
            }]
          : []),
      ],
      shadowedKeys,
    }
  }

  async validate(profile: Profile, context: ValidationContext = {}): Promise<ValidationResult> {
    const targetScope = resolveGeminiWritableScope(context.targetScope)
    const { settingsPath, unmanagedKeys } = await this.readState(targetScope)
    const issues: ValidationIssue[] = []
    const contract = normalizeGeminiContract(profile)
    const apiKey = contract.runtimeApiKey
    const enforcedAuthType = contract.stableSettings.enforcedAuthType
    const managedFields = contract.stableSettings
    const limitations = getPlatformLimitationIssues(this.platform)

    if (!apiKey || typeof apiKey !== 'string') {
      issues.push({
        code: 'missing-gemini-api-key',
        level: 'error',
        message: '缺少 GEMINI_API_KEY',
        field: 'GEMINI_API_KEY',
      })
    }

    if (enforcedAuthType !== undefined && enforcedAuthType !== 'gemini-api-key') {
      issues.push({
        code: 'unsupported-auth-type',
        level: 'warning',
        message: 'Gemini 首版仅稳定支持 enforcedAuthType = gemini-api-key。',
        field: 'enforcedAuthType',
      })
    }

    issues.push(...this.buildExperimentalWarnings(profile))

    return {
      ok: !issues.some((item) => item.level === 'error'),
      errors: issues.filter((item) => item.level === 'error'),
      warnings: issues.filter((item) => item.level === 'warning'),
      limitations,
      effectiveConfig: this.buildEffectiveConfig({
        stored: managedFields,
        apiKey,
        apiKeySource: 'env',
        overrideMessage: 'Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。',
        shadowedApiKey: true,
      }),
      managedBoundaries: this.buildManagedBoundaries(settingsPath, unmanagedKeys),
      secretReferences: this.buildSecretReferences(apiKey, 'env'),
      preservedFields: unmanagedKeys,
      retainedZones: [],
    }
  }

  async preview(profile: Profile, context: PreviewContext = {}): Promise<PreviewResult> {
    const targetScope = resolveGeminiWritableScope(context.targetScope)
    const { settingsPath, currentSettings, currentManaged, unmanagedKeys } = await this.readState(targetScope)
    const contract = normalizeGeminiContract(profile)
    const nextSettings = mergeGeminiSettings(currentSettings, profile.apply)
    const nextManaged = pickGeminiSettingsFields(nextSettings)
    const nextEffective = await this.mergeManagedWithTarget({ targetScope, nextSettings })
    const validation = await this.validate(profile, { targetScope })
    const warnings = [...validation.warnings]
    const limitations = [...validation.limitations]
    const managedFields = contract.stableSettings
    const diff = diffManagedFields(settingsPath, currentSettings, nextSettings, {
      managedKeys: [...GEMINI_SETTINGS_MANAGED_KEYS],
      preservedKeys: unmanagedKeys,
    })

    warnings.push({
      code: 'env-auth-required',
      level: 'warning',
      message: 'Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。',
    })

    if (unmanagedKeys.length > 0) {
      warnings.push({
        code: 'unmanaged-current-file',
        level: 'warning',
        message: `当前 Gemini settings.json 存在非托管字段：${unmanagedKeys.join(', ')}`,
      })
    }

    const experimentalBaseUrl = contract.experimental.geminiBaseUrl
    if (experimentalBaseUrl) {
      warnings.push(...this.buildExperimentalWarnings(profile))
    }
    warnings.push(...this.buildScopeSwitchWarning(targetScope))

    const riskLevel = !validation.ok ? 'high' : isHighRiskTargetScope(this.platform, targetScope) ? 'high' : warnings.length > 0 ? 'medium' : 'low'

    return {
      platform: this.platform,
      profileId: profile.id,
      targetFiles: await this.buildWriteTargetFile(targetScope),
      effectiveFields: [
        ...Object.entries(managedFields).map(([key, value]) => ({
          key,
          value,
          maskedValue: maskRecord({ [key]: value })[key],
          source: 'profile',
          scope: targetScope,
        })),
        ...('GEMINI_API_KEY' in profile.apply ? [{
          key: 'GEMINI_API_KEY',
          value: contract.runtimeApiKey,
          maskedValue: maskRecord({ GEMINI_API_KEY: contract.runtimeApiKey }).GEMINI_API_KEY,
          source: 'env' as const,
          scope: 'runtime',
          secret: true,
        }] : []),
        ...(experimentalBaseUrl ? [{
          key: 'GEMINI_BASE_URL',
          value: experimentalBaseUrl,
          maskedValue: maskRecord({ GEMINI_BASE_URL: experimentalBaseUrl }).GEMINI_BASE_URL,
          source: 'managed-policy' as const,
          scope: 'runtime',
        }] : []),
      ],
      storedOnlyFields: Object.entries(profile.source)
        .filter(([key]) => !(key in managedFields) && key !== 'GEMINI_API_KEY')
        .map(([key, value]) => ({
          key,
          value,
          maskedValue: maskRecord({ [key]: value })[key],
          source: 'profile',
        })),
      storedConfig: toConfigFieldViews(currentSettings, 'stored', { scope: targetScope }),
      effectiveConfig: this.buildEffectiveConfig({
        stored: currentManaged,
        effectiveManaged: nextEffective.effectiveManaged,
        apiKey: profile.apply.GEMINI_API_KEY,
        apiKeySource: 'effective',
        overrideMessage: '最终生效的 API key 取决于环境变量，而不是 settings.json。',
        storedScope: targetScope,
        effectiveScope: nextEffective.contributors.enforcedAuthType ?? targetScope,
        managedOverrides: nextEffective.contributors.enforcedAuthType && nextEffective.contributors.enforcedAuthType !== targetScope
          ? [{
              key: 'enforcedAuthType',
              source: `scope-${nextEffective.contributors.enforcedAuthType}`,
              targetScope,
              message: `enforcedAuthType 会写入 ${targetScope} scope，但最终仍由 ${nextEffective.contributors.enforcedAuthType} scope 生效。`,
            }]
          : [],
      }),
      managedBoundaries: this.buildManagedBoundaries(settingsPath, unmanagedKeys),
      secretReferences: collectSecretReferences({ ...managedFields, GEMINI_API_KEY: profile.apply.GEMINI_API_KEY }),
      preservedFields: unmanagedKeys,
      retainedZones: [],
      diffSummary: [diff],
      warnings,
      limitations,
      riskLevel,
      requiresConfirmation: riskLevel !== 'low',
      backupPlanned: diff.hasChanges,
      noChanges: !diff.hasChanges,
    }
  }

  async detectCurrent(profiles: Profile[] = []): Promise<CurrentProfileResult | null> {
    const { settingsPath, unmanagedKeys } = await this.readState()
    const scopeState = await loadGeminiScopeState()
    const currentSettings = scopeState.mergedSettings
    const currentManaged = scopeState.mergedManaged
    const warnings: ValidationIssue[] = []
    const matchedProfile = profiles.find((profile) => {
      const contract = normalizeGeminiContract(profile)
      return (
        !contract.experimental.geminiBaseUrl
        && Object.entries(contract.stableSettings).every(([key, value]) => currentManaged[key] === value)
      )
    })
    const hasUndetectableExperimentalProfile = profiles.some((profile) => Boolean(normalizeGeminiContract(profile).experimental.geminiBaseUrl))

    const apiKey = matchedProfile?.apply.GEMINI_API_KEY
    if (apiKey) {
      warnings.push(this.buildEnvWarning())
    }
    if (hasUndetectableExperimentalProfile) {
      warnings.push({
        code: 'experimental-current-state-undetectable',
        level: 'warning',
        message: 'Gemini 实验性 base URL 当前无法可靠检测，当前态不会标记为完整匹配。',
        field: 'GEMINI_BASE_URL',
        source: 'managed-policy',
      })
    }

    return {
      platform: this.platform,
      matchedProfileId: matchedProfile?.id,
      managed: Boolean(matchedProfile),
      targetFiles: await this.listTargets(),
      scopeAvailability: scopeState.targets.map((target) => ({
        scope: target.scope,
        status: target.status,
        detected: target.detected,
        writable: target.writable,
        path: target.path,
        reasonCode: target.reasonCode,
        reason: target.reason,
        remediation: target.remediation,
      })),
      details: currentSettings,
      currentScope: scopeState.contributors.enforcedAuthType ?? 'user',
      storedConfig: toConfigFieldViews(currentManaged, 'stored', { scope: scopeState.contributors.enforcedAuthType ?? 'user' }),
      effectiveConfig: this.buildEffectiveConfig({
        stored: currentManaged,
        apiKey,
        apiKeySource: 'env',
        overrideMessage: '最终生效的 API key 取决于环境变量，而不是 settings.json。',
        shadowedApiKey: Boolean(apiKey),
        managedOverrides: scopeState.contributors.enforcedAuthType && scopeState.contributors.enforcedAuthType !== 'user'
          ? [{
              key: 'enforcedAuthType',
              source: `scope-${scopeState.contributors.enforcedAuthType}`,
              targetScope: scopeState.contributors.enforcedAuthType,
              message: `enforcedAuthType 当前由 ${scopeState.contributors.enforcedAuthType} scope 生效。`,
            }]
          : [],
        storedScope: scopeState.contributors.enforcedAuthType ?? 'user',
        effectiveScope: scopeState.contributors.enforcedAuthType ?? 'user',
      }),
      managedBoundaries: [
        {
          type: 'scope-aware',
          managedKeys: [...GEMINI_SETTINGS_MANAGED_KEYS],
          notes: ['Gemini 当前按 system-defaults < user < project < system-overrides 的顺序合并 settings.json。'],
        },
        ...this.buildManagedBoundaries(settingsPath, unmanagedKeys),
      ],
      secretReferences: apiKey ? this.buildSecretReferences(apiKey, 'env') : [],
      warnings,
      limitations: getPlatformLimitationIssues(this.platform),
    }
  }

  async listTargets(): Promise<TargetFileInfo[]> {
    return this.buildTargetFiles()
  }

  async apply(profile: Profile, context: ApplyContext): Promise<ApplyResult> {
    const targetScope = resolveGeminiWritableScope(context.targetScope)
    const { settingsPath, currentSettings, currentManaged, unmanagedKeys } = await this.readState(targetScope)
    const contract = normalizeGeminiContract(profile)
    const nextSettings = mergeGeminiSettings(currentSettings, profile.apply)
    const nextManaged = pickGeminiSettingsFields(nextSettings)
    const nextEffective = await this.mergeManagedWithTarget({ targetScope, nextSettings })
    const diff = diffManagedFields(settingsPath, currentSettings, nextSettings, {
      managedKeys: [...GEMINI_SETTINGS_MANAGED_KEYS],
      preservedKeys: unmanagedKeys,
    })
    const targetFiles = await this.buildWriteTargetFile(targetScope)
    const limitations = getPlatformLimitationIssues(this.platform)
    const warnings: ValidationIssue[] = []

    if (contract.experimental.geminiBaseUrl) {
      warnings.push({
        code: 'experimental-gemini-base-url-not-applied',
        level: 'warning',
        message: 'Gemini 实验性 base URL 当前没有可靠写入目标，本次不会落盘。',
        field: 'GEMINI_BASE_URL',
        source: 'managed-policy',
      })
    }

    if (!diff.hasChanges) {
      return {
        ok: true,
        changedFiles: [],
        noChanges: true,
        diffSummary: [diff],
        targetFiles,
        storedConfig: toConfigFieldViews(currentSettings, 'stored', { scope: targetScope }),
        effectiveConfig: this.buildEffectiveConfig({
          stored: currentManaged,
          effectiveManaged: nextEffective.effectiveManaged,
          apiKey: profile.apply.GEMINI_API_KEY,
          apiKeySource: 'effective',
          overrideMessage: '最终生效的 API key 取决于环境变量，而不是 settings.json。',
          storedScope: targetScope,
          effectiveScope: nextEffective.contributors.enforcedAuthType ?? targetScope,
        }),
        managedBoundaries: this.buildManagedBoundaries(settingsPath, unmanagedKeys),
        warnings,
        limitations,
      }
    }

    await atomicWrite(settingsPath, stringifyGeminiSettings(nextSettings))

    return {
      ok: true,
      changedFiles: [settingsPath],
      noChanges: false,
      diffSummary: [diff],
      targetFiles,
      storedConfig: toConfigFieldViews(nextSettings, 'stored', { scope: targetScope }),
      effectiveConfig: this.buildEffectiveConfig({
        stored: nextManaged,
        effectiveManaged: nextEffective.effectiveManaged,
        apiKey: profile.apply.GEMINI_API_KEY,
        apiKeySource: 'effective',
        overrideMessage: 'Gemini API key 仍由环境变量决定。',
        storedScope: targetScope,
        effectiveScope: nextEffective.contributors.enforcedAuthType ?? targetScope,
      }),
      managedBoundaries: this.buildManagedBoundaries(settingsPath, unmanagedKeys),
      warnings,
      limitations,
    }
  }

  async rollback(snapshotId: string, context?: RollbackContext): Promise<RollbackResult> {
    const backupId = context?.backupId ?? snapshotId
    const record = await this.snapshotStore.readManifest(this.platform, backupId)
    const expectedScope = context?.targetScope ? resolveGeminiWritableScope(context.targetScope) : undefined
    const manifestScope = record.manifest.targetFiles[0]?.scope
    if (requiresRollbackScopeMatch(this.platform) && expectedScope && manifestScope && manifestScope !== expectedScope) {
      return {
        ok: false,
        backupId,
        restoredFiles: [],
        warnings: [{
          code: 'rollback-scope-mismatch',
          level: 'warning',
          message: `快照属于 ${manifestScope} scope，不能按 ${expectedScope} scope 回滚。`,
        }],
        limitations: [],
      }
    }

    const restoredFiles: string[] = []

    for (const target of record.manifest.targetFiles) {
      const backupContent = await this.snapshotStore.readSnapshotFile(this.platform, backupId, target.storedFileName)

      if (target.existsBeforeBackup) {
        await atomicWrite(target.originalPath, backupContent ?? '')
      } else {
        await removeFile(target.originalPath)
      }

      restoredFiles.push(target.originalPath)
    }

    const restoredScope = resolveGeminiWritableScope(manifestScope)
    const { settingsPath, currentManaged, unmanagedKeys } = await this.readState(restoredScope)
    const apiKey = record.manifest.secretReferences?.find((item) => item.key === 'GEMINI_API_KEY')?.maskedValue

    return {
      ok: true,
      backupId,
      restoredFiles,
      targetFiles: record.manifest.targetFiles.map((target) => ({
        path: target.originalPath,
        format: 'json',
        exists: target.existsBeforeBackup,
        managedScope: 'partial-fields',
        scope: target.scope,
        role: target.role,
        managedKeys: target.managedKeys,
      })),
      effectiveConfig: this.buildEffectiveConfig({
        stored: currentManaged,
        apiKey,
        apiKeySource: 'env',
        overrideMessage: 'Gemini API key 仍由环境变量决定。',
        shadowedApiKey: Boolean(apiKey),
        storedScope: restoredScope,
        effectiveScope: restoredScope,
      }),
      managedBoundaries: this.buildManagedBoundaries(
        settingsPath,
        unmanagedKeys,
        '回滚仅恢复 Gemini settings.json 中的托管字段。',
      ),
      warnings: [
        {
          code: 'rollback-restored-managed-files',
          level: 'warning',
          message: '已按快照清单恢复托管文件。',
        },
      ],
      limitations: [
        {
          code: 'rollback-env-not-restored',
          level: 'limitation',
          message: '回滚不会恢复环境变量。',
        },
      ],
    }
  }
}
