import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProfilesStore } from '../../src/stores/profiles.store'
import { StateStore } from '../../src/stores/state.store'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../../src/constants/public-json-schema'
import type { CommandResult, SchemaActionCapability } from '../../src/types/command'
import type { Profile } from '../../src/types/profile'
import { validateSchema, type JsonSchema } from '../helpers/public-json-schema'

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(__dirname, '../..')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const publicJsonSchemaPath = path.join(repoRoot, 'docs', 'public-json-output.schema.json')

type CliRunResult = {
  stdout: string
  stderr: string
  exitCode: number
}

type ScopeCapabilityContract = {
  scope: string
  detect: boolean
  preview: boolean
  use: boolean
  rollback: boolean
  writable: boolean
  risk?: 'normal' | 'high'
  confirmationRequired?: boolean
  note?: string
}

type ScopeAvailabilityContract = {
  scope: string
  status: 'available' | 'unresolved' | 'blocked'
  detected: boolean
  writable: boolean
  path?: string
  reasonCode?: string
  reason?: string
  remediation?: string
}

let runtimeDir: string
let claudeProjectRoot: string
let claudeUserSettingsPath: string
let claudeProjectSettingsPath: string
let claudeLocalSettingsPath: string
let codexConfigPath: string
let codexAuthPath: string
let geminiSettingsPath: string
let geminiProjectRoot: string
let geminiProjectSettingsPath: string

beforeEach(async () => {
  runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-cli-it-'))
  claudeProjectRoot = path.join(runtimeDir, 'workspace')
  claudeUserSettingsPath = path.join(runtimeDir, 'claude-user-settings.json')
  claudeProjectSettingsPath = path.join(claudeProjectRoot, '.claude', 'settings.json')
  claudeLocalSettingsPath = path.join(claudeProjectRoot, '.claude', 'settings.local.json')
  codexConfigPath = path.join(runtimeDir, 'config.toml')
  codexAuthPath = path.join(runtimeDir, 'auth.json')
  geminiSettingsPath = path.join(runtimeDir, 'gemini-settings.json')
  geminiProjectRoot = path.join(runtimeDir, 'gemini-workspace')
  geminiProjectSettingsPath = path.join(geminiProjectRoot, '.gemini', 'settings.json')

  process.env.API_SWITCHER_RUNTIME_DIR = runtimeDir
  process.env.API_SWITCHER_CLAUDE_PROJECT_ROOT = claudeProjectRoot
  process.env.API_SWITCHER_CLAUDE_USER_SETTINGS_PATH = claudeUserSettingsPath
  process.env.API_SWITCHER_CLAUDE_PROJECT_SETTINGS_PATH = claudeProjectSettingsPath
  process.env.API_SWITCHER_CLAUDE_LOCAL_SETTINGS_PATH = claudeLocalSettingsPath
  process.env.API_SWITCHER_CLAUDE_TARGET_SCOPE = 'project'
  process.env.API_SWITCHER_CODEX_CONFIG_PATH = codexConfigPath
  process.env.API_SWITCHER_CODEX_AUTH_PATH = codexAuthPath
  process.env.API_SWITCHER_GEMINI_SETTINGS_PATH = geminiSettingsPath
  process.env.API_SWITCHER_GEMINI_PROJECT_ROOT = geminiProjectRoot

  const profilesStore = new ProfilesStore()
  await profilesStore.write({
    version: 1,
    profiles: [
      {
        id: 'claude-prod',
        name: 'claude-prod',
        platform: 'claude',
        source: { token: 'sk-live-123456', baseURL: 'https://gateway.example.com/api' },
        apply: {
          ANTHROPIC_AUTH_TOKEN: 'sk-live-123456',
          ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
        },
      },
      {
        id: 'codex-prod',
        name: 'codex-prod',
        platform: 'codex',
        source: { apiKey: 'sk-codex-live-123456', baseURL: 'https://gateway.example.com/openai/v1' },
        apply: {
          OPENAI_API_KEY: 'sk-codex-live-123456',
          base_url: 'https://gateway.example.com/openai/v1',
        },
      },
      {
        id: 'gemini-prod',
        name: 'gemini-prod',
        platform: 'gemini',
        source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
        apply: {
          GEMINI_API_KEY: 'gm-live-123456',
          enforcedAuthType: 'gemini-api-key',
        },
      },
      {
        id: 'gemini-invalid',
        name: 'gemini-invalid',
        platform: 'gemini',
        source: { authType: 'oauth-personal' },
        apply: {
          enforcedAuthType: 'oauth-personal',
        },
      },
    ],
  })

  await fs.mkdir(path.dirname(claudeProjectSettingsPath), { recursive: true })
  await fs.writeFile(
    claudeProjectSettingsPath,
    JSON.stringify({ theme: 'dark', ANTHROPIC_AUTH_TOKEN: 'sk-old-000', ANTHROPIC_BASE_URL: 'https://old.example.com/api' }, null, 2),
    'utf8',
  )
  await fs.writeFile(codexConfigPath, 'default_provider = "openai"\nbase_url = "https://old.example.com/v1"\n', 'utf8')
  await fs.writeFile(codexAuthPath, JSON.stringify({ OPENAI_API_KEY: 'sk-old-000', user_id: 'u-1' }, null, 2), 'utf8')
  await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'oauth-personal' }, null, 2), 'utf8')
  await fs.mkdir(path.dirname(geminiProjectSettingsPath), { recursive: true })
  await fs.writeFile(geminiProjectSettingsPath, JSON.stringify({ projectOnly: true }, null, 2), 'utf8')
})

afterEach(async () => {
  delete process.env.API_SWITCHER_RUNTIME_DIR
  delete process.env.API_SWITCHER_CLAUDE_PROJECT_ROOT
  delete process.env.API_SWITCHER_CLAUDE_USER_SETTINGS_PATH
  delete process.env.API_SWITCHER_CLAUDE_PROJECT_SETTINGS_PATH
  delete process.env.API_SWITCHER_CLAUDE_LOCAL_SETTINGS_PATH
  delete process.env.API_SWITCHER_CLAUDE_TARGET_SCOPE
  delete process.env.API_SWITCHER_CLAUDE_SETTINGS_PATH
  delete process.env.API_SWITCHER_CODEX_CONFIG_PATH
  delete process.env.API_SWITCHER_CODEX_AUTH_PATH
  delete process.env.API_SWITCHER_GEMINI_SETTINGS_PATH
  delete process.env.API_SWITCHER_GEMINI_PROJECT_ROOT

  await fs.rm(runtimeDir, { recursive: true, force: true })
})

