import type {
  CurrentProfileResult,
  PreviewResult,
  RollbackResult,
  ValidationResult,
} from './adapter'
import type { HealthStatus, PlatformName, RiskLevel } from './platform'
import type { Profile } from './profile'
import type { LastSwitchRecord } from './state'
import type { SnapshotScopePolicy } from './snapshot'
import type { PlatformExplainableSummary, PlatformScopeCapability, ScopeAvailability } from './capabilities'

export const COMMAND_ACTIONS = [
  'add',
  'current',
  'export',
  'import',
  'import-apply',
  'list',
  'preview',
  'rollback',
  'schema',
  'use',
  'validate',
] as const

export interface CommandError {
  code: string
  message: string
  details?: unknown
}

export interface CommandResult<T = unknown> {
  schemaVersion?: string
  ok: boolean
  action: string
  data?: T
  warnings?: string[]
  limitations?: string[]
  error?: CommandError
}

export interface PreviewRiskSummary {
  allowed: boolean
  riskLevel: RiskLevel
  reasons: string[]
  limitations: string[]
}

export interface PreviewSummary {
  warnings: string[]
  limitations: string[]
}

export interface PreviewCommandOutput {
  profile: Profile
  validation: ValidationResult
  preview: PreviewResult
  risk: PreviewRiskSummary
  summary: PreviewSummary
  scopeCapabilities?: PlatformScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
}

export interface UseRiskSummary {
  allowed: boolean
  riskLevel: RiskLevel
  reasons: string[]
  limitations: string[]
}

export interface UseSummary {
  warnings: string[]
  limitations: string[]
}

export interface ConfirmationRequiredDetails {
  risk: UseRiskSummary
  scopePolicy?: SnapshotScopePolicy
  scopeCapabilities?: PlatformScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
}

export interface UseCommandOutput {
  profile: Profile
  backupId?: string
  validation?: ValidationResult
  preview: PreviewResult
  risk: UseRiskSummary
  summary: UseSummary
  changedFiles: string[]
  noChanges: boolean
  scopeCapabilities?: PlatformScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
}

export interface RollbackSummary {
  warnings: string[]
  limitations: string[]
}

export interface CurrentSummary {
  warnings: string[]
  limitations: string[]
}

export interface ListSummary {
  warnings: string[]
  limitations: string[]
}

export interface ExportSummary {
  warnings: string[]
  limitations: string[]
}

export interface SchemaCommandOutput {
  schemaVersion: string
  schemaId?: string
  schema?: Record<string, unknown>
}

export interface RollbackCommandOutput {
  backupId: string
  restoredFiles: string[]
  rollback?: RollbackResult
  scopePolicy?: SnapshotScopePolicy
  scopeCapabilities?: PlatformScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  summary: RollbackSummary
}

export interface RollbackErrorDetails {
  rollback?: RollbackResult
  scopePolicy?: SnapshotScopePolicy
  scopeCapabilities?: PlatformScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
}

export interface CurrentCommandOutput {
  current: Partial<Record<PlatformName, string>>
  lastSwitch?: LastSwitchRecord
  detections: CurrentProfileResult[]
  summary: CurrentSummary
}

export interface ValidateSummary {
  warnings: string[]
  limitations: string[]
}

export interface ValidateCommandItem {
  profileId: string
  platform: PlatformName
  validation: ValidationResult
  scopeCapabilities?: PlatformScopeCapability[]
}

export interface ValidateCommandOutput {
  items: ValidateCommandItem[]
  summary: ValidateSummary
}

export interface ExportedProfileItem {
  profile: Profile
  validation?: ValidationResult
  scopeCapabilities?: PlatformScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  defaultWriteScope?: string
  observedAt?: string
}

export interface ExportCommandOutput {
  profiles: ExportedProfileItem[]
  summary: ExportSummary
}

export interface ImportPreviewSummary {
  totalItems: number
  matchCount: number
  mismatchCount: number
  partialCount: number
  insufficientDataCount: number
  platformStats: ImportPreviewPlatformStat[]
  decisionCodeStats: ImportPreviewDecisionCodeStat[]
  driftKindStats: ImportPreviewDriftKindStat[]
  warnings: string[]
  limitations: string[]
}

export interface ImportPreviewPlatformStat {
  platform: PlatformName
  totalItems: number
  matchCount: number
  mismatchCount: number
  partialCount: number
  insufficientDataCount: number
}

export interface ImportPreviewDecisionCodeStat {
  code: ImportPreviewDecisionReasonCode
  totalCount: number
  blockingCount: number
  nonBlockingCount: number
}

