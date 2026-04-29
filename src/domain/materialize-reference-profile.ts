import type { Profile } from '../types/profile'
import type { SecretReferenceResolver } from './secret-reference-resolver'

type MaterializeResult = {
  profile: Profile
  materialized: boolean
}

function cloneProfile(profile: Profile, apply: Record<string, unknown>): Profile {
  return {
    ...profile,
    apply,
  }
}

function materializeClaude(profile: Profile, resolver: SecretReferenceResolver): MaterializeResult {
  const reference = typeof profile.apply.auth_reference === 'string' ? profile.apply.auth_reference.trim() : undefined
  if (!reference) {
    return { profile, materialized: false }
  }

  const resolution = resolver.resolve(reference)
  if (resolution.status !== 'resolved') {
    return { profile, materialized: false }
  }

  const apply = {
    ...profile.apply,
    ANTHROPIC_AUTH_TOKEN: reference,
  }

  return {
    profile: cloneProfile(profile, apply),
    materialized: true,
  }
}

function materializeCodex(profile: Profile, resolver: SecretReferenceResolver): MaterializeResult {
  const reference = typeof profile.apply.auth_reference === 'string' ? profile.apply.auth_reference.trim() : undefined
  if (!reference) {
    return { profile, materialized: false }
  }

  const resolution = resolver.resolve(reference)
  if (resolution.status !== 'resolved' || !resolution.resolvedValue) {
    return { profile, materialized: false }
  }

  const apply = {
    ...profile.apply,
    OPENAI_API_KEY: resolution.resolvedValue,
  }

  return {
    profile: cloneProfile(profile, apply),
    materialized: true,
  }
}

function materializeGemini(profile: Profile, resolver: SecretReferenceResolver): MaterializeResult {
  const reference = typeof profile.apply.auth_reference === 'string' ? profile.apply.auth_reference.trim() : undefined
  if (!reference) {
    return { profile, materialized: false }
  }

  const resolution = resolver.resolve(reference)
  if (resolution.status !== 'resolved' || !resolution.resolvedValue) {
    return { profile, materialized: false }
  }

  const apply = {
    ...profile.apply,
    GEMINI_API_KEY: resolution.resolvedValue,
  }

  return {
    profile: cloneProfile(profile, apply),
    materialized: true,
  }
}

export function materializeReferenceProfile(profile: Profile, resolver: SecretReferenceResolver): MaterializeResult {
  switch (profile.platform) {
    case 'claude':
      return materializeClaude(profile, resolver)
    case 'codex':
      return materializeCodex(profile, resolver)
    case 'gemini':
      return materializeGemini(profile, resolver)
    default:
      return { profile, materialized: false }
  }
}
