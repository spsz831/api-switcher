import { buildProfileReferenceSummary } from '../domain/secret-inspection'
import type { ImportPreviewItem, ReadonlyTriageStats } from '../types/command'
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
