import type {
  CurrentProfileResult,
  ManagedBoundary,
  PreviewResult,
  RollbackResult,
  SecretReference,
  ValidationResult,
} from './adapter'
import type { HealthStatus, PlatformName, RiskLevel } from './platform'
import type { Profile } from './profile'
import type { LastSwitchRecord } from './state'

export interface CommandError {
  code: string
  message: string
  details?: unknown
}

export interface CommandResult<T = unknown> {
  ok: boolean
  action: string
  data?: T
  warnings?: string[]
  limitations?: string[]
  error?: CommandError
}

export interface PreviewCommandOutput {
  profile: Profile
  validation: ValidationResult
  preview: PreviewResult
}

export interface UseCommandOutput {
  profile: Profile
  backupId?: string
  validation?: ValidationResult
  preview: PreviewResult
  changedFiles: string[]
  noChanges: boolean
}

export interface RollbackCommandOutput {
  backupId: string
  restoredFiles: string[]
  rollback?: RollbackResult
}

export interface CurrentCommandOutput {
  current: Partial<Record<PlatformName, string>>
  lastSwitch?: LastSwitchRecord
  detections: CurrentProfileResult[]
}

export interface ValidateCommandItem {
  profileId: string
  platform: PlatformName
  validation: ValidationResult
  limitations?: string[]
}

export interface ValidateCommandOutput {
  items: ValidateCommandItem[]
}

export interface ExportedProfileItem {
  profile: Profile
  validation?: ValidationResult
  limitations?: string[]
  managedBoundaries?: ManagedBoundary[]
  secretReferences?: SecretReference[]
}

export interface ExportCommandOutput {
  profiles: ExportedProfileItem[]
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
  risk?: AddRiskSummary
}

export interface ListCommandItem {
  profile: Profile
  current: boolean
  healthStatus: HealthStatus
  riskLevel: RiskLevel
}

export interface ListCommandOutput {
  profiles: ListCommandItem[]
}

export interface AddProfileInput {
  platform: PlatformName
  name: string
  key: string
  url?: string
}
