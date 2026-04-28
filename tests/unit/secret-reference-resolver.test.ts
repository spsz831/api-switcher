import { describe, expect, it } from 'vitest'
import { buildReferenceGovernanceFailureDetails, buildSecretReferenceStats } from '../../src/domain/secret-inspection'
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

  it('reference governance 失败细节会区分 env 缺失、已解析和 unsupported scheme', () => {
    const resolver = new EnvSecretReferenceResolver({
      API_SWITCHER_TEST_SECRET: 'sk-live-123456',
    })
    const profile: Profile = {
      id: 'governance-details',
      name: 'governance-details',
      platform: 'claude',
      source: { secret_ref: 'env://API_SWITCHER_MISSING_SECRET' },
      apply: {
        auth_reference: 'env://API_SWITCHER_TEST_SECRET',
        secondary_auth_reference: 'vault://claude/prod',
      } as any,
    }

    expect(buildReferenceGovernanceFailureDetails(profile, {
      errors: [],
      warnings: [],
      limitations: [{
        code: 'SECRET_REFERENCE_WRITE_UNSUPPORTED',
        level: 'limitation',
        source: 'profile',
        message: '当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。',
      }],
    }, resolver)).toEqual({
      hasReferenceProfiles: true,
      hasInlineProfiles: false,
      hasWriteUnsupportedProfiles: true,
      primaryReason: 'REFERENCE_MISSING',
      reasonCodes: ['REFERENCE_MISSING'],
      referenceDetails: [
        {
          code: 'REFERENCE_ENV_UNRESOLVED',
          field: 'source.secret_ref',
          status: 'unresolved',
          reference: 'env://API_SWITCHER_MISSING_SECRET',
          scheme: 'env',
          message: 'profile.source.secret_ref 的 env 引用当前不可解析。',
        },
        {
          code: 'REFERENCE_ENV_RESOLVED',
          field: 'apply.auth_reference',
          status: 'resolved',
          reference: 'env://API_SWITCHER_TEST_SECRET',
          scheme: 'env',
          message: 'profile.apply.auth_reference 的 env 引用已解析，但当前写入链路仍不会直接消费引用。',
        },
        {
          code: 'REFERENCE_SCHEME_UNSUPPORTED',
          field: 'apply.secondary_auth_reference',
          status: 'unsupported-scheme',
          reference: 'vault://claude/prod',
          scheme: 'vault',
          message: 'profile.apply.secondary_auth_reference 使用的引用 scheme 当前不受支持。',
        },
      ],
    })
  })
})
