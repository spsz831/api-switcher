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
  platformStats?: SinglePlatformStat[]
  referenceStats?: SecretReferenceStats
  executabilityStats?: ExecutabilityStats
  warnings: string[]
  limitations: string[]
}

export interface PreviewCommandOutput {
  profile: Profile
  validation: ValidationResult
  preview: PreviewResult
  risk: PreviewRiskSummary
  summary: PreviewSummary
  scopePolicy?: SnapshotScopePolicy
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
  platformStats?: SinglePlatformStat[]
  referenceStats?: SecretReferenceStats
  executabilityStats?: ExecutabilityStats
  warnings: string[]
  limitations: string[]
}

export interface ConfirmationRequiredDetails {
  risk: UseRiskSummary
  scopePolicy?: SnapshotScopePolicy
  scopeCapabilities?: PlatformScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  referenceGovernance?: ReferenceGovernanceFailureDetails
}

export interface UseCommandOutput {
  profile: Profile
  backupId?: string
  platformSummary?: PlatformExplainableSummary
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
  platformStats?: SinglePlatformStat[]
  referenceStats?: SecretReferenceStats
  executabilityStats?: ExecutabilityStats
  warnings: string[]
  limitations: string[]
}

export interface SinglePlatformStat {
  platform: PlatformName
  profileCount: number
  profileId?: string
  targetScope?: string
  warningCount: number
  limitationCount: number
  changedFileCount?: number
  restoredFileCount?: number
  backupCreated?: boolean
  noChanges?: boolean
  platformSummary?: PlatformExplainableSummary
}

export interface SecretReferenceStats {
  profileCount: number
  referenceProfileCount: number
  resolvedReferenceProfileCount: number
  missingReferenceProfileCount: number
  unsupportedReferenceProfileCount: number
  inlineProfileCount: number
  writeUnsupportedProfileCount: number
  hasReferenceProfiles: boolean
  hasResolvedReferenceProfiles: boolean
  hasMissingReferenceProfiles: boolean
  hasUnsupportedReferenceProfiles: boolean
  hasInlineProfiles: boolean
  hasWriteUnsupportedProfiles: boolean
}

export interface ExecutabilityStats {
  profileCount: number
  inlineReadyProfileCount: number
  referenceReadyProfileCount: number
  referenceMissingProfileCount: number
  writeUnsupportedProfileCount: number
  sourceRedactedProfileCount: number
  hasInlineReadyProfiles: boolean
  hasReferenceReadyProfiles: boolean
  hasReferenceMissingProfiles: boolean
  hasWriteUnsupportedProfiles: boolean
  hasSourceRedactedProfiles: boolean
}

export interface ReadonlyTriageBucketStat {
  id: 'overview' | 'reference-governance' | 'write-readiness' | 'source-blocked' | 'platform-routing'
  title: string
  totalCount: number
  summaryFields: string[]
  itemFields?: string[]
  recommendedNextStep: 'inspect-items' | 'review-reference-details' | 'repair-source-input' | 'group-by-platform' | 'continue-to-write'
}

export interface ReadonlyTriageStats {
  totalItems: number
  buckets: ReadonlyTriageBucketStat[]
}

export type ReferenceGovernanceReasonCode =
  | 'REFERENCE_WRITE_UNSUPPORTED'
  | 'INLINE_SECRET_PRESENT'
  | 'REFERENCE_MISSING'
  | 'REFERENCE_INPUT_CONFLICT'

export type ReferenceGovernanceDetailCode =
  | 'REFERENCE_VALUE_MISSING'
  | 'REFERENCE_ENV_RESOLVED'
  | 'REFERENCE_ENV_UNRESOLVED'
  | 'REFERENCE_SCHEME_UNSUPPORTED'

export interface ReferenceGovernanceDetail {
  code: ReferenceGovernanceDetailCode
  field: string
  status: 'resolved' | 'missing' | 'unsupported-scheme'
  reference?: string
  scheme?: string
  message: string
}

export interface ReferenceGovernanceFailureDetails {
  hasReferenceProfiles: boolean
  hasInlineProfiles: boolean
  hasWriteUnsupportedProfiles: boolean
  primaryReason?: ReferenceGovernanceReasonCode
  reasonCodes: ReferenceGovernanceReasonCode[]
  referenceDetails?: ReferenceGovernanceDetail[]
}

export interface ReferenceSummary {
  hasReferenceFields: boolean
  hasInlineSecrets: boolean
  writeUnsupported: boolean
  resolvedReferenceCount: number
  missingReferenceCount: number
  unsupportedReferenceCount: number
  missingValueCount: number
  referenceDetails?: ReferenceGovernanceDetail[]
}

