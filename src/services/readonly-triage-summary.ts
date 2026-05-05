import { buildProfileReferenceSummary } from '../domain/secret-inspection'
import type { AuditSummary, ExecutabilityStats, ImportPreviewItem, OverlaySummary, ReadonlyTriageStats, SecretReferenceStats } from '../types/command'
import type { Profile } from '../types/profile'
import type { ImportedProfileSource } from './import-source.service'

function hasReferenceGovernanceSignal(profile: Profile): boolean {
  return buildProfileReferenceSummary(profile) !== undefined
}

function hasWriteReadinessSignal(profile: Profile): boolean {
  const summary = buildProfileReferenceSummary(profile)
  if (!summary) {
    return false
  }

  return summary.writeUnsupported
    || summary.missingReferenceCount > 0
    || summary.missingValueCount > 0
    || summary.unsupportedReferenceCount > 0
}

export function buildReadonlyStateAuditTriageStats(profiles: Profile[]): ReadonlyTriageStats {
  return {
    totalItems: profiles.length,
    buckets: [
      {
        id: 'overview',
        title: 'Overview bucket',
        totalCount: profiles.length,
        summaryFields: ['summary.platformStats'],
        itemFields: ['platformSummary'],
        recommendedNextStep: 'inspect-items',
      },
      {
        id: 'reference-governance',
        title: 'Reference governance bucket',
        totalCount: profiles.filter(hasReferenceGovernanceSignal).length,
        summaryFields: ['summary.referenceStats'],
        itemFields: ['detections.referenceSummary', 'profiles.referenceSummary'],
        recommendedNextStep: 'review-reference-details',
      },
      {
        id: 'write-readiness',
        title: 'Write readiness bucket',
        totalCount: profiles.filter(hasWriteReadinessSignal).length,
        summaryFields: ['summary.executabilityStats'],
        itemFields: ['detections.referenceSummary', 'profiles.referenceSummary'],
        recommendedNextStep: 'continue-to-write',
      },
    ],
  }
}

export function buildAuditSummary(input: {
  totalProfiles: number
  platformCount: number
  referenceStats?: SecretReferenceStats
  executabilityStats?: ExecutabilityStats
  highRiskItemCount?: number
  recommendedNextStep?: AuditSummary['recommendedNextStep']
}): AuditSummary {
  const hasHighRiskItems = (input.highRiskItemCount ?? 0) > 0

  return {
    totalProfiles: input.totalProfiles,
    platformCount: input.platformCount,
    hasReferenceProfiles: input.referenceStats?.hasReferenceProfiles ?? false,
    hasInlineSecrets: input.referenceStats?.hasInlineProfiles ?? false,
    hasWriteUnsupportedProfiles: input.referenceStats?.hasWriteUnsupportedProfiles
      ?? input.executabilityStats?.hasWriteUnsupportedProfiles
      ?? false,
    hasHighRiskItems,
    recommendedNextStep: input.recommendedNextStep ?? inferRecommendedNextStep({
      referenceStats: input.referenceStats,
      executabilityStats: input.executabilityStats,
      hasHighRiskItems,
      platformCount: input.platformCount,
    }),
  }
}

export function buildEmptyOverlaySummary(): OverlaySummary {
  return {
    hasOverlayLayer: false,
    overlayItemCount: 0,
    overlayKinds: [],
    preservedKeys: [],
    runtimeOnlyKeys: [],
    notes: ['overlaySummary is a read-only scaffold; overlay mutation commands are not implemented.'],
  }
}

function inferRecommendedNextStep(input: {
  referenceStats?: SecretReferenceStats
  executabilityStats?: ExecutabilityStats
  hasHighRiskItems: boolean
  platformCount: number
}): AuditSummary['recommendedNextStep'] {
  if (
    input.referenceStats?.hasMissingReferenceProfiles
    || input.referenceStats?.hasUnsupportedReferenceProfiles
    || input.executabilityStats?.hasReferenceMissingProfiles
    || input.executabilityStats?.hasSourceRedactedProfiles
  ) {
    return 'repair-input'
  }

  if (input.referenceStats?.hasReferenceProfiles || input.referenceStats?.hasWriteUnsupportedProfiles) {
    return 'review-reference-details'
  }

  if (input.hasHighRiskItems) {
    return 'inspect-overview'
  }

  if (input.platformCount > 1) {
    return 'group-by-platform'
  }

  if (input.executabilityStats?.hasInlineReadyProfiles || input.executabilityStats?.hasReferenceReadyProfiles) {
    return 'continue-to-write'
  }

  return 'inspect-overview'
}

export function buildReadonlyImportTriageStats(
  items: ImportPreviewItem[],
  sourceProfiles: ImportedProfileSource[],
): ReadonlyTriageStats {
  return {
    totalItems: items.length,
    buckets: [
      {
        id: 'source-blocked',
        title: 'Source blocked bucket',
        totalCount: sourceProfiles.filter((item) => (item.redactedInlineSecretFields?.length ?? 0) > 0).length,
        summaryFields: ['summary.sourceExecutability'],
        itemFields: ['sourceCompatibility', 'items.previewDecision'],
        recommendedNextStep: 'repair-source-input',
      },
      {
        id: 'write-readiness',
        title: 'Write readiness bucket',
        totalCount: items.filter((item) => !item.previewDecision.canProceedToApplyDesign).length,
        summaryFields: ['summary.executabilityStats'],
        itemFields: ['items.previewDecision', 'items.fidelity'],
        recommendedNextStep: 'continue-to-write',
      },
      {
        id: 'platform-routing',
        title: 'Platform routing bucket',
        totalCount: items.length,
        summaryFields: ['summary.platformStats'],
        itemFields: ['platformSummary'],
        recommendedNextStep: 'group-by-platform',
      },
    ],
  }
}
