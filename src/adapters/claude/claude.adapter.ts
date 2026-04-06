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
  OverrideExplanation,
  PreviewResult,
  RollbackContext,
  RollbackResult,
  TargetFileInfo,
  ValidationIssue,
  ValidationResult,
} from '../../types/adapter'
import type { Profile } from '../../types/profile'
import { atomicWrite } from '../../utils/atomic-write'
import { readTextFile, removeFile } from '../../utils/file-system'
import { SnapshotStore } from '../../stores/snapshot.store'
import { getPlatformLimitationIssues } from '../../services/profile.service'
import { BasePlatformAdapter } from '../base/platform-adapter'
import { CLAUDE_MANAGED_KEYS, mergeClaudeSettings, pickClaudeManagedFields } from './claude.mapper'
import { parseClaudeSettings, stringifyClaudeSettings } from './claude.parser'
import {
  type ClaudeScope,
  resolveClaudeScopeTargets,
  resolveClaudeSettingsPath,
  resolveClaudeTargetScope,
} from './claude.target-resolver'

function toIssues(messages: string[] | undefined, prefix: string, level: ValidationIssue['level']): ValidationIssue[] {
  return (messages ?? []).map((message, index) => ({
    code: `${prefix}-${index + 1}`,
    level,
    message,
  }))
}

type ClaudeScopeState = {
  scope: ClaudeScope
  path: string
  exists: boolean
  settings: Record<string, unknown>
  managedFields: Record<string, unknown>
  unmanagedKeys: string[]
}

const CLAUDE_SCOPE_LABELS: Record<ClaudeScope, string> = {
  user: '用户',
  project: '项目',
  local: '本地',
}

export class ClaudeAdapter extends BasePlatformAdapter {
  readonly platform = 'claude' as const

  constructor(private readonly snapshotStore = new SnapshotStore()) {
    super()
  }

  private async readScopeStates(): Promise<ClaudeScopeState[]> {
    const targets = resolveClaudeScopeTargets()

    return Promise.all(targets.map(async ({ scope, path }) => {
      const content = await readTextFile(path)
      const settings = parseClaudeSettings(content)
      const managedFields = pickClaudeManagedFields(settings)

      return {
        scope,
        path,
        exists: content !== null,
        settings,
        managedFields,
        unmanagedKeys: Object.keys(settings).filter((key) => !(key in managedFields)),
      }
    }))
  }

  private getScopeState(scopeStates: ClaudeScopeState[], scope: ClaudeScope): ClaudeScopeState {
    return scopeStates.find((item) => item.scope === scope) ?? {
      scope,
      path: resolveClaudeSettingsPath(scope),
      exists: false,
      settings: {},
      managedFields: {},
      unmanagedKeys: [],
    }
  }

  private buildTargetFiles(scopeStates: ClaudeScopeState[], options: { includeAllScopes?: boolean } = {}): TargetFileInfo[] {
    const targetScope = resolveClaudeTargetScope()
    const items = options.includeAllScopes ? scopeStates : [this.getScopeState(scopeStates, targetScope)]

    return items.map((item) => ({
      path: item.path,
      format: 'json',
      exists: item.exists,
      managedScope: 'partial-fields',
      scope: item.scope,
      role: 'settings',
      managedKeys: [...CLAUDE_MANAGED_KEYS],
      preservedKeys: item.unmanagedKeys.length > 0 ? item.unmanagedKeys : undefined,
    }))
  }

  private buildManagedBoundaries(
    scopeState: ClaudeScopeState,
    options: { noteKind?: 'write' | 'effective'; preservedKeys?: string[] } = {},
  ): ManagedBoundary[] {
    const noteKind = options.noteKind ?? 'write'
    const note = noteKind === 'effective'
      ? `当前生效配置来自 Claude ${CLAUDE_SCOPE_LABELS[scopeState.scope]}级配置文件。`
      : `当前写入目标为 Claude ${CLAUDE_SCOPE_LABELS[scopeState.scope]}级配置文件。`

    return [
      {
        target: scopeState.path,
        type: 'scope-aware',
        managedKeys: [...CLAUDE_MANAGED_KEYS],
        preservedKeys: options.preservedKeys ?? scopeState.unmanagedKeys,
        notes: [note],
      },
    ]
  }