export interface CurrentListPlatformStat {
  platform: PlatformName
  profileCount: number
  currentProfileId?: string
  detectedProfileId?: string
  managed: boolean
  currentScope?: string
  referenceStats?: SecretReferenceStats
  platformSummary?: PlatformExplainableSummary
}

export interface CurrentSummary {
  platformStats?: CurrentListPlatformStat[]
  referenceStats?: SecretReferenceStats
  executabilityStats?: ExecutabilityStats
  triageStats?: ReadonlyTriageStats
  warnings: string[]
  limitations: string[]
}

export interface ListSummary {
  platformStats?: CurrentListPlatformStat[]
  referenceStats?: SecretReferenceStats
  executabilityStats?: ExecutabilityStats
  triageStats?: ReadonlyTriageStats
  warnings: string[]
  limitations: string[]
}

export interface ValidateExportPlatformStat {
  platform: PlatformName
  profileCount: number
  okCount: number
  warningCount: number
  limitationCount: number
  referenceStats?: SecretReferenceStats
  platformSummary?: PlatformExplainableSummary
}

export interface ExportSummary {
  platformStats?: ValidateExportPlatformStat[]
  referenceStats?: SecretReferenceStats
  executabilityStats?: ExecutabilityStats
  triageStats?: ReadonlyTriageStats
  secretExportPolicy?: SecretExportPolicySummary
  warnings: string[]
  limitations: string[]
}

export interface SecretExportPolicySummary {
  mode: 'redacted-by-default' | 'include-secrets'
  inlineSecretsExported: number
  inlineSecretsRedacted: number
  referenceSecretsPreserved: number
  profilesWithRedactedSecrets: number
}

export interface SecretExportItemDetail {
  field: string
  kind: 'inline-secret-redacted' | 'inline-secret-exported' | 'reference-preserved'
}

export interface SecretExportItemSummary {
  hasInlineSecrets: boolean
  hasRedactedInlineSecrets: boolean
  hasReferenceSecrets: boolean
  redactedFieldCount: number
  preservedReferenceCount: number
  details?: SecretExportItemDetail[]
}

export interface SchemaCommandOutput {
  schemaVersion: string
  schemaId?: string
  commandCatalog?: SchemaCommandCatalog
  catalogSummary?: SchemaCatalogSummary
  schema?: Record<string, unknown>
}

export interface SchemaConsumerProfile {
  id: 'single-platform-write' | 'readonly-import-batch' | 'readonly-state-audit'
  title: string
  appliesToActions: Array<'add' | 'preview' | 'use' | 'rollback' | 'current' | 'list' | 'validate' | 'export' | 'import' | 'import-apply'>
  exampleActions: Array<'add' | 'preview' | 'use' | 'rollback' | 'current' | 'list' | 'validate' | 'export' | 'import' | 'import-apply'>
  bestEntryAction: 'add' | 'preview' | 'use' | 'rollback' | 'current' | 'list' | 'validate' | 'export' | 'import' | 'import-apply'
  sharedSummaryFields: string[]
  sharedItemFields: string[]
  sharedFailureFields: string[]
  optionalScopeFields: string[]
  optionalItemFields: string[]
  optionalFailureFields: string[]
  optionalArtifactFields: string[]
  recommendedStages: Array<'summary' | 'selection' | 'items' | 'detail' | 'artifacts'>
  summarySectionGuidance?: SchemaConsumerProfileSummarySectionGuidance[]
  followUpHints?: SchemaConsumerProfileFollowUpHint[]
  triageBuckets?: SchemaConsumerProfileTriageBucket[]
  consumerActions?: SchemaConsumerProfileAction[]
  starterTemplate?: SchemaConsumerProfileStarterTemplate
  defaultConsumerFlowId?: SchemaConsumerProfileFlowStep['id']
  consumerFlow?: SchemaConsumerProfileFlowStep[]
}

export interface SchemaActionCapability {
  action: typeof COMMAND_ACTIONS[number]
  hasPlatformSummary: boolean
  hasPlatformStats: boolean
  hasScopeCapabilities: boolean
  hasScopeAvailability: boolean
  hasScopePolicy: boolean
  consumerProfileIds?: SchemaConsumerProfile['id'][]
  primaryFields: string[]
  primaryErrorFields: string[]
  failureCodes: SchemaActionFailureCode[]
  fieldPresence: SchemaActionFieldPresence[]
  fieldSources: SchemaActionFieldSource[]
  fieldStability: SchemaActionFieldStability[]
  readOrderGroups: SchemaReadOrderGroups
  summarySections?: SchemaSummarySection[]
  primaryFieldSemantics: SchemaFieldSemanticBinding[]
  primaryErrorFieldSemantics: SchemaFieldSemanticBinding[]
  referenceGovernanceCodes?: SchemaReferenceGovernanceCode[]
}

