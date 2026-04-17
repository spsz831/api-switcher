import publicJsonSchema from '../../docs/public-json-output.schema.json'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../constants/public-json-schema'
import type { CommandResult, SchemaCommandOutput } from '../types/command'

export class SchemaService {
  getPublicJsonSchemaVersion(): CommandResult<SchemaCommandOutput> {
    return {
      ok: true,
      action: 'schema',
      data: {
        schemaVersion: PUBLIC_JSON_SCHEMA_VERSION,
      },
    }
  }

  getPublicJsonSchema(): CommandResult<SchemaCommandOutput> {
    return {
      ok: true,
      action: 'schema',
      data: {
        schemaVersion: PUBLIC_JSON_SCHEMA_VERSION,
        schemaId: publicJsonSchema.$id,
        schema: publicJsonSchema,
      },
    }
  }
}
