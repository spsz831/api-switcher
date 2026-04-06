import { diffManagedFields } from '../../domain/diff-engine'
import {
  buildEffectiveConfigView,
  collectSecretReferences,
  maskRecord,
  toConfigFieldViews,
} from '../../domain/masking'
import type {
  ApplyContext,
  ApplyResult,
  CurrentProfileResult,
  ManagedBoundary,
  PreviewResult,
  RollbackContext,
  RollbackResult,
  TargetFileInfo,
  ValidationIssue,
  ValidationResult,
} from '../../types/adapter'
import type { Profile } from '../../types/profile'
import { atomicWrite } from '../../utils/atomic-write'
import { pathExists, readTextFile, removeFile } from '../../utils/file-system'
import { SnapshotStore } from '../../stores/snapshot.store'
import { getPlatformLimitationIssues } from '../../services/profile.service'
import { BasePlatformAdapter } from '../base/platform-adapter'
import { GEMINI_SETTINGS_MANAGED_KEYS, mergeGeminiSettings, pickGeminiSettingsFields } from './gemini.mapper'
import { parseGeminiSettings, stringifyGeminiSettings } from './gemini.parser'
import { resolveGeminiSettingsPath } from './gemini.target-resolver'

function toIssues(messages: string[] | undefined, prefix: string, level: ValidationIssue['level']): ValidationIssue[] {
  return (messages ?? []).map((message, index) => ({
    code: `${prefix}-${index + 1}`,
    level,
    message,
  }))
}

export class GeminiAdapter extends BasePlatformAdapter {
  readonly platform = 'gemini' as const

  constructor(private readonly snapshotStore = new SnapshotStore()) {
    super()
  }

  private async buildTargetFiles(): Promise<TargetFileInfo[]> {
    const settingsPath = resolveGeminiSettingsPath()
    return [{
      path: settingsPath,
      format: 'json',
      exists: await pathExists(settingsPath),
      managedScope: 'partial-fields',
      scope: 'user',
      role: 'settings',
      managedKeys: [...GEMINI_SETTINGS_MANAGED_KEYS],
    }]
  }

  private buildManagedBoundaries(settingsPath: string, preservedKeys: string[] = []): ManagedBoundary[] {
    return [
      {
        target: settingsPath,
        type: 'managed-fields',
        managedKeys: [...GEMINI_SETTINGS_MANAGED_KEYS],
        preservedKeys,
        notes: ['Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。'],
      },
    ]
  }

  async validate(profile: Profile): Promise<ValidationResult> {
    const settingsPath = resolveGeminiSettingsPath()
    const issues: ValidationIssue[] = []
    const apiKey = profile.apply.GEMINI_API_KEY
    const enforcedAuthType = profile.apply.enforcedAuthType
    const managedFields = pickGeminiSettingsFields(profile.apply)
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

    if ('GEMINI_BASE_URL' in profile.apply) {
      issues.push({
        code: 'unsupported-base-url',
        level: 'warning',
        message: 'Gemini CLI 官方文档当前未确认可通过 settings.json 稳定写入自定义 base URL，已忽略该字段。',
        field: 'GEMINI_BASE_URL',
      })
    }

    return {
      ok: !issues.some((item) => item.level === 'error'),
      errors: issues.filter((item) => item.level === 'error'),
      warnings: issues.filter((item) => item.level === 'warning'),
      limitations,
      effectiveConfig: buildEffectiveConfigView({
        stored: managedFields,
        effective: {
          ...managedFields,
          ...(apiKey ? { GEMINI_API_KEY: apiKey } : {}),
        },
        overrides: apiKey ? [{
          key: 'GEMINI_API_KEY',
          kind: 'env',
          source: 'env',
          message: 'Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。',
        }] : [],
        scope: 'user',
      }),
      managedBoundaries: this.buildManagedBoundaries(settingsPath),
      secretReferences: collectSecretReferences({ ...managedFields, GEMINI_API_KEY: apiKey }),
      preservedFields: [],
      retainedZones: [],
    }
  }

