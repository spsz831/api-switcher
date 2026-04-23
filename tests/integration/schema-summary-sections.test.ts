import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../../src/constants/public-json-schema'
import type { CommandResult } from '../../src/types/command'

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(__dirname, '../..')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')

type CliRunResult = {
  stdout: string
  stderr: string
  exitCode: number
}

let runtimeDir: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-schema-summary-it-'))
  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  await fs.rm(runtimeDir, { recursive: true, force: true })
})

async function runCli(argv: string[]): Promise<CliRunResult> {
  try {
    const result = await execFileAsync(process.execPath, [tsxCliPath, 'src/cli/index.ts', ...argv], {
      cwd: repoRoot,
      env: process.env,
    })

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
    }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number | string | null }
    return {
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
    }
  }
}

function parseJsonResult<T>(stdout: string): CommandResult<T> {
  const payload = JSON.parse(stdout) as CommandResult<T>
  expect(payload.schemaVersion).toBe(PUBLIC_JSON_SCHEMA_VERSION)
  return payload
}

describe('schema summary sections integration', () => {
  it('schema --json 只为五个只读命令暴露 summarySections', async () => {
    const result = await runCli(['schema', '--json'])
    const payload = parseJsonResult<{
      commandCatalog: {
        actions: Array<{
          action: string
          summarySections?: Array<{
            id: string
          }>
        }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')

    const actions = payload.data?.commandCatalog.actions ?? []
    const byAction = (action: string) => actions.find((item) => item.action === action)

    expect(byAction('current')?.summarySections?.map((item) => item.id)).toEqual([
      'platform',
      'reference',
      'executability',
    ])
    expect(byAction('list')?.summarySections?.map((item) => item.id)).toEqual([
      'platform',
      'reference',
      'executability',
    ])
    expect(byAction('validate')?.summarySections?.map((item) => item.id)).toEqual([
      'platform',
      'reference',
      'executability',
    ])
    expect(byAction('export')?.summarySections?.map((item) => item.id)).toEqual([
      'platform',
      'reference',
      'executability',
    ])
    expect(byAction('import')?.summarySections?.map((item) => item.id)).toEqual([
      'source-executability',
      'executability',
      'platform',
    ])

    expect(byAction('preview')?.summarySections).toBeUndefined()
    expect(byAction('use')?.summarySections).toBeUndefined()
    expect(byAction('rollback')?.summarySections).toBeUndefined()
    expect(byAction('import-apply')?.summarySections).toBeUndefined()
    expect(byAction('schema')?.summarySections).toBeUndefined()
  })

  it('schema --json 只为只读 consumer profile 暴露 summarySectionGuidance', async () => {
    const result = await runCli(['schema', '--json'])
    const payload = parseJsonResult<{
      commandCatalog: {
        consumerProfiles?: Array<{
          id: string
          summarySectionGuidance?: Array<{
            id: string
          }>
        }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')

    const consumerProfiles = payload.data?.commandCatalog?.consumerProfiles ?? []
    const byProfile = (id: string) => consumerProfiles.find((item) => item.id === id)

    expect(byProfile('readonly-state-audit')?.summarySectionGuidance?.map((item) => item.id)).toEqual([
      'platform',
      'reference',
      'executability',
    ])
    expect(byProfile('readonly-import-batch')?.summarySectionGuidance?.map((item) => item.id)).toEqual([
      'source-executability',
      'executability',
      'platform',
    ])
    expect(byProfile('single-platform-write')?.summarySectionGuidance).toBeUndefined()
  })

  it('schema --json 只为只读 consumer profile 暴露 followUpHints', async () => {
    const result = await runCli(['schema', '--json'])
    const payload = parseJsonResult<{
      commandCatalog: {
        consumerProfiles?: Array<{
          id: string
          followUpHints?: Array<{
            nextStep: string
          }>
        }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')

    const consumerProfiles = payload.data?.commandCatalog?.consumerProfiles ?? []
    const byProfile = (id: string) => consumerProfiles.find((item) => item.id === id)

    expect(byProfile('readonly-state-audit')?.followUpHints?.map((item) => item.nextStep)).toEqual([
      'inspect-items',
      'review-reference-details',
      'continue-to-write',
    ])
    expect(byProfile('readonly-import-batch')?.followUpHints?.map((item) => item.nextStep)).toEqual([
      'repair-source-input',
      'continue-to-write',
      'group-by-platform',
    ])
    expect(byProfile('single-platform-write')?.followUpHints).toBeUndefined()
  })

  it('schema --json 只为只读 consumer profile 暴露 triageBuckets', async () => {
    const result = await runCli(['schema', '--json'])
    const payload = parseJsonResult<{
      commandCatalog: {
        consumerProfiles?: Array<{
          id: string
          triageBuckets?: Array<{
            id: string
          }>
        }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')

    const consumerProfiles = payload.data?.commandCatalog?.consumerProfiles ?? []
    const byProfile = (id: string) => consumerProfiles.find((item) => item.id === id)

    expect(byProfile('readonly-state-audit')?.triageBuckets?.map((item) => item.id)).toEqual([
      'overview',
      'reference-governance',
      'write-readiness',
    ])
    expect(byProfile('readonly-import-batch')?.triageBuckets?.map((item) => item.id)).toEqual([
      'source-blocked',
      'write-readiness',
      'platform-routing',
    ])
    expect(byProfile('single-platform-write')?.triageBuckets).toBeUndefined()
  })

  it('schema --json 只为只读 consumer profile 暴露 consumerActions', async () => {
    const result = await runCli(['schema', '--json'])
    const payload = parseJsonResult<{
      commandCatalog?: {
        consumerProfiles?: Array<{
          id: string
          consumerActions?: Array<{
            id: string
            use: string
            nextStep: string
          }>
        }>
      }
    }>(result.stdout)

    const consumerProfiles = payload.data?.commandCatalog?.consumerProfiles ?? []
    const byProfile = (id: string) => consumerProfiles.find((item) => item.id === id)

    expect(byProfile('readonly-state-audit')?.consumerActions?.map((item) => item.id)).toEqual([
      'inspect-overview',
      'review-reference-governance',
      'assess-write-readiness',
    ])
    expect(byProfile('readonly-import-batch')?.consumerActions?.map((item) => item.id)).toEqual([
      'repair-source-blockers',
      'assess-import-readiness',
      'route-by-platform',
    ])
    expect(byProfile('readonly-state-audit')?.consumerActions?.map((item) => item.nextStep)).toEqual([
      'inspect-items',
      'review-reference-details',
      'continue-to-write',
    ])
    expect(byProfile('readonly-import-batch')?.consumerActions?.map((item) => item.use)).toEqual([
      'gating',
      'gating',
      'routing',
    ])
    expect(byProfile('single-platform-write')?.consumerActions).toBeUndefined()
  })

  it('schema --json 为只读 consumer profile 暴露稳定的默认 consumer flow', async () => {
    const result = await runCli(['schema', '--json'])
    const payload = parseJsonResult<{
      commandCatalog?: {
        consumerProfiles?: Array<{
          id: string
          defaultConsumerFlowId?: string
          consumerFlow?: Array<{
            id: string
            defaultEntry: boolean
          }>
        }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')

    const consumerProfiles = payload.data?.commandCatalog?.consumerProfiles ?? []
    const byProfile = (id: string) => consumerProfiles.find((item) => item.id === id)

    expect(byProfile('readonly-state-audit')?.defaultConsumerFlowId).toBe('overview-to-items')
    expect(
      byProfile('readonly-state-audit')?.consumerFlow?.filter((item) => item.defaultEntry).map((item) => item.id),
    ).toEqual(['overview-to-items'])
    expect(byProfile('readonly-import-batch')?.defaultConsumerFlowId).toBe('source-to-repair')
    expect(
      byProfile('readonly-import-batch')?.consumerFlow?.filter((item) => item.defaultEntry).map((item) => item.id),
    ).toEqual(['source-to-repair'])
    expect(byProfile('single-platform-write')?.defaultConsumerFlowId).toBeUndefined()
    expect(byProfile('single-platform-write')?.consumerFlow).toBeUndefined()
  })

  it('schema --json 只为只读 consumer profile 暴露最小机器消费模板', async () => {
    const result = await runCli(['schema', '--json'])
    const payload = parseJsonResult<{
      commandCatalog?: {
        consumerProfiles?: Array<{
          id: string
          starterTemplate?: {
            id: string
            summary: {
              fields: string[]
            }
            items: {
              sharedFields: string[]
            }
            failure: {
              fields: string[]
            }
            flow: {
              defaultConsumerFlowId?: string
            }
          }
        }>
      }
    }>(result.stdout)

    const consumerProfiles = payload.data?.commandCatalog?.consumerProfiles ?? []
    const byProfile = (id: string) => consumerProfiles.find((item) => item.id === id)

    expect(byProfile('readonly-state-audit')?.starterTemplate).toEqual({
      id: 'readonly-state-audit-minimal-reader',
      summary: {
        fields: [
          'summary.platformStats',
          'summary.referenceStats',
          'summary.executabilityStats',
          'summary.triageStats',
        ],
      },
      items: {
        sharedFields: [
          'platformSummary',
          'referenceSummary',
        ],
      },
      failure: {
        fields: [
          'error.code',
          'error.message',
        ],
      },
      flow: {
        defaultConsumerFlowId: 'overview-to-items',
      },
    })
    expect(byProfile('readonly-import-batch')?.starterTemplate).toEqual({
      id: 'readonly-import-batch-minimal-reader',
      summary: {
        fields: [
          'summary.sourceExecutability',
          'summary.executabilityStats',
          'summary.platformStats',
          'summary.triageStats',
        ],
      },
      items: {
        sharedFields: [
          'platformSummary',
          'exportedObservation',
          'localObservation',
          'previewDecision',
        ],
      },
      failure: {
        fields: [
          'error.code',
          'error.message',
        ],
      },
      flow: {
        defaultConsumerFlowId: 'source-to-repair',
      },
    })
    expect(byProfile('single-platform-write')?.starterTemplate).toBeUndefined()
  })
})
