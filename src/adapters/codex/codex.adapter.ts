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
import { getPlatformLimitationIssues } from '../../domain/platform-limitations'
import { BasePlatformAdapter } from '../base/platform-adapter'
import {
  CODEX_AUTH_MANAGED_KEYS,
  CODEX_CONFIG_MANAGED_KEYS,
  mergeCodexAuth,
  mergeCodexConfig,
  pickCodexAuthFields,
  pickCodexConfigFields,
} from './codex.mapper'
import {
  parseCodexAuth,
  parseCodexConfig,
  stringifyCodexAuth,
  stringifyCodexConfig,
} from './codex.parser'
import { resolveCodexTargets } from './codex.target-resolver'

function toIssues(messages: string[] | undefined, prefix: string, level: ValidationIssue['level']): ValidationIssue[] {
  return (messages ?? []).map((message, index) => ({
    code: `${prefix}-${index + 1}`,
    level,
    message,
  }))
}

function listPreservedKeys(current: Record<string, unknown>, managedKeys: readonly string[]): string[] {
  return Object.keys(current).filter((key) => !managedKeys.includes(key))
}

export class CodexAdapter extends BasePlatformAdapter {
  readonly platform = 'codex' as const

  constructor(private readonly snapshotStore = new SnapshotStore()) {
    super()
  }

  private async buildTargetFiles(): Promise<TargetFileInfo[]> {
    const { configPath, authPath } = resolveCodexTargets()
    return [
      {
        path: configPath,
        format: 'toml',
        exists: await pathExists(configPath),
        managedScope: 'multi-file',
        role: 'config',
        managedKeys: [...CODEX_CONFIG_MANAGED_KEYS],
      },
      {
        path: authPath,
        format: 'json',
        exists: await pathExists(authPath),
        managedScope: 'multi-file',
        role: 'auth',
        managedKeys: [...CODEX_AUTH_MANAGED_KEYS],
      },
    ]
  }

  private buildManagedBoundaries(configPath: string, authPath: string, preserved: { config: string[]; auth: string[] }): ManagedBoundary[] {
    return [
      {
        type: 'multi-file-transaction',
        managedKeys: [...CODEX_CONFIG_MANAGED_KEYS, ...CODEX_AUTH_MANAGED_KEYS],
        notes: ['Codex 配置切换会联动 config.toml 与 auth.json。'],
      },
      {
        target: configPath,
        type: 'managed-fields',
        managedKeys: [...CODEX_CONFIG_MANAGED_KEYS],
        preservedKeys: preserved.config,
      },
      {
        target: authPath,
        type: 'managed-fields',
        managedKeys: [...CODEX_AUTH_MANAGED_KEYS],
        preservedKeys: preserved.auth,
      },
    ]
  }

  async validate(profile: Profile): Promise<ValidationResult> {
    const { configPath, authPath } = resolveCodexTargets()
    const issues: ValidationIssue[] = []
    const limitations = getPlatformLimitationIssues(this.platform)
    const apiKey = profile.apply.OPENAI_API_KEY
    const baseUrl = profile.apply.base_url
    const managed = {
      ...pickCodexConfigFields(profile.apply),
      ...pickCodexAuthFields(profile.apply),
    }

    if (!apiKey || typeof apiKey !== 'string') {
      issues.push({
        code: 'missing-openai-api-key',
        level: 'error',
        message: '缺少 OPENAI_API_KEY',
        field: 'OPENAI_API_KEY',
      })
    }

    if (baseUrl && typeof baseUrl === 'string' && !baseUrl.endsWith('/v1') && !baseUrl.endsWith('/openai/v1')) {
      issues.push({
        code: 'url-path-warning',
        level: 'warning',
        message: 'base_url 可能缺少 /v1 或 /openai/v1 后缀。',
        field: 'base_url',
      })
    }

    return {
      ok: !issues.some((item) => item.level === 'error'),
      errors: issues.filter((item) => item.level === 'error'),
      warnings: issues.filter((item) => item.level === 'warning'),
      limitations,
      effectiveConfig: buildEffectiveConfigView({
        stored: managed,
        effective: managed,
      }),
      managedBoundaries: this.buildManagedBoundaries(configPath, authPath, { config: [], auth: [] }),
      secretReferences: collectSecretReferences(managed),
      preservedFields: [],
      retainedZones: [],
    }
  }