export interface SchemaCommandCatalog {
  actions: SchemaActionCapability[]
  consumerProfiles?: SchemaConsumerProfile[]
  recommendedActions?: SchemaRecommendedAction[]
}

export interface SchemaCatalogSummary {
  counts: {
    consumerProfiles: number
    actions: number
    recommendedActions: number
  }
  consumerProfiles: Array<{
    id: SchemaConsumerProfile['id']
    bestEntryAction: SchemaConsumerProfile['bestEntryAction']
    hasStarterTemplate?: boolean
    starterTemplateId?: NonNullable<SchemaConsumerProfile['starterTemplate']>['id']
    recommendedEntryMode?: 'starter-template' | 'full-consumer-profile'
  }>
  actions: Array<{
    action: SchemaActionCapability['action']
  }>
  recommendedActions: Array<{
    code: SchemaRecommendedAction['code']
    family: SchemaRecommendedAction['family']
  }>
}

export interface SchemaFieldSemanticBinding {
  path: string
  semantic: string
}

export interface SchemaSummarySection {
  id: 'platform' | 'reference' | 'executability' | 'source-executability'
  title: string
  priority: number
  fields: string[]
  purpose: string
  recommendedWhen?: string[]
}

export interface SchemaConsumerProfileSummarySectionGuidance {
  id: SchemaSummarySection['id']
  title: string
  priority: number
  fields: string[]
  purpose: string
  recommendedUses: Array<'overview' | 'governance' | 'gating' | 'routing'>
}

export interface SchemaConsumerProfileFollowUpHint {
  use: 'overview' | 'governance' | 'gating' | 'routing'
  nextStep: SchemaRecommendedActionCode
  primaryFields: string[]
  purpose: string
}

export interface SchemaConsumerProfileTriageBucket {
  id: 'overview' | 'reference-governance' | 'write-readiness' | 'source-blocked' | 'platform-routing'
  title: string
  summaryFields: string[]
  itemFields?: string[]
  purpose: string
  recommendedNextStep: SchemaConsumerProfileFollowUpHint['nextStep']
}

export interface SchemaConsumerProfileAction {
  id: string
  title: string
  priority: number
  use: SchemaConsumerProfileFollowUpHint['use']
  appliesWhen: string
  triggerFields: string[]
  summarySectionIds: SchemaSummarySection['id'][]
  triageBucketIds?: SchemaConsumerProfileTriageBucket['id'][]
  nextStep: SchemaConsumerProfileFollowUpHint['nextStep']
  primaryFields: string[]
  purpose: string
}

export interface SchemaConsumerProfileFlowStep {
  id: string
  title: string
  priority: number
  defaultEntry: boolean
  defaultOnBucket: boolean
  selectionReason: string
  summarySectionIds: SchemaSummarySection['id'][]
  triageBucketIds?: SchemaConsumerProfileTriageBucket['id'][]
  readFields: string[]
  consumerActionId: SchemaConsumerProfileAction['id']
  nextStep: SchemaConsumerProfileFollowUpHint['nextStep']
  purpose: string
}

export interface SchemaConsumerProfileStarterTemplateSection {
  fields: string[]
}

export interface SchemaConsumerProfileStarterTemplateItems {
  sharedFields: string[]
}

export interface SchemaConsumerProfileStarterTemplateFlow {
  defaultConsumerFlowId?: SchemaConsumerProfileFlowStep['id']
}

export interface SchemaConsumerProfileStarterTemplate {
  id: string
  summary: SchemaConsumerProfileStarterTemplateSection
  items: SchemaConsumerProfileStarterTemplateItems
  failure: SchemaConsumerProfileStarterTemplateSection
  flow: SchemaConsumerProfileStarterTemplateFlow
}

export interface SchemaActionFailureCode {
  code: string
  priority: number
  category: 'input' | 'state' | 'scope' | 'confirmation' | 'platform' | 'runtime' | 'source'
  recommendedHandling: SchemaRecommendedActionCode
  appliesWhen: string
  triggerFields: string[]
}

export interface SchemaReferenceGovernanceCode {
  code: ReferenceGovernanceReasonCode
  priority: number
  category: 'reference' | 'inline-secret' | 'input'
  recommendedHandling: SchemaRecommendedActionCode
  appliesWhen: string
  triggerFields: string[]
}

export type SchemaRecommendedActionCode =
  | 'inspect-items'
  | 'review-reference-details'
  | 'repair-source-input'
  | 'group-by-platform'
  | 'continue-to-write'
  | 'fix-input-and-retry'
  | 'select-existing-resource'
  | 'resolve-scope-before-retry'
  | 'confirm-before-write'
  | 'check-platform-support'
  | 'inspect-runtime-details'
  | 'check-import-source'
  | 'fix-reference-input'
  | 'resolve-reference-support'
  | 'migrate-inline-secret'

