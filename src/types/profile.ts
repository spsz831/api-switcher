import type { HealthStatus, PlatformName, RiskLevel } from './platform'

export interface ProfileMeta {
  tags?: string[]
  riskLevel?: RiskLevel
  healthStatus?: HealthStatus
  notes?: string
  createdAt?: string
  updatedAt?: string
  lastValidatedAt?: string
}

export interface Profile {
  id: string
  name: string
  platform: PlatformName
  source: Record<string, unknown>
  apply: Record<string, unknown>
  meta?: ProfileMeta
}

export interface ProfilesFile {
  version: number
  profiles: Profile[]
}

export type ProfileSelector = string
