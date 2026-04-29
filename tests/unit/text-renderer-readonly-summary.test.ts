import { describe, expect, it } from 'vitest'
import { renderText } from '../../src/renderers/text-renderer'
import type {
  CommandResult,
  CurrentCommandOutput,
  ExportCommandOutput,
  ImportPreviewCommandOutput,
  ListCommandOutput,
  ValidateCommandOutput,
} from '../../src/types/command'

function expectOrderedSections(output: string, sections: string[]): void {
  let previousIndex = -1

  for (const section of sections) {
    const index = output.indexOf(section)
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeGreaterThan(previousIndex)
    previousIndex = index
  }
}

function renderSuccess<T>(action: CommandResult<T>['action'], data: T): string {
  return renderText({
    ok: true,
    action,
    data,
  } as CommandResult<T>)
}

describe('text renderer readonly summary order', () => {
  it('current 输出按共享 section 顺序渲染 summary', () => {
    const output = renderSuccess('current', {
      current: { gemini: 'gemini-prod' },
      detections: [],
      summary: {
        platformStats: [
          {
            platform: 'gemini',
            profileCount: 1,
            managed: true,
          },
        ],
        referenceStats: {
          profileCount: 1,
          referenceProfileCount: 0,
          resolvedReferenceProfileCount: 0,
          missingReferenceProfileCount: 0,
          unsupportedReferenceProfileCount: 0,
          inlineProfileCount: 1,
          writeUnsupportedProfileCount: 0,
          hasReferenceProfiles: false,
          hasResolvedReferenceProfiles: false,
          hasMissingReferenceProfiles: false,
          hasUnsupportedReferenceProfiles: false,
          hasInlineProfiles: true,
          hasWriteUnsupportedProfiles: false,
        },
        warnings: [],
        limitations: [],
      },
    } satisfies CurrentCommandOutput)

    expectOrderedSections(output, ['按平台汇总:', 'referenceStats 摘要:'])
  })

  it('list 输出按共享 section 顺序渲染 summary', () => {
    const output = renderSuccess('list', {
      profiles: [],
      summary: {
        platformStats: [
          {
            platform: 'claude',
            profileCount: 1,
            managed: true,
          },
        ],
        referenceStats: {
          profileCount: 1,
          referenceProfileCount: 1,
          resolvedReferenceProfileCount: 1,
          missingReferenceProfileCount: 0,
          unsupportedReferenceProfileCount: 0,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 0,
          hasReferenceProfiles: true,
          hasResolvedReferenceProfiles: true,
          hasMissingReferenceProfiles: false,
          hasUnsupportedReferenceProfiles: false,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: false,
        },
        warnings: [],
        limitations: [],
      },
    } satisfies ListCommandOutput)

    expectOrderedSections(output, ['按平台汇总:', 'referenceStats 摘要:'])
  })

  it('validate 输出按共享 section 顺序渲染 summary', () => {
    const output = renderSuccess('validate', {
      items: [],
      summary: {
        platformStats: [
          {
            platform: 'codex',
            profileCount: 1,
            okCount: 1,
            warningCount: 0,
            limitationCount: 0,
          },
        ],
        referenceStats: {
          profileCount: 1,
          referenceProfileCount: 0,
          resolvedReferenceProfileCount: 0,
          missingReferenceProfileCount: 0,
          unsupportedReferenceProfileCount: 0,
          inlineProfileCount: 1,
          writeUnsupportedProfileCount: 0,
          hasReferenceProfiles: false,
          hasResolvedReferenceProfiles: false,
          hasMissingReferenceProfiles: false,
          hasUnsupportedReferenceProfiles: false,
          hasInlineProfiles: true,
          hasWriteUnsupportedProfiles: false,
        },
        warnings: [],
        limitations: [],
      },
    } satisfies ValidateCommandOutput)

    expectOrderedSections(output, ['按平台汇总:', 'referenceStats 摘要:'])
  })

  it('export 输出按共享 section 顺序渲染 summary', () => {
    const output = renderSuccess('export', {
      profiles: [],
      summary: {
        platformStats: [
          {
            platform: 'gemini',
            profileCount: 1,
            okCount: 1,
            warningCount: 0,
            limitationCount: 0,
          },
        ],
        referenceStats: {
          profileCount: 1,
          referenceProfileCount: 0,
          resolvedReferenceProfileCount: 0,
          missingReferenceProfileCount: 0,
          unsupportedReferenceProfileCount: 0,
          inlineProfileCount: 1,
          writeUnsupportedProfileCount: 0,
          hasReferenceProfiles: false,
          hasResolvedReferenceProfiles: false,
          hasMissingReferenceProfiles: false,
          hasUnsupportedReferenceProfiles: false,
          hasInlineProfiles: true,
          hasWriteUnsupportedProfiles: false,
        },
        warnings: [],
        limitations: [],
      },
    } satisfies ExportCommandOutput)

    expectOrderedSections(output, ['按平台汇总:', 'referenceStats 摘要:'])
  })

  it('import preview 仍通过共享 section 渲染平台汇总', () => {
    const output = renderSuccess('import', {
      sourceFile: 'E:/tmp/import.json',
      sourceCompatibility: {
        mode: 'strict',
        warnings: [],
      },
      items: [],
      summary: {
        totalItems: 1,
        matchCount: 1,
        mismatchCount: 0,
        partialCount: 0,
        insufficientDataCount: 0,
        sourceExecutability: {
          totalItems: 1,
          applyReadyCount: 1,
          previewOnlyCount: 0,
          blockedCount: 0,
          blockedByCodeStats: [
            {
              code: 'REDACTED_INLINE_SECRET',
              totalCount: 0,
            },
          ],
        },
        platformStats: [
          {
            platform: 'gemini',
            totalItems: 1,
            matchCount: 1,
            mismatchCount: 0,
            partialCount: 0,
            insufficientDataCount: 0,
          },
        ],
        decisionCodeStats: [],
        driftKindStats: [],
        warnings: [],
        limitations: [],
      },
    } as unknown as ImportPreviewCommandOutput)

    expect(output).toContain('按平台汇总:')
  })
})
