import publicJsonSchema from '../../docs/public-json-output.schema.json'
import {
  getReadonlyConsumerProfileSummarySectionGuidance,
  getReadonlySummarySections,
} from '../constants/readonly-summary-sections'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../constants/public-json-schema'
import {
  COMMAND_ACTIONS,
  type CommandResult,
  type SchemaActionCapability,
  type SchemaActionFailureCode,
  type SchemaConsumerProfile,
  type SchemaActionFieldPresence,
  type SchemaActionFieldSource,
  type SchemaActionFieldStability,
  type SchemaCommandOutput,
  type SchemaFieldSemanticBinding,
  type SchemaReadOrderGroups,
  type SchemaReferenceGovernanceCode,
} from '../types/command'

const SCHEMA_CONSUMER_PROFILES: SchemaConsumerProfile[] = [
  {
    id: 'readonly-state-audit',
    title: 'Readonly state audit',
    appliesToActions: ['current', 'list', 'validate', 'export'],
    exampleActions: ['current', 'export'],
    bestEntryAction: 'current',
    sharedSummaryFields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'],
    sharedItemFields: ['platformSummary'],
    sharedFailureFields: ['error.code', 'error.message'],
    optionalScopeFields: ['scopeCapabilities', 'scopeAvailability', 'defaultWriteScope', 'observedAt'],
    optionalItemFields: ['referenceSummary', 'secretExportSummary', 'currentScope'],
    optionalFailureFields: [],
    optionalArtifactFields: [],
    recommendedStages: ['summary', 'items', 'detail'],
    summarySectionGuidance: getReadonlyConsumerProfileSummarySectionGuidance('readonly-state-audit'),
    followUpHints: [
      {
        use: 'overview',
        nextStep: 'inspect-items',
        primaryFields: ['detections', 'platformSummary'],
        purpose: '看完平台级概览后，继续展开检测项或 profile 项，确认具体命中与平台 explainable。',
      },
      {
        use: 'governance',
        nextStep: 'review-reference-details',
        primaryFields: ['detections.referenceSummary', 'profiles.referenceSummary'],
        purpose: '当 summary 暴露出 reference / inline / unsupported 治理信号后，继续展开 item 级 reference explainable。',
      },
      {
        use: 'gating',
        nextStep: 'continue-to-write',
        primaryFields: ['summary.executabilityStats', 'detections.referenceSummary', 'profiles.referenceSummary'],
        purpose: '当只读结果需要决定能否继续进入 use/import apply 时，先结合 executability 聚合与 item 级 reference 细节判断。',
      },
    ],
  },
  {
    id: 'single-platform-write',
    title: 'Single-platform write',
    appliesToActions: ['add', 'preview', 'use', 'rollback', 'import-apply'],
    exampleActions: ['preview', 'use', 'import-apply'],
    bestEntryAction: 'preview',
    sharedSummaryFields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'],
    sharedItemFields: ['platformSummary', 'preview'],
    sharedFailureFields: ['error.code', 'error.message'],
    optionalScopeFields: ['scopePolicy', 'scopeCapabilities', 'scopeAvailability'],
    optionalItemFields: ['risk', 'rollback'],
    optionalFailureFields: ['error.details.referenceGovernance', 'error.details.scopePolicy', 'error.details.scopeCapabilities', 'error.details.scopeAvailability', 'error.details.previewDecision', 'error.details.risk'],
    optionalArtifactFields: ['changedFiles', 'backupId', 'restoredFiles'],
    recommendedStages: ['summary', 'detail', 'artifacts'],
  },
  {
    id: 'readonly-import-batch',
    title: 'Readonly import batch analysis',
    appliesToActions: ['import'],
    exampleActions: ['import'],
    bestEntryAction: 'import',
    sharedSummaryFields: ['summary.sourceExecutability', 'summary.executabilityStats', 'summary.platformStats'],
    sharedItemFields: ['platformSummary', 'previewDecision'],
    sharedFailureFields: ['error.code', 'error.message'],
    optionalScopeFields: [],
    optionalItemFields: ['fidelity', 'exportedObservation', 'localObservation'],
    optionalFailureFields: [],
    optionalArtifactFields: [],
    recommendedStages: ['summary', 'items', 'detail'],
    summarySectionGuidance: getReadonlyConsumerProfileSummarySectionGuidance('readonly-import-batch'),
    followUpHints: [
      {
        use: 'gating',
        nextStep: 'repair-source-input',
        primaryFields: ['summary.sourceExecutability', 'sourceCompatibility', 'items.previewDecision'],
        purpose: '当导入源本身被 redacted inline secret 或 schema 兼容性阻断时，先回到 source 侧修复。',
      },
      {
        use: 'gating',
        nextStep: 'continue-to-write',
        primaryFields: ['summary.executabilityStats', 'items.previewDecision', 'items.fidelity'],
        purpose: '当需要决定是否继续进入 import apply 时，继续展开 item 级 previewDecision 与 fidelity 证据。',
      },
      {
        use: 'routing',
        nextStep: 'group-by-platform',
        primaryFields: ['summary.platformStats', 'platformSummary'],
        purpose: '当 mixed-batch 需要拆分处理时，先按平台聚合与 item 级 platform explainable 分组。',
      },
    ],
  },
]

const REFERENCE_GOVERNANCE_CODE_CATALOG: SchemaReferenceGovernanceCode[] = [
  { code: 'REFERENCE_INPUT_CONFLICT', priority: 1, category: 'input', recommendedHandling: 'fix-reference-input' },
  { code: 'REFERENCE_MISSING', priority: 2, category: 'reference', recommendedHandling: 'fix-reference-input' },
  { code: 'REFERENCE_WRITE_UNSUPPORTED', priority: 3, category: 'reference', recommendedHandling: 'resolve-reference-support' },
  { code: 'INLINE_SECRET_PRESENT', priority: 4, category: 'inline-secret', recommendedHandling: 'migrate-inline-secret' },
]

