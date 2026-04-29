import { describe, expect, it } from 'vitest'
import { collectUniqueIssueMessages, maskRecord, maskSecret, mergeUniqueMessages } from '../../src/domain/masking'

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

  it('mergeUniqueMessages 会去重并忽略空字符串', () => {
    expect(mergeUniqueMessages(['a', 'b', 'a'], undefined, ['b', '', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('collectUniqueIssueMessages 会去重 issue message', () => {
    expect(collectUniqueIssueMessages([
      { code: 'w1', level: 'warning', message: 'same' },
      { code: 'w2', level: 'warning', message: 'same' },
      { code: 'w3', level: 'warning', message: 'other' },
    ])).toEqual(['same', 'other'])
  })
})
