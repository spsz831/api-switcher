import type { CommandResult } from '../types/command'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../constants/public-json-schema'
import { isSecretLikeKey, maskValue } from '../domain/masking'

function sanitizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const record = value as Record<string, unknown>

  return Object.fromEntries(
    Object.entries(record).map(([key, entryValue]) => {
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

      if (isSecretLikeKey(key)) {
        if (Array.isArray(entryValue) || (entryValue && typeof entryValue === 'object')) {
          return [key, sanitizeJsonValue(entryValue)]
        }

        return [key, maskValue(key, entryValue)]
      }

      return [key, sanitizeJsonValue(entryValue)]
    }),
  )
}

export function renderJson(result: CommandResult): string {
  const sanitizedResult = sanitizeJsonValue(result) as Record<string, unknown>

  return JSON.stringify({
    schemaVersion: PUBLIC_JSON_SCHEMA_VERSION,
    ...sanitizedResult,
  }, null, 2)
}