const SCHEMA_ACTION_CAPABILITIES: SchemaActionCapability[] = COMMAND_ACTIONS.map((action) => ({
  action,
  hasPlatformSummary: ['current', 'list', 'validate', 'export', 'use', 'rollback', 'import', 'import-apply'].includes(action),
  hasPlatformStats: ['add', 'current', 'list', 'validate', 'export', 'preview', 'use', 'rollback', 'import', 'import-apply'].includes(action),
  hasScopeCapabilities: ['add', 'current', 'list', 'preview', 'use', 'rollback', 'import', 'import-apply'].includes(action),
  hasScopeAvailability: ['current', 'preview', 'use', 'rollback', 'import', 'import-apply'].includes(action),
  hasScopePolicy: ['preview', 'use', 'rollback', 'import-apply'].includes(action),
  consumerProfileIds: getConsumerProfileIds(action),
  primaryFields: getPrimaryFields(action),
  primaryErrorFields: getPrimaryErrorFields(action),
  failureCodes: getFailureCodes(action),
  fieldPresence: getFieldPresence(action),
  fieldSources: getFieldSources(action),
  fieldStability: getFieldStability(action),
  readOrderGroups: getReadOrderGroups(action),
  summarySections: getSummarySections(action),
  primaryFieldSemantics: getPrimaryFieldSemantics(action),
  primaryErrorFieldSemantics: getPrimaryErrorFieldSemantics(action),
  ...getReferenceGovernanceCodeCatalog(action),
}))

function getConsumerProfileIds(action: typeof COMMAND_ACTIONS[number]): SchemaConsumerProfile['id'][] | undefined {
  if (action === 'current' || action === 'list' || action === 'validate' || action === 'export') {
    return ['readonly-state-audit']
  }
  if (action === 'add' || action === 'preview' || action === 'use' || action === 'rollback' || action === 'import-apply') {
    return ['single-platform-write']
  }
  if (action === 'import') {
    return ['readonly-import-batch']
  }

  return undefined
}

function getReferenceGovernanceCodeCatalog(action: typeof COMMAND_ACTIONS[number]): { referenceGovernanceCodes?: SchemaReferenceGovernanceCode[] } {
  if (action !== 'use' && action !== 'import-apply') {
    return {}
  }

  return { referenceGovernanceCodes: REFERENCE_GOVERNANCE_CODE_CATALOG }
}

function getPrimaryFields(action: typeof COMMAND_ACTIONS[number]): string[] {
  switch (action) {
    case 'add':
      return ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'risk', 'preview', 'scopeCapabilities']
    case 'current':
      return ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'current', 'detections', 'detections.referenceSummary', 'scopeCapabilities', 'scopeAvailability']
    case 'export':
      return ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'summary.secretExportPolicy', 'profiles', 'profiles.referenceSummary', 'profiles.secretExportSummary']
    case 'import':
      return ['summary.sourceExecutability', 'summary.executabilityStats', 'summary.platformStats', 'items', 'sourceCompatibility']
    case 'import-apply':
      return ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'platformSummary', 'preview', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability', 'changedFiles', 'backupId']
    case 'list':
      return ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'profiles', 'profiles.referenceSummary']
    case 'preview':
      return ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'risk', 'preview', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability']
    case 'rollback':
      return ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'platformSummary', 'rollback', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability', 'restoredFiles', 'backupId']
    case 'schema':
      return ['commandCatalog', 'schemaVersion', 'schemaId', 'schema']
    case 'use':
      return ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'platformSummary', 'preview', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability', 'changedFiles', 'backupId']
    case 'validate':
      return ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'items', 'items.referenceSummary']
    default:
      return []
  }
}

function getPrimaryErrorFields(action: typeof COMMAND_ACTIONS[number]): string[] {
  switch (action) {
    case 'preview':
      return ['error.code', 'error.message', 'error.details.scopePolicy', 'error.details.scopeAvailability']
    case 'use':
      return ['error.code', 'error.message', 'error.details.referenceGovernance', 'error.details.risk', 'error.details.scopePolicy', 'error.details.scopeCapabilities', 'error.details.scopeAvailability']
    case 'rollback':
      return ['error.code', 'error.message', 'error.details.scopePolicy', 'error.details.scopeCapabilities', 'error.details.scopeAvailability']
    case 'import':
      return ['error.code', 'error.message']
    case 'import-apply':
      return ['error.code', 'error.message', 'error.details.referenceGovernance', 'error.details.previewDecision', 'error.details.scopePolicy', 'error.details.scopeCapabilities', 'error.details.scopeAvailability']
    default:
      return ['error.code', 'error.message']
  }
}