  async preview(profile: Profile): Promise<PreviewResult> {
    const { configPath, authPath } = resolveCodexTargets()
    const currentConfig = parseCodexConfig(await readTextFile(configPath))
    const currentAuth = parseCodexAuth(await readTextFile(authPath))
    const nextConfig = mergeCodexConfig(currentConfig, profile.apply)
    const nextAuth = mergeCodexAuth(currentAuth, profile.apply)
    const validation = await this.validate(profile)
    const warnings = [...validation.warnings]
    const limitations = [...validation.limitations]

    const configManaged = pickCodexConfigFields(profile.apply)
    const authManaged = pickCodexAuthFields(profile.apply)
    const allManaged = { ...configManaged, ...authManaged }
    const currentManaged = { ...pickCodexConfigFields(currentConfig), ...pickCodexAuthFields(currentAuth) }
    const nextManaged = { ...pickCodexConfigFields(nextConfig), ...pickCodexAuthFields(nextAuth) }
    const unmanagedConfigKeys = listPreservedKeys(currentConfig, CODEX_CONFIG_MANAGED_KEYS)
    const unmanagedAuthKeys = listPreservedKeys(currentAuth, CODEX_AUTH_MANAGED_KEYS)
    const configDiff = diffManagedFields(configPath, currentConfig, nextConfig, {
      managedKeys: [...CODEX_CONFIG_MANAGED_KEYS],
      preservedKeys: unmanagedConfigKeys,
    })
    const authDiff = diffManagedFields(authPath, currentAuth, nextAuth, {
      managedKeys: [...CODEX_AUTH_MANAGED_KEYS],
      preservedKeys: unmanagedAuthKeys,
    })

    if (unmanagedConfigKeys.length > 0) {
      warnings.push({
        code: 'unmanaged-current-file',
        level: 'warning',
        message: `当前 Codex config.toml 存在非托管字段：${unmanagedConfigKeys.join(', ')}`,
      })
    }

    if (unmanagedAuthKeys.length > 0) {
      warnings.push({
        code: 'unmanaged-current-file',
        level: 'warning',
        message: `当前 Codex auth.json 存在非托管字段：${unmanagedAuthKeys.join(', ')}`,
      })
    }

    if (configDiff.hasChanges || authDiff.hasChanges) {
      warnings.push({
        code: 'multi-file-overwrite',
        level: 'warning',
        message: 'Codex 将修改多个目标文件。',
      })
    }

    const riskLevel = !validation.ok ? 'high' : warnings.length > 0 ? 'medium' : 'low'

    return {
      platform: this.platform,
      profileId: profile.id,
      targetFiles: await this.buildTargetFiles(),
      effectiveFields: Object.entries(allManaged).map(([key, value]) => ({
        key,
        value,
        maskedValue: maskRecord({ [key]: value })[key],
        source: 'profile',
      })),
      storedOnlyFields: Object.entries(profile.source)
        .filter(([key]) => !(key in allManaged))
        .map(([key, value]) => ({
          key,
          value,
          maskedValue: maskRecord({ [key]: value })[key],
          source: 'profile',
        })),
      storedConfig: [
        ...toConfigFieldViews(currentConfig, 'stored', { scope: 'config' }),
        ...toConfigFieldViews(currentAuth, 'stored', { scope: 'auth' }),
      ],
      effectiveConfig: buildEffectiveConfigView({
        stored: currentManaged,
        effective: nextManaged,
      }),
      managedBoundaries: this.buildManagedBoundaries(configPath, authPath, {
        config: unmanagedConfigKeys,
        auth: unmanagedAuthKeys,
      }),
      secretReferences: collectSecretReferences(nextManaged),
      preservedFields: [...unmanagedConfigKeys, ...unmanagedAuthKeys],
      retainedZones: [],
      diffSummary: [configDiff, authDiff],
      warnings,
      limitations,
      riskLevel,
      requiresConfirmation: riskLevel !== 'low',
      backupPlanned: configDiff.hasChanges || authDiff.hasChanges,
      noChanges: !configDiff.hasChanges && !authDiff.hasChanges,
    }
  }

  async detectCurrent(profiles: Profile[] = []): Promise<CurrentProfileResult | null> {
    const { configPath, authPath } = resolveCodexTargets()
    const currentConfig = parseCodexConfig(await readTextFile(configPath))
    const currentAuth = parseCodexAuth(await readTextFile(authPath))
    const currentManaged = { ...pickCodexConfigFields(currentConfig), ...pickCodexAuthFields(currentAuth) }

    const matchedProfile = profiles.find((profile) => {
      const configManaged = pickCodexConfigFields(profile.apply)
      const authManaged = pickCodexAuthFields(profile.apply)
      return (
        Object.entries(configManaged).every(([key, value]) => currentConfig[key] === value)
        && Object.entries(authManaged).every(([key, value]) => currentAuth[key] === value)
      )
    })

    return {
      platform: this.platform,
      matchedProfileId: matchedProfile?.id,
      managed: Boolean(matchedProfile),
      targetFiles: await this.listTargets(),
      details: {
        config: currentConfig,
        auth: currentAuth,
      },
      storedConfig: [
        ...toConfigFieldViews(currentConfig, 'stored', { scope: 'config' }),
        ...toConfigFieldViews(currentAuth, 'stored', { scope: 'auth' }),
      ],
      effectiveConfig: buildEffectiveConfigView({
        stored: currentManaged,
        effective: currentManaged,
      }),
      managedBoundaries: this.buildManagedBoundaries(configPath, authPath, {
        config: listPreservedKeys(currentConfig, CODEX_CONFIG_MANAGED_KEYS),
        auth: listPreservedKeys(currentAuth, CODEX_AUTH_MANAGED_KEYS),
      }),
      secretReferences: collectSecretReferences(currentManaged),
      warnings: [],
      limitations: getPlatformLimitationIssues(this.platform),
    }
  }

