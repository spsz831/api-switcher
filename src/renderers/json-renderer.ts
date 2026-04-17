import type { CommandResult } from '../types/command'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../constants/public-json-schema'

export function renderJson(result: CommandResult): string {
  return JSON.stringify({
    schemaVersion: PUBLIC_JSON_SCHEMA_VERSION,
    ...result,
  }, null, 2)
}
