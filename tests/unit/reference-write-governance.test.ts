import { describe, expect, it } from 'vitest'
import { EnvSecretReferenceResolver } from '../../src/domain/secret-reference-resolver'
import { planReferenceWrite } from '../../src/domain/reference-write-governance'
import type { Profile } from '../../src/types/profile'

function createReferenceProfile(platform: Profile['platform']): Profile {
  return {
    id: `${platform}-reference-profile`,
    name: `${platform}-reference-profile`,
    platform,
    source: {},
    apply: {},
  }
}

describe('reference write governance', () => {
  it('resolver 会把 env 引用稳定区分为 resolved / unresolved / unsupported-scheme', () => {
    const resolver = new EnvSecretReferenceResolver({
      API_SWITCHER_TEST_SECRET: 'sk-live-123456',
    })

    expect(resolver.resolve('env://API_SWITCHER_TEST_SECRET')).toEqual({
      reference: 'env://API_SWITCHER_TEST_SECRET',
      status: 'resolved',
      scheme: 'env',
      resolvedValue: 'sk-live-123456',
    })
    expect(resolver.resolve('env://API_SWITCHER_MISSING_SECRET')).toEqual({
      reference: 'env://API_SWITCHER_MISSING_SECRET',
      status: 'unresolved',
      scheme: 'env',
    })
    expect(resolver.resolve('vault://prod/openai')).toEqual({
      reference: 'vault://prod/openai',
      status: 'unsupported-scheme',
      scheme: 'vault',
    })
  })

  it('会按平台把 resolved reference 映射到 native 或 inline fallback 写入决策', () => {
    expect(planReferenceWrite({
      profile: createReferenceProfile('claude'),
      resolution: {
        reference: 'env://ANTHROPIC_AUTH_TOKEN',
        status: 'resolved',
        scheme: 'env',
      },
    })).toEqual(expect.objectContaining({
      decisionCode: 'native-reference-write',
      writeStrategy: 'native-reference-supported',
      requiresForce: false,
      blocking: false,
      reasonCodes: ['REFERENCE_NATIVE_WRITE_SUPPORTED'],
    }))

    expect(planReferenceWrite({
      profile: createReferenceProfile('codex'),
      resolution: {
        reference: 'env://OPENAI_API_KEY',
        status: 'resolved',
        scheme: 'env',
      },
    })).toEqual(expect.objectContaining({
      decisionCode: 'inline-fallback-write',
      writeStrategy: 'inline-fallback-only',
      requiresForce: true,
      blocking: false,
      reasonCodes: ['REFERENCE_INLINE_FALLBACK_REQUIRED'],
    }))
  })

  it('会把 unresolved 和 unsupported-scheme 收口成 reference-blocked', () => {
    expect(planReferenceWrite({
      profile: createReferenceProfile('claude'),
      resolution: {
        reference: 'env://ANTHROPIC_AUTH_TOKEN',
        status: 'unresolved',
        scheme: 'env',
      },
    })).toEqual(expect.objectContaining({
      decisionCode: 'reference-blocked',
      blocking: true,
      requiresForce: false,
      reasonCodes: ['REFERENCE_ENV_UNRESOLVED'],
    }))

    expect(planReferenceWrite({
      profile: createReferenceProfile('gemini'),
      resolution: {
        reference: 'vault://gemini/prod',
        status: 'unsupported-scheme',
        scheme: 'vault',
      },
    })).toEqual(expect.objectContaining({
      decisionCode: 'reference-blocked',
      blocking: true,
      requiresForce: false,
      reasonCodes: ['REFERENCE_SCHEME_UNSUPPORTED'],
    }))
  })
})
