import type { CommandResult } from '../types/command'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../constants/public-json-schema'
import { isSecretLikeKey, isSecretReferenceKey, maskValue } from '../domain/masking'

function shouldPreserveExportProfileValue(path: Array<string | number>, action?: string): boolean {
  return action === 'export'
    && path.length >= 4
    && path[0] === 'data'
    && path[1] === 'profiles'
    && typeof path[2] === 'number'
    && path[3] === 'profile'
}

function sanitizeJsonValue(value: unknown, path: Array<string | number> = [], action?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeJsonValue(item, [...path, index], action))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const record = value as Record<string, unknown>

  return Object.fromEntries(
    Object.entries(record).map(([key, entryValue]) => {
      const nextPath = [...path, key]

      if (
        key === 'value'
        && typeof record.maskedValue === 'string'
        && (record.secret === true || (typeof record.key === 'string' && isSecretLikeKey(record.key)))
      ) {
        return [key, record.maskedValue]
      }

      if (key === 'secret') {
        return [key, entryValue]
      }

      if (shouldPreserveExportProfileValue(path, action)) {
        return [key, sanitizeJsonValue(entryValue, nextPath, action)]
      }

      if (isSecretLikeKey(key) && !isSecretReferenceKey(key)) {
        if (Array.isArray(entryValue) || (entryValue && typeof entryValue === 'object')) {
          return [key, sanitizeJsonValue(entryValue, nextPath, action)]
        }

        if (typeof entryValue !== 'string') {
          return [key, entryValue]
        }

        return [key, maskValue(key, entryValue)]
      }

      return [key, sanitizeJsonValue(entryValue, nextPath, action)]
    }),
  )
}

export function renderJson(result: CommandResult): string {
  const sanitizedResult = sanitizeJsonValue(result, [], result.action) as Record<string, unknown>

  return JSON.stringify({
    schemaVersion: PUBLIC_JSON_SCHEMA_VERSION,
    ...sanitizedResult,
  }, null, 2)
}
