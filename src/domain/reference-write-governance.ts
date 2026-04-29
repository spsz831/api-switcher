import type { SecretReferenceResolution } from './secret-reference-resolver'
import type { Profile } from '../types/profile'

export type ReferenceWriteStrategy =
  | 'native-reference-supported'
  | 'inline-fallback-only'
  | 'blocked'

export type ReferenceWriteDecisionCode =
  | 'native-reference-write'
  | 'inline-fallback-write'
  | 'reference-blocked'

export type ReferenceWriteReasonCode =
  | 'REFERENCE_NATIVE_WRITE_SUPPORTED'
  | 'REFERENCE_INLINE_FALLBACK_REQUIRED'
  | 'REFERENCE_ENV_UNRESOLVED'
  | 'REFERENCE_SCHEME_UNSUPPORTED'

export interface ReferenceWritePlan {
  decisionCode: ReferenceWriteDecisionCode
  writeStrategy: ReferenceWriteStrategy
  requiresForce: boolean
  blocking: boolean
  reasonCodes: ReferenceWriteReasonCode[]
}

function resolvePlatformWriteStrategy(platform: Profile['platform']): Exclude<ReferenceWriteStrategy, 'blocked'> {
  switch (platform) {
    case 'claude':
      return 'native-reference-supported'
    case 'codex':
    case 'gemini':
      return 'inline-fallback-only'
    default:
      return 'inline-fallback-only'
  }
}

export function planReferenceWrite(input: {
  profile: Profile
  resolution: SecretReferenceResolution
}): ReferenceWritePlan {
  if (input.resolution.status === 'resolved') {
    const writeStrategy = resolvePlatformWriteStrategy(input.profile.platform)
    if (writeStrategy === 'native-reference-supported') {
      return {
        decisionCode: 'native-reference-write',
        writeStrategy,
        requiresForce: false,
        blocking: false,
        reasonCodes: ['REFERENCE_NATIVE_WRITE_SUPPORTED'],
      }
    }

    return {
      decisionCode: 'inline-fallback-write',
      writeStrategy,
      requiresForce: true,
      blocking: false,
      reasonCodes: ['REFERENCE_INLINE_FALLBACK_REQUIRED'],
    }
  }

  if (input.resolution.status === 'unresolved') {
    return {
      decisionCode: 'reference-blocked',
      writeStrategy: 'blocked',
      requiresForce: false,
      blocking: true,
      reasonCodes: ['REFERENCE_ENV_UNRESOLVED'],
    }
  }

  return {
    decisionCode: 'reference-blocked',
    writeStrategy: 'blocked',
    requiresForce: false,
    blocking: true,
    reasonCodes: ['REFERENCE_SCHEME_UNSUPPORTED'],
  }
}
