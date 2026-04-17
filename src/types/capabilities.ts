export interface PlatformScopeExplainable {
  current: {
    detectionScopes: string[]
    precedence: string[]
    writeLabel: string
    writePolicy: string
  }
  preview: {
    precedence: string[]
    perspective: string
    relationships: Record<string, string>
    reminders: Record<string, string>
    defaultRelationship: string
    defaultReminder: string
  }
}

export type PlatformScopeRisk = 'normal' | 'high'
export type ScopeAvailabilityStatus = 'available' | 'unresolved' | 'blocked'

export interface ScopeAvailability {
  scope: string
  status: ScopeAvailabilityStatus
  detected: boolean
  writable: boolean
  path?: string
  reasonCode?: string
  reason?: string
  remediation?: string
}

export interface PlatformScopeCapability {
  scope: string
  detect: boolean
  preview: boolean
  use: boolean
  rollback: boolean
  writable: boolean
  risk?: PlatformScopeRisk
  confirmationRequired?: boolean
  note?: string
}

export interface PlatformScopePolicy {
  scopeCapabilities: PlatformScopeCapability[]
  writeScopes?: string[]
  defaultScope: string
  envDefaultScopeVar?: string
  invalidScopeMessage: string
  highRiskScopes?: string[]
  writeWarnings?: Record<string, string>
  rollbackRequiresScopeMatch?: boolean
}

export interface PlatformCapabilities {
  supportsMultiFileWrite: boolean
  supportsRollback: boolean
  supportsCurrentDetection: boolean
  supportsPartialMerge: boolean
  scopeExplainable?: PlatformScopeExplainable
  scopePolicy?: PlatformScopePolicy
}