function getFailureCodes(action: typeof COMMAND_ACTIONS[number]): SchemaActionFailureCode[] {
  switch (action) {
    case 'add':
      return [
        { code: 'ADD_INPUT_REQUIRED', priority: 1, category: 'input', recommendedHandling: 'fix-input-and-retry' },
        { code: 'ADD_INPUT_CONFLICT', priority: 2, category: 'input', recommendedHandling: 'fix-input-and-retry' },
        { code: 'UNSUPPORTED_PLATFORM', priority: 3, category: 'input', recommendedHandling: 'fix-input-and-retry' },
        { code: 'GEMINI_URL_UNSUPPORTED', priority: 4, category: 'input', recommendedHandling: 'fix-input-and-retry' },
        { code: 'DUPLICATE_PROFILE_ID', priority: 5, category: 'state', recommendedHandling: 'select-existing-resource' },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 6, category: 'platform', recommendedHandling: 'check-platform-support' },
        { code: 'ADD_FAILED', priority: 7, category: 'runtime', recommendedHandling: 'inspect-runtime-details' },
      ]
    case 'current':
      return [
        { code: 'ADAPTER_NOT_REGISTERED', priority: 1, category: 'platform', recommendedHandling: 'check-platform-support' },
        { code: 'CURRENT_FAILED', priority: 2, category: 'runtime', recommendedHandling: 'inspect-runtime-details' },
      ]
    case 'export':
      return [
        { code: 'ADAPTER_NOT_REGISTERED', priority: 1, category: 'platform', recommendedHandling: 'check-platform-support' },
        { code: 'EXPORT_FAILED', priority: 2, category: 'runtime', recommendedHandling: 'inspect-runtime-details' },
      ]
    case 'import':
      return [
        { code: 'IMPORT_SOURCE_NOT_FOUND', priority: 1, category: 'source', recommendedHandling: 'check-import-source' },
        { code: 'IMPORT_SOURCE_INVALID', priority: 2, category: 'source', recommendedHandling: 'check-import-source' },
        { code: 'IMPORT_UNSUPPORTED_SCHEMA', priority: 3, category: 'source', recommendedHandling: 'check-import-source' },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 4, category: 'platform', recommendedHandling: 'check-platform-support' },
        { code: 'IMPORT_PREVIEW_FAILED', priority: 5, category: 'runtime', recommendedHandling: 'inspect-runtime-details' },
      ]
    case 'import-apply':
      return [
        { code: 'IMPORT_SOURCE_NOT_FOUND', priority: 1, category: 'source', recommendedHandling: 'check-import-source' },
        { code: 'IMPORT_SOURCE_INVALID', priority: 2, category: 'source', recommendedHandling: 'check-import-source' },
        { code: 'IMPORT_UNSUPPORTED_SCHEMA', priority: 3, category: 'source', recommendedHandling: 'check-import-source' },
        { code: 'IMPORT_PROFILE_NOT_FOUND', priority: 4, category: 'source', recommendedHandling: 'check-import-source' },
        { code: 'IMPORT_SOURCE_REDACTED_INLINE_SECRETS', priority: 5, category: 'source', recommendedHandling: 'check-import-source' },
        { code: 'INVALID_SCOPE', priority: 6, category: 'input', recommendedHandling: 'fix-input-and-retry' },
        { code: 'IMPORT_SCOPE_UNAVAILABLE', priority: 7, category: 'scope', recommendedHandling: 'resolve-scope-before-retry' },
        { code: 'IMPORT_APPLY_NOT_READY', priority: 8, category: 'state', recommendedHandling: 'resolve-scope-before-retry' },
        { code: 'VALIDATION_FAILED', priority: 9, category: 'runtime', recommendedHandling: 'inspect-runtime-details' },
        { code: 'CONFIRMATION_REQUIRED', priority: 10, category: 'confirmation', recommendedHandling: 'confirm-before-write' },
        { code: 'IMPORT_PLATFORM_NOT_SUPPORTED', priority: 11, category: 'platform', recommendedHandling: 'check-platform-support' },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 12, category: 'platform', recommendedHandling: 'check-platform-support' },
        { code: 'IMPORT_APPLY_FAILED', priority: 13, category: 'runtime', recommendedHandling: 'inspect-runtime-details' },
      ]
    case 'list':
      return [
        { code: 'UNSUPPORTED_PLATFORM', priority: 1, category: 'input', recommendedHandling: 'fix-input-and-retry' },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 2, category: 'platform', recommendedHandling: 'check-platform-support' },
        { code: 'LIST_FAILED', priority: 3, category: 'runtime', recommendedHandling: 'inspect-runtime-details' },
      ]
    case 'preview':
      return [
        { code: 'PROFILE_NOT_FOUND', priority: 1, category: 'state', recommendedHandling: 'select-existing-resource' },
        { code: 'INVALID_SCOPE', priority: 2, category: 'input', recommendedHandling: 'fix-input-and-retry' },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 3, category: 'platform', recommendedHandling: 'check-platform-support' },
        { code: 'PREVIEW_FAILED', priority: 4, category: 'runtime', recommendedHandling: 'inspect-runtime-details' },
      ]
    case 'rollback':
      return [
        { code: 'BACKUP_NOT_FOUND', priority: 1, category: 'state', recommendedHandling: 'select-existing-resource' },
        { code: 'INVALID_BACKUP_ID', priority: 2, category: 'input', recommendedHandling: 'fix-input-and-retry' },
        { code: 'INVALID_SCOPE', priority: 3, category: 'input', recommendedHandling: 'fix-input-and-retry' },
        { code: 'ROLLBACK_SCOPE_MISMATCH', priority: 4, category: 'scope', recommendedHandling: 'resolve-scope-before-retry' },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 5, category: 'platform', recommendedHandling: 'check-platform-support' },
        { code: 'ROLLBACK_FAILED', priority: 6, category: 'runtime', recommendedHandling: 'inspect-runtime-details' },
      ]
    case 'schema':
      return []
    case 'use':
      return [
        { code: 'PROFILE_NOT_FOUND', priority: 1, category: 'state', recommendedHandling: 'select-existing-resource' },
        { code: 'INVALID_SCOPE', priority: 2, category: 'input', recommendedHandling: 'fix-input-and-retry' },
        { code: 'VALIDATION_FAILED', priority: 3, category: 'runtime', recommendedHandling: 'inspect-runtime-details' },
        { code: 'CONFIRMATION_REQUIRED', priority: 4, category: 'confirmation', recommendedHandling: 'confirm-before-write' },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 5, category: 'platform', recommendedHandling: 'check-platform-support' },
        { code: 'APPLY_FAILED', priority: 6, category: 'runtime', recommendedHandling: 'inspect-runtime-details' },
        { code: 'USE_FAILED', priority: 7, category: 'runtime', recommendedHandling: 'inspect-runtime-details' },
      ]
    case 'validate':
      return [
        { code: 'PROFILE_NOT_FOUND', priority: 1, category: 'state', recommendedHandling: 'select-existing-resource' },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 2, category: 'platform', recommendedHandling: 'check-platform-support' },
        { code: 'VALIDATE_FAILED', priority: 3, category: 'runtime', recommendedHandling: 'inspect-runtime-details' },
      ]
    default:
      return []
  }
}

