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
  primaryFields: getPrimaryFields(action),
  primaryErrorFields: getPrimaryErrorFields(action),
}))

function getPrimaryFields(action: typeof COMMAND_ACTIONS[number]): string[] {
  switch (action) {
    case 'add':
      return ['summary.platformStats', 'risk', 'preview', 'scopeCapabilities']
    case 'current':
      return ['summary.platformStats', 'current', 'detections', 'scopeCapabilities', 'scopeAvailability']
    case 'export':
      return ['summary.platformStats', 'profiles']
    case 'import':
      return ['summary.platformStats', 'items', 'sourceCompatibility']
    case 'import-apply':
      return ['summary.platformStats', 'platformSummary', 'preview', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability', 'changedFiles', 'backupId']
    case 'list':
      return ['summary.platformStats', 'profiles']
    case 'preview':
      return ['summary.platformStats', 'risk', 'preview', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability']
    case 'rollback':
      return ['summary.platformStats', 'platformSummary', 'rollback', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability', 'restoredFiles', 'backupId']
    case 'schema':
      return ['commandCatalog', 'schemaVersion', 'schemaId', 'schema']
    case 'use':
      return ['summary.platformStats', 'platformSummary', 'preview', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability', 'changedFiles', 'backupId']
    case 'validate':
      return ['summary.platformStats', 'items']
    default:
      return []
  }
}

function getPrimaryErrorFields(action: typeof COMMAND_ACTIONS[number]): string[] {
  switch (action) {
    case 'preview':
      return ['error.code', 'error.message', 'error.details.scopePolicy', 'error.details.scopeAvailability']
    case 'use':
      return ['error.code', 'error.message', 'error.details.risk', 'error.details.scopePolicy', 'error.details.scopeCapabilities', 'error.details.scopeAvailability']
    case 'rollback':
      return ['error.code', 'error.message', 'error.details.scopePolicy', 'error.details.scopeCapabilities', 'error.details.scopeAvailability']
    case 'import':
      return ['error.code', 'error.message']
    case 'import-apply':
      return ['error.code', 'error.message', 'error.details.previewDecision', 'error.details.scopePolicy', 'error.details.scopeCapabilities', 'error.details.scopeAvailability']
    default:
      return ['error.code', 'error.message']
  }
}

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
