import { describe, expect, it } from 'vitest'
import { buildSecretReferenceStats } from '../../src/domain/secret-inspection'
import { EnvSecretReferenceResolver } from '../../src/domain/secret-reference-resolver'
import type { Profile } from '../../src/types/profile'

describe('secret reference resolver', () => {
  it('用 env:// 引用做只读解析状态聚合，不暴露 secret 值', () => {
    const resolver = new EnvSecretReferenceResolver({
      API_SWITCHER_TEST_SECRET: 'sk-live-123456',
    })
    const profiles: Profile[] = [
      {
        id: 'resolved',
        name: 'resolved',
        platform: 'codex',
        source: { secret_ref: 'env://API_SWITCHER_TEST_SECRET' },
        apply: { auth_reference: 'env://API_SWITCHER_TEST_SECRET' },
      },
      {
        id: 'missing',
        name: 'missing',
        platform: 'claude',
        source: { secret_ref: 'env://API_SWITCHER_MISSING_SECRET' },
        apply: { auth_reference: 'env://API_SWITCHER_MISSING_SECRET' },
      },
      {
        id: 'unsupported',
        name: 'unsupported',
        platform: 'gemini',
        source: { secret_ref: 'vault://gemini/prod' },
        apply: { auth_reference: 'vault://gemini/prod' },
      },
    ]

    expect(buildSecretReferenceStats(profiles, resolver)).toEqual({
      profileCount: 3,
      referenceProfileCount: 3,
      resolvedReferenceProfileCount: 1,
      missingReferenceProfileCount: 1,
      unsupportedReferenceProfileCount: 1,
      inlineProfileCount: 0,
      writeUnsupportedProfileCount: 3,
      hasReferenceProfiles: true,
      hasResolvedReferenceProfiles: true,
      hasMissingReferenceProfiles: true,
      hasUnsupportedReferenceProfiles: true,
      hasInlineProfiles: false,
      hasWriteUnsupportedProfiles: true,
    })
  })
})
