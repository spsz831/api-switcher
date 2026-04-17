import type { PlatformCapabilities, PlatformScopeCapability, ScopeAvailability } from './capabilities'
import type { PlatformName, RiskLevel } from './platform'
import type { Profile } from './profile'

export type IssueLevel = 'error' | 'warning' | 'limitation'
export type ManagedScope = 'full-file' | 'partial-fields' | 'multi-file'
export type EffectiveSource =
  | 'profile'
  | 'stored'
  | 'effective'
  | 'scope-user'
  | 'scope-project'
  | 'scope-local'
  | 'env'
  | 'cli-arg'
  | 'managed-policy'
  | 'secret_ref'
  | 'auth_reference'
  | 'unknown-runtime'
export type OverrideKind = 'scope' | 'env' | 'cli-arg' | 'managed-policy' | 'unknown-runtime'

export interface ValidationIssue {
  code: string
  level: IssueLevel
  message: string
  field?: string
  source?: EffectiveSource | string
}

export interface ConfigFieldView {
  key: string
  value: unknown
  maskedValue: string
  source: EffectiveSource | string
  scope?: string
  secret?: boolean
  shadowed?: boolean
}

export interface SecretReference {
  key: string
  source: 'inline' | 'secret_ref' | 'auth_reference' | 'env' | 'unknown'
  reference?: string
  present: boolean
  maskedValue: string
}

export interface OverrideExplanation {
  key: string
  kind: OverrideKind
  source: EffectiveSource | string
  message: string
  shadowed?: boolean
  targetScope?: string
}

export interface ManagedBoundary {
  target?: string
  type: 'managed-fields' | 'retained-zone' | 'multi-file-transaction' | 'scope-aware'
  managedKeys: string[]
  preservedKeys?: string[]
  preservedZones?: string[]
  notes?: string[]
}

export interface EffectiveConfigView {
  stored: ConfigFieldView[]
  effective: ConfigFieldView[]
  overrides: OverrideExplanation[]
  shadowedKeys?: string[]
}

export interface ValidationResult {
  ok: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  limitations: ValidationIssue[]
  normalizedSuggestions?: string[]
  effectiveConfig?: EffectiveConfigView
  managedBoundaries?: ManagedBoundary[]
  secretReferences?: SecretReference[]
  preservedFields?: string[]
  retainedZones?: string[]
}

export interface TargetFileInfo {
  path: string
  format: 'json' | 'toml' | 'env' | 'unknown'
  exists: boolean
  managedScope: ManagedScope
  scope?: string
  role?: string
  managedKeys?: string[]
  preservedKeys?: string[]
  retainedZones?: string[]
}

export interface EffectiveField extends ConfigFieldView {}

export interface StoredOnlyField extends ConfigFieldView {}

export interface DiffSummary {
  path: string
  changedKeys: string[]
  hasChanges: boolean
  managedKeys?: string[]
  preservedKeys?: string[]
  retainedZones?: string[]
}

export interface PreviewResult {
  platform: PlatformName
  profileId: string
  targetFiles: TargetFileInfo[]
  effectiveFields: EffectiveField[]
  storedOnlyFields: StoredOnlyField[]
  storedConfig?: ConfigFieldView[]
  effectiveConfig?: EffectiveConfigView
  managedBoundaries?: ManagedBoundary[]
  secretReferences?: SecretReference[]
  preservedFields?: string[]
  retainedZones?: string[]
  diffSummary: DiffSummary[]
  warnings: ValidationIssue[]
  limitations: ValidationIssue[]
  riskLevel: RiskLevel
  requiresConfirmation: boolean
  backupPlanned: boolean
  noChanges?: boolean
}

export interface CurrentProfileResult {
  platform: PlatformName
  matchedProfileId?: string
  managed: boolean
  targetFiles: TargetFileInfo[]
  details?: Record<string, unknown>
  currentScope?: string
  scopeCapabilities?: PlatformScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  storedConfig?: ConfigFieldView[]
  effectiveConfig?: EffectiveConfigView
  managedBoundaries?: ManagedBoundary[]
  secretReferences?: SecretReference[]
  warnings?: ValidationIssue[]
  limitations?: ValidationIssue[]
}

export interface BackupContext {
  reason?: string
  targetScope?: string
}

export interface BackupResult {
  ok: boolean
  backupId: string
  targetFiles: string[]
}

export interface ApplyContext {
  backupId: string
  targetScope?: string
}

export interface ApplyResult {
  ok: boolean
  changedFiles: string[]
  noChanges: boolean
  diffSummary: DiffSummary[]
  targetFiles?: TargetFileInfo[]
  storedConfig?: ConfigFieldView[]
  effectiveConfig?: EffectiveConfigView
  managedBoundaries?: ManagedBoundary[]
  warnings?: ValidationIssue[]
  limitations?: ValidationIssue[]
}

export interface RollbackContext {
  backupId?: string
  targetScope?: string
}

export interface PreviewContext {
  targetScope?: string
}

export interface RollbackResult {
  ok: boolean
  backupId: string
  restoredFiles: string[]
  targetFiles?: TargetFileInfo[]
  effectiveConfig?: EffectiveConfigView
  managedBoundaries?: ManagedBoundary[]
  warnings?: ValidationIssue[]
  limitations?: ValidationIssue[]
}

export interface PlatformAdapter {
  readonly platform: PlatformName
  readonly capabilities: PlatformCapabilities
  validate(profile: Profile): Promise<ValidationResult>
  preview(profile: Profile, context?: PreviewContext): Promise<PreviewResult>
  detectCurrent(profiles?: Profile[]): Promise<CurrentProfileResult | null>
  listTargets(context?: PreviewContext): Promise<TargetFileInfo[]>
  backup(context?: BackupContext): Promise<BackupResult>
  apply(profile: Profile, context: ApplyContext): Promise<ApplyResult>
  rollback(snapshotId: string, context?: RollbackContext): Promise<RollbackResult>
}
