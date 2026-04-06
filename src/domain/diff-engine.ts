import type { DiffSummary } from '../types/adapter'

export interface DiffManagedFieldsOptions {
  managedKeys?: string[]
  preservedKeys?: string[]
  retainedZones?: string[]
}

export function diffManagedFields(
  filePath: string,
  current: Record<string, unknown>,
  next: Record<string, unknown>,
  options: DiffManagedFieldsOptions = {},
): DiffSummary {
  const comparedKeys = options.managedKeys && options.managedKeys.length > 0
    ? options.managedKeys
    : [...new Set([...Object.keys(current), ...Object.keys(next)])]

  const changedKeys = comparedKeys.filter((key) => JSON.stringify(current[key]) !== JSON.stringify(next[key]))

  return {
    path: filePath,
    changedKeys,
    hasChanges: changedKeys.length > 0,
    managedKeys: options.managedKeys,
    preservedKeys: options.preservedKeys,
    retainedZones: options.retainedZones,
  }
}

export function changedFilePaths(diffSummary: DiffSummary[]): string[] {
  return diffSummary.filter((item) => item.hasChanges).map((item) => item.path)
}
