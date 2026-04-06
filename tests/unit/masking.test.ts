import { describe, expect, it } from 'vitest'
import { maskRecord, maskSecret } from '../../src/domain/masking'

describe('masking', () => {
  it('会脱敏长字符串', () => {
    expect(maskSecret('sk-live-123456')).toBe('sk-l***56')
  })

  it('会按 key 名脱敏 record', () => {
    expect(maskRecord({ apiKey: 'abcdef123456', baseURL: 'https://example.com' })).toEqual({
      apiKey: 'abcd***56',
      baseURL: 'https://example.com',
    })
  })
})
