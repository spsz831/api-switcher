import type {
  SchemaConsumerProfileSummarySectionGuidance,
  SchemaSummarySection,
} from '../types/command'

export type ReadonlySummarySectionAction = 'current' | 'list' | 'validate' | 'export' | 'import'

const CURRENT_LIST_VALIDATE_EXPORT_SUMMARY_SECTIONS: SchemaSummarySection[] = [
  {
    id: 'platform',
    title: 'Platform summary',
    priority: 1,
    fields: ['summary.platformStats'],
    purpose: '先看平台级聚合，快速判断结果覆盖了哪些平台以及各平台状态分布。',
    recommendedWhen: ['cross-platform overview', 'top-level health check'],
  },
  {
    id: 'reference',
    title: 'Reference summary',
    priority: 2,
    fields: ['summary.referenceStats'],
    purpose: '看 secret/reference 解析形态，判断是否存在未解析 env、受支持但不写入、或不支持 scheme 的输入。',
    recommendedWhen: ['secret governance', 'reference resolution review'],
  },
  {
    id: 'executability',
    title: 'Executability summary',
    priority: 3,
    fields: ['summary.executabilityStats'],
    purpose: '看后续若进入写入命令时是否具备可执行条件，用于区分可继续处理和需人工修复的项。',
    recommendedWhen: ['pre-write readiness', 'apply/use readiness check'],
  },
]

const IMPORT_SUMMARY_SECTIONS: SchemaSummarySection[] = [
  {
    id: 'source-executability',
    title: 'Source executability summary',
    priority: 1,
    fields: ['summary.sourceExecutability'],
    purpose: '先看导入源本身是否还能继续进入 apply，用于识别 redacted inline secret 等源侧阻塞。',
    recommendedWhen: ['import source triage', 'apply eligibility from source data'],
  },
  {
    id: 'executability',
    title: 'Executability summary',
    priority: 2,
    fields: ['summary.executabilityStats'],
    purpose: '再看目标平台侧是否具备写入可执行条件，用于区分可继续 apply 和需本地修复的项。',
    recommendedWhen: ['pre-apply readiness', 'target-side write readiness'],
  },
  {
    id: 'platform',
    title: 'Platform summary',
    priority: 3,
    fields: ['summary.platformStats'],
    purpose: '最后看 mixed-batch 在各平台上的分布，便于按平台分批处理。',
    recommendedWhen: ['mixed-batch routing', 'platform-level distribution review'],
  },
]

export function getReadonlySummarySections(action: ReadonlySummarySectionAction): SchemaSummarySection[] {
  switch (action) {
    case 'current':
    case 'list':
    case 'validate':
    case 'export':
      return CURRENT_LIST_VALIDATE_EXPORT_SUMMARY_SECTIONS
    case 'import':
      return IMPORT_SUMMARY_SECTIONS
  }
}

export function getReadonlyConsumerProfileSummarySectionGuidance(
  profileId: 'readonly-state-audit' | 'readonly-import-batch',
): SchemaConsumerProfileSummarySectionGuidance[] {
  switch (profileId) {
    case 'readonly-state-audit':
      return CURRENT_LIST_VALIDATE_EXPORT_SUMMARY_SECTIONS.map((section) => ({
        id: section.id,
        title: section.title,
        priority: section.priority,
        fields: section.fields,
        purpose: section.purpose,
        recommendedUses: section.id === 'platform'
          ? ['overview']
          : section.id === 'reference'
            ? ['governance']
            : ['gating'],
      }))
    case 'readonly-import-batch':
      return IMPORT_SUMMARY_SECTIONS.map((section) => ({
        id: section.id,
        title: section.title,
        priority: section.priority,
        fields: section.fields,
        purpose: section.purpose,
        recommendedUses: section.id === 'platform'
          ? ['routing', 'overview']
          : ['gating'],
      }))
  }
}