async function runCli(argv: string[], envOverrides: NodeJS.ProcessEnv = {}): Promise<CliRunResult> {
  const env = {
    ...process.env,
    API_SWITCHER_RUNTIME_DIR: runtimeDir,
    API_SWITCHER_CLAUDE_PROJECT_ROOT: claudeProjectRoot,
    API_SWITCHER_CLAUDE_USER_SETTINGS_PATH: claudeUserSettingsPath,
    API_SWITCHER_CLAUDE_PROJECT_SETTINGS_PATH: claudeProjectSettingsPath,
    API_SWITCHER_CLAUDE_LOCAL_SETTINGS_PATH: claudeLocalSettingsPath,
    API_SWITCHER_CLAUDE_TARGET_SCOPE: 'project',
    API_SWITCHER_CODEX_CONFIG_PATH: codexConfigPath,
    API_SWITCHER_CODEX_AUTH_PATH: codexAuthPath,
    API_SWITCHER_GEMINI_SETTINGS_PATH: geminiSettingsPath,
    API_SWITCHER_GEMINI_PROJECT_ROOT: geminiProjectRoot,
    ...envOverrides,
  }

  try {
    const result = await execFileAsync(process.execPath, [tsxCliPath, 'src/cli/index.ts', ...argv], {
      cwd: repoRoot,
      env,
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

function parseJsonResult<T = unknown>(stdout: string): CommandResult<T> {
  const payload = JSON.parse(stdout) as CommandResult<T>
  expect(payload.schemaVersion).toBe(PUBLIC_JSON_SCHEMA_VERSION)
  return payload
}

function validatePayloadAgainstPublicSchema(schema: JsonSchema, payload: unknown): boolean {
  return validateSchema(schema, payload, schema)
}

async function writeImportSourceFile(
  filePath: string,
  profiles: Array<Record<string, unknown>>,
): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify({
    schemaVersion: PUBLIC_JSON_SCHEMA_VERSION,
    ok: true,
    action: 'export',
    data: {
      profiles,
      summary: {
        warnings: [],
        limitations: [],
      },
    },
  }, null, 2), 'utf8')
}

describe('cli top-level contracts integration', () => {
  const PUBLIC_SCHEMA_CONTRACT_TIMEOUT_MS = 20_000

  it('鏍稿績鍛戒护 --json 鎴愬姛杈撳嚭鍙 public JSON schema 鏍￠獙', async () => {
    const staticSchema = JSON.parse(await fs.readFile(publicJsonSchemaPath, 'utf8')) as JsonSchema
    await new StateStore().markCurrent('gemini', 'gemini-prod', 'snapshot-gemini-001')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const schemaResult = await runCli(['schema', '--json'])
    const currentResult = await runCli(['current', '--json'])
    const listResult = await runCli(['list', '--json'])
    const previewResult = await runCli(['preview', 'gemini-prod', '--scope', 'project', '--json'])
    const useResult = await runCli(['use', 'codex-prod', '--force', '--json'])

    expect(schemaResult.exitCode).toBe(0)
    expect(currentResult.exitCode).toBe(0)
    expect(listResult.exitCode).toBe(0)
    expect(previewResult.exitCode).toBe(0)
    expect(useResult.exitCode).toBe(0)

    const usePayload = parseJsonResult<{ backupId?: string }>(useResult.stdout)
    expect(usePayload.data?.backupId).toBeTruthy()

    await fs.writeFile(codexConfigPath, 'default_provider = "other"\n', 'utf8')
    await fs.writeFile(codexAuthPath, JSON.stringify({ OPENAI_API_KEY: 'sk-other' }, null, 2), 'utf8')

    const rollbackResult = await runCli(['rollback', usePayload.data!.backupId!, '--json'])
    expect(rollbackResult.exitCode).toBe(0)

    const payloads = [
      parseJsonResult(schemaResult.stdout),
      parseJsonResult(currentResult.stdout),
      parseJsonResult(listResult.stdout),
      parseJsonResult(previewResult.stdout),
      usePayload,
      parseJsonResult(rollbackResult.stdout),
    ]

    for (const payload of payloads) {
      expect(validatePayloadAgainstPublicSchema(staticSchema, payload)).toBe(true)
    }
  }, PUBLIC_SCHEMA_CONTRACT_TIMEOUT_MS)

  it('绗簩鎵瑰懡浠?--json 鎴愬姛杈撳嚭鍙 public JSON schema 鏍￠獙', async () => {
    const staticSchema = JSON.parse(await fs.readFile(publicJsonSchemaPath, 'utf8')) as JsonSchema
    const importFile = path.join(runtimeDir, 'schema-validation-import-source.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'codex-prod',
          name: 'codex-prod',
          platform: 'codex',
          source: { apiKey: 'sk-codex-live-123456', baseURL: 'https://gateway.example.com/openai/v1' },
          apply: {
            OPENAI_API_KEY: 'sk-codex-live-123456',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
      },
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
        scopeAvailability: [
          { scope: 'user', status: 'available', detected: true, writable: true, path: geminiSettingsPath },
          { scope: 'project', status: 'available', detected: true, writable: true, path: geminiProjectSettingsPath },
        ],
      },
    ])

    const validateResult = await runCli(['validate', 'gemini-prod', '--json'])
    const exportResult = await runCli(['export', '--json'])
    const importPreviewResult = await runCli(['import', importFile, '--json'])
    const importApplyResult = await runCli(['import', 'apply', importFile, '--profile', 'codex-prod', '--force', '--json'])

    expect(validateResult.exitCode).toBe(0)
    expect(exportResult.exitCode).toBe(0)
    expect(importPreviewResult.exitCode).toBe(0)
    expect(importApplyResult.exitCode).toBe(0)

    const payloads = [
      { name: 'validate', payload: parseJsonResult(validateResult.stdout) },
      { name: 'export', payload: parseJsonResult(exportResult.stdout) },
      { name: 'import-preview', payload: parseJsonResult(importPreviewResult.stdout) },
      { name: 'import-apply', payload: parseJsonResult(importApplyResult.stdout) },
    ]

    for (const item of payloads) {
      expect(validatePayloadAgainstPublicSchema(staticSchema, item.payload), item.name).toBe(true)
    }
  }, PUBLIC_SCHEMA_CONTRACT_TIMEOUT_MS)

  it('缁熶竴澶辫触 envelope --json 杈撳嚭鍙 public JSON schema 鏍￠獙', async () => {
    const staticSchema = JSON.parse(await fs.readFile(publicJsonSchemaPath, 'utf8')) as JsonSchema
    const missingImportFile = path.join(runtimeDir, 'missing-import-for-schema-check.json')

    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'openai-prod',
          name: 'openai-prod',
          platform: 'openai' as Profile['platform'],
          source: { apiKey: 'sk-openai-123456' },
          apply: { OPENAI_API_KEY: 'sk-openai-123456' },
        },
      ],
    })

    const exportFailureResult = await runCli(['export', '--json'])

    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'claude-prod',
          name: 'claude-prod',
          platform: 'claude',
          source: { token: 'sk-live-123456', baseURL: 'https://gateway.example.com/api' },
          apply: {
            ANTHROPIC_AUTH_TOKEN: 'sk-live-123456',
            ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
          },
        },
        {
          id: 'codex-prod',
          name: 'codex-prod',
          platform: 'codex',
          source: { apiKey: 'sk-codex-live-123456', baseURL: 'https://gateway.example.com/openai/v1' },
          apply: {
            OPENAI_API_KEY: 'sk-codex-live-123456',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
        {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: {
            GEMINI_API_KEY: 'gm-live-123456',
            enforcedAuthType: 'gemini-api-key',
          },
        },
        {
          id: 'gemini-invalid',
          name: 'gemini-invalid',
          platform: 'gemini',
          source: { authType: 'oauth-personal' },
          apply: {
            enforcedAuthType: 'oauth-personal',
          },
        },
      ],
    })

    const validateFailureResult = await runCli(['validate', 'missing-profile', '--json'])
    const importFailureResult = await runCli(['import', missingImportFile, '--json'])
    const importApplyFailureFile = path.join(runtimeDir, 'import-apply-failure-source.json')
    await writeImportSourceFile(importApplyFailureFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])
    const importApplyFailureResult = await runCli(['import', 'apply', importApplyFailureFile, '--profile', 'gemini-prod', '--json'])

    expect(exportFailureResult.exitCode).toBe(1)
    expect(validateFailureResult.exitCode).toBe(1)
    expect(importFailureResult.exitCode).toBe(1)
    expect(importApplyFailureResult.exitCode).toBe(1)

    const payloads = [
      parseJsonResult(exportFailureResult.stdout),
      parseJsonResult(validateFailureResult.stdout),
      parseJsonResult(importFailureResult.stdout),
      parseJsonResult(importApplyFailureResult.stdout),
    ]

    for (const payload of payloads) {
      expect(payload.ok).toBe(false)
      expect(validatePayloadAgainstPublicSchema(staticSchema, payload)).toBe(true)
    }
  }, PUBLIC_SCHEMA_CONTRACT_TIMEOUT_MS)

  it('schema --json 输出当前 public JSON schema 与版本', async () => {
    const result = await runCli(['schema', '--json'])
    const staticSchema = JSON.parse(await fs.readFile(publicJsonSchemaPath, 'utf8')) as {
      $schema: string
      $id: string
      $defs?: Record<string, unknown>
    }
    const payload = parseJsonResult<{
      schemaVersion: string
      schemaId: string
      commandCatalog: {
        recommendedActions?: Array<{
          code: string
          title: string
          family: string
          availability: string[]
          purpose: string
        }>
        consumerProfiles?: Array<{
          id: string
          title: string
          appliesToActions: string[]
          exampleActions: string[]
          bestEntryAction: string
          sharedSummaryFields: string[]
          sharedItemFields: string[]
          sharedFailureFields: string[]
          optionalScopeFields: string[]
          optionalItemFields: string[]
          optionalFailureFields: string[]
          optionalArtifactFields: string[]
          recommendedStages: string[]
          summarySectionGuidance?: Array<{
            id: string
            title: string
            priority: number
            fields: string[]
            purpose: string
            recommendedUses: string[]
          }>
          followUpHints?: Array<{
            use: string
            nextStep: string
            primaryFields: string[]
            purpose: string
          }>
          defaultConsumerFlowId?: string
          triageBuckets?: Array<{
            id: string
            title: string
            summaryFields: string[]
            itemFields?: string[]
            purpose: string
            recommendedNextStep: string
          }>
          consumerActions?: Array<{
            id: string
            title: string
            priority: number
            use: string
            appliesWhen: string
            triggerFields: string[]
            summarySectionIds: string[]
            triageBucketIds?: string[]
            nextStep: string
            primaryFields: string[]
            purpose: string
          }>
          consumerFlow?: Array<{
            id: string
            title: string
            priority: number
            defaultEntry: boolean
            defaultOnBucket: boolean
            selectionReason: string
            summarySectionIds: string[]
            triageBucketIds?: string[]
            readFields: string[]
            consumerActionId: string
            nextStep: string
            purpose: string
          }>
        }>
        actions: Array<{
          action: string
          hasPlatformSummary: boolean
          hasPlatformStats: boolean
          hasScopeCapabilities: boolean
          hasScopeAvailability: boolean
          hasScopePolicy: boolean
          consumerProfileIds?: string[]
          primaryFields: string[]
          primaryErrorFields: string[]
          failureCodes: Array<{
            code: string
            priority: number
            category: string
            recommendedHandling: string
            appliesWhen: string
            triggerFields: string[]
          }>
          fieldPresence: Array<{
            path: string
            channel: string
            presence: string
            conditionCode?: string
          }>
          fieldSources: Array<{
            path: string
            channel: string
            source: string
          }>
          fieldStability: Array<{
            path: string
            channel: string
            stabilityTier: string
          }>
          readOrderGroups: {
            success: Array<{
              stage: string
              fields: string[]
            }>
            failure: Array<{
              stage: string
              fields: string[]
            }>
          }
          summarySections?: Array<{
            id: string
            title: string
            priority: number
            fields: string[]
            purpose: string
            recommendedWhen?: string[]
          }>
          primaryFieldSemantics: Array<{ path: string; semantic: string }>
          primaryErrorFieldSemantics: Array<{ path: string; semantic: string }>
        }>
      }
      schema: {
        $schema: string
        $id: string
        $defs?: Record<string, unknown>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.schemaVersion).toBe(PUBLIC_JSON_SCHEMA_VERSION)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')
    expect(payload.data?.schemaVersion).toBe(PUBLIC_JSON_SCHEMA_VERSION)
    expect(payload.data?.schemaId).toBe('https://api-switcher.local/schemas/public-json-output.schema.json')
    const actions = payload.data?.commandCatalog.actions ?? []
    const recommendedActions = payload.data?.commandCatalog.recommendedActions ?? []
    const consumerProfiles = payload.data?.commandCatalog.consumerProfiles ?? []
    const addAction = actions.find((action) => action.action === 'add')
    const currentAction = actions.find((action) => action.action === 'current')
    const exportAction = actions.find((action) => action.action === 'export')
    const listAction = actions.find((action) => action.action === 'list')
    const importAction = actions.find((action) => action.action === 'import')
    const importApplyAction = actions.find((action) => action.action === 'import-apply')
    const previewAction = actions.find((action) => action.action === 'preview')
    const rollbackAction = actions.find((action) => action.action === 'rollback')
    const schemaAction = actions.find((action) => action.action === 'schema')
    const useAction = actions.find((action) => action.action === 'use')
    const validateAction = actions.find((action) => action.action === 'validate')

    expect(recommendedActions.map((item) => item.code)).toEqual([
      'inspect-items',
      'review-reference-details',
      'repair-source-input',
      'group-by-platform',
      'continue-to-write',
      'fix-input-and-retry',
      'select-existing-resource',
      'resolve-scope-before-retry',
      'confirm-before-write',
      'check-platform-support',
      'inspect-runtime-details',
      'check-import-source',
      'fix-reference-input',
      'resolve-reference-support',
      'migrate-inline-secret',
    ])
    expect(recommendedActions.find((item) => item.code === 'continue-to-write')).toEqual({
      code: 'continue-to-write',
      title: 'Continue to write',
      family: 'execute',
      availability: ['readonly'],
      purpose: '在只读分析确认条件满足后，继续进入后续写入链路。',
    })
    expect(recommendedActions.find((item) => item.code === 'resolve-scope-before-retry')).toEqual({
      code: 'resolve-scope-before-retry',
      title: 'Resolve scope before retry',
      family: 'repair',
      availability: ['failure'],
      purpose: '先修复或切换 scope 相关条件，再重新执行命令。',
    })

    expect(consumerProfiles).toEqual([
      {
        id: 'readonly-state-audit',
        title: 'Readonly state audit',
        appliesToActions: ['current', 'list', 'validate', 'export'],
        exampleActions: ['current', 'export'],
        bestEntryAction: 'current',
        defaultConsumerActionId: 'inspect-overview',
        defaultCommandExample: 'api-switcher current --json',
        defaultCommandPurpose: '先读取当前状态与平台级聚合，再决定是否进入 list / validate / export。',
        sharedSummaryFields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'summary.triageStats'],
        sharedItemFields: ['platformSummary'],
        sharedFailureFields: ['error.code', 'error.message'],
        optionalScopeFields: ['scopeCapabilities', 'scopeAvailability', 'defaultWriteScope', 'observedAt'],
        optionalItemFields: ['referenceSummary', 'secretExportSummary', 'currentScope'],
        optionalFailureFields: [],
        optionalArtifactFields: [],
        recommendedStages: ['summary', 'items', 'detail'],
        summarySectionGuidance: [
          {
            id: 'platform',
            title: 'Platform summary',
            priority: 1,
            fields: ['summary.platformStats'],
            purpose: '先看平台级聚合，快速判断结果覆盖了哪些平台以及各平台状态分布。',
            recommendedUses: ['overview'],
          },
          {
            id: 'reference',
            title: 'Reference summary',
            priority: 2,
            fields: ['summary.referenceStats'],
            purpose: '看 secret/reference 解析形态，判断是否存在未解析 env、受支持但不写入、或不支持 scheme 的输入。',
            recommendedUses: ['governance'],
          },
          {
            id: 'executability',
            title: 'Executability summary',
            priority: 3,
            fields: ['summary.executabilityStats'],
            purpose: '看后续若进入写入命令时是否具备可执行条件，用于区分可继续处理和需人工修复的项。',
            recommendedUses: ['gating'],
          },
        ],
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
        defaultConsumerFlowId: 'overview-to-items',
        triageBuckets: [
          {
            id: 'overview',
            title: 'Overview bucket',
            summaryFields: ['summary.platformStats'],
            itemFields: ['platformSummary'],
            purpose: '先做平台级总览，判断当前批次覆盖了哪些平台、每个平台大致状态如何。',
            recommendedNextStep: 'inspect-items',
          },
          {
            id: 'reference-governance',
            title: 'Reference governance bucket',
            summaryFields: ['summary.referenceStats'],
            itemFields: ['detections.referenceSummary', 'profiles.referenceSummary'],
            purpose: '把 reference / inline / unsupported-scheme / missing-value 这类 secret 治理问题归到同一桶里处理。',
            recommendedNextStep: 'review-reference-details',
          },
          {
            id: 'write-readiness',
            title: 'Write readiness bucket',
            summaryFields: ['summary.executabilityStats'],
            itemFields: ['detections.referenceSummary', 'profiles.referenceSummary'],
            purpose: '把是否还能继续进入 use/import apply 的信号归到同一桶里，先判断 readiness 再决定是否继续写入。',
            recommendedNextStep: 'continue-to-write',
          },
        ],
        consumerActions: [
          {
            id: 'inspect-overview',
            title: 'Inspect overview',
            priority: 1,
            use: 'overview',
            appliesWhen: '当只读结果需要先做平台级总览，并确认哪些条目值得继续展开时优先使用。',
            triggerFields: ['summary.platformStats', 'summary.triageStats'],
            summarySectionIds: ['platform'],
            triageBucketIds: ['overview'],
            nextStep: 'inspect-items',
            primaryFields: ['summary.platformStats', 'detections', 'platformSummary'],
            purpose: '先看平台概览，再展开 detection 或 profile 明细，确认具体命中与平台 explainable。',
          },
          {
            id: 'review-reference-governance',
            title: 'Review reference governance',
            priority: 2,
            use: 'governance',
            appliesWhen: '当 summary 暴露出 reference、inline secret 或 unsupported-scheme 治理信号时优先使用。',
            triggerFields: ['summary.referenceStats', 'summary.triageStats', 'detections.referenceSummary', 'profiles.referenceSummary'],
            summarySectionIds: ['reference'],
            triageBucketIds: ['reference-governance'],
            nextStep: 'review-reference-details',
            primaryFields: ['summary.referenceStats', 'detections.referenceSummary', 'profiles.referenceSummary'],
            purpose: '当 summary 暴露出 reference 治理信号时，继续展开 item 级 reference explainable。',
          },
          {
            id: 'assess-write-readiness',
            title: 'Assess write readiness',
            priority: 3,
            use: 'gating',
            appliesWhen: '当只读分析需要决定是否继续进入 use 或 import apply 等写入链路时优先使用。',
            triggerFields: ['summary.executabilityStats', 'summary.triageStats'],
            summarySectionIds: ['executability'],
            triageBucketIds: ['write-readiness'],
            nextStep: 'continue-to-write',
            primaryFields: ['summary.executabilityStats', 'detections.referenceSummary', 'profiles.referenceSummary'],
            purpose: '当只读结果需要决定是否继续进入写入链路时，优先查看 executability 与 item 级 reference 证据。',
          },
        ],
        starterRecipes: [
          {
            id: 'readonly-state-audit-overview',
            intent: '从只读状态审计入口进入平台总览与后续明细展开。',
            discover: 'api-switcher schema --json --catalog-summary',
            action: 'api-switcher schema --json --action current',
            nextStep: 'api-switcher schema --json --recommended-action inspect-items',
            runtime: 'api-switcher current --json',
            appliesTo: ['current', 'list', 'validate', 'export'],
          },
        ],
        starterTemplate: {
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
        },
        consumerFlow: [
          {
            id: 'overview-to-items',
            title: 'Overview to items',
            priority: 1,
            defaultEntry: true,
            defaultOnBucket: true,
            selectionReason: '默认先看平台 overview，因为它成本最低，能快速判断后续是否需要展开 item 明细。',
            summarySectionIds: ['platform'],
            triageBucketIds: ['overview'],
            readFields: ['summary.platformStats', 'summary.triageStats', 'detections', 'platformSummary'],
            consumerActionId: 'inspect-overview',
            nextStep: 'inspect-items',
            purpose: '先通过平台级 overview 锁定值得展开的项，再进入 item 明细。',
          },
          {
            id: 'reference-to-governance',
            title: 'Reference to governance',
            priority: 2,
            defaultEntry: false,
            defaultOnBucket: true,
            selectionReason: '当 reference-governance bucket 有命中时优先选择，用于直接进入 secret/reference 治理复核。',
            summarySectionIds: ['reference'],
            triageBucketIds: ['reference-governance'],
            readFields: ['summary.referenceStats', 'summary.triageStats', 'detections.referenceSummary', 'profiles.referenceSummary'],
            consumerActionId: 'review-reference-governance',
            nextStep: 'review-reference-details',
            purpose: '当 summary 已暴露 secret/reference 治理信号时，把读取顺序直接映射到 governance 动作卡片。',
          },
          {
            id: 'executability-to-write',
            title: 'Executability to write',
            priority: 3,
            defaultEntry: false,
            defaultOnBucket: true,
            selectionReason: '当 write-readiness bucket 有命中时优先选择，用于判断是否可以继续进入写入链路。',
            summarySectionIds: ['executability'],
            triageBucketIds: ['write-readiness'],
            readFields: ['summary.executabilityStats', 'summary.triageStats', 'detections.referenceSummary', 'profiles.referenceSummary'],
            consumerActionId: 'assess-write-readiness',
            nextStep: 'continue-to-write',
            purpose: '当只读结果已经进入 readiness 判断阶段时，先读 executability 再决定是否继续写入。',
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
        starterRecipes: [
          {
            id: 'single-platform-write-preview-to-execute',
            intent: '从 preview 发现链路进入单平台写入执行判断。',
            discover: 'api-switcher schema --json --catalog-summary',
            action: 'api-switcher schema --json --action preview',
            nextStep: 'api-switcher schema --json --recommended-action continue-to-write',
            runtime: 'api-switcher preview <selector> --json',
            appliesTo: ['preview', 'use', 'import-apply'],
          },
        ],
      },
      {
        id: 'readonly-import-batch',
        title: 'Readonly import batch analysis',
        appliesToActions: ['import'],
        exampleActions: ['import'],
        bestEntryAction: 'import',
        defaultConsumerActionId: 'repair-source-blockers',
        defaultCommandExample: 'api-switcher import <file> --json',
        defaultCommandPurpose: '先做导入源分流与可执行性判断，再决定是否修复源数据或继续 apply。',
        sharedSummaryFields: ['summary.sourceExecutability', 'summary.executabilityStats', 'summary.platformStats', 'summary.triageStats'],
        sharedItemFields: ['platformSummary', 'previewDecision'],
        sharedFailureFields: ['error.code', 'error.message'],
        optionalScopeFields: [],
        optionalItemFields: ['fidelity', 'exportedObservation', 'localObservation'],
        optionalFailureFields: [],
        optionalArtifactFields: [],
        recommendedStages: ['summary', 'items', 'detail'],
        summarySectionGuidance: [
          {
            id: 'source-executability',
            title: 'Source executability summary',
            priority: 1,
            fields: ['summary.sourceExecutability'],
            purpose: '先看导入源本身是否还能继续进入 apply，用于识别 redacted inline secret 等源侧阻塞。',
            recommendedUses: ['gating'],
          },
          {
            id: 'executability',
            title: 'Executability summary',
            priority: 2,
            fields: ['summary.executabilityStats'],
            purpose: '再看目标平台侧是否具备写入可执行条件，用于区分可继续 apply 和需本地修复的项。',
            recommendedUses: ['gating'],
          },
          {
            id: 'platform',
            title: 'Platform summary',
            priority: 3,
            fields: ['summary.platformStats'],
            purpose: '最后看 mixed-batch 在各平台上的分布，便于按平台分批处理。',
            recommendedUses: ['routing', 'overview'],
          },
        ],
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
        defaultConsumerFlowId: 'source-to-repair',
        triageBuckets: [
          {
            id: 'source-blocked',
            title: 'Source blocked bucket',
            summaryFields: ['summary.sourceExecutability'],
            itemFields: ['sourceCompatibility', 'items.previewDecision'],
            purpose: '把导入源本身已经阻断 apply 的项单独成桶，例如 redacted inline secret 或 source schema 兼容性问题。',
            recommendedNextStep: 'repair-source-input',
          },
          {
            id: 'write-readiness',
            title: 'Write readiness bucket',
            summaryFields: ['summary.executabilityStats'],
            itemFields: ['items.previewDecision', 'items.fidelity'],
            purpose: '把目标侧仍可继续 apply 与需要本地修复的项归到同一桶里，便于做 gating。',
            recommendedNextStep: 'continue-to-write',
          },
          {
            id: 'platform-routing',
            title: 'Platform routing bucket',
            summaryFields: ['summary.platformStats'],
            itemFields: ['platformSummary'],
            purpose: '把 mixed-batch 结果按平台路由拆分，便于后续分别处理不同平台。',
            recommendedNextStep: 'group-by-platform',
          },
        ],
        consumerActions: [
          {
            id: 'repair-source-blockers',
            title: 'Repair source blockers',
            priority: 1,
            use: 'gating',
            appliesWhen: '当导入源本身已经阻断 apply，必须先修复 source 才能继续时优先使用。',
            triggerFields: ['summary.sourceExecutability', 'summary.triageStats', 'sourceCompatibility'],
            summarySectionIds: ['source-executability'],
            triageBucketIds: ['source-blocked'],
            nextStep: 'repair-source-input',
            primaryFields: ['summary.sourceExecutability', 'sourceCompatibility', 'items.previewDecision'],
            purpose: '当导入源本身已经阻断 apply 时，先回到 source 侧修复再继续。',
          },
          {
            id: 'assess-import-readiness',
            title: 'Assess import readiness',
            priority: 2,
            use: 'gating',
            appliesWhen: '当 import preview 已经通过 source 检查，但仍需判断目标侧是否能进入 import apply 时优先使用。',
            triggerFields: ['summary.executabilityStats', 'summary.triageStats', 'items.previewDecision', 'items.fidelity'],
            summarySectionIds: ['executability'],
            triageBucketIds: ['write-readiness'],
            nextStep: 'continue-to-write',
            primaryFields: ['summary.executabilityStats', 'items.previewDecision', 'items.fidelity'],
            purpose: '当需要决定是否继续进入 import apply 时，先查看 executability、previewDecision 与 fidelity 证据。',
          },
          {
            id: 'route-by-platform',
            title: 'Route by platform',
            priority: 3,
            use: 'routing',
            appliesWhen: '当 mixed-batch 需要按平台拆分处理，而不是继续作为整批统一决策时优先使用。',
            triggerFields: ['summary.platformStats', 'summary.triageStats', 'platformSummary'],
            summarySectionIds: ['platform'],
            triageBucketIds: ['platform-routing'],
            nextStep: 'group-by-platform',
            primaryFields: ['summary.platformStats', 'platformSummary'],
            purpose: '当 mixed-batch 需要拆分处理时，先按平台聚合和 item 级 platform explainable 分组。',
          },
        ],
        starterRecipes: [
          {
            id: 'readonly-import-batch-source-gating',
            intent: '从导入批次分析入口先判断 source gating，再决定是否继续 apply。',
            discover: 'api-switcher schema --json --catalog-summary',
            action: 'api-switcher schema --json --action import',
            nextStep: 'api-switcher schema --json --recommended-action repair-source-input',
            runtime: 'api-switcher import preview <file> --json',
            appliesTo: ['import'],
          },
        ],
        starterTemplate: {
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
        },
        consumerFlow: [
          {
            id: 'source-to-repair',
            title: 'Source to repair',
            priority: 1,
            defaultEntry: true,
            defaultOnBucket: true,
            selectionReason: '默认先看 source gating，因为导入源一旦阻断 apply，后续目标侧分析都应让位于 source 修复。',
            summarySectionIds: ['source-executability'],
            triageBucketIds: ['source-blocked'],
            readFields: ['summary.sourceExecutability', 'summary.triageStats', 'sourceCompatibility', 'items.previewDecision'],
            consumerActionId: 'repair-source-blockers',
            nextStep: 'repair-source-input',
            purpose: '当导入源已阻断 apply 时，先把 source gating 信号映射到修复动作。',
          },
          {
            id: 'executability-to-apply',
            title: 'Executability to apply',
            priority: 2,
            defaultEntry: false,
            defaultOnBucket: true,
            selectionReason: '当 write-readiness bucket 有命中时优先选择，用于在 source 通过后判断是否继续 apply。',
            summarySectionIds: ['executability'],
            triageBucketIds: ['write-readiness'],
            readFields: ['summary.executabilityStats', 'summary.triageStats', 'items.previewDecision', 'items.fidelity'],
            consumerActionId: 'assess-import-readiness',
            nextStep: 'continue-to-write',
            purpose: '当 source 已通过检查后，把目标侧写入 readiness 信号映射到 apply 决策动作。',
          },
          {
            id: 'platform-to-routing',
            title: 'Platform to routing',
            priority: 3,
            defaultEntry: false,
            defaultOnBucket: true,
            selectionReason: '当 platform-routing bucket 有命中时优先选择，用于把 mixed-batch 按平台拆分处理。',
            summarySectionIds: ['platform'],
            triageBucketIds: ['platform-routing'],
            readFields: ['summary.platformStats', 'summary.triageStats', 'platformSummary'],
            consumerActionId: 'route-by-platform',
            nextStep: 'group-by-platform',
            purpose: '当 mixed-batch 需要拆平台处理时，把平台级 summary 直接映射到 routing 动作。',
          },
        ],
      },
    ])

    expect(addAction).toEqual({
      action: 'add',
      hasPlatformSummary: false,
      hasPlatformStats: true,
      hasScopeCapabilities: true,
      hasScopeAvailability: false,
      hasScopePolicy: false,
      consumerProfileIds: ['single-platform-write'],
      primaryFields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'risk', 'preview', 'scopeCapabilities'],
      primaryErrorFields: ['error.code', 'error.message'],
      failureCodes: [
        { code: 'ADD_INPUT_REQUIRED', priority: 1, category: 'input', recommendedHandling: 'fix-input-and-retry', textEntryPoint: 'error-message', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'ADD_INPUT_CONFLICT', priority: 2, category: 'input', recommendedHandling: 'fix-input-and-retry', textEntryPoint: 'error-message', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'UNSUPPORTED_PLATFORM', priority: 3, category: 'input', recommendedHandling: 'fix-input-and-retry', textEntryPoint: 'error-message', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'GEMINI_URL_UNSUPPORTED', priority: 4, category: 'input', recommendedHandling: 'fix-input-and-retry', textEntryPoint: 'error-message', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'DUPLICATE_PROFILE_ID', priority: 5, category: 'state', recommendedHandling: 'select-existing-resource', textEntryPoint: 'error-message', appliesWhen: '当错误表明当前目标资源、快照或状态前提不存在时优先使用。', triggerFields: ['error.code'] },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 6, category: 'platform', recommendedHandling: 'check-platform-support', textEntryPoint: 'error-message', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
        { code: 'ADD_FAILED', priority: 7, category: 'runtime', recommendedHandling: 'inspect-runtime-details', textEntryPoint: 'error-message', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
      ],
      failureTextActions: [
        { textEntryPoint: 'error-message', recommendedHandling: 'fix-input-and-retry', appliesToCodes: ['ADD_INPUT_REQUIRED', 'ADD_INPUT_CONFLICT', 'UNSUPPORTED_PLATFORM', 'GEMINI_URL_UNSUPPORTED'] },
        { textEntryPoint: 'error-message', recommendedHandling: 'select-existing-resource', appliesToCodes: ['DUPLICATE_PROFILE_ID'] },
        { textEntryPoint: 'error-message', recommendedHandling: 'check-platform-support', appliesToCodes: ['ADAPTER_NOT_REGISTERED'] },
        { textEntryPoint: 'error-message', recommendedHandling: 'inspect-runtime-details', appliesToCodes: ['ADD_FAILED'] },
      ],
      fieldPresence: [
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
        { path: 'risk', channel: 'success', presence: 'always' },
        { path: 'preview', channel: 'success', presence: 'always' },
        { path: 'scopeCapabilities', channel: 'success', presence: 'always' },
      ],
      fieldSources: [
        { path: 'summary.platformStats', channel: 'success', source: 'command-service' },
        { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
        { path: 'risk', channel: 'success', source: 'command-service' },
        { path: 'preview', channel: 'success', source: 'platform-adapter' },
        { path: 'scopeCapabilities', channel: 'success', source: 'platform-adapter' },
      ],
      fieldStability: [
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'risk', channel: 'success', stabilityTier: 'stable' },
        { path: 'preview', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeCapabilities', channel: 'success', stabilityTier: 'stable' },
      ],
      readOrderGroups: {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'], purpose: '先看单平台聚合、reference 聚合和写入可执行性聚合；reference-only 在 add 阶段只代表录入形态，不代表当前环境已完成解析或可执行性检查。' },
          { stage: 'detail', fields: ['risk', 'preview', 'scopeCapabilities'], purpose: '再展开新增结果、风险和 scope 能力；真正的本地解析、治理判断和写入可执行性检查留在 preview/use/import apply。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定失败类型。' },
        ],
      },
      primaryFieldSemantics: [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
        { path: 'risk', semantic: 'risk' },
        { path: 'preview', semantic: 'result-core' },
        { path: 'scopeCapabilities', semantic: 'scope-resolution' },
      ],
      primaryErrorFieldSemantics: [
        { path: 'error.code', semantic: 'error-core' },
        { path: 'error.message', semantic: 'error-core' },
      ],
      successTextEntries: [
        { path: 'summary.platformStats', textEntryPoint: 'platform-summary' },
        { path: 'summary.referenceStats', textEntryPoint: 'reference-stats-summary' },
        { path: 'summary.executabilityStats', textEntryPoint: 'executability-stats-summary' },
        { path: 'preview', textEntryPoint: 'preview-detail' },
      ],
    })

    expect(currentAction).toEqual({
      action: 'current',
      hasPlatformSummary: true,
      hasPlatformStats: true,
      hasScopeCapabilities: true,
      hasScopeAvailability: true,
      hasScopePolicy: false,
      consumerProfileIds: ['readonly-state-audit'],
      primaryFields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'summary.triageStats', 'current', 'detections', 'detections.referenceSummary', 'scopeCapabilities', 'scopeAvailability'],
      primaryErrorFields: ['error.code', 'error.message'],
      failureCodes: [
        { code: 'ADAPTER_NOT_REGISTERED', priority: 1, category: 'platform', recommendedHandling: 'check-platform-support', textEntryPoint: 'error-message', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
        { code: 'CURRENT_FAILED', priority: 2, category: 'runtime', recommendedHandling: 'inspect-runtime-details', textEntryPoint: 'error-message', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
      ],
      failureTextActions: [
        { textEntryPoint: 'error-message', recommendedHandling: 'check-platform-support', appliesToCodes: ['ADAPTER_NOT_REGISTERED'] },
        { textEntryPoint: 'error-message', recommendedHandling: 'inspect-runtime-details', appliesToCodes: ['CURRENT_FAILED'] },
      ],
      fieldPresence: [
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
        { path: 'summary.triageStats', channel: 'success', presence: 'always' },
        { path: 'current', channel: 'success', presence: 'always' },
        { path: 'detections', channel: 'success', presence: 'always' },
        { path: 'detections.referenceSummary', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_ITEM_HAS_REFERENCE_OR_INLINE_SECRET_CONTEXT' },
        { path: 'scopeCapabilities', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_PLATFORM_EXPOSES_SCOPE_CAPABILITIES' },
        { path: 'scopeAvailability', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_PLATFORM_EXPOSES_SCOPE_AVAILABILITY' },
      ],
      fieldSources: [
        { path: 'summary.platformStats', channel: 'success', source: 'command-service' },
        { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
        { path: 'summary.triageStats', channel: 'success', source: 'command-service' },
        { path: 'current', channel: 'success', source: 'command-service' },
        { path: 'detections', channel: 'success', source: 'platform-adapter' },
        { path: 'detections.referenceSummary', channel: 'success', source: 'command-service' },
        { path: 'scopeCapabilities', channel: 'success', source: 'platform-adapter' },
        { path: 'scopeAvailability', channel: 'success', source: 'platform-adapter' },
      ],
      fieldStability: [
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.triageStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'current', channel: 'success', stabilityTier: 'stable' },
        { path: 'detections', channel: 'success', stabilityTier: 'stable' },
        { path: 'detections.referenceSummary', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeCapabilities', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeAvailability', channel: 'success', stabilityTier: 'bounded' },
      ],
      readOrderGroups: {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'summary.triageStats'], purpose: '先看平台级聚合、reference 聚合、写入可执行性聚合和 triage 分流桶。' },
          { stage: 'selection', fields: ['current'], purpose: '再看当前 state 记录。' },
          { stage: 'items', fields: ['detections', 'detections.referenceSummary'], purpose: '最后展开检测结果列表，并按需读取每项的 reference explainable。' },
          { stage: 'detail', fields: ['scopeCapabilities', 'scopeAvailability'], purpose: '按需展开 scope 元信息。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定失败类型。' },
        ],
      },
      summarySections: [
        { id: 'platform', title: 'Platform summary', priority: 1, fields: ['summary.platformStats'], purpose: '先看平台级聚合，快速判断结果覆盖了哪些平台以及各平台状态分布。', recommendedWhen: ['cross-platform overview', 'top-level health check'] },
        { id: 'reference', title: 'Reference summary', priority: 2, fields: ['summary.referenceStats'], purpose: '看 secret/reference 解析形态，判断是否存在未解析 env、受支持但不写入、或不支持 scheme 的输入。', recommendedWhen: ['secret governance', 'reference resolution review'] },
        { id: 'executability', title: 'Executability summary', priority: 3, fields: ['summary.executabilityStats'], purpose: '看后续若进入写入命令时是否具备可执行条件，用于区分可继续处理和需人工修复的项。', recommendedWhen: ['pre-write readiness', 'apply/use readiness check'] },
      ],
      primaryFieldSemantics: [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
        { path: 'summary.triageStats', semantic: 'triage-aggregate' },
        { path: 'current', semantic: 'result-core' },
        { path: 'detections', semantic: 'item-collection' },
        { path: 'detections.referenceSummary', semantic: 'item-explainable' },
        { path: 'scopeCapabilities', semantic: 'scope-resolution' },
        { path: 'scopeAvailability', semantic: 'scope-resolution' },
      ],
      primaryErrorFieldSemantics: [
        { path: 'error.code', semantic: 'error-core' },
        { path: 'error.message', semantic: 'error-core' },
      ],
    })

    expect(exportAction).toEqual({
      action: 'export',
      hasPlatformSummary: true,
      hasPlatformStats: true,
      hasScopeCapabilities: false,
      hasScopeAvailability: false,
      hasScopePolicy: false,
      consumerProfileIds: ['readonly-state-audit'],
      primaryFields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'summary.triageStats', 'summary.secretExportPolicy', 'profiles', 'profiles.referenceSummary', 'profiles.secretExportSummary'],
      primaryErrorFields: ['error.code', 'error.message'],
      failureCodes: [
        { code: 'ADAPTER_NOT_REGISTERED', priority: 1, category: 'platform', recommendedHandling: 'check-platform-support', textEntryPoint: 'error-message', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
        { code: 'EXPORT_FAILED', priority: 2, category: 'runtime', recommendedHandling: 'inspect-runtime-details', textEntryPoint: 'error-message', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
      ],
      failureTextActions: [
        { textEntryPoint: 'error-message', recommendedHandling: 'check-platform-support', appliesToCodes: ['ADAPTER_NOT_REGISTERED'] },
        { textEntryPoint: 'error-message', recommendedHandling: 'inspect-runtime-details', appliesToCodes: ['EXPORT_FAILED'] },
      ],
      fieldPresence: [
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
        { path: 'summary.triageStats', channel: 'success', presence: 'always' },
        { path: 'summary.secretExportPolicy', channel: 'success', presence: 'always' },
        { path: 'profiles', channel: 'success', presence: 'always' },
        { path: 'profiles.referenceSummary', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_ITEM_HAS_REFERENCE_OR_INLINE_SECRET_CONTEXT' },
        { path: 'profiles.secretExportSummary', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_ITEM_HAS_REFERENCE_OR_INLINE_SECRET_CONTEXT' },
      ],
      fieldSources: [
        { path: 'summary.platformStats', channel: 'success', source: 'command-service' },
        { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
        { path: 'summary.triageStats', channel: 'success', source: 'command-service' },
        { path: 'summary.secretExportPolicy', channel: 'success', source: 'command-service' },
        { path: 'profiles', channel: 'success', source: 'command-service' },
        { path: 'profiles.referenceSummary', channel: 'success', source: 'command-service' },
        { path: 'profiles.secretExportSummary', channel: 'success', source: 'command-service' },
      ],
      fieldStability: [
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.triageStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.secretExportPolicy', channel: 'success', stabilityTier: 'stable' },
        { path: 'profiles', channel: 'success', stabilityTier: 'stable' },
        { path: 'profiles.referenceSummary', channel: 'success', stabilityTier: 'stable' },
        { path: 'profiles.secretExportSummary', channel: 'success', stabilityTier: 'stable' },
      ],
      readOrderGroups: {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'summary.triageStats', 'summary.secretExportPolicy'], purpose: '先看平台级导出聚合、reference 聚合、写入可执行性聚合、triage 分流桶和本次 secret 导出策略。' },
          { stage: 'items', fields: ['profiles', 'profiles.referenceSummary', 'profiles.secretExportSummary'], purpose: '再读导出 profile 列表，并按需读取每项的 reference 与 secret export explainable。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定失败类型。' },
        ],
      },
      summarySections: [
        { id: 'platform', title: 'Platform summary', priority: 1, fields: ['summary.platformStats'], purpose: '先看平台级聚合，快速判断结果覆盖了哪些平台以及各平台状态分布。', recommendedWhen: ['cross-platform overview', 'top-level health check'] },
        { id: 'reference', title: 'Reference summary', priority: 2, fields: ['summary.referenceStats'], purpose: '看 secret/reference 解析形态，判断是否存在未解析 env、受支持但不写入、或不支持 scheme 的输入。', recommendedWhen: ['secret governance', 'reference resolution review'] },
        { id: 'executability', title: 'Executability summary', priority: 3, fields: ['summary.executabilityStats'], purpose: '看后续若进入写入命令时是否具备可执行条件，用于区分可继续处理和需人工修复的项。', recommendedWhen: ['pre-write readiness', 'apply/use readiness check'] },
      ],
      primaryFieldSemantics: [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
        { path: 'summary.triageStats', semantic: 'triage-aggregate' },
        { path: 'summary.secretExportPolicy', semantic: 'result-policy' },
        { path: 'profiles', semantic: 'item-collection' },
        { path: 'profiles.referenceSummary', semantic: 'item-explainable' },
        { path: 'profiles.secretExportSummary', semantic: 'item-explainable' },
      ],
      primaryErrorFieldSemantics: [
        { path: 'error.code', semantic: 'error-core' },
        { path: 'error.message', semantic: 'error-core' },
      ],
    })

    expect(listAction).toEqual({
      action: 'list',
      hasPlatformSummary: true,
      hasPlatformStats: true,
      hasScopeCapabilities: true,
      hasScopeAvailability: false,
      hasScopePolicy: false,
      consumerProfileIds: ['readonly-state-audit'],
      primaryFields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'summary.triageStats', 'profiles', 'profiles.referenceSummary'],
      primaryErrorFields: ['error.code', 'error.message'],
      failureCodes: [
        { code: 'UNSUPPORTED_PLATFORM', priority: 1, category: 'input', recommendedHandling: 'fix-input-and-retry', textEntryPoint: 'error-message', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 2, category: 'platform', recommendedHandling: 'check-platform-support', textEntryPoint: 'error-message', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
        { code: 'LIST_FAILED', priority: 3, category: 'runtime', recommendedHandling: 'inspect-runtime-details', textEntryPoint: 'error-message', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
      ],
      failureTextActions: [
        { textEntryPoint: 'error-message', recommendedHandling: 'fix-input-and-retry', appliesToCodes: ['UNSUPPORTED_PLATFORM'] },
        { textEntryPoint: 'error-message', recommendedHandling: 'check-platform-support', appliesToCodes: ['ADAPTER_NOT_REGISTERED'] },
        { textEntryPoint: 'error-message', recommendedHandling: 'inspect-runtime-details', appliesToCodes: ['LIST_FAILED'] },
      ],
      fieldPresence: [
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
        { path: 'summary.triageStats', channel: 'success', presence: 'always' },
        { path: 'profiles', channel: 'success', presence: 'always' },
        { path: 'profiles.referenceSummary', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_ITEM_HAS_REFERENCE_OR_INLINE_SECRET_CONTEXT' },
      ],
      fieldSources: [
        { path: 'summary.platformStats', channel: 'success', source: 'command-service' },
        { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
        { path: 'summary.triageStats', channel: 'success', source: 'command-service' },
        { path: 'profiles', channel: 'success', source: 'command-service' },
        { path: 'profiles.referenceSummary', channel: 'success', source: 'command-service' },
      ],
      fieldStability: [
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.triageStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'profiles', channel: 'success', stabilityTier: 'stable' },
        { path: 'profiles.referenceSummary', channel: 'success', stabilityTier: 'stable' },
      ],
      readOrderGroups: {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'summary.triageStats'], purpose: '先按平台分组并识别 reference 聚合、写入可执行性聚合与 triage 分流桶。' },
          { stage: 'items', fields: ['profiles', 'profiles.referenceSummary'], purpose: '再读 profile 列表，并按需读取每项的 reference explainable。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定失败类型。' },
        ],
      },
      summarySections: [
        { id: 'platform', title: 'Platform summary', priority: 1, fields: ['summary.platformStats'], purpose: '先看平台级聚合，快速判断结果覆盖了哪些平台以及各平台状态分布。', recommendedWhen: ['cross-platform overview', 'top-level health check'] },
        { id: 'reference', title: 'Reference summary', priority: 2, fields: ['summary.referenceStats'], purpose: '看 secret/reference 解析形态，判断是否存在未解析 env、受支持但不写入、或不支持 scheme 的输入。', recommendedWhen: ['secret governance', 'reference resolution review'] },
        { id: 'executability', title: 'Executability summary', priority: 3, fields: ['summary.executabilityStats'], purpose: '看后续若进入写入命令时是否具备可执行条件，用于区分可继续处理和需人工修复的项。', recommendedWhen: ['pre-write readiness', 'apply/use readiness check'] },
      ],
      primaryFieldSemantics: [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
        { path: 'summary.triageStats', semantic: 'triage-aggregate' },
        { path: 'profiles', semantic: 'item-collection' },
        { path: 'profiles.referenceSummary', semantic: 'item-explainable' },
      ],
      primaryErrorFieldSemantics: [
        { path: 'error.code', semantic: 'error-core' },
        { path: 'error.message', semantic: 'error-core' },
      ],
    })

    expect(previewAction).toEqual({
      action: 'preview',
      hasPlatformSummary: false,
      hasPlatformStats: true,
      hasScopeCapabilities: true,
      hasScopeAvailability: true,
      hasScopePolicy: true,
      consumerProfileIds: ['single-platform-write'],
      primaryFields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'risk', 'referenceReadiness', 'referenceDecision', 'referenceGovernance', 'preview', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability'],
      primaryErrorFields: ['error.code', 'error.message', 'error.details.scopePolicy', 'error.details.scopeAvailability'],
      failureCodes: [
        { code: 'PROFILE_NOT_FOUND', priority: 1, category: 'state', recommendedHandling: 'select-existing-resource', textEntryPoint: 'error-message', appliesWhen: '当错误表明当前目标资源、快照或状态前提不存在时优先使用。', triggerFields: ['error.code'] },
        { code: 'INVALID_SCOPE', priority: 2, category: 'input', recommendedHandling: 'fix-input-and-retry', textEntryPoint: 'error-message', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 3, category: 'platform', recommendedHandling: 'check-platform-support', textEntryPoint: 'error-message', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
        { code: 'PREVIEW_FAILED', priority: 4, category: 'runtime', recommendedHandling: 'inspect-runtime-details', textEntryPoint: 'error-message', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
      ],
      failureTextActions: [
        { textEntryPoint: 'error-message', recommendedHandling: 'select-existing-resource', appliesToCodes: ['PROFILE_NOT_FOUND'] },
        { textEntryPoint: 'error-message', recommendedHandling: 'fix-input-and-retry', appliesToCodes: ['INVALID_SCOPE'] },
        { textEntryPoint: 'error-message', recommendedHandling: 'check-platform-support', appliesToCodes: ['ADAPTER_NOT_REGISTERED'] },
        { textEntryPoint: 'error-message', recommendedHandling: 'inspect-runtime-details', appliesToCodes: ['PREVIEW_FAILED'] },
      ],
      fieldPresence: [
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
        { path: 'risk', channel: 'success', presence: 'always' },
        { path: 'referenceReadiness', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_REFERENCE_DECISION_IS_DETECTED' },
        { path: 'referenceDecision', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_REFERENCE_DECISION_IS_DETECTED' },
        { path: 'referenceGovernance', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_REFERENCE_GOVERNANCE_IS_EMITTED_IN_SUCCESS_PAYLOAD' },
        { path: 'preview', channel: 'success', presence: 'always' },
        { path: 'scopePolicy', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_COMMAND_RESOLVES_SCOPE_POLICY' },
        { path: 'scopeCapabilities', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_PLATFORM_EXPOSES_SCOPE_CAPABILITIES' },
        { path: 'scopeAvailability', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SCOPE_AVAILABILITY_IS_RESOLVED' },
        { path: 'error.details.scopePolicy', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_SCOPE_FAILURE_PROVIDES_POLICY_DETAILS' },
        { path: 'error.details.scopeAvailability', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_SCOPE_FAILURE_PROVIDES_AVAILABILITY_DETAILS' },
      ],
      fieldSources: [
        { path: 'summary.platformStats', channel: 'success', source: 'command-service' },
        { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
        { path: 'risk', channel: 'success', source: 'command-service' },
        { path: 'referenceReadiness', channel: 'success', source: 'command-service' },
        { path: 'referenceDecision', channel: 'success', source: 'command-service' },
        { path: 'referenceGovernance', channel: 'success', source: 'command-service' },
        { path: 'preview', channel: 'success', source: 'platform-adapter' },
        { path: 'scopePolicy', channel: 'success', source: 'command-service' },
        { path: 'scopeCapabilities', channel: 'success', source: 'platform-adapter' },
        { path: 'scopeAvailability', channel: 'success', source: 'platform-adapter' },
        { path: 'error.details.scopePolicy', channel: 'failure', source: 'command-service' },
        { path: 'error.details.scopeAvailability', channel: 'failure', source: 'platform-adapter' },
      ],
      fieldStability: [
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'risk', channel: 'success', stabilityTier: 'stable' },
        { path: 'referenceReadiness', channel: 'success', stabilityTier: 'stable' },
        { path: 'referenceDecision', channel: 'success', stabilityTier: 'stable' },
        { path: 'referenceGovernance', channel: 'success', stabilityTier: 'stable' },
        { path: 'preview', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopePolicy', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeCapabilities', channel: 'success', stabilityTier: 'stable' },
        { path: 'scopeAvailability', channel: 'success', stabilityTier: 'bounded' },
        { path: 'error.details.scopePolicy', channel: 'failure', stabilityTier: 'bounded' },
        { path: 'error.details.scopeAvailability', channel: 'failure', stabilityTier: 'bounded' },
      ],
      readOrderGroups: {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'], purpose: '先看目标 scope 的平台聚合、reference 聚合和写入可执行性聚合。' },
          { stage: 'detail', fields: ['risk', 'referenceReadiness', 'referenceDecision', 'referenceGovernance', 'preview', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability'], purpose: '再先看轻量 reference readiness，再按需展开 reference 治理分支、预览、风险和 scope 元信息。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定阻塞类型。' },
          { stage: 'error-details', fields: ['error.details.scopePolicy', 'error.details.scopeAvailability'], purpose: '再看 scope 相关上下文。' },
        ],
      },
      primaryFieldSemantics: [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
        { path: 'risk', semantic: 'risk' },
        { path: 'referenceReadiness', semantic: 'reference-governance' },
        { path: 'referenceDecision', semantic: 'reference-governance' },
        { path: 'referenceGovernance', semantic: 'reference-governance' },
        { path: 'preview', semantic: 'result-core' },
        { path: 'scopePolicy', semantic: 'scope-resolution' },
        { path: 'scopeCapabilities', semantic: 'scope-resolution' },
        { path: 'scopeAvailability', semantic: 'scope-resolution' },
      ],
      primaryErrorFieldSemantics: [
        { path: 'error.code', semantic: 'error-core' },
        { path: 'error.message', semantic: 'error-core' },
        { path: 'error.details.scopePolicy', semantic: 'error-details' },
        { path: 'error.details.scopeAvailability', semantic: 'error-details' },
      ],
      successTextEntries: [
        { path: 'summary.platformStats', textEntryPoint: 'platform-summary' },
        { path: 'summary.referenceStats', textEntryPoint: 'reference-stats-summary' },
        { path: 'summary.executabilityStats', textEntryPoint: 'executability-stats-summary' },
        { path: 'referenceReadiness', textEntryPoint: 'reference-stats-summary', note: 'preview 文本模式当前没有独立的 referenceReadiness 区块；先看“referenceStats 摘要”，再进入 preview 细节与限制说明。' },
      ],
    })

    expect(importAction?.summarySections).toEqual([
      { id: 'source-executability', title: 'Source executability summary', priority: 1, fields: ['summary.sourceExecutability'], purpose: '先看导入源本身是否还能继续进入 apply，用于识别 redacted inline secret 等源侧阻塞。', recommendedWhen: ['import source triage', 'apply eligibility from source data'] },
      { id: 'executability', title: 'Executability summary', priority: 2, fields: ['summary.executabilityStats'], purpose: '再看目标平台侧是否具备写入可执行条件，用于区分可继续 apply 和需本地修复的项。', recommendedWhen: ['pre-apply readiness', 'target-side write readiness'] },
      { id: 'platform', title: 'Platform summary', priority: 3, fields: ['summary.platformStats'], purpose: '最后看 mixed-batch 在各平台上的分布，便于按平台分批处理。', recommendedWhen: ['mixed-batch routing', 'platform-level distribution review'] },
    ])
    expect(importAction?.consumerProfileIds).toEqual(['readonly-import-batch'])
    expect(currentAction?.consumerProfileIds).toEqual(['readonly-state-audit'])
    expect(listAction?.consumerProfileIds).toEqual(['readonly-state-audit'])
    expect(validateAction?.consumerProfileIds).toEqual(['readonly-state-audit'])
    expect(exportAction?.consumerProfileIds).toEqual(['readonly-state-audit'])
    expect(previewAction?.summarySections).toBeUndefined()
    expect(useAction?.summarySections).toBeUndefined()
    expect(rollbackAction?.summarySections).toBeUndefined()
    expect(importApplyAction?.summarySections).toBeUndefined()
    expect(schemaAction?.summarySections).toBeUndefined()
    const writeUseAction = useAction as SchemaActionCapability | undefined
    const writeRollbackAction = rollbackAction as SchemaActionCapability | undefined
    const writeImportApplyAction = importApplyAction as SchemaActionCapability | undefined

    expect(writeUseAction?.primaryFields).toEqual([
      'summary.platformStats',
      'summary.referenceStats',
      'summary.executabilityStats',
      'platformSummary',
      'preview',
      'scopePolicy',
      'scopeCapabilities',
      'scopeAvailability',
      'dryRun',
      'changedFiles',
      'backupId',
    ])
    expect(writeUseAction?.consumerProfileIds).toEqual(['single-platform-write'])
    expect(writeUseAction?.fieldPresence).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
      { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
    ]))
    expect(writeUseAction?.fieldSources).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
      { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
    ]))
    expect(writeUseAction?.fieldStability).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
      { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
    ]))
    expect(writeUseAction?.readOrderGroups.success.find((group) => group.stage === 'summary')).toEqual({
      stage: 'summary',
      fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'],
      purpose: '先看写入平台的聚合结果、reference 聚合和写入可执行性聚合。',
    })
    expect(writeUseAction?.primaryFieldSemantics).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
      { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
    ]))
    expect(writeUseAction?.failureCodes).toEqual([
      { code: 'PROFILE_NOT_FOUND', priority: 1, category: 'state', recommendedHandling: 'select-existing-resource', textEntryPoint: 'error-message', appliesWhen: '当错误表明当前目标资源、快照或状态前提不存在时优先使用。', triggerFields: ['error.code'] },
      { code: 'INVALID_SCOPE', priority: 2, category: 'input', recommendedHandling: 'fix-input-and-retry', textEntryPoint: 'error-message', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
      { code: 'VALIDATION_FAILED', priority: 3, category: 'runtime', recommendedHandling: 'inspect-runtime-details', textEntryPoint: 'error-message', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
      { code: 'CONFIRMATION_REQUIRED', priority: 4, category: 'confirmation', recommendedHandling: 'confirm-before-write', textEntryPoint: 'risk-summary', appliesWhen: '当错误仅因缺少显式确认而阻止写入时优先使用。', triggerFields: ['error.code', 'error.details.risk', 'error.details.previewDecision'] },
      { code: 'ADAPTER_NOT_REGISTERED', priority: 5, category: 'platform', recommendedHandling: 'check-platform-support', textEntryPoint: 'error-message', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
      { code: 'APPLY_FAILED', priority: 6, category: 'runtime', recommendedHandling: 'inspect-runtime-details', textEntryPoint: 'error-message', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
      { code: 'USE_FAILED', priority: 7, category: 'runtime', recommendedHandling: 'inspect-runtime-details', textEntryPoint: 'reference-summary', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
    ])
    expect(writeUseAction?.failureTextActions).toEqual([
      { textEntryPoint: 'error-message', recommendedHandling: 'select-existing-resource', appliesToCodes: ['PROFILE_NOT_FOUND'] },
      { textEntryPoint: 'error-message', recommendedHandling: 'fix-input-and-retry', appliesToCodes: ['INVALID_SCOPE'] },
      { textEntryPoint: 'error-message', recommendedHandling: 'inspect-runtime-details', appliesToCodes: ['VALIDATION_FAILED', 'APPLY_FAILED'] },
      { textEntryPoint: 'risk-summary', recommendedHandling: 'confirm-before-write', appliesToCodes: ['CONFIRMATION_REQUIRED'] },
      { textEntryPoint: 'error-message', recommendedHandling: 'check-platform-support', appliesToCodes: ['ADAPTER_NOT_REGISTERED'] },
      { textEntryPoint: 'reference-summary', recommendedHandling: 'inspect-runtime-details', appliesToCodes: ['USE_FAILED'] },
    ])
    expect(writeRollbackAction?.primaryFields).toEqual([
      'summary.platformStats',
      'summary.referenceStats',
      'summary.executabilityStats',
      'platformSummary',
      'rollback',
      'scopePolicy',
      'scopeCapabilities',
      'scopeAvailability',
      'restoredFiles',
      'backupId',
    ])
    expect(writeRollbackAction?.consumerProfileIds).toEqual(['single-platform-write'])
    expect(writeRollbackAction?.fieldPresence).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SNAPSHOT_PREVIOUS_PROFILE_IS_AVAILABLE' },
      { path: 'summary.executabilityStats', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SNAPSHOT_PREVIOUS_PROFILE_IS_AVAILABLE' },
    ]))
    expect(writeRollbackAction?.fieldSources).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
      { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
    ]))
    expect(writeRollbackAction?.fieldStability).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'bounded' },
      { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'bounded' },
    ]))
    expect(writeRollbackAction?.readOrderGroups.success.find((group) => group.stage === 'summary')).toEqual({
      stage: 'summary',
      fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'],
      purpose: '先看恢复的平台聚合，以及快照上一版 profile 的 reference 聚合和写入可执行性聚合。',
    })
    expect(writeRollbackAction?.primaryFieldSemantics).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
      { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
    ]))
    expect(writeImportApplyAction?.primaryFields).toEqual([
      'summary.platformStats',
      'summary.referenceStats',
      'summary.executabilityStats',
      'platformSummary',
      'preview',
      'scopePolicy',
      'scopeCapabilities',
      'scopeAvailability',
      'dryRun',
      'changedFiles',
      'backupId',
    ])
    expect(writeImportApplyAction?.consumerProfileIds).toEqual(['single-platform-write'])
    expect(writeImportApplyAction?.fieldPresence).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
      { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
      { path: 'error.details.results[].failureCategory', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_BATCH_PARTIAL_FAILURE_RESULTS_ARE_EMITTED' },
      { path: 'error.details.results[].reasonCodes', channel: 'failure', presence: 'conditional', conditionCode: 'WHEN_BATCH_PARTIAL_FAILURE_RESULTS_ARE_EMITTED' },
    ]))
    expect(writeImportApplyAction?.fieldSources).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
      { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
      { path: 'error.details.results[].failureCategory', channel: 'failure', source: 'command-service' },
      { path: 'error.details.results[].reasonCodes', channel: 'failure', source: 'command-service' },
    ]))
    expect(writeImportApplyAction?.fieldStability).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
      { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
      { path: 'error.details.results[].failureCategory', channel: 'failure', stabilityTier: 'stable' },
      { path: 'error.details.results[].reasonCodes', channel: 'failure', stabilityTier: 'stable' },
    ]))
    expect(writeImportApplyAction?.readOrderGroups.success.find((group) => group.stage === 'summary')).toEqual({
      stage: 'summary',
      fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'],
      purpose: '先看 apply 的平台级聚合、reference 聚合和写入可执行性聚合。',
    })
    expect(writeImportApplyAction?.readOrderGroups.success.find((group) => group.stage === 'detail')).toEqual({
      stage: 'detail',
      fields: ['platformSummary', 'preview', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability', 'results'],
      purpose: '单条 apply 再理解平台语义和 scope 决策；批量 apply 则在这一层展开 results[]。',
    })
    expect(writeImportApplyAction?.primaryFieldSemantics).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
      { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
      { path: 'results', semantic: 'item-collection' },
    ]))
    expect(writeImportApplyAction?.primaryErrorFieldSemantics).toEqual(expect.arrayContaining([
      { path: 'error.details.results[].failureCategory', semantic: 'error-details' },
      { path: 'error.details.results[].reasonCodes', semantic: 'error-details' },
    ]))
    expect(writeImportApplyAction?.failureCodes).toEqual([
      { code: 'IMPORT_SOURCE_NOT_FOUND', priority: 1, category: 'source', recommendedHandling: 'check-import-source', textEntryPoint: 'error-message', appliesWhen: '当错误来自导入源文件、schema 或 profile 选择问题时优先使用。', triggerFields: ['error.code', 'error.details.sourceFile'] },
      { code: 'IMPORT_SOURCE_INVALID', priority: 2, category: 'source', recommendedHandling: 'check-import-source', textEntryPoint: 'error-message', appliesWhen: '当错误来自导入源文件、schema 或 profile 选择问题时优先使用。', triggerFields: ['error.code', 'error.details.sourceFile'] },
      { code: 'IMPORT_UNSUPPORTED_SCHEMA', priority: 3, category: 'source', recommendedHandling: 'check-import-source', textEntryPoint: 'error-message', appliesWhen: '当错误来自导入源文件、schema 或 profile 选择问题时优先使用。', triggerFields: ['error.code', 'error.details.sourceFile'] },
      { code: 'IMPORT_PROFILE_NOT_FOUND', priority: 4, category: 'source', recommendedHandling: 'check-import-source', textEntryPoint: 'error-message', appliesWhen: '当错误来自导入源文件、schema 或 profile 选择问题时优先使用。', triggerFields: ['error.code', 'error.details.sourceFile'] },
      { code: 'IMPORT_APPLY_BATCH_PLATFORM_MISMATCH', priority: 5, category: 'platform', recommendedHandling: 'group-by-platform', textEntryPoint: 'error-message', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
      { code: 'IMPORT_SOURCE_REDACTED_INLINE_SECRETS', priority: 6, category: 'source', recommendedHandling: 'check-import-source', textEntryPoint: 'redacted-fields', appliesWhen: '当错误来自导入源文件、schema 或 profile 选择问题时优先使用。', triggerFields: ['error.code', 'error.details.sourceFile'] },
      { code: 'INVALID_SCOPE', priority: 7, category: 'input', recommendedHandling: 'fix-input-and-retry', textEntryPoint: 'error-message', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
      { code: 'IMPORT_SCOPE_UNAVAILABLE', priority: 8, category: 'scope', recommendedHandling: 'resolve-scope-before-retry', textEntryPoint: 'scope-availability', appliesWhen: '当错误表明 scope 解析、可用性或匹配条件未满足时优先使用。', triggerFields: ['error.code', 'error.details.scopePolicy', 'error.details.scopeAvailability'] },
      { code: 'IMPORT_APPLY_NOT_READY', priority: 9, category: 'state', recommendedHandling: 'resolve-scope-before-retry', textEntryPoint: 'preview-decision', appliesWhen: '当错误表明当前目标资源、快照或状态前提不存在时优先使用。', triggerFields: ['error.code'] },
      { code: 'VALIDATION_FAILED', priority: 10, category: 'runtime', recommendedHandling: 'inspect-runtime-details', textEntryPoint: 'error-message', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
      { code: 'CONFIRMATION_REQUIRED', priority: 11, category: 'confirmation', recommendedHandling: 'confirm-before-write', textEntryPoint: 'risk-summary', appliesWhen: '当错误仅因缺少显式确认而阻止写入时优先使用。', triggerFields: ['error.code', 'error.details.risk', 'error.details.previewDecision'] },
      { code: 'IMPORT_PLATFORM_NOT_SUPPORTED', priority: 12, category: 'platform', recommendedHandling: 'check-platform-support', textEntryPoint: 'error-message', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
      { code: 'ADAPTER_NOT_REGISTERED', priority: 13, category: 'platform', recommendedHandling: 'check-platform-support', textEntryPoint: 'error-message', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
      { code: 'IMPORT_APPLY_BATCH_PARTIAL_FAILURE', priority: 14, category: 'runtime', recommendedHandling: 'inspect-runtime-details', textEntryPoint: 'error-message', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
      { code: 'IMPORT_APPLY_FAILED', priority: 15, category: 'runtime', recommendedHandling: 'inspect-runtime-details', textEntryPoint: 'reference-summary', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
    ])
    expect(writeImportApplyAction?.failureTextActions).toEqual([
      { textEntryPoint: 'error-message', recommendedHandling: 'check-import-source', appliesToCodes: ['IMPORT_SOURCE_NOT_FOUND', 'IMPORT_SOURCE_INVALID', 'IMPORT_UNSUPPORTED_SCHEMA', 'IMPORT_PROFILE_NOT_FOUND'] },
      { textEntryPoint: 'error-message', recommendedHandling: 'group-by-platform', appliesToCodes: ['IMPORT_APPLY_BATCH_PLATFORM_MISMATCH'] },
      { textEntryPoint: 'redacted-fields', recommendedHandling: 'check-import-source', appliesToCodes: ['IMPORT_SOURCE_REDACTED_INLINE_SECRETS'] },
      { textEntryPoint: 'error-message', recommendedHandling: 'fix-input-and-retry', appliesToCodes: ['INVALID_SCOPE'] },
      { textEntryPoint: 'scope-availability', recommendedHandling: 'resolve-scope-before-retry', appliesToCodes: ['IMPORT_SCOPE_UNAVAILABLE'] },
      { textEntryPoint: 'preview-decision', recommendedHandling: 'resolve-scope-before-retry', appliesToCodes: ['IMPORT_APPLY_NOT_READY'] },
      { textEntryPoint: 'error-message', recommendedHandling: 'inspect-runtime-details', appliesToCodes: ['VALIDATION_FAILED', 'IMPORT_APPLY_BATCH_PARTIAL_FAILURE'] },
      { textEntryPoint: 'risk-summary', recommendedHandling: 'confirm-before-write', appliesToCodes: ['CONFIRMATION_REQUIRED'] },
      { textEntryPoint: 'error-message', recommendedHandling: 'check-platform-support', appliesToCodes: ['IMPORT_PLATFORM_NOT_SUPPORTED', 'ADAPTER_NOT_REGISTERED'] },
      { textEntryPoint: 'reference-summary', recommendedHandling: 'inspect-runtime-details', appliesToCodes: ['IMPORT_APPLY_FAILED'] },
    ])

    expect(validateAction).toEqual({
      action: 'validate',
      hasPlatformSummary: true,
      hasPlatformStats: true,
      hasScopeCapabilities: false,
      hasScopeAvailability: false,
      hasScopePolicy: false,
      consumerProfileIds: ['readonly-state-audit'],
      primaryFields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'summary.triageStats', 'items', 'items.referenceSummary'],
      primaryErrorFields: ['error.code', 'error.message'],
      failureCodes: [
        { code: 'PROFILE_NOT_FOUND', priority: 1, category: 'state', recommendedHandling: 'select-existing-resource', textEntryPoint: 'error-message', appliesWhen: '当错误表明当前目标资源、快照或状态前提不存在时优先使用。', triggerFields: ['error.code'] },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 2, category: 'platform', recommendedHandling: 'check-platform-support', textEntryPoint: 'error-message', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
        { code: 'VALIDATE_FAILED', priority: 3, category: 'runtime', recommendedHandling: 'inspect-runtime-details', textEntryPoint: 'error-message', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
      ],
      failureTextActions: [
        { textEntryPoint: 'error-message', recommendedHandling: 'select-existing-resource', appliesToCodes: ['PROFILE_NOT_FOUND'] },
        { textEntryPoint: 'error-message', recommendedHandling: 'check-platform-support', appliesToCodes: ['ADAPTER_NOT_REGISTERED'] },
        { textEntryPoint: 'error-message', recommendedHandling: 'inspect-runtime-details', appliesToCodes: ['VALIDATE_FAILED'] },
      ],
      fieldPresence: [
        { path: 'summary.platformStats', channel: 'success', presence: 'always' },
        { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
        { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
        { path: 'summary.triageStats', channel: 'success', presence: 'always' },
        { path: 'items', channel: 'success', presence: 'always' },
        { path: 'items.referenceSummary', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_ITEM_HAS_REFERENCE_OR_INLINE_SECRET_CONTEXT' },
      ],
      fieldSources: [
        { path: 'summary.platformStats', channel: 'success', source: 'command-service' },
        { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
        { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
        { path: 'summary.triageStats', channel: 'success', source: 'command-service' },
        { path: 'items', channel: 'success', source: 'command-service' },
        { path: 'items.referenceSummary', channel: 'success', source: 'command-service' },
      ],
      fieldStability: [
        { path: 'summary.platformStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'summary.triageStats', channel: 'success', stabilityTier: 'stable' },
        { path: 'items', channel: 'success', stabilityTier: 'stable' },
        { path: 'items.referenceSummary', channel: 'success', stabilityTier: 'stable' },
      ],
      readOrderGroups: {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'summary.triageStats'], purpose: '先看平台级通过/限制聚合、reference 聚合、写入可执行性聚合和 triage 分流桶。' },
          { stage: 'items', fields: ['items', 'items.referenceSummary'], purpose: '再展开各 profile 校验结果，并按需读取每项的 reference explainable。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '先确定失败类型。' },
        ],
      },
      summarySections: [
        { id: 'platform', title: 'Platform summary', priority: 1, fields: ['summary.platformStats'], purpose: '先看平台级聚合，快速判断结果覆盖了哪些平台以及各平台状态分布。', recommendedWhen: ['cross-platform overview', 'top-level health check'] },
        { id: 'reference', title: 'Reference summary', priority: 2, fields: ['summary.referenceStats'], purpose: '看 secret/reference 解析形态，判断是否存在未解析 env、受支持但不写入、或不支持 scheme 的输入。', recommendedWhen: ['secret governance', 'reference resolution review'] },
        { id: 'executability', title: 'Executability summary', priority: 3, fields: ['summary.executabilityStats'], purpose: '看后续若进入写入命令时是否具备可执行条件，用于区分可继续处理和需人工修复的项。', recommendedWhen: ['pre-write readiness', 'apply/use readiness check'] },
      ],
      primaryFieldSemantics: [
        { path: 'summary.platformStats', semantic: 'platform-aggregate' },
        { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
        { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
        { path: 'summary.triageStats', semantic: 'triage-aggregate' },
        { path: 'items', semantic: 'item-collection' },
        { path: 'items.referenceSummary', semantic: 'item-explainable' },
      ],
      primaryErrorFieldSemantics: [
        { path: 'error.code', semantic: 'error-core' },
        { path: 'error.message', semantic: 'error-core' },
      ],
    })

    expect(schemaAction).toEqual({
      action: 'schema',
      hasPlatformSummary: false,
      hasPlatformStats: false,
      hasScopeCapabilities: false,
      hasScopeAvailability: false,
      hasScopePolicy: false,
      primaryFields: ['commandCatalog', 'schemaVersion', 'schemaId', 'schema'],
      primaryErrorFields: ['error.code', 'error.message'],
      failureCodes: [
        { code: 'SCHEMA_ACTION_NOT_FOUND', priority: 1, category: 'input', recommendedHandling: 'fix-input-and-retry', textEntryPoint: 'error-message', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'SCHEMA_CONSUMER_PROFILE_NOT_FOUND', priority: 2, category: 'input', recommendedHandling: 'fix-input-and-retry', textEntryPoint: 'error-message', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'SCHEMA_RECOMMENDED_ACTION_NOT_FOUND', priority: 3, category: 'input', recommendedHandling: 'fix-input-and-retry', textEntryPoint: 'error-message', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
      ],
      failureTextActions: [
        { textEntryPoint: 'error-message', recommendedHandling: 'fix-input-and-retry', appliesToCodes: ['SCHEMA_ACTION_NOT_FOUND', 'SCHEMA_CONSUMER_PROFILE_NOT_FOUND', 'SCHEMA_RECOMMENDED_ACTION_NOT_FOUND'] },
      ],
      fieldPresence: [
        { path: 'schemaVersion', channel: 'success', presence: 'always' },
        { path: 'commandCatalog', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SCHEMA_DOCUMENT_IS_REQUESTED' },
        { path: 'schemaId', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SCHEMA_DOCUMENT_IS_REQUESTED' },
        { path: 'schema', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SCHEMA_DOCUMENT_IS_REQUESTED' },
      ],
      fieldSources: [
        { path: 'schemaVersion', channel: 'success', source: 'schema-service' },
        { path: 'commandCatalog', channel: 'success', source: 'schema-service' },
        { path: 'schemaId', channel: 'success', source: 'schema-service' },
        { path: 'schema', channel: 'success', source: 'schema-service' },
      ],
      fieldStability: [
        { path: 'schemaVersion', channel: 'success', stabilityTier: 'stable' },
        { path: 'commandCatalog', channel: 'success', stabilityTier: 'stable' },
        { path: 'schemaId', channel: 'success', stabilityTier: 'stable' },
        { path: 'schema', channel: 'success', stabilityTier: 'stable' },
      ],
      readOrderGroups: {
        success: [
          { stage: 'selection', fields: ['commandCatalog'], purpose: '先读取命令级能力索引。' },
          { stage: 'detail', fields: ['schemaVersion', 'schemaId', 'schema'], purpose: '再按需展开 schema 元信息和完整文档。' },
        ],
        failure: [
          { stage: 'error-core', fields: ['error.code', 'error.message'], purpose: '保留统一失败入口。' },
        ],
      },
      primaryFieldSemantics: [
        { path: 'commandCatalog', semantic: 'schema-catalog' },
        { path: 'schemaVersion', semantic: 'schema-metadata' },
        { path: 'schemaId', semantic: 'schema-metadata' },
        { path: 'schema', semantic: 'schema-document' },
      ],
      primaryErrorFieldSemantics: [
        { path: 'error.code', semantic: 'error-core' },
        { path: 'error.message', semantic: 'error-core' },
      ],
    })
    expect(payload.data?.schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(payload.data?.schema.$id).toBe(payload.data?.schemaId)
    expect(payload.data?.schema.$defs).toHaveProperty('ScopeCapability')
    expect(payload.data?.schema.$defs).toHaveProperty('CommandResult')
    expect(payload.data?.schema).toEqual(staticSchema)
  })


  it('CLI 椤跺眰鏈崟鑾峰紓甯告椂杩斿洖 stderr 骞惰缃?exitCode 2', async () => {
    const crashHookPath = path.join(runtimeDir, 'crash-on-stdout.cjs')
    await fs.writeFile(
      crashHookPath,
      "process.stdout.write = () => { throw new Error('stdout crashed for test') }\n",
      'utf8',
    )

    const result = await runCli(['current'], {
      NODE_OPTIONS: `--require ${crashHookPath}`,
    })

    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('stdout crashed for test')
    expect(result.exitCode).toBe(2)
  })

  it('未知命令保持 Commander 的 stderr 失败出口', async () => {
    const result = await runCli(['unknown-command'])

    expect(result.stdout).toBe('')
    expect(result.stderr).toContain("error: unknown command 'unknown-command'")
    expect(result.exitCode).toBe(1)
  })

  it('命令 help 从平台 policy 输出统一 scope 支持矩阵', async () => {
    const preview = await runCli(['preview', '--help'])
    const use = await runCli(['use', '--help'])
    const rollback = await runCli(['rollback', '--help'])

    expect(preview.exitCode).toBe(0)
    expect(use.exitCode).toBe(0)
    expect(rollback.exitCode).toBe(0)
    expect(preview.stdout).toContain('--scope <scope>')
    expect(preview.stdout).toContain('目标作用域（Claude: user/project/local; Codex: 不使用 --scope; Gemini:')
    expect(preview.stdout).toContain('user/project）')
    expect(use.stdout).toContain('目标作用域（Claude: user/project/local; Codex: 不使用 --scope; Gemini:')
    expect(use.stdout).toContain('user/project）')
    expect(rollback.stdout).toContain('期望回滚的目标作用域（Claude: user/project/local; Codex: 不使用 --scope;')
    expect(rollback.stdout).toContain('user/project）')
  })
})