export interface SchemaRecommendedAction {
  code: SchemaRecommendedActionCode
  title: string
  family: 'inspect' | 'repair' | 'route' | 'execute'
  availability: Array<'readonly' | 'failure'>
  purpose: string
}

export interface SchemaReadOrderGroups {
  success: SchemaSuccessReadOrderGroup[]
  failure: SchemaFailureReadOrderGroup[]
}

export interface SchemaActionFieldPresence {
  path: string
  channel: 'success' | 'failure'
  presence: 'always' | 'conditional'
  conditionCode?: string
}

export interface SchemaActionFieldSource {
  path: string
  channel: 'success' | 'failure'
  source:
    | 'command-service'
    | 'platform-adapter'
    | 'schema-service'
    | 'write-pipeline'
    | 'import-analysis'
    | 'error-envelope'
}

export interface SchemaActionFieldStability {
  path: string
  channel: 'success' | 'failure'
  stabilityTier: 'stable' | 'bounded' | 'expandable'
}

export interface SchemaSuccessReadOrderGroup {
  stage: 'summary' | 'selection' | 'items' | 'detail' | 'artifacts'
  fields: string[]
  purpose?: string
}

export interface SchemaFailureReadOrderGroup {
  stage: 'error-core' | 'error-details' | 'error-recovery'
  fields: string[]
  purpose?: string
}

export interface RollbackCommandOutput {
  backupId: string
  restoredFiles: string[]
  platformSummary?: PlatformExplainableSummary
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
  platformStats?: ValidateExportPlatformStat[]
  referenceStats?: SecretReferenceStats
  executabilityStats?: ExecutabilityStats
  triageStats?: ReadonlyTriageStats
  warnings: string[]
  limitations: string[]
}

export interface ValidateCommandItem {
  profileId: string
  platform: PlatformName
  validation: ValidationResult
  platformSummary?: PlatformExplainableSummary
  scopeCapabilities?: PlatformScopeCapability[]
  referenceSummary?: ReferenceSummary
}

export interface ValidateCommandOutput {
  items: ValidateCommandItem[]
  summary: ValidateSummary
}

export interface ExportedProfileItem {
  profile: Profile
  validation?: ValidationResult
  platformSummary?: PlatformExplainableSummary
  scopeCapabilities?: PlatformScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  defaultWriteScope?: string
  observedAt?: string
  referenceSummary?: ReferenceSummary
  secretExportSummary?: SecretExportItemSummary
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
  sourceExecutability: ImportSourceExecutabilitySummary
  executabilityStats?: ExecutabilityStats
  triageStats?: ReadonlyTriageStats
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

export type ImportSourceExecutabilityCode =
  | 'REDACTED_INLINE_SECRET'

export interface ImportSourceExecutabilityCodeStat {
  code: ImportSourceExecutabilityCode
  totalCount: number
}

export interface ImportSourceExecutabilitySummary {
  totalItems: number
  applyReadyCount: number
  previewOnlyCount: number
  blockedCount: number
  blockedByCodeStats: ImportSourceExecutabilityCodeStat[]
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
  platformSummary?: PlatformExplainableSummary
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

export interface ImportApplyRedactedSecretDetails {
  sourceFile: string
  profileId: string
  redactedInlineSecretFields: string[]
}

export interface ImportApplyNotReadyDetails {
  sourceFile: string
  profileId: string
  previewDecision: ImportPreviewDecision
  fidelity?: ImportFidelityReport
  localObservation?: ImportObservation
  exportedObservation?: ImportObservation
}

export interface ValidationFailureDetails extends ValidationResult {
  referenceGovernance?: ReferenceGovernanceFailureDetails
}

export interface ImportApplySummary {
  platformStats?: SinglePlatformStat[]
  referenceStats?: SecretReferenceStats
  executabilityStats?: ExecutabilityStats
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
  dryRun?: boolean
  platformSummary?: PlatformExplainableSummary
  scopePolicy?: SnapshotScopePolicy
  scopeCapabilities: PlatformScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  validation: ValidationResult
  preview: PreviewResult
  risk: ImportApplyRiskSummary
  backupId?: string
  changedFiles: string[]
  noChanges: boolean
  summary: ImportApplySummary
}

export interface AddSummary {
  platformStats?: SinglePlatformStat[]
  referenceStats?: SecretReferenceStats
  executabilityStats?: ExecutabilityStats
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
  referenceSummary?: ReferenceSummary
}

export interface ListCommandOutput {
  profiles: ListCommandItem[]
  summary: ListSummary
}

export interface AddProfileInput {
  platform: PlatformName
  name: string
  key?: string
  secretRef?: string
  authReference?: string
  url?: string
}