  async preview(profile: Profile): Promise<PreviewResult> {
    const settingsPath = resolveGeminiSettingsPath()
    const currentSettings = parseGeminiSettings(await readTextFile(settingsPath))
    const nextSettings = mergeGeminiSettings(currentSettings, profile.apply)
    const validation = await this.validate(profile)
    const warnings = [...validation.warnings]
    const limitations = [...validation.limitations]
    const managedFields = pickGeminiSettingsFields(profile.apply)
    const currentManaged = pickGeminiSettingsFields(currentSettings)
    const unmanagedKeys = Object.keys(currentSettings).filter((key) => !(key in managedFields))
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

    const riskLevel = !validation.ok ? 'high' : warnings.length > 0 ? 'medium' : 'low'

    return {
      platform: this.platform,
      profileId: profile.id,
      targetFiles: await this.buildTargetFiles(),
      effectiveFields: [
        ...Object.entries(managedFields).map(([key, value]) => ({
          key,
          value,
          maskedValue: maskRecord({ [key]: value })[key],
          source: 'profile',
          scope: 'user',
        })),
        ...('GEMINI_API_KEY' in profile.apply ? [{
          key: 'GEMINI_API_KEY',
          value: profile.apply.GEMINI_API_KEY,
          maskedValue: maskRecord({ GEMINI_API_KEY: profile.apply.GEMINI_API_KEY }).GEMINI_API_KEY,
          source: 'env' as const,
          scope: 'runtime',
          secret: true,
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
      storedConfig: toConfigFieldViews(currentSettings, 'stored', { scope: 'user' }),
      effectiveConfig: buildEffectiveConfigView({
        stored: currentManaged,
        effective: {
          ...managedFields,
          ...(profile.apply.GEMINI_API_KEY !== undefined ? { GEMINI_API_KEY: profile.apply.GEMINI_API_KEY } : {}),
        },
        overrides: profile.apply.GEMINI_API_KEY !== undefined ? [{
          key: 'GEMINI_API_KEY',
          kind: 'env',
          source: 'env',
          message: '最终生效的 API key 取决于环境变量，而不是 settings.json。',
        }] : [],
        scope: 'user',
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
    const settingsPath = resolveGeminiSettingsPath()
    const currentSettings = parseGeminiSettings(await readTextFile(settingsPath))
    const currentManaged = pickGeminiSettingsFields(currentSettings)

    const matchedProfile = profiles.find((profile) => {
      const managedFields = pickGeminiSettingsFields(profile.apply)
      return Object.entries(managedFields).every(([key, value]) => currentSettings[key] === value)
    })

    return {
      platform: this.platform,
      matchedProfileId: matchedProfile?.id,
      managed: Boolean(matchedProfile),
      targetFiles: await this.listTargets(),
      details: currentSettings,
      currentScope: 'user',
      storedConfig: toConfigFieldViews(currentSettings, 'stored', { scope: 'user' }),
      effectiveConfig: buildEffectiveConfigView({
        stored: currentManaged,
        effective: currentManaged,
        scope: 'user',
      }),
      managedBoundaries: this.buildManagedBoundaries(settingsPath, Object.keys(currentSettings).filter((key) => !(key in currentManaged))),
      secretReferences: collectSecretReferences(currentSettings),
      warnings: [],
      limitations: getPlatformLimitationIssues(this.platform),
    }
  }

  async listTargets(): Promise<TargetFileInfo[]> {
    return this.buildTargetFiles()
  }

  async apply(profile: Profile, _context: ApplyContext): Promise<ApplyResult> {
    const settingsPath = resolveGeminiSettingsPath()
    const currentSettings = parseGeminiSettings(await readTextFile(settingsPath))
    const nextSettings = mergeGeminiSettings(currentSettings, profile.apply)
    const currentManaged = pickGeminiSettingsFields(currentSettings)
    const unmanagedKeys = Object.keys(currentSettings).filter((key) => !(key in pickGeminiSettingsFields(profile.apply)))
    const diff = diffManagedFields(settingsPath, currentSettings, nextSettings, {
      managedKeys: [...GEMINI_SETTINGS_MANAGED_KEYS],
      preservedKeys: unmanagedKeys,
    })
    const targetFiles = await this.listTargets()
    const limitations = getPlatformLimitationIssues(this.platform)

    if (!diff.hasChanges) {
      return {
        ok: true,
        changedFiles: [],
        noChanges: true,
        diffSummary: [diff],
        targetFiles,
        storedConfig: toConfigFieldViews(currentSettings, 'stored', { scope: 'user' }),
        effectiveConfig: buildEffectiveConfigView({
          stored: currentManaged,
          effective: currentManaged,
          scope: 'user',
        }),
        managedBoundaries: this.buildManagedBoundaries(settingsPath, unmanagedKeys),
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
      storedConfig: toConfigFieldViews(nextSettings, 'stored', { scope: 'user' }),
      effectiveConfig: buildEffectiveConfigView({
        stored: pickGeminiSettingsFields(nextSettings),
        effective: {
          ...pickGeminiSettingsFields(nextSettings),
          ...(profile.apply.GEMINI_API_KEY !== undefined ? { GEMINI_API_KEY: profile.apply.GEMINI_API_KEY } : {}),
        },
        overrides: profile.apply.GEMINI_API_KEY !== undefined ? [{
          key: 'GEMINI_API_KEY',
          kind: 'env',
          source: 'env',
          message: 'Gemini API key 仍由环境变量决定。',
        }] : [],
        scope: 'user',
      }),
      managedBoundaries: this.buildManagedBoundaries(settingsPath, unmanagedKeys),
      limitations,
    }
  }

  async rollback(snapshotId: string, context?: RollbackContext): Promise<RollbackResult> {
    const backupId = context?.backupId ?? snapshotId
    const record = await this.snapshotStore.readManifest(this.platform, backupId)
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
      managedBoundaries: record.manifest.managedBoundaries,
      warnings: toIssues(record.manifest.warnings, 'snapshot-warning', 'warning'),
      limitations: toIssues(record.manifest.limitations, 'snapshot-limitation', 'limitation'),
    }
  }
}
