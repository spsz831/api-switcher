import publicJsonSchema from '../../docs/public-json-output.schema.json'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../constants/public-json-schema'
import {
  COMMAND_ACTIONS,
  type CommandResult,
  type SchemaActionCapability,
  type SchemaCommandOutput,
  type SchemaFieldSemanticBinding,
} from '../types/command'

const SCHEMA_ACTION_CAPABILITIES: SchemaActionCapability[] = COMMAND_ACTIONS.map((action) => ({
  action,
  hasPlatformSummary: ['current', 'list', 'validate', 'export', 'use', 'rollback', 'import', 'import-apply'].includes(action),
  hasPlatformStats: ['add', 'current', 'list', 'validate', 'export', 'preview', 'use', 'rollback', 'import', 'import-apply'].includes(action),
  hasScopeCapabilities: ['add', 'current', 'list', 'preview', 'use', 'rollback', 'import', 'import-apply'].includes(action),
  hasScopeAvailability: ['current', 'preview', 'use', 'rollback', 'import', 'import-apply'].includes(action),
  hasScopePolicy: ['preview', 'use', 'rollback', 'import-apply'].includes(action),
  primaryFields: getPrimaryFields(action),
  primaryErrorFields: getPrimaryErrorFields(action),
  primaryFieldSemantics: getPrimaryFieldSemantics(action),
  primaryErrorFieldSemantics: getPrimaryErrorFieldSemantics(action),
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

function getPrimaryFieldSemantics(action: typeof COMMAND_ACTIONS[number]): SchemaFieldSemanticBinding[] {
  switch (action) {
    case 'add':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'risk', semantic: 'risk' },
        { path: 'preview', semantic: 'result-core' },
        { path: 'scopeCapabilities', semantic: 'scope-resolution' },
      ]
    case 'current':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'current', semantic: 'result-core' },
        { path: 'detections', semantic: 'item-collection' },
        { path: 'scopeCapabilities', semantic: 'scope-resolution' },
        { path: 'scopeAvailability', semantic: 'scope-resolution' },
      ]
    case 'export':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'profiles', semantic: 'item-collection' },
      ]
    case 'import':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'items', semantic: 'item-collection' },
        { path: 'sourceCompatibility', semantic: 'source-compatibility' },
      ]
    case 'import-apply':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'platformSummary', semantic: 'platform-explainable' },
        { path: 'preview', semantic: 'result-core' },
        { path: 'scopePolicy', semantic: 'scope-resolution' },
        { path: 'scopeCapabilities', semantic: 'scope-resolution' },
        { path: 'scopeAvailability', semantic: 'scope-resolution' },
        { path: 'changedFiles', semantic: 'artifacts' },
        { path: 'backupId', semantic: 'artifacts' },
      ]
    case 'list':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'profiles', semantic: 'item-collection' },
      ]
    case 'preview':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'risk', semantic: 'risk' },
        { path: 'preview', semantic: 'result-core' },
        { path: 'scopePolicy', semantic: 'scope-resolution' },
        { path: 'scopeCapabilities', semantic: 'scope-resolution' },
        { path: 'scopeAvailability', semantic: 'scope-resolution' },
      ]
    case 'rollback':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'platformSummary', semantic: 'platform-explainable' },
        { path: 'rollback', semantic: 'result-core' },
        { path: 'scopePolicy', semantic: 'scope-resolution' },
        { path: 'scopeCapabilities', semantic: 'scope-resolution' },
        { path: 'scopeAvailability', semantic: 'scope-resolution' },
        { path: 'restoredFiles', semantic: 'artifacts' },
        { path: 'backupId', semantic: 'artifacts' },
      ]
    case 'schema':
      return [
        { path: 'commandCatalog', semantic: 'schema-catalog' },
        { path: 'schemaVersion', semantic: 'schema-metadata' },
        { path: 'schemaId', semantic: 'schema-metadata' },
        { path: 'schema', semantic: 'schema-document' },
      ]
    case 'use':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'platformSummary', semantic: 'platform-explainable' },
        { path: 'preview', semantic: 'result-core' },
        { path: 'scopePolicy', semantic: 'scope-resolution' },
        { path: 'scopeCapabilities', semantic: 'scope-resolution' },
        { path: 'scopeAvailability', semantic: 'scope-resolution' },
        { path: 'changedFiles', semantic: 'artifacts' },
        { path: 'backupId', semantic: 'artifacts' },
      ]
    case 'validate':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'items', semantic: 'item-collection' },
      ]
    default:
      return []
  }
}

function getPrimaryErrorFieldSemantics(action: typeof COMMAND_ACTIONS[number]): SchemaFieldSemanticBinding[] {
  switch (action) {
    case 'preview':
      return [
        { path: 'error.code', semantic: 'error-core' },
        { path: 'error.message', semantic: 'error-core' },
        { path: 'error.details.scopePolicy', semantic: 'error-details' },
        { path: 'error.details.scopeAvailability', semantic: 'error-details' },
      ]
    case 'use':
      return [
        { path: 'error.code', semantic: 'error-core' },
        { path: 'error.message', semantic: 'error-core' },
        { path: 'error.details.risk', semantic: 'error-details' },
        { path: 'error.details.scopePolicy', semantic: 'error-details' },
        { path: 'error.details.scopeCapabilities', semantic: 'error-details' },
        { path: 'error.details.scopeAvailability', semantic: 'error-details' },
      ]
    case 'rollback':
      return [
        { path: 'error.code', semantic: 'error-core' },
        { path: 'error.message', semantic: 'error-core' },
        { path: 'error.details.scopePolicy', semantic: 'error-details' },
        { path: 'error.details.scopeCapabilities', semantic: 'error-details' },
        { path: 'error.details.scopeAvailability', semantic: 'error-details' },
      ]
    case 'import-apply':
      return [
        { path: 'error.code', semantic: 'error-core' },
        { path: 'error.message', semantic: 'error-core' },
        { path: 'error.details.previewDecision', semantic: 'error-details' },
        { path: 'error.details.scopePolicy', semantic: 'error-details' },
        { path: 'error.details.scopeCapabilities', semantic: 'error-details' },
        { path: 'error.details.scopeAvailability', semantic: 'error-details' },
      ]
    default:
      return [
        { path: 'error.code', semantic: 'error-core' },
        { path: 'error.message', semantic: 'error-core' },
      ]
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