  private computeEffectiveManagedFields(scopeStates: ClaudeScopeState[]): {
    effective: Record<string, unknown>
    sourceByKey: Record<string, ClaudeScope>
  } {
    const effective: Record<string, unknown> = {}
    const sourceByKey: Record<string, ClaudeScope> = {}

    for (const scopeState of scopeStates) {
      for (const [key, value] of Object.entries(scopeState.managedFields)) {
        effective[key] = value
        sourceByKey[key] = scopeState.scope
      }
    }

    return { effective, sourceByKey }
  }

  private resolveCurrentScope(sourceByKey: Record<string, ClaudeScope>): ClaudeScope | undefined {
    if (Object.values(sourceByKey).includes('local')) {
      return 'local'
    }

    if (Object.values(sourceByKey).includes('project')) {
      return 'project'
    }

    if (Object.values(sourceByKey).includes('user')) {
      return 'user'
    }

    return undefined
  }

  private buildOverrides(
    targetScope: ClaudeScope,
    targetManagedFields: Record<string, unknown>,
    sourceByKey: Record<string, ClaudeScope>,
  ): OverrideExplanation[] {
    return Object.keys(targetManagedFields)
      .filter((key) => sourceByKey[key] && sourceByKey[key] !== targetScope)
      .map((key) => {
        const effectiveScope = sourceByKey[key]

        return {
          key,
          kind: 'scope',
          source: `scope-${effectiveScope}`,
          message: `该字段会写入 Claude ${CLAUDE_SCOPE_LABELS[targetScope]}级配置，但最终仍由${CLAUDE_SCOPE_LABELS[effectiveScope]}级配置生效。`,
          shadowed: true,
          targetScope,
        }
      })
  }

  private buildEffectiveConfig(input: {
    stored: Record<string, unknown>
    storedScope: ClaudeScope
    effective: Record<string, unknown>
    sourceByKey: Record<string, ClaudeScope>
    overrides?: OverrideExplanation[]
    shadowedKeys?: string[]
  }): EffectiveConfigView {
    const shadowedKeys = new Set(input.shadowedKeys ?? [])

    return {
      stored: Object.entries(input.stored).map(([key, value]) => toConfigFieldView(key, value, 'stored', {
        scope: input.storedScope,
        shadowed: shadowedKeys.has(key),
      })),
      effective: Object.entries(input.effective).map(([key, value]) => {
        const scope = input.sourceByKey[key] ?? input.storedScope
        return toConfigFieldView(key, value, `scope-${scope}`, {
          scope,
          shadowed: shadowedKeys.has(key),
        })
      }),
      overrides: input.overrides ?? [],
      shadowedKeys: [...shadowedKeys],
    }
  }

  private buildShadowedWarnings(targetScope: ClaudeScope, shadowedKeys: string[]): ValidationIssue[] {
    if (shadowedKeys.length === 0) {
      return []
    }

    return [
      {
        code: 'shadowed-by-higher-scope',
        level: 'warning',
        message: `以下字段写入 Claude ${CLAUDE_SCOPE_LABELS[targetScope]}级后仍会被更高优先级作用域覆盖：${shadowedKeys.join(', ')}`,
        source: `scope-${targetScope}`,
      },
    ]
  }

  async validate(profile: Profile): Promise<ValidationResult> {
    const scopeStates = await this.readScopeStates()
    const targetScope = resolveClaudeTargetScope()
    const targetScopeState = this.getScopeState(scopeStates, targetScope)
    const issues: ValidationIssue[] = []
    const limitations = getPlatformLimitationIssues(this.platform)
    const token = profile.apply.ANTHROPIC_AUTH_TOKEN
    const baseUrl = profile.apply.ANTHROPIC_BASE_URL
    const managedFields = pickClaudeManagedFields(profile.apply)
    const nextScopeStates = scopeStates.map((item) => item.scope === targetScope
      ? {
          ...item,
          settings: mergeClaudeSettings(item.settings, profile.apply),
          managedFields,
        }
      : item)
    const { effective, sourceByKey } = this.computeEffectiveManagedFields(nextScopeStates)
    const overrides = this.buildOverrides(targetScope, managedFields, sourceByKey)
    const shadowedKeys = overrides.filter((item) => item.shadowed).map((item) => item.key)

    if (!token || typeof token !== 'string') {
      issues.push({
        code: 'missing-anthropic-auth-token',
        level: 'error',
        message: '缺少 ANTHROPIC_AUTH_TOKEN',
        field: 'ANTHROPIC_AUTH_TOKEN',
      })
    }

    if (baseUrl && typeof baseUrl === 'string' && !baseUrl.endsWith('/api')) {
      issues.push({
        code: 'url-path-warning',
        level: 'warning',
        message: 'ANTHROPIC_BASE_URL 可能缺少 /api 后缀。',
        field: 'ANTHROPIC_BASE_URL',
      })
    }

    issues.push(...this.buildShadowedWarnings(targetScope, shadowedKeys))

    return {
      ok: !issues.some((item) => item.level === 'error'),
      errors: issues.filter((item) => item.level === 'error'),
      warnings: issues.filter((item) => item.level === 'warning'),
      limitations,
      effectiveConfig: this.buildEffectiveConfig({
        stored: managedFields,
        storedScope: targetScope,
        effective,
        sourceByKey,
        overrides,
        shadowedKeys,
      }),
      managedBoundaries: this.buildManagedBoundaries(targetScopeState),
      secretReferences: collectSecretReferences(managedFields),
      preservedFields: targetScopeState.unmanagedKeys,
      retainedZones: [],
    }
  }