function getFieldPresence(action: typeof COMMAND_ACTIONS[number]): SchemaActionFieldPresence[] {
  switch (action) {
    case 'add':
      return [
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
        { path: 'risk', channel: 'success', presence: 'always' },
        { path: 'preview', channel: 'success', presence: 'always' },
        { path: 'scopeCapabilities', channel: 'success', presence: 'always' },
      ]
    case 'current':
      return [
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
        { path: 'current', channel: 'success', presence: 'always' },
        { path: 'detections', channel: 'success', presence: 'always' },
        { path: 'detections.referenceSummary', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_ITEM_HAS_REFERENCE_OR_INLINE_SECRET_CONTEXT' },
        { path: 'scopeCapabilities', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_PLATFORM_EXPOSES_SCOPE_CAPABILITIES' },
        { path: 'scopeAvailability', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_PLATFORM_EXPOSES_SCOPE_AVAILABILITY' },
      ]
    case 'export':
      return [
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
        { path: 'summary.secretExportPolicy', channel: 'success', presence: 'always' },
        { path: 'profiles', channel: 'success', presence: 'always' },
        { path: 'profiles.referenceSummary', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_ITEM_HAS_REFERENCE_OR_INLINE_SECRET_CONTEXT' },
        { path: 'profiles.secretExportSummary', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_ITEM_HAS_REFERENCE_OR_INLINE_SECRET_CONTEXT' },
      ]
    case 'import':
      return [
        { path: 'summary.sourceExecutability', channel: 'success', presence: 'always' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'items', channel: 'success', presence: 'always' },
        { path: 'sourceCompatibility', channel: 'success', presence: 'always' },
        { path: 'error.code', channel: 'failure', presence: 'always' },
        { path: 'error.message', channel: 'failure', presence: 'always' },
      ]
    case 'import-apply':
      return [
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
        { path: 'platformSummary', channel: 'success', presence: 'always' },
        { path: 'preview', channel: 'success', presence: 'always' },
        { path: 'scopePolicy', channel: 'success', presence: 'always' },
        { path: 'scopeCapabilities', channel: 'success', presence: 'always' },
        { path: 'scopeAvailability', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SCOPE_AVAILABILITY_IS_RESOLVED' },
        { path: 'changedFiles', channel: 'success', presence: 'always' },
        { path: 'backupId', channel: 'success', presence: 'always' },
        { path: 'error.details.referenceGovernance', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_REFERENCE_GOVERNANCE_FAILURE_IS_DETECTED' },
        { path: 'error.details.previewDecision', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_IMPORT_APPLY_FAILURE_PROVIDES_PREVIEW_DECISION' },
        { path: 'error.details.scopePolicy', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_SCOPE_FAILURE_PROVIDES_POLICY_DETAILS' },
        { path: 'error.details.scopeCapabilities', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_SCOPE_FAILURE_PROVIDES_CAPABILITY_DETAILS' },
        { path: 'error.details.scopeAvailability', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_SCOPE_FAILURE_PROVIDES_AVAILABILITY_DETAILS' },
      ]
    case 'list':
      return [
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
        { path: 'profiles', channel: 'success', presence: 'always' },
        { path: 'profiles.referenceSummary', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_ITEM_HAS_REFERENCE_OR_INLINE_SECRET_CONTEXT' },
      ]
    case 'preview':
      return [
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
        { path: 'risk', channel: 'success', presence: 'always' },
        { path: 'preview', channel: 'success', presence: 'always' },
        { path: 'scopePolicy', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_COMMAND_RESOLVES_SCOPE_POLICY' },
        { path: 'scopeCapabilities', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_PLATFORM_EXPOSES_SCOPE_CAPABILITIES' },
        { path: 'scopeAvailability', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SCOPE_AVAILABILITY_IS_RESOLVED' },
        { path: 'error.details.scopePolicy', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_SCOPE_FAILURE_PROVIDES_POLICY_DETAILS' },
        { path: 'error.details.scopeAvailability', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_SCOPE_FAILURE_PROVIDES_AVAILABILITY_DETAILS' },
      ]
    case 'rollback':
      return [
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'summary.referenceStats', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SNAPSHOT_PREVIOUS_PROFILE_IS_AVAILABLE' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SNAPSHOT_PREVIOUS_PROFILE_IS_AVAILABLE' },
        { path: 'platformSummary', channel: 'success', presence: 'always' },
        { path: 'rollback', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_ROLLBACK_RESULT_IS_AVAILABLE' },
        { path: 'scopePolicy', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_COMMAND_RESOLVES_SCOPE_POLICY' },
        { path: 'scopeCapabilities', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_PLATFORM_EXPOSES_SCOPE_CAPABILITIES' },
        { path: 'scopeAvailability', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SCOPE_AVAILABILITY_IS_RESOLVED' },
        { path: 'restoredFiles', channel: 'success', presence: 'always' },
        { path: 'backupId', channel: 'success', presence: 'always' },
        { path: 'error.details.scopePolicy', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_SCOPE_FAILURE_PROVIDES_POLICY_DETAILS' },
        { path: 'error.details.scopeCapabilities', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_SCOPE_FAILURE_PROVIDES_CAPABILITY_DETAILS' },
        { path: 'error.details.scopeAvailability', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_SCOPE_FAILURE_PROVIDES_AVAILABILITY_DETAILS' },
      ]
    case 'schema':
      return [
        { path: 'schemaVersion', channel: 'success', presence: 'always' },
        { path: 'commandCatalog', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SCHEMA_DOCUMENT_IS_REQUESTED' },
        { path: 'schemaId', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SCHEMA_DOCUMENT_IS_REQUESTED' },
        { path: 'schema', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SCHEMA_DOCUMENT_IS_REQUESTED' },
      ]
    case 'use':
      return [
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
        { path: 'platformSummary', channel: 'success', presence: 'always' },
        { path: 'preview', channel: 'success', presence: 'always' },
        { path: 'scopePolicy', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_COMMAND_RESOLVES_SCOPE_POLICY' },
        { path: 'scopeCapabilities', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_PLATFORM_EXPOSES_SCOPE_CAPABILITIES' },
        { path: 'scopeAvailability', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SCOPE_AVAILABILITY_IS_RESOLVED' },
        { path: 'changedFiles', channel: 'success', presence: 'always' },
        { path: 'backupId', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_BACKUP_IS_CREATED' },
        { path: 'error.details.referenceGovernance', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_REFERENCE_GOVERNANCE_FAILURE_IS_DETECTED' },
        { path: 'error.details.risk', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_CONFIRMATION_OR_VALIDATION_FAILURE_PROVIDES_RISK' },
        { path: 'error.details.scopePolicy', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_SCOPE_FAILURE_PROVIDES_POLICY_DETAILS' },
        { path: 'error.details.scopeCapabilities', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_SCOPE_FAILURE_PROVIDES_CAPABILITY_DETAILS' },
        { path: 'error.details.scopeAvailability', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_SCOPE_FAILURE_PROVIDES_AVAILABILITY_DETAILS' },
      ]
    case 'validate':
      return [
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
        { path: 'items', channel: 'success', presence: 'always' },
        { path: 'items.referenceSummary', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_ITEM_HAS_REFERENCE_OR_INLINE_SECRET_CONTEXT' },
      ]
    default:
      return []
  }
}

function getFieldSources(action: typeof COMMAND_ACTIONS[number]): SchemaActionFieldSource[] {
  switch (action) {
    case 'add':
      return [
        { path: 'summary.platformStats', channel: 'success', source: 'command-service' },
        { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
        { path: 'risk', channel: 'success', source: 'command-service' },
        { path: 'preview', channel: 'success', source: 'platform-adapter' },
        { path: 'scopeCapabilities', channel: 'success', source: 'platform-adapter' },
      ]
    case 'current':
      return [
        { path: 'summary.platformStats', channel: 'success', source: 'command-service' },
        { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
        { path: 'current', channel: 'success', source: 'command-service' },
        { path: 'detections', channel: 'success', source: 'platform-adapter' },
        { path: 'detections.referenceSummary', channel: 'success', source: 'command-service' },
        { path: 'scopeCapabilities', channel: 'success', source: 'platform-adapter' },
        { path: 'scopeAvailability', channel: 'success', source: 'platform-adapter' },
      ]
    case 'export':
      return [
        { path: 'summary.platformStats', channel: 'success', source: 'command-service' },
        { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
        { path: 'summary.secretExportPolicy', channel: 'success', source: 'command-service' },
        { path: 'profiles', channel: 'success', source: 'command-service' },
        { path: 'profiles.referenceSummary', channel: 'success', source: 'command-service' },
        { path: 'profiles.secretExportSummary', channel: 'success', source: 'command-service' },
      ]
    case 'import':
      return [
        { path: 'summary.sourceExecutability', channel: 'success', source: 'import-analysis' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'import-analysis' },
        { path: 'summary.platformStats', channel: 'success', source: 'import-analysis' },
        { path: 'items', channel: 'success', source: 'import-analysis' },
        { path: 'sourceCompatibility', channel: 'success', source: 'import-analysis' },
        { path: 'error.code', channel: 'failure', source: 'error-envelope' },
        { path: 'error.message', channel: 'failure', source: 'error-envelope' },
      ]
    case 'import-apply':
      return [
        { path: 'summary.platformStats', channel: 'success', source: 'command-service' },
        { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
        { path: 'platformSummary', channel: 'success', source: 'platform-adapter' },
        { path: 'preview', channel: 'success', source: 'platform-adapter' },
        { path: 'scopePolicy', channel: 'success', source: 'command-service' },
        { path: 'scopeCapabilities', channel: 'success', source: 'platform-adapter' },
        { path: 'scopeAvailability', channel: 'success', source: 'platform-adapter' },
        { path: 'changedFiles', channel: 'success', source: 'write-pipeline' },
        { path: 'backupId', channel: 'success', source: 'write-pipeline' },
        { path: 'error.details.referenceGovernance', channel: 'failure', source: 'command-service' },
        { path: 'error.details.previewDecision', channel: 'failure', source: 'import-analysis' },
        { path: 'error.details.scopePolicy', channel: 'failure', source: 'command-service' },
        { path: 'error.details.scopeCapabilities', channel: 'failure', source: 'platform-adapter' },
        { path: 'error.details.scopeAvailability', channel: 'failure', source: 'platform-adapter' },
      ]
    case 'list':
      return [
        { path: 'summary.platformStats', channel: 'success', source: 'command-service' },
        { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
        { path: 'profiles', channel: 'success', source: 'command-service' },
        { path: 'profiles.referenceSummary', channel: 'success', source: 'command-service' },
      ]
    case 'preview':
      return [
        { path: 'summary.platformStats', channel: 'success', source: 'command-service' },
        { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
        { path: 'risk', channel: 'success', source: 'command-service' },
        { path: 'preview', channel: 'success', source: 'platform-adapter' },
        { path: 'scopePolicy', channel: 'success', source: 'command-service' },
        { path: 'scopeCapabilities', channel: 'success', source: 'platform-adapter' },
        { path: 'scopeAvailability', channel: 'success', source: 'platform-adapter' },
        { path: 'error.details.scopePolicy', channel: 'failure', source: 'command-service' },
        { path: 'error.details.scopeAvailability', channel: 'failure', source: 'platform-adapter' },
      ]
    case 'rollback':
      return [
        { path: 'summary.platformStats', channel: 'success', source: 'command-service' },
        { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
        { path: 'platformSummary', channel: 'success', source: 'platform-adapter' },
        { path: 'rollback', channel: 'success', source: 'write-pipeline' },
        { path: 'scopePolicy', channel: 'success', source: 'command-service' },
        { path: 'scopeCapabilities', channel: 'success', source: 'platform-adapter' },
        { path: 'scopeAvailability', channel: 'success', source: 'platform-adapter' },
        { path: 'restoredFiles', channel: 'success', source: 'write-pipeline' },
        { path: 'backupId', channel: 'success', source: 'write-pipeline' },
        { path: 'error.details.scopePolicy', channel: 'failure', source: 'command-service' },
        { path: 'error.details.scopeCapabilities', channel: 'failure', source: 'platform-adapter' },
        { path: 'error.details.scopeAvailability', channel: 'failure', source: 'platform-adapter' },
      ]
    case 'schema':
      return [
        { path: 'schemaVersion', channel: 'success', source: 'schema-service' },
        { path: 'commandCatalog', channel: 'success', source: 'schema-service' },
        { path: 'schemaId', channel: 'success', source: 'schema-service' },
        { path: 'schema', channel: 'success', source: 'schema-service' },
      ]
    case 'use':
      return [
        { path: 'summary.platformStats', channel: 'success', source: 'command-service' },
        { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
        { path: 'platformSummary', channel: 'success', source: 'platform-adapter' },
        { path: 'preview', channel: 'success', source: 'platform-adapter' },
        { path: 'scopePolicy', channel: 'success', source: 'command-service' },
        { path: 'scopeCapabilities', channel: 'success', source: 'platform-adapter' },
        { path: 'scopeAvailability', channel: 'success', source: 'platform-adapter' },
        { path: 'changedFiles', channel: 'success', source: 'write-pipeline' },
        { path: 'backupId', channel: 'success', source: 'write-pipeline' },
        { path: 'error.details.referenceGovernance', channel: 'failure', source: 'command-service' },
        { path: 'error.details.risk', channel: 'failure', source: 'command-service' },
        { path: 'error.details.scopePolicy', channel: 'failure', source: 'command-service' },
        { path: 'error.details.scopeCapabilities', channel: 'failure', source: 'platform-adapter' },
        { path: 'error.details.scopeAvailability', channel: 'failure', source: 'platform-adapter' },
      ]
    case 'validate':
      return [
        { path: 'summary.platformStats', channel: 'success', source: 'command-service' },
        { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
        { path: 'items', channel: 'success', source: 'command-service' },
        { path: 'items.referenceSummary', channel: 'success', source: 'command-service' },
      ]
    default:
      return []
  }
}

function getFieldStability(action: typeof COMMAND_ACTIONS[number]): SchemaActionFieldStability[] {
  switch (action) {
    case 'add':
      return [
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'risk', channel: 'success', stabilityTier: 'stable' },
        { path: 'preview', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeCapabilities', channel: 'success', stabilityTier: 'stable' },
      ]
    case 'current':
      return [
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'current', channel: 'success', stabilityTier: 'stable' },
        { path: 'detections', channel: 'success', stabilityTier: 'stable' },
        { path: 'detections.referenceSummary', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeCapabilities', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeAvailability', channel: 'success', stabilityTier: 'bounded' },
      ]
    case 'export':
      return [
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.secretExportPolicy', channel: 'success', stabilityTier: 'stable' },
        { path: 'profiles', channel: 'success', stabilityTier: 'stable' },
        { path: 'profiles.referenceSummary', channel: 'success', stabilityTier: 'stable' },
        { path: 'profiles.secretExportSummary', channel: 'success', stabilityTier: 'stable' },
      ]
    case 'import':
      return [
        { path: 'summary.sourceExecutability', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'items', channel: 'success', stabilityTier: 'stable' },
        { path: 'sourceCompatibility', channel: 'success', stabilityTier: 'stable' },
        { path: 'error.code', channel: 'failure', stabilityTier: 'stable' },
        { path: 'error.message', channel: 'failure', stabilityTier: 'stable' },
      ]
    case 'import-apply':
      return [
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'platformSummary', channel: 'success', stabilityTier: 'stable' },
        { path: 'preview', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopePolicy', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeCapabilities', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeAvailability', channel: 'success', stabilityTier: 'bounded' },
        { path: 'changedFiles', channel: 'success', stabilityTier: 'stable' },
        { path: 'backupId', channel: 'success', stabilityTier: 'stable' },
        { path: 'error.details.referenceGovernance', channel: 'failure', stabilityTier: 'stable' },
        { path: 'error.details.previewDecision', channel: 'failure', stabilityTier: 'bounded' },
        { path: 'error.details.scopePolicy', channel: 'failure', stabilityTier: 'bounded' },
        { path: 'error.details.scopeCapabilities', channel: 'failure', stabilityTier: 'bounded' },
        { path: 'error.details.scopeAvailability', channel: 'failure', stabilityTier: 'bounded' },
      ]
    case 'list':
      return [
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'profiles', channel: 'success', stabilityTier: 'stable' },
        { path: 'profiles.referenceSummary', channel: 'success', stabilityTier: 'stable' },
      ]
    case 'preview':
      return [
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'risk', channel: 'success', stabilityTier: 'stable' },
        { path: 'preview', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopePolicy', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeCapabilities', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeAvailability', channel: 'success', stabilityTier: 'bounded' },
        { path: 'error.details.scopePolicy', channel: 'failure', stabilityTier: 'bounded' },
        { path: 'error.details.scopeAvailability', channel: 'failure', stabilityTier: 'bounded' },
      ]
    case 'rollback':
      return [
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'bounded' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'bounded' },
        { path: 'platformSummary', channel: 'success', stabilityTier: 'stable' },
        { path: 'rollback', channel: 'success', stabilityTier: 'bounded' },
        { path: 'scopePolicy', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeCapabilities', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeAvailability', channel: 'success', stabilityTier: 'bounded' },
        { path: 'restoredFiles', channel: 'success', stabilityTier: 'stable' },
        { path: 'backupId', channel: 'success', stabilityTier: 'stable' },
        { path: 'error.details.scopePolicy', channel: 'failure', stabilityTier: 'bounded' },
        { path: 'error.details.scopeCapabilities', channel: 'failure', stabilityTier: 'bounded' },
        { path: 'error.details.scopeAvailability', channel: 'failure', stabilityTier: 'bounded' },
      ]
    case 'schema':
      return [
        { path: 'schemaVersion', channel: 'success', stabilityTier: 'stable' },
        { path: 'commandCatalog', channel: 'success', stabilityTier: 'stable' },
        { path: 'schemaId', channel: 'success', stabilityTier: 'stable' },
        { path: 'schema', channel: 'success', stabilityTier: 'stable' },
      ]
    case 'use':
      return [
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'platformSummary', channel: 'success', stabilityTier: 'stable' },
        { path: 'preview', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopePolicy', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeCapabilities', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeAvailability', channel: 'success', stabilityTier: 'bounded' },
        { path: 'changedFiles', channel: 'success', stabilityTier: 'stable' },
        { path: 'backupId', channel: 'success', stabilityTier: 'stable' },
        { path: 'error.details.referenceGovernance', channel: 'failure', stabilityTier: 'stable' },
        { path: 'error.details.risk', channel: 'failure', stabilityTier: 'bounded' },
        { path: 'error.details.scopePolicy', channel: 'failure', stabilityTier: 'bounded' },
        { path: 'error.details.scopeCapabilities', channel: 'failure', stabilityTier: 'bounded' },
        { path: 'error.details.scopeAvailability', channel: 'failure', stabilityTier: 'bounded' },
      ]
    case 'validate':
      return [
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'items', channel: 'success', stabilityTier: 'stable' },
        { path: 'items.referenceSummary', channel: 'success', stabilityTier: 'stable' },
      ]
    default:
      return []
  }
}

function getReadOrderGroups(action: typeof COMMAND_ACTIONS[number]): SchemaReadOrderGroups {
  switch (action) {
    case 'add':
      return {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'], purpose: '先看单平台聚合、reference 聚合和写入可执行性聚合。' },
          { stage: 'detail', fields: ['risk', 'preview', 'scopeCapabilities'], purpose: '再展开新增结果、风险和 scope 能力。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定失败类型。' },
        ],
      }
    case 'current':
      return {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'], purpose: '先看平台级聚合、reference 聚合和写入可执行性聚合。' },
          { stage: 'selection', fields: ['current'], purpose: '再看当前 state 记录。' },
          { stage: 'items', fields: ['detections', 'detections.referenceSummary'], purpose: '最后展开检测结果列表，并按需读取每项的 reference explainable。' },
          { stage: 'detail', fields: ['scopeCapabilities', 'scopeAvailability'], purpose: '按需展开 scope 元信息。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定失败类型。' },
        ],
      }
    case 'export':
      return {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'summary.secretExportPolicy'], purpose: '先看平台级导出聚合、reference 聚合、写入可执行性聚合和本次 secret 导出策略。' },
          { stage: 'items', fields: ['profiles', 'profiles.referenceSummary', 'profiles.secretExportSummary'], purpose: '再读导出 profile 列表，并按需读取每项的 reference 与 secret export explainable。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定失败类型。' },
        ],
      }
    case 'import':
      return {
        success: [
          { stage: 'summary', fields: ['summary.sourceExecutability', 'summary.executabilityStats', 'summary.platformStats'], purpose: '先看导入源可执行性、写入可执行性和 mixed-batch 平台聚合。' },
          { stage: 'items', fields: ['items'], purpose: '再处理每个 imported item。' },
          { stage: 'detail', fields: ['sourceCompatibility'], purpose: '最后看来源兼容性。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定顶层失败类型。' },
          { stage: 'error-recovery', fields: ['error.code'], purpose: '再根据 failureCodes 选择导入源修复动作。' },
        ],
      }
    case 'import-apply':
      return {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'], purpose: '先看 apply 的平台级聚合、reference 聚合和写入可执行性聚合。' },
          { stage: 'detail', fields: ['platformSummary', 'preview', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability'], purpose: '再理解平台语义和 scope 决策。' },
          { stage: 'artifacts', fields: ['changedFiles', 'backupId'], purpose: '最后消费落盘产物。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定阻塞类型。' },
          { stage: 'error-details', fields: ['error.details.referenceGovernance', 'error.details.previewDecision', 'error.details.scopePolicy', 'error.details.scopeCapabilities', 'error.details.scopeAvailability'], purpose: '再看 reference 治理、导入决策和 scope 上下文。' },
          { stage: 'error-recovery', fields: ['error.code'], purpose: '最后按 recommendedHandling 选择修复动作。' },
        ],
      }
    case 'list':
      return {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'], purpose: '先按平台分组并识别 reference 聚合与写入可执行性聚合。' },
          { stage: 'items', fields: ['profiles', 'profiles.referenceSummary'], purpose: '再读 profile 列表，并按需读取每项的 reference explainable。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定失败类型。' },
        ],
      }
    case 'preview':
      return {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'], purpose: '先看目标 scope 的平台聚合、reference 聚合和写入可执行性聚合。' },
          { stage: 'detail', fields: ['risk', 'preview', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability'], purpose: '再展开预览、风险和 scope 元信息。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定阻塞类型。' },
          { stage: 'error-details', fields: ['error.details.scopePolicy', 'error.details.scopeAvailability'], purpose: '再看 scope 相关上下文。' },
        ],
      }
    case 'rollback':
      return {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'], purpose: '先看恢复的平台聚合，以及快照上一版 profile 的 reference 聚合和写入可执行性聚合。' },
          { stage: 'detail', fields: ['platformSummary', 'rollback', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability'], purpose: '再展开恢复结果和 scope 上下文。' },
          { stage: 'artifacts', fields: ['restoredFiles', 'backupId'], purpose: '最后消费恢复产物。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定阻塞类型。' },
          { stage: 'error-details', fields: ['error.details.scopePolicy', 'error.details.scopeCapabilities', 'error.details.scopeAvailability'], purpose: '再看 scope 不匹配或不可用上下文。' },
          { stage: 'error-recovery', fields: ['error.code'], purpose: '最后按 recommendedHandling 选择恢复动作。' },
        ],
      }
    case 'schema':
      return {
        success: [
          { stage: 'selection', fields: ['commandCatalog'], purpose: '先读取命令级能力索引。' },
          { stage: 'detail', fields: ['schemaVersion', 'schemaId', 'schema'], purpose: '再按需展开 schema 元信息和完整文档。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '保留统一失败入口。' },
        ],
      }
    case 'use':
      return {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'], purpose: '先看写入平台的聚合结果、reference 聚合和写入可执行性聚合。' },
          { stage: 'detail', fields: ['platformSummary', 'preview', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability'], purpose: '再理解平台语义、预览和 scope 上下文。' },
          { stage: 'artifacts', fields: ['changedFiles', 'backupId'], purpose: '最后消费备份和落盘产物。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定阻塞类型。' },
          { stage: 'error-details', fields: ['error.details.referenceGovernance', 'error.details.risk', 'error.details.scopePolicy', 'error.details.scopeCapabilities', 'error.details.scopeAvailability'], purpose: '再看 reference 治理、风险和 scope 上下文。' },
          { stage: 'error-recovery', fields: ['error.code'], purpose: '最后按 recommendedHandling 选择修复动作。' },
        ],
      }
    case 'validate':
      return {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'], purpose: '先看平台级通过/限制聚合、reference 聚合和写入可执行性聚合。' },
          { stage: 'items', fields: ['items', 'items.referenceSummary'], purpose: '再展开各 profile 校验结果，并按需读取每项的 reference explainable。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定失败类型。' },
        ],
      }
    default:
      return {
        success: [],
        failure: [],
      }
  }
}

function getSummarySections(action: typeof COMMAND_ACTIONS[number]) {
  switch (action) {
    case 'current':
    case 'list':
    case 'validate':
    case 'export':
      return getReadonlySummarySections(action)
    case 'import':
      return getReadonlySummarySections(action)
    default:
      return undefined
  }
}

function getPrimaryFieldSemantics(action: typeof COMMAND_ACTIONS[number]): SchemaFieldSemanticBinding[] {
  switch (action) {
    case 'add':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
        { path: 'risk', semantic: 'risk' },
        { path: 'preview', semantic: 'result-core' },
        { path: 'scopeCapabilities', semantic: 'scope-resolution' },
      ]
    case 'current':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
        { path: 'current', semantic: 'result-core' },
        { path: 'detections', semantic: 'item-collection' },
        { path: 'detections.referenceSummary', semantic: 'item-explainable' },
        { path: 'scopeCapabilities', semantic: 'scope-resolution' },
        { path: 'scopeAvailability', semantic: 'scope-resolution' },
      ]
    case 'export':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
        { path: 'summary.secretExportPolicy', semantic: 'result-policy' },
        { path: 'profiles', semantic: 'item-collection' },
        { path: 'profiles.referenceSummary', semantic: 'item-explainable' },
        { path: 'profiles.secretExportSummary', semantic: 'item-explainable' },
      ]
    case 'import':
      return [
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
        { path: 'summary.sourceExecutability', semantic: 'source-executability' },
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'items', semantic: 'item-collection' },
        { path: 'sourceCompatibility', semantic: 'source-compatibility' },
      ]
    case 'import-apply':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
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
        { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
        { path: 'profiles', semantic: 'item-collection' },
        { path: 'profiles.referenceSummary', semantic: 'item-explainable' },
      ]
    case 'preview':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
        { path: 'risk', semantic: 'risk' },
        { path: 'preview', semantic: 'result-core' },
        { path: 'scopePolicy', semantic: 'scope-resolution' },
        { path: 'scopeCapabilities', semantic: 'scope-resolution' },
        { path: 'scopeAvailability', semantic: 'scope-resolution' },
      ]
    case 'rollback':
      return [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
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
        { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
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
        { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
        { path: 'items', semantic: 'item-collection' },
        { path: 'items.referenceSummary', semantic: 'item-explainable' },
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
        { path: 'error.details.referenceGovernance', semantic: 'reference-governance' },
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
        { path: 'error.details.referenceGovernance', semantic: 'reference-governance' },
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
    consumerProfiles: SCHEMA_CONSUMER_PROFILES,
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
