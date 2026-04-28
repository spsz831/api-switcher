import { describe, expect, it } from 'vitest'
import { materializeReferenceProfile } from '../../src/domain/materialize-reference-profile'
import { EnvSecretReferenceResolver } from '../../src/domain/secret-reference-resolver'
import type { Profile } from '../../src/types/profile'

function createProfile(platform: Profile['platform'], apply: Record<string, unknown>): Profile {
  return {
    id: `${platform}-ref`,
    name: `${platform}-ref`,
    platform,
    source: {},
    apply,
  }
}

describe('materialize reference profile', () => {
  const resolver = new EnvSecretReferenceResolver({
    API_SWITCHER_ANTHROPIC_TOKEN: 'sk-ant-live-123456',
    API_SWITCHER_OPENAI_KEY: 'sk-openai-live-123456',
    API_SWITCHER_GEMINI_KEY: 'gm-live-123456',
  })

  it('Claude 会把 auth_reference 物化到原生字段并保留 env 引用', () => {
    const profile = createProfile('claude', {
      auth_reference: 'env://API_SWITCHER_ANTHROPIC_TOKEN',
      ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
    })

    const result = materializeReferenceProfile(profile, resolver)

    expect(result.materialized).toBe(true)
    expect(result.profile.apply).toEqual(expect.objectContaining({
      auth_reference: 'env://API_SWITCHER_ANTHROPIC_TOKEN',
      ANTHROPIC_AUTH_TOKEN: 'env://API_SWITCHER_ANTHROPIC_TOKEN',
      ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
    }))
  })

  it('Codex 会把 resolved auth_reference 物化成 OPENAI_API_KEY 明文 fallback', () => {
    const profile = createProfile('codex', {
      auth_reference: 'env://API_SWITCHER_OPENAI_KEY',
      base_url: 'https://gateway.example.com/openai/v1',
    })

    const result = materializeReferenceProfile(profile, resolver)

    expect(result.materialized).toBe(true)
    expect(result.profile.apply).toEqual(expect.objectContaining({
      auth_reference: 'env://API_SWITCHER_OPENAI_KEY',
      OPENAI_API_KEY: 'sk-openai-live-123456',
      base_url: 'https://gateway.example.com/openai/v1',
    }))
  })

  it('Gemini 会把 resolved auth_reference 物化成 GEMINI_API_KEY 明文 fallback', () => {
    const profile = createProfile('gemini', {
      auth_reference: 'env://API_SWITCHER_GEMINI_KEY',
      enforcedAuthType: 'gemini-api-key',
    })

    const result = materializeReferenceProfile(profile, resolver)

    expect(result.materialized).toBe(true)
    expect(result.profile.apply).toEqual(expect.objectContaining({
      auth_reference: 'env://API_SWITCHER_GEMINI_KEY',
      GEMINI_API_KEY: 'gm-live-123456',
      enforcedAuthType: 'gemini-api-key',
    }))
  })

  it('未解析或无引用时保持原 profile 不变', () => {
    const unresolved = createProfile('codex', {
      auth_reference: 'env://API_SWITCHER_MISSING_KEY',
    })
    const inline = createProfile('claude', {
      ANTHROPIC_AUTH_TOKEN: 'sk-inline-123456',
    })

    expect(materializeReferenceProfile(unresolved, resolver)).toEqual({
      profile: unresolved,
      materialized: false,
    })
    expect(materializeReferenceProfile(inline, resolver)).toEqual({
      profile: inline,
      materialized: false,
    })
  })
})