  async listTargets(): Promise<TargetFileInfo[]> {
    return this.buildTargetFiles()
  }

  async apply(profile: Profile, _context: ApplyContext): Promise<ApplyResult> {
    const { configPath, authPath } = resolveCodexTargets()
    const currentConfigContent = await readTextFile(configPath)
    const currentAuthContent = await readTextFile(authPath)
    const currentConfig = parseCodexConfig(currentConfigContent)
    const currentAuth = parseCodexAuth(currentAuthContent)
    const nextConfig = mergeCodexConfig(currentConfig, profile.apply)
    const nextAuth = mergeCodexAuth(currentAuth, profile.apply)
    const unmanagedConfigKeys = listPreservedKeys(currentConfig, CODEX_CONFIG_MANAGED_KEYS)
    const unmanagedAuthKeys = listPreservedKeys(currentAuth, CODEX_AUTH_MANAGED_KEYS)
    const configDiff = diffManagedFields(configPath, currentConfig, nextConfig, {
      managedKeys: [...CODEX_CONFIG_MANAGED_KEYS],
      preservedKeys: unmanagedConfigKeys,
    })
    const authDiff = diffManagedFields(authPath, currentAuth, nextAuth, {
      managedKeys: [...CODEX_AUTH_MANAGED_KEYS],
      preservedKeys: unmanagedAuthKeys,
    })
    const targetFiles = await this.listTargets()
    const limitations = getPlatformLimitationIssues(this.platform)

    if (!configDiff.hasChanges && !authDiff.hasChanges) {
      return {
        ok: true,
        changedFiles: [],
        noChanges: true,
        diffSummary: [configDiff, authDiff],
        targetFiles,
        storedConfig: [
          ...toConfigFieldViews(currentConfig, 'stored', { scope: 'config' }),
          ...toConfigFieldViews(currentAuth, 'stored', { scope: 'auth' }),
        ],
        effectiveConfig: buildEffectiveConfigView({
          stored: { ...pickCodexConfigFields(currentConfig), ...pickCodexAuthFields(currentAuth) },
          effective: { ...pickCodexConfigFields(currentConfig), ...pickCodexAuthFields(currentAuth) },
        }),
        managedBoundaries: this.buildManagedBoundaries(configPath, authPath, {
          config: unmanagedConfigKeys,
          auth: unmanagedAuthKeys,
        }),
        limitations,
      }
    }

    if (configDiff.hasChanges) {
      await atomicWrite(configPath, stringifyCodexConfig(nextConfig, currentConfigContent))
    }

    if (authDiff.hasChanges) {
      await atomicWrite(authPath, stringifyCodexAuth(nextAuth))
    }

    return {
      ok: true,
      changedFiles: [configPath, authPath].filter((filePath) => filePath === configPath ? configDiff.hasChanges : authDiff.hasChanges),
      noChanges: false,
      diffSummary: [configDiff, authDiff],
      targetFiles,
      storedConfig: [
        ...toConfigFieldViews(nextConfig, 'stored', { scope: 'config' }),
        ...toConfigFieldViews(nextAuth, 'stored', { scope: 'auth' }),
      ],
      effectiveConfig: buildEffectiveConfigView({
        stored: { ...pickCodexConfigFields(nextConfig), ...pickCodexAuthFields(nextAuth) },
        effective: { ...pickCodexConfigFields(nextConfig), ...pickCodexAuthFields(nextAuth) },
      }),
      managedBoundaries: this.buildManagedBoundaries(configPath, authPath, {
        config: unmanagedConfigKeys,
        auth: unmanagedAuthKeys,
      }),
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
        format: target.role === 'config' ? 'toml' : 'json',
        exists: true,
        managedScope: 'multi-file',
        role: target.role,
        scope: target.scope,
        managedKeys: target.managedKeys,
      })),
      managedBoundaries: record.manifest.managedBoundaries,
      warnings: toIssues(record.manifest.warnings, 'snapshot-warning', 'warning'),
      limitations: toIssues(record.manifest.limitations, 'snapshot-limitation', 'limitation'),
    }
  }
}
