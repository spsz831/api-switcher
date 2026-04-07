import type {
  CurrentProfileResult,
  PreviewResult,
  RollbackResult,
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

export interface PreviewRiskSummary {
  allowed: boolean
  riskLevel: RiskLevel
  reasons: string[]
  limitations: string[]
}

export interface PreviewCommandOutput {
  profile: Profile
  validation: ValidationResult
  preview: PreviewResult
  risk: PreviewRiskSummary
}

export interface UseRiskSummary {
  allowed: boolean
  riskLevel: RiskLevel
  reasons: string[]
  limitations: string[]
}

export interface UseCommandOutput {
  profile: Profile
  backupId?: string
  validation?: ValidationResult
  preview: PreviewResult
  risk: UseRiskSummary
  changedFiles: string[]
  noChanges: boolean
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

export interface RollbackCommandOutput {
  backupId: string
  restoredFiles: string[]
  rollback?: RollbackResult
  summary: RollbackSummary
}

export interface CurrentCommandOutput {
  current: Partial<Record<PlatformName, string>>
  lastSwitch?: LastSwitchRecord
  detections: CurrentProfileResult[]
  summary: CurrentSummary
}

export interface ValidateCommandItem {
  profileId: string
  platform: PlatformName
  validation: ValidationResult
}

export interface ValidateCommandOutput {
  items: ValidateCommandItem[]
}

export interface ExportedProfileItem {
  profile: Profile
  validation?: ValidationResult
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
  risk: AddRiskSummary
}

export interface ListCommandItem {
  profile: Profile
  current: boolean
  healthStatus: HealthStatus
  riskLevel: RiskLevel
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