export interface ImportPreviewDriftKindStat {
  driftKind: ImportFidelityMismatchGroup['driftKind']
  totalCount: number
  blockingCount: number
  warningCount: number
  infoCount: number
}

export interface ImportObservation {
  scopeCapabilities?: PlatformScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  defaultWriteScope?: string
  observedAt?: string
}

export interface ImportFidelityMismatch {
  field: 'defaultWriteScope' | 'scopeAvailability' | 'scopeCapabilities'
  driftKind: 'default-scope-drift' | 'availability-drift' | 'capability-drift'
  severity: 'blocking' | 'warning' | 'info'
  scope?: string
  exportedValue?: unknown
  localValue?: unknown
  message: string
  recommendedAction?: string
}

export interface ImportFidelityDriftSummary {
  blocking: number
  warning: number
  info: number
}

export interface ImportFidelityMismatchGroup {
  driftKind: 'default-scope-drift' | 'availability-drift' | 'capability-drift'
  totalCount: number
  blockingCount: number
  warningCount: number
  infoCount: number
  mismatches: ImportFidelityMismatch[]
}

export interface ImportFidelityReport {
  status: 'match' | 'mismatch' | 'partial' | 'insufficient-data'
  mismatches: ImportFidelityMismatch[]
  driftSummary: ImportFidelityDriftSummary
  groupedMismatches: ImportFidelityMismatchGroup[]
  highlights: string[]
}

export interface ImportPreviewDecision {
  canProceedToApplyDesign: boolean
  recommendedScope?: string
  requiresLocalResolution: boolean
  reasonCodes: ImportPreviewDecisionReasonCode[]
  reasons: ImportPreviewDecisionReason[]
}

export type ImportPreviewDecisionReasonCode =
  | 'READY_USING_LOCAL_OBSERVATION'
  | 'LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION'
  | 'BLOCKED_BY_INSUFFICIENT_OBSERVATION'
  | 'BLOCKED_BY_FIDELITY_MISMATCH'
  | 'REQUIRES_LOCAL_SCOPE_RESOLUTION'

export interface ImportPreviewDecisionReason {
  code: ImportPreviewDecisionReasonCode
  blocking: boolean
  message: string
}

export interface ImportPreviewItem {
  profile: Profile
  platform: PlatformName
  exportedObservation?: ImportObservation
  localObservation?: ImportObservation
  fidelity?: ImportFidelityReport
  previewDecision: ImportPreviewDecision
}

export interface ImportPreviewCommandOutput {
  sourceFile: string
  sourceCompatibility: ImportSourceCompatibility
  items: ImportPreviewItem[]
  summary: ImportPreviewSummary
}

export interface ImportSourceCompatibility {
  mode: 'strict' | 'schema-version-missing'
  schemaVersion?: string
  warnings: string[]
}

export interface ImportApplySourceDetails {
  sourceFile: string
  profileId?: string
}

export interface ImportApplyNotReadyDetails {
  sourceFile: string
  profileId: string
  previewDecision: ImportPreviewDecision
  fidelity?: ImportFidelityReport
  localObservation?: ImportObservation
  exportedObservation?: ImportObservation
}

export interface ImportApplySummary {
  warnings: string[]
  limitations: string[]
}

export interface ImportApplyRiskSummary {
  allowed: true
  riskLevel: RiskLevel
  reasons: string[]
  limitations: string[]
}

export interface ImportApplyCommandOutput {
  sourceFile: string
  importedProfile: Profile
  appliedScope?: string
  scopePolicy: SnapshotScopePolicy
  scopeCapabilities: PlatformScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  validation: ValidationResult
  preview: PreviewResult
  risk: ImportApplyRiskSummary
  backupId: string
  changedFiles: string[]
  noChanges: boolean
  summary: ImportApplySummary
}

export interface AddSummary {
  warnings: string[]
  limitations: string[]
}

export interface AddRiskSummary {
  allowed: boolean
  riskLevel: RiskLevel
  reasons: string[]
  limitations: string[]
}

export interface AddCommandOutput {
  profile: Profile
  validation: ValidationResult
  preview: PreviewResult
  risk: AddRiskSummary
  summary: AddSummary
  scopeCapabilities?: PlatformScopeCapability[]
}

export interface ListCommandItem {
  profile: Profile
  current: boolean
  healthStatus: HealthStatus
  riskLevel: RiskLevel
  platformSummary?: PlatformExplainableSummary
  scopeCapabilities?: PlatformScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
}

export interface ListCommandOutput {
  profiles: ListCommandItem[]
  summary: ListSummary
}

export interface AddProfileInput {
  platform: PlatformName
  name: string
  key: string
  url?: string
}
