import publicJsonSchema from '../../docs/public-json-output.schema.json'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../constants/public-json-schema'
import { COMMAND_ACTIONS, type CommandResult, type SchemaActionCapability, type SchemaCommandOutput } from '../types/command'

const SCHEMA_ACTION_CAPABILITIES: SchemaActionCapability[] = COMMAND_ACTIONS.map((action) => ({
  action,
  hasPlatformSummary: ['current', 'list', 'validate', 'export', 'use', 'rollback', 'import', 'import-apply'].includes(action),
  hasPlatformStats: ['add', 'current', 'list', 'validate', 'export', 'preview', 'use', 'rollback', 'import', 'import-apply'].includes(action),
  hasScopeCapabilities: ['add', 'current', 'list', 'preview', 'use', 'rollback', 'import', 'import-apply'].includes(action),
  hasScopeAvailability: ['current', 'preview', 'use', 'rollback', 'import', 'import-apply'].includes(action),
  hasScopePolicy: ['preview', 'use', 'rollback', 'import-apply'].includes(action),
}))

function buildCommandCatalog() {
  return {
    actions: SCHEMA_ACTION_CAPABILITIES,
  }
}

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
        commandCatalog: buildCommandCatalog(),
        schema: publicJsonSchema,
      },
    }
  }
}
