import type { PreviewResult, ValidationResult } from '../types/adapter'
import type { RiskLevel } from '../types/platform'

export interface RiskDecisionInput {
  force?: boolean
}

export interface RiskDecision {
  allowed: boolean
  riskLevel: RiskLevel
  reasons: string[]
  limitations: string[]
}

export function evaluateRisk(preview: PreviewResult, validation: ValidationResult, input: RiskDecisionInput = {}): RiskDecision {
  const reasons = [
    ...validation.errors.map((item) => item.message),
    ...validation.warnings.map((item) => item.message),
    ...preview.warnings.map((item) => item.message),
  ]
  const limitations = [
    ...validation.limitations.map((item) => item.message),
    ...preview.limitations.map((item) => item.message),
  ]

  if (!validation.ok) {
    return {
      allowed: false,
      riskLevel: 'high',
      reasons,
      limitations,
    }
  }

  if (preview.riskLevel === 'high' && !input.force) {
    return {
      allowed: false,
      riskLevel: 'high',
      reasons,
      limitations,
    }
  }

  if (preview.requiresConfirmation && !input.force) {
    return {
      allowed: false,
      riskLevel: preview.riskLevel,
      reasons,
      limitations,
    }
  }

  return {
    allowed: true,
    riskLevel: preview.riskLevel,
    reasons,
    limitations,
  }
}
