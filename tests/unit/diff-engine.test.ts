import { describe, expect, it } from 'vitest'
import { diffManagedFields } from '../../src/domain/diff-engine'

describe('diff engine', () => {
  it('能识别变更字段', () => {
    const diff = diffManagedFields('/tmp/settings.json', { a: 1, b: 2 }, { a: 1, b: 3, c: 4 })
    expect(diff.hasChanges).toBe(true)
    expect(diff.changedKeys).toEqual(['b', 'c'])
  })
})