  async preview(profile: Profile): Promise<PreviewResult> {
    const scopeStates = await this.readScopeStates()
    const targetScope = resolveClaudeTargetScope()
    const targetScopeState = this.getScopeState(scopeStates, targetScope)
    const managedFields = pickClaudeManagedFields(profile.apply)
    const mergedSettings = mergeClaudeSettings(targetScopeState.settings, profile.apply)
    const nextScopeStates = scopeStates.map((item) => item.scope === targetScope
      ? {
          ...item,
          settings: mergedSettings,
          managedFields: pickClaudeManagedFields(mergedSettings),
          unmanagedKeys: Object.keys(mergedSettings).filter((key) => !(key in pickClaudeManagedFields(mergedSettings))),
        }
      : item)
    const validation = await this.validate(profile)
    const warnings = [...validation.warnings]
    const limitations = [...validation.limitations]
    const managedCurrent = targetScopeState.managedFields
    const targetFiles = this.buildTargetFiles(scopeStates)
    const diff = diffManagedFields(targetScopeState.path, targetScopeState.settings, mergedSettings, {
      managedKeys: [...CLAUDE_MANAGED_KEYS],
      preservedKeys: targetScopeState.unmanagedKeys,
    })
    const { effective, sourceByKey } = this.computeEffectiveManagedFields(nextScopeStates)
    const overrides = this.buildOverrides(targetScope, managedFields, sourceByKey)
    const shadowedKeys = overrides.filter((item) => item.shadowed).map((item) => item.key)

    if (targetScopeState.unmanagedKeys.length > 0) {
      warnings.push({
        code: 'unmanaged-current-file',
        level: 'warning',
        message: `当前 Claude 配置存在非托管字段：${targetScopeState.unmanagedKeys.join(', ')}`,
      })
    }

    const riskLevel = !validation.ok ? 'high' : warnings.length > 0 ? 'medium' : 'low'

    return {
      platform: this.platform,
      profileId: profile.id,
      targetFiles,
      effectiveFields: Object.entries(effective).map(([key, value]) => ({
        key,
        value,
        maskedValue: maskRecord({ [key]: value })[key],
        source: `scope-${sourceByKey[key] ?? targetScope}`,
        scope: sourceByKey[key] ?? targetScope,
        secret: key === 'ANTHROPIC_AUTH_TOKEN',
        shadowed: shadowedKeys.includes(key),
      })),
      storedOnlyFields: Object.entries(profile.source)
        .filter(([key]) => !(key in managedFields))
        .map(([key, value]) => ({
          key,
          value,
          maskedValue: maskRecord({ [key]: value })[key],
          source: 'profile',
        })),
      storedConfig: toConfigFieldViews(targetScopeState.settings, 'stored', { scope: targetScope }),
      effectiveConfig: this.buildEffectiveConfig({
        stored: managedCurrent,
        storedScope: targetScope,
        effective,
        sourceByKey,
        overrides,
        shadowedKeys,
      }),
      managedBoundaries: this.buildManagedBoundaries(targetScopeState, { preservedKeys: targetScopeState.unmanagedKeys }),
      secretReferences: collectSecretReferences(effective),
      preservedFields: targetScopeState.unmanagedKeys,
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
    const scopeStates = await this.readScopeStates()
    const { effective, sourceByKey } = this.computeEffectiveManagedFields(scopeStates)
    const currentScope = this.resolveCurrentScope(sourceByKey)
    const currentScopeState = currentScope ? this.getScopeState(scopeStates, currentScope) : undefined
    const managedBoundaries = currentScopeState
      ? this.buildManagedBoundaries(currentScopeState, { noteKind: 'effective' })
      : []

    const matchedProfile = profiles.find((profile) => {
      const managedFields = pickClaudeManagedFields(profile.apply)
      return Object.entries(managedFields).every(([key, value]) => effective[key] === value)
    })

    return {
      platform: this.platform,
      matchedProfileId: matchedProfile?.id,
      managed: Boolean(matchedProfile),
      targetFiles: await this.listTargets(),
      details: effective,
      currentScope,
      storedConfig: currentScopeState
        ? toConfigFieldViews(currentScopeState.settings, 'stored', { scope: currentScopeState.scope })
        : [],
      effectiveConfig: currentScope
        ? this.buildEffectiveConfig({
            stored: currentScopeState?.managedFields ?? {},
            storedScope: currentScope,
            effective,
            sourceByKey,
          })
        : undefined,
      managedBoundaries,
      secretReferences: collectSecretReferences(effective),
      warnings: [],
      limitations: getPlatformLimitationIssues(this.platform),
    }
  }

  async listTargets(): Promise<TargetFileInfo[]> {
    return this.buildTargetFiles(await this.readScopeStates(), { includeAllScopes: true })
  }

  async apply(profile: Profile, _context: ApplyContext): Promise<ApplyResult> {
    const scopeStates = await this.readScopeStates()
    const targetScope = resolveClaudeTargetScope()
    const targetScopeState = this.getScopeState(scopeStates, targetScope)
    const mergedSettings = mergeClaudeSettings(targetScopeState.settings, profile.apply)
    const mergedManagedFields = pickClaudeManagedFields(mergedSettings)
    const diff = diffManagedFields(targetScopeState.path, targetScopeState.settings, mergedSettings, {
      managedKeys: [...CLAUDE_MANAGED_KEYS],
      preservedKeys: targetScopeState.unmanagedKeys,
    })
    const limitations = getPlatformLimitationIssues(this.platform)
    const nextScopeStates = scopeStates.map((item) => item.scope === targetScope
      ? {
          ...item,
          settings: mergedSettings,
          managedFields: mergedManagedFields,
          unmanagedKeys: Object.keys(mergedSettings).filter((key) => !(key in mergedManagedFields)),
        }
      : item)
    const { effective, sourceByKey } = this.computeEffectiveManagedFields(nextScopeStates)
    const overrides = this.buildOverrides(targetScope, mergedManagedFields, sourceByKey)
    const shadowedKeys = overrides.filter((item) => item.shadowed).map((item) => item.key)
    const targetFiles = this.buildTargetFiles(scopeStates)

    if (!diff.hasChanges) {
      const currentEffective = this.computeEffectiveManagedFields(scopeStates)
      const currentOverrides = this.buildOverrides(targetScope, targetScopeState.managedFields, currentEffective.sourceByKey)
      const currentShadowedKeys = currentOverrides.filter((item) => item.shadowed).map((item) => item.key)

      return {
        ok: true,
        changedFiles: [],
        noChanges: true,
        diffSummary: [diff],
        targetFiles,
        storedConfig: toConfigFieldViews(targetScopeState.settings, 'stored', { scope: targetScope }),
        effectiveConfig: this.buildEffectiveConfig({
          stored: targetScopeState.managedFields,
          storedScope: targetScope,
          effective: currentEffective.effective,
          sourceByKey: currentEffective.sourceByKey,
          overrides: currentOverrides,
          shadowedKeys: currentShadowedKeys,
        }),
        managedBoundaries: this.buildManagedBoundaries(targetScopeState, { preservedKeys: targetScopeState.unmanagedKeys }),
        limitations,
      }
    }

    await atomicWrite(targetScopeState.path, stringifyClaudeSettings(mergedSettings))

    return {
      ok: true,
      changedFiles: [targetScopeState.path],
      noChanges: false,
      diffSummary: [diff],
      targetFiles,
      storedConfig: toConfigFieldViews(mergedSettings, 'stored', { scope: targetScope }),
      effectiveConfig: this.buildEffectiveConfig({
        stored: mergedManagedFields,
        storedScope: targetScope,
        effective,
        sourceByKey,
        overrides,
        shadowedKeys,
      }),
      managedBoundaries: this.buildManagedBoundaries(targetScopeState, { preservedKeys: targetScopeState.unmanagedKeys }),
      warnings: this.buildShadowedWarnings(targetScope, shadowedKeys),
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
        exists: true,
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
