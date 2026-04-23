import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProfilesStore } from '../../src/stores/profiles.store'
import { StateStore } from '../../src/stores/state.store'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../../src/constants/public-json-schema'
import type { CommandResult } from '../../src/types/command'
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

describe('cli commands integration', () => {
  const PUBLIC_SCHEMA_CONTRACT_TIMEOUT_MS = 20_000

  it('核心命令 --json 成功输出可被 public JSON schema 校验', async () => {
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

  it('第二批命令 --json 成功输出可被 public JSON schema 校验', async () => {
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

  it('统一失败 envelope --json 输出可被 public JSON schema 校验', async () => {
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
      },
      {
        id: 'readonly-import-batch',
        title: 'Readonly import batch analysis',
        appliesToActions: ['import'],
        exampleActions: ['import'],
        bestEntryAction: 'import',
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
        { code: 'ADD_INPUT_REQUIRED', priority: 1, category: 'input', recommendedHandling: 'fix-input-and-retry', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'ADD_INPUT_CONFLICT', priority: 2, category: 'input', recommendedHandling: 'fix-input-and-retry', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'UNSUPPORTED_PLATFORM', priority: 3, category: 'input', recommendedHandling: 'fix-input-and-retry', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'GEMINI_URL_UNSUPPORTED', priority: 4, category: 'input', recommendedHandling: 'fix-input-and-retry', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'DUPLICATE_PROFILE_ID', priority: 5, category: 'state', recommendedHandling: 'select-existing-resource', appliesWhen: '当错误表明当前目标资源、快照或状态前提不存在时优先使用。', triggerFields: ['error.code'] },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 6, category: 'platform', recommendedHandling: 'check-platform-support', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
        { code: 'ADD_FAILED', priority: 7, category: 'runtime', recommendedHandling: 'inspect-runtime-details', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
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
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'], purpose: '先看单平台聚合、reference 聚合和写入可执行性聚合。' },
          { stage: 'detail', fields: ['risk', 'preview', 'scopeCapabilities'], purpose: '再展开新增结果、风险和 scope 能力。' },
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
        { code: 'ADAPTER_NOT_REGISTERED', priority: 1, category: 'platform', recommendedHandling: 'check-platform-support', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
        { code: 'CURRENT_FAILED', priority: 2, category: 'runtime', recommendedHandling: 'inspect-runtime-details', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
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
        { code: 'ADAPTER_NOT_REGISTERED', priority: 1, category: 'platform', recommendedHandling: 'check-platform-support', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
        { code: 'EXPORT_FAILED', priority: 2, category: 'runtime', recommendedHandling: 'inspect-runtime-details', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
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
        { code: 'UNSUPPORTED_PLATFORM', priority: 1, category: 'input', recommendedHandling: 'fix-input-and-retry', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 2, category: 'platform', recommendedHandling: 'check-platform-support', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
        { code: 'LIST_FAILED', priority: 3, category: 'runtime', recommendedHandling: 'inspect-runtime-details', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
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
      primaryFields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats', 'risk', 'preview', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability'],
      primaryErrorFields: ['error.code', 'error.message', 'error.details.scopePolicy', 'error.details.scopeAvailability'],
      failureCodes: [
        { code: 'PROFILE_NOT_FOUND', priority: 1, category: 'state', recommendedHandling: 'select-existing-resource', appliesWhen: '当错误表明当前目标资源、快照或状态前提不存在时优先使用。', triggerFields: ['error.code'] },
        { code: 'INVALID_SCOPE', priority: 2, category: 'input', recommendedHandling: 'fix-input-and-retry', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 3, category: 'platform', recommendedHandling: 'check-platform-support', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
        { code: 'PREVIEW_FAILED', priority: 4, category: 'runtime', recommendedHandling: 'inspect-runtime-details', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
      ],
      fieldPresence: [
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
      ],
      fieldSources: [
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
      ],
      fieldStability: [
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
      ],
      readOrderGroups: {
        success: [
          { stage: 'summary', fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'], purpose: '先看目标 scope 的平台聚合、reference 聚合和写入可执行性聚合。' },
          { stage: 'detail', fields: ['risk', 'preview', 'scopePolicy', 'scopeCapabilities', 'scopeAvailability'], purpose: '再展开预览、风险和 scope 元信息。' },
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
    expect(useAction?.primaryFields).toEqual([
      'summary.platformStats',
      'summary.referenceStats',
      'summary.executabilityStats',
      'platformSummary',
      'preview',
      'scopePolicy',
      'scopeCapabilities',
      'scopeAvailability',
      'changedFiles',
      'backupId',
    ])
    expect(useAction?.consumerProfileIds).toEqual(['single-platform-write'])
    expect(useAction?.fieldPresence).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
      { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
    ]))
    expect(useAction?.fieldSources).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
      { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
    ]))
    expect(useAction?.fieldStability).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
      { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
    ]))
    expect(useAction?.readOrderGroups.success.find((group) => group.stage === 'summary')).toEqual({
      stage: 'summary',
      fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'],
      purpose: '先看写入平台的聚合结果、reference 聚合和写入可执行性聚合。',
    })
    expect(useAction?.primaryFieldSemantics).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
      { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
    ]))
    expect(rollbackAction?.primaryFields).toEqual([
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
    expect(rollbackAction?.consumerProfileIds).toEqual(['single-platform-write'])
    expect(rollbackAction?.fieldPresence).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SNAPSHOT_PREVIOUS_PROFILE_IS_AVAILABLE' },
      { path: 'summary.executabilityStats', channel: 'success', presence: 'conditional', conditionCode: 'WHEN_SNAPSHOT_PREVIOUS_PROFILE_IS_AVAILABLE' },
    ]))
    expect(rollbackAction?.fieldSources).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
      { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
    ]))
    expect(rollbackAction?.fieldStability).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'bounded' },
      { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'bounded' },
    ]))
    expect(rollbackAction?.readOrderGroups.success.find((group) => group.stage === 'summary')).toEqual({
      stage: 'summary',
      fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'],
      purpose: '先看恢复的平台聚合，以及快照上一版 profile 的 reference 聚合和写入可执行性聚合。',
    })
    expect(rollbackAction?.primaryFieldSemantics).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
      { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
    ]))
    expect(importApplyAction?.primaryFields).toEqual([
      'summary.platformStats',
      'summary.referenceStats',
      'summary.executabilityStats',
      'platformSummary',
      'preview',
      'scopePolicy',
      'scopeCapabilities',
      'scopeAvailability',
      'changedFiles',
      'backupId',
    ])
    expect(importApplyAction?.consumerProfileIds).toEqual(['single-platform-write'])
    expect(importApplyAction?.fieldPresence).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', presence: 'always' },
      { path: 'summary.executabilityStats', channel: 'success', presence: 'always' },
    ]))
    expect(importApplyAction?.fieldSources).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', source: 'command-service' },
      { path: 'summary.executabilityStats', channel: 'success', source: 'command-service' },
    ]))
    expect(importApplyAction?.fieldStability).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', channel: 'success', stabilityTier: 'stable' },
      { path: 'summary.executabilityStats', channel: 'success', stabilityTier: 'stable' },
    ]))
    expect(importApplyAction?.readOrderGroups.success.find((group) => group.stage === 'summary')).toEqual({
      stage: 'summary',
      fields: ['summary.platformStats', 'summary.referenceStats', 'summary.executabilityStats'],
      purpose: '先看 apply 的平台级聚合、reference 聚合和写入可执行性聚合。',
    })
    expect(importApplyAction?.primaryFieldSemantics).toEqual(expect.arrayContaining([
      { path: 'summary.referenceStats', semantic: 'platform-aggregate' },
      { path: 'summary.executabilityStats', semantic: 'executability-aggregate' },
    ]))

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
        { code: 'PROFILE_NOT_FOUND', priority: 1, category: 'state', recommendedHandling: 'select-existing-resource', appliesWhen: '当错误表明当前目标资源、快照或状态前提不存在时优先使用。', triggerFields: ['error.code'] },
        { code: 'ADAPTER_NOT_REGISTERED', priority: 2, category: 'platform', recommendedHandling: 'check-platform-support', appliesWhen: '当错误表明当前平台或适配器不可用时优先使用。', triggerFields: ['error.code'] },
        { code: 'VALIDATE_FAILED', priority: 3, category: 'runtime', recommendedHandling: 'inspect-runtime-details', appliesWhen: '当错误来自运行时执行、底层异常或 validation 失败时优先使用。', triggerFields: ['error.code'] },
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
        { code: 'SCHEMA_ACTION_NOT_FOUND', priority: 1, category: 'input', recommendedHandling: 'fix-input-and-retry', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'SCHEMA_CONSUMER_PROFILE_NOT_FOUND', priority: 2, category: 'input', recommendedHandling: 'fix-input-and-retry', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
        { code: 'SCHEMA_RECOMMENDED_ACTION_NOT_FOUND', priority: 3, category: 'input', recommendedHandling: 'fix-input-and-retry', appliesWhen: '当错误来自输入参数或命令参数不合法时优先使用。', triggerFields: ['error.code'] },
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

  it('schema --json --consumer-profile 只返回目标 consumer profile', async () => {
    const result = await runCli(['schema', '--json', '--consumer-profile', 'readonly-import-batch'])
    const payload = parseJsonResult<{
      commandCatalog: {
        consumerProfiles?: Array<{ id: string }>
        actions: Array<{ action: string }>
      }
      schema?: Record<string, unknown>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')
    expect(payload.data?.commandCatalog.consumerProfiles?.map((item) => item.id)).toEqual(['readonly-import-batch'])
    expect(payload.data?.commandCatalog.actions.length).toBeGreaterThan(1)
    expect(payload.data?.schema).toBeDefined()
  })

  it('schema --json --consumer-profile 对未知 profile 返回稳定失败 envelope', async () => {
    const result = await runCli(['schema', '--json', '--consumer-profile', 'missing-profile'])
    const staticSchema = JSON.parse(await fs.readFile(publicJsonSchemaPath, 'utf8')) as JsonSchema
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('schema')
    expect(payload.error).toEqual({
      code: 'SCHEMA_CONSUMER_PROFILE_NOT_FOUND',
      message: '未找到指定 schema consumer profile: missing-profile',
      details: {
        consumerProfileId: 'missing-profile',
        availableConsumerProfileIds: ['readonly-state-audit', 'single-platform-write', 'readonly-import-batch'],
      },
    })
    expect(validatePayloadAgainstPublicSchema(staticSchema, payload)).toBe(true)
  })

  it('schema --json --action 只返回目标 action capability', async () => {
    const result = await runCli(['schema', '--json', '--action', 'import-apply'])
    const payload = parseJsonResult<{
      commandCatalog: {
        actions: Array<{ action: string }>
        consumerProfiles?: Array<{ id: string }>
      }
      schema?: Record<string, unknown>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')
    expect(payload.data?.commandCatalog.actions.map((item) => item.action)).toEqual(['import-apply'])
    expect(payload.data?.commandCatalog.consumerProfiles?.length).toBeGreaterThan(1)
    expect(payload.data?.schema).toBeDefined()
  })

  it('schema --json --action 对未知 action 返回稳定失败 envelope', async () => {
    const result = await runCli(['schema', '--json', '--action', 'missing-action'])
    const staticSchema = JSON.parse(await fs.readFile(publicJsonSchemaPath, 'utf8')) as JsonSchema
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('schema')
    expect(payload.error).toEqual({
      code: 'SCHEMA_ACTION_NOT_FOUND',
      message: '未找到指定 schema action: missing-action',
      details: {
        action: 'missing-action',
        availableActions: ['add', 'current', 'export', 'import', 'import-apply', 'list', 'preview', 'rollback', 'schema', 'use', 'validate'],
      },
    })
    expect(validatePayloadAgainstPublicSchema(staticSchema, payload)).toBe(true)
  })

  it('schema --json --recommended-action 只返回目标 recommended action', async () => {
    const result = await runCli(['schema', '--json', '--recommended-action', 'continue-to-write'])
    const payload = parseJsonResult<{
      commandCatalog: {
        recommendedActions?: Array<{ code: string }>
        actions: Array<{ action: string }>
        consumerProfiles?: Array<{ id: string }>
      }
      schema?: Record<string, unknown>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')
    expect(payload.data?.commandCatalog.recommendedActions?.map((item) => item.code)).toEqual(['continue-to-write'])
    expect(payload.data?.commandCatalog.actions.length).toBeGreaterThan(1)
    expect(payload.data?.commandCatalog.consumerProfiles?.length).toBeGreaterThan(1)
    expect(payload.data?.schema).toBeDefined()
  })

  it('schema --json --recommended-action 对未知 code 返回稳定失败 envelope', async () => {
    const result = await runCli(['schema', '--json', '--recommended-action', 'missing-step'])
    const staticSchema = JSON.parse(await fs.readFile(publicJsonSchemaPath, 'utf8')) as JsonSchema
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('schema')
    expect(payload.error).toEqual({
      code: 'SCHEMA_RECOMMENDED_ACTION_NOT_FOUND',
      message: '未找到指定 schema recommended action: missing-step',
      details: {
        code: 'missing-step',
        availableRecommendedActions: [
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
        ],
      },
    })
    expect(validatePayloadAgainstPublicSchema(staticSchema, payload)).toBe(true)
  })

  it('schema --json --catalog-summary 只返回轻量 catalog 索引', async () => {
    const result = await runCli(['schema', '--json', '--catalog-summary'])
    const payload = parseJsonResult<{
      catalogSummary?: {
        counts: {
          consumerProfiles: number
          actions: number
          recommendedActions: number
        }
        consumerProfiles: Array<{
          id: string
          bestEntryAction: string
          hasStarterTemplate?: boolean
          starterTemplateId?: string
          recommendedEntryMode?: 'starter-template' | 'full-consumer-profile'
        }>
        actions: Array<{ action: string }>
        recommendedActions: Array<{ code: string; family: string }>
      }
      commandCatalog?: unknown
      schema?: unknown
      schemaId?: string
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')
    expect(payload.data?.catalogSummary).toEqual({
      counts: {
        consumerProfiles: 3,
        actions: 11,
        recommendedActions: 15,
      },
      consumerProfiles: [
        {
          id: 'readonly-state-audit',
          bestEntryAction: 'current',
          hasStarterTemplate: true,
          starterTemplateId: 'readonly-state-audit-minimal-reader',
          recommendedEntryMode: 'starter-template',
        },
        {
          id: 'single-platform-write',
          bestEntryAction: 'preview',
          recommendedEntryMode: 'full-consumer-profile',
        },
        {
          id: 'readonly-import-batch',
          bestEntryAction: 'import',
          hasStarterTemplate: true,
          starterTemplateId: 'readonly-import-batch-minimal-reader',
          recommendedEntryMode: 'starter-template',
        },
      ],
      actions: [
        { action: 'add' },
        { action: 'current' },
        { action: 'export' },
        { action: 'import' },
        { action: 'import-apply' },
        { action: 'list' },
        { action: 'preview' },
        { action: 'rollback' },
        { action: 'schema' },
        { action: 'use' },
        { action: 'validate' },
      ],
      recommendedActions: [
        { code: 'inspect-items', family: 'inspect' },
        { code: 'review-reference-details', family: 'inspect' },
        { code: 'repair-source-input', family: 'repair' },
        { code: 'group-by-platform', family: 'route' },
        { code: 'continue-to-write', family: 'execute' },
        { code: 'fix-input-and-retry', family: 'repair' },
        { code: 'select-existing-resource', family: 'repair' },
        { code: 'resolve-scope-before-retry', family: 'repair' },
        { code: 'confirm-before-write', family: 'execute' },
        { code: 'check-platform-support', family: 'repair' },
        { code: 'inspect-runtime-details', family: 'inspect' },
        { code: 'check-import-source', family: 'repair' },
        { code: 'fix-reference-input', family: 'repair' },
        { code: 'resolve-reference-support', family: 'repair' },
        { code: 'migrate-inline-secret', family: 'repair' },
      ],
    })
    expect(payload.data?.commandCatalog).toBeUndefined()
    expect(payload.data?.schema).toBeUndefined()
    expect(payload.data?.schemaId).toBeUndefined()
  })

  it('schema --json 暴露 use/import-apply 失败态 referenceGovernance 消费入口', async () => {
    const result = await runCli(['schema', '--json'])
    const payload = parseJsonResult<{
      commandCatalog: {
        actions: Array<{
          action: string
          primaryErrorFields: string[]
          failureCodes: Array<{
            code: string
            priority: number
            category: string
            recommendedHandling: string
          }>
          fieldPresence: Array<{ path: string; channel: string; presence: string; conditionCode?: string }>
          fieldSources: Array<{ path: string; channel: string; source: string }>
          fieldStability: Array<{ path: string; channel: string; stabilityTier: string }>
          readOrderGroups: { failure: Array<{ stage: string; fields: string[] }> }
          primaryErrorFieldSemantics: Array<{ path: string; semantic: string }>
          referenceGovernanceCodes?: Array<{
            code: string
            priority: number
            category: string
            recommendedHandling: string
          }>
        }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)

    for (const actionName of ['use', 'import-apply']) {
      const action = payload.data?.commandCatalog.actions.find((item) => item.action === actionName)
      expect(action?.primaryErrorFields).toContain('error.details.referenceGovernance')
      expect(action?.fieldPresence).toContainEqual({
        path: 'error.details.referenceGovernance',
        channel: 'failure',
        presence: 'conditional',
        conditionCode: 'WHEN_REFERENCE_GOVERNANCE_FAILURE_IS_DETECTED',
      })
      expect(action?.fieldSources).toContainEqual({
        path: 'error.details.referenceGovernance',
        channel: 'failure',
        source: 'command-service',
      })
      expect(action?.fieldStability).toContainEqual({
        path: 'error.details.referenceGovernance',
        channel: 'failure',
        stabilityTier: 'stable',
      })
      expect(action?.readOrderGroups.failure.find((group) => group.stage === 'error-details')?.fields).toContain('error.details.referenceGovernance')
      expect(action?.primaryErrorFieldSemantics).toContainEqual({
        path: 'error.details.referenceGovernance',
        semantic: 'reference-governance',
      })
      if (actionName === 'import-apply') {
        expect(action?.failureCodes).toEqual(expect.arrayContaining([
          expect.objectContaining({
            code: 'IMPORT_SOURCE_REDACTED_INLINE_SECRETS',
            priority: 5,
            category: 'source',
            recommendedHandling: 'check-import-source',
            appliesWhen: '当错误来自导入源文件、schema 或 profile 选择问题时优先使用。',
            triggerFields: ['error.code', 'error.details.sourceFile'],
          }),
        ]))
      }
      expect(action?.referenceGovernanceCodes).toEqual([
        {
          code: 'REFERENCE_INPUT_CONFLICT',
          priority: 1,
          category: 'input',
          recommendedHandling: 'fix-reference-input',
          appliesWhen: '当 reference 输入彼此冲突，必须先统一输入来源时优先使用。',
          triggerFields: ['error.details.referenceGovernance.primaryReason', 'error.details.referenceGovernance.reasonCodes', 'error.details.referenceGovernance.referenceDetails'],
        },
        {
          code: 'REFERENCE_MISSING',
          priority: 2,
          category: 'reference',
          recommendedHandling: 'fix-reference-input',
          appliesWhen: '当 reference 缺少必需值，必须先补齐缺失引用或环境来源时优先使用。',
          triggerFields: ['error.details.referenceGovernance.primaryReason', 'error.details.referenceGovernance.reasonCodes', 'error.details.referenceGovernance.referenceDetails'],
        },
        {
          code: 'REFERENCE_WRITE_UNSUPPORTED',
          priority: 3,
          category: 'reference',
          recommendedHandling: 'resolve-reference-support',
          appliesWhen: '当平台已识别 reference，但当前写入目标不支持该形态时优先使用。',
          triggerFields: ['error.details.referenceGovernance.primaryReason', 'error.details.referenceGovernance.reasonCodes', 'error.details.referenceGovernance.referenceDetails'],
        },
        {
          code: 'INLINE_SECRET_PRESENT',
          priority: 4,
          category: 'inline-secret',
          recommendedHandling: 'migrate-inline-secret',
          appliesWhen: '当写入链路检测到 inline secret，必须先迁移到受支持治理形态时优先使用。',
          triggerFields: ['error.details.referenceGovernance.primaryReason', 'error.details.referenceGovernance.reasonCodes', 'error.details.referenceGovernance.referenceDetails'],
        },
      ])
    }
  })

  it('schema 文本输出当前 public JSON schema 摘要', async () => {
    const result = await runCli(['schema'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[schema] 成功')
    expect(result.stdout).toContain('Schema Version: 2026-04-15.public-json.v1')
    expect(result.stdout).toContain('Schema ID: https://api-switcher.local/schemas/public-json-output.schema.json')
  })

  it('schema --catalog-summary 文本输出会给出 consumer profile 推荐入口提示', async () => {
    const result = await runCli(['schema', '--catalog-summary'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[schema] 成功')
    expect(result.stdout).toContain('Catalog Summary:')
    expect(result.stdout).toContain('readonly-state-audit')
    expect(result.stdout).toContain('recommended=starter-template')
    expect(result.stdout).toContain('starterTemplate=readonly-state-audit-minimal-reader')
    expect(result.stdout).toContain('next=api-switcher schema --json --consumer-profile readonly-state-audit')
    expect(result.stdout).toContain('single-platform-write')
    expect(result.stdout).toContain('recommended=full-consumer-profile')
    expect(result.stdout).toContain('next=api-switcher schema --json --consumer-profile single-platform-write')
    expect(result.stdout).toContain('readonly-import-batch')
    expect(result.stdout).toContain('starterTemplate=readonly-import-batch-minimal-reader')
  })

  it('schema 命令在顶层 help 和子命令 help 中可发现', async () => {
    const root = await runCli(['--help'])
    const schema = await runCli(['schema', '--help'])

    expect(root.stderr).toBe('')
    expect(root.exitCode).toBe(0)
    expect(root.stdout).toContain('schema')
    expect(root.stdout).toContain('输出 public JSON schema')
    expect(root.stdout).toContain('consumerProfiles[].defaultConsumerFlowId')
    expect(root.stdout).toContain('consumerFlow[]')

    expect(schema.stderr).toBe('')
    expect(schema.exitCode).toBe(0)
    expect(schema.stdout).toContain('Usage:')
    expect(schema.stdout).toContain('consumerProfiles[].defaultConsumerFlowId')
    expect(schema.stdout).toContain('consumerFlow[]')
    expect(schema.stdout).toContain('--json')
    expect(schema.stdout).toContain('使用 JSON 输出')
    expect(schema.stdout).toContain('--schema-version')
    expect(schema.stdout).toContain('--consumer-profile <id>')
    expect(schema.stdout).toContain('--action <action>')
    expect(schema.stdout).toContain('--recommended-action <code>')
    expect(schema.stdout).toContain('--catalog-summary')
    expect(schema.stdout).toContain('先用 --catalog-summary')
    expect(schema.stdout).toContain('完整 catalog')
  })

  it('schema --schema-version 只输出当前 public JSON schema 版本', async () => {
    const result = await runCli(['schema', '--schema-version'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[schema] 成功')
    expect(result.stdout).toContain(`Schema Version: ${PUBLIC_JSON_SCHEMA_VERSION}`)
    expect(result.stdout).not.toContain('Schema ID:')
  })

  it('schema --schema-version --json 只返回当前 public JSON schema 版本', async () => {
    const result = await runCli(['schema', '--schema-version', '--json'])
    const payload = parseJsonResult<{ schemaVersion: string }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('schema')
    expect(payload.data).toEqual({ schemaVersion: PUBLIC_JSON_SCHEMA_VERSION })
  })

  it('current --json 输出结构化 state 与检测结果', async () => {
    await new StateStore().markCurrent('gemini', 'gemini-prod', 'snapshot-gemini-001')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['current', '--json'])
    const payload = parseJsonResult<{
      current: Record<string, string>
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          currentProfileId?: string
          detectedProfileId?: string
          managed: boolean
          currentScope?: string
          platformSummary?: {
            kind: string
            precedence?: string[]
            currentScope?: string
            composedFiles?: string[]
            facts: Array<{ code: string; message: string }>
          }
        }>
        warnings: string[]
        limitations: string[]
      }
      detections: Array<{
        platform: string
        managed: boolean
        matchedProfileId?: string
        platformSummary?: {
          kind: string
          precedence?: string[]
          currentScope?: string
          composedFiles?: string[]
          facts: Array<{ code: string; message: string }>
        }
        targetFiles: Array<{ path: string; scope?: string }>
        managedBoundaries?: Array<{ type: string; managedKeys: string[]; preservedKeys?: string[]; notes?: string[] }>
        secretReferences?: Array<{ key: string; source: string; present: boolean; maskedValue: string }>
        effectiveConfig?: {
          stored: Array<{ key: string; maskedValue: string; source: string; scope?: string; secret?: boolean }>
          effective: Array<{ key: string; maskedValue: string; source: string; scope?: string; secret?: boolean; shadowed?: boolean }>
          overrides: Array<{ key: string; kind: string; source: string; message: string; shadowed?: boolean }>
          shadowedKeys?: string[]
        }
        scopeCapabilities?: ScopeCapabilityContract[]
        scopeAvailability?: ScopeAvailabilityContract[]
        warnings?: Array<{ code: string; message: string }>
        limitations?: Array<{ code: string; message: string }>
      }>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('current')
    expect(payload.data?.current.gemini).toBe('gemini-prod')
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'gemini',
        profileCount: 2,
        currentProfileId: 'gemini-prod',
        detectedProfileId: 'gemini-prod',
        managed: true,
        currentScope: 'user',
        platformSummary: {
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          currentScope: 'user',
          facts: [
            { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
            { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
          ],
        },
      }),
    ]))
    expect(payload.data?.summary.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(payload.data?.summary.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')

    const geminiDetection = payload.data?.detections.find((item) => item.platform === 'gemini')
    expect(geminiDetection?.managed).toBe(true)
    expect(geminiDetection?.matchedProfileId).toBe('gemini-prod')
    expect(geminiDetection?.targetFiles.find((item) => item.scope === 'user')?.path).toBe(geminiSettingsPath)
    expect(geminiDetection?.scopeCapabilities).toEqual([
      expect.objectContaining({
        scope: 'system-defaults',
        detect: true,
        preview: true,
        use: false,
        rollback: false,
        writable: false,
      }),
      expect.objectContaining({
        scope: 'user',
        detect: true,
        preview: true,
        use: true,
        rollback: true,
        writable: true,
        risk: 'normal',
      }),
      expect.objectContaining({
        scope: 'project',
        detect: true,
        preview: true,
        use: true,
        rollback: true,
        writable: true,
        risk: 'high',
        confirmationRequired: true,
      }),
      expect.objectContaining({
        scope: 'system-overrides',
        detect: true,
        preview: true,
        use: false,
        rollback: false,
        writable: false,
      }),
    ])
    expect(geminiDetection?.scopeAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'user',
        status: 'available',
        detected: true,
        writable: true,
      }),
      expect.objectContaining({
        scope: 'project',
        status: 'available',
        detected: true,
        writable: true,
        path: geminiProjectSettingsPath,
      }),
    ]))
    expect(geminiDetection?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
      currentScope: 'user',
      facts: [
        { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
        { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
      ],
    })
    expect(geminiDetection?.managedBoundaries?.[0]?.type).toBe('scope-aware')
    expect(geminiDetection?.managedBoundaries?.[0]?.managedKeys).toContain('enforcedAuthType')
    expect(geminiDetection?.managedBoundaries?.[1]?.type).toBe('managed-fields')
    expect(geminiDetection?.managedBoundaries?.[1]?.preservedKeys).toContain('ui')
    expect(geminiDetection?.secretReferences).toEqual([
      {
        key: 'GEMINI_API_KEY',
        source: 'env',
        present: true,
        maskedValue: 'gm-l***56',
      },
    ])
    expect(geminiDetection?.effectiveConfig?.stored).toHaveLength(1)
    expect(geminiDetection?.effectiveConfig?.stored?.[0]).toMatchObject({
      key: 'enforcedAuthType',
      maskedValue: 'gemini-api-key',
      source: 'stored',
      scope: 'user',
      secret: false,
    })
    expect(geminiDetection?.effectiveConfig?.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'enforcedAuthType',
        maskedValue: 'gemini-api-key',
        source: 'effective',
        scope: 'user',
        secret: false,
      }),
      expect.objectContaining({
        key: 'GEMINI_API_KEY',
        maskedValue: 'gm-l***56',
        source: 'env',
        scope: 'runtime',
        secret: true,
        shadowed: true,
      }),
    ]))
    expect(geminiDetection?.effectiveConfig?.overrides).toEqual([
      {
        key: 'GEMINI_API_KEY',
        kind: 'env',
        source: 'env',
        message: '最终生效的 API key 取决于环境变量，而不是 settings.json。',
        shadowed: true,
      },
    ])
    expect(geminiDetection?.effectiveConfig?.shadowedKeys).toEqual(['GEMINI_API_KEY'])
    expect(geminiDetection?.warnings?.map((item) => item.message)).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(geminiDetection?.limitations?.map((item) => item.message)).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('current 文本输出底层 state 读取异常的失败结果', async () => {
    const statePath = path.join(runtimeDir, 'state.json')
    await fs.rm(statePath, { force: true, recursive: true })
    await fs.mkdir(statePath, { recursive: true })

    const result = await runCli(['current'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain('[current] 失败')
    expect(result.stdout).toContain('EISDIR')
  })

  it('list --json 输出结构化 profiles 与 explainable 摘要', async () => {
    await new StateStore().markCurrent('gemini', 'gemini-prod', 'snapshot-gemini-001')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['list', '--json'])
    const payload = parseJsonResult<{
      profiles: Array<{
        profile: Profile
        current: boolean
        healthStatus: string
        riskLevel: string
        platformSummary?: {
          kind: string
          precedence?: string[]
          currentScope?: string
          composedFiles?: string[]
          facts: Array<{ code: string; message: string }>
        }
        scopeCapabilities?: ScopeCapabilityContract[]
        scopeAvailability?: ScopeAvailabilityContract[]
      }>
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          currentProfileId?: string
          detectedProfileId?: string
          managed: boolean
          currentScope?: string
          platformSummary?: {
            kind: string
            precedence?: string[]
            currentScope?: string
            composedFiles?: string[]
            facts: Array<{ code: string; message: string }>
          }
        }>
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('list')
    expect(payload.data?.profiles).toHaveLength(4)
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'claude',
        profileCount: 1,
        managed: false,
        currentScope: 'project',
        platformSummary: expect.objectContaining({
          kind: 'scope-precedence',
          precedence: ['user', 'project', 'local'],
          currentScope: 'project',
          facts: [
            { code: 'CLAUDE_SCOPE_PRECEDENCE', message: 'Claude 支持 user < project < local 三层 precedence。' },
            { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '如果存在 local，同名字段最终以 local 为准。' },
          ],
        }),
      }),
      expect.objectContaining({
        platform: 'codex',
        profileCount: 1,
        managed: false,
        platformSummary: expect.objectContaining({
          kind: 'multi-file-composition',
          facts: [
            { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
            { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
          ],
        }),
      }),
      expect.objectContaining({
        platform: 'gemini',
        profileCount: 2,
        currentProfileId: 'gemini-prod',
        detectedProfileId: 'gemini-prod',
        managed: true,
        currentScope: 'user',
        platformSummary: expect.objectContaining({
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
          currentScope: 'user',
          facts: [
            { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
            { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
          ],
        }),
      }),
    ]))
    expect(payload.data?.summary.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(payload.data?.summary.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')

    const geminiProfile = payload.data?.profiles.find((item) => item.profile.id === 'gemini-prod')
    expect(geminiProfile?.current).toBe(true)
    expect(geminiProfile?.healthStatus).toBe('valid')
    expect(geminiProfile?.riskLevel).toBe('low')
    expect(geminiProfile?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'system-defaults', use: false, rollback: false, writable: false }),
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true }),
      expect.objectContaining({ scope: 'system-overrides', use: false, rollback: false, writable: false }),
    ]))
    expect(geminiProfile?.scopeAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', status: 'available', writable: true }),
      expect.objectContaining({ scope: 'project', status: 'available', writable: true, path: geminiProjectSettingsPath }),
    ]))

    const claudeProfile = payload.data?.profiles.find((item) => item.profile.id === 'claude-prod')
    expect(claudeProfile?.current).toBe(false)
    expect(claudeProfile?.healthStatus).toBe('unknown')
    expect(claudeProfile?.riskLevel).toBe('low')
    expect(claudeProfile?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'local', use: true, rollback: true, writable: true }),
    ]))
    expect(claudeProfile?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['user', 'project', 'local'],
      currentScope: 'project',
      facts: [
        { code: 'CLAUDE_SCOPE_PRECEDENCE', message: 'Claude 支持 user < project < local 三层 precedence。' },
        { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '如果存在 local，同名字段最终以 local 为准。' },
      ],
    })

    const codexProfile = payload.data?.profiles.find((item) => item.profile.id === 'codex-prod')
    expect(codexProfile?.platformSummary).toEqual({
      kind: 'multi-file-composition',
      composedFiles: expect.any(Array),
      facts: [
        { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
        { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
      ],
    })
  })

  it('validate --json 成功时返回带 explainable 元数据的结构化 items', async () => {
    const result = await runCli(['validate', 'gemini-prod', '--json'])
    const payload = parseJsonResult<{
      items: Array<{
        profileId: string
        platform: string
        platformSummary?: {
          kind: string
          precedence?: string[]
          currentScope?: string
          composedFiles?: string[]
          facts: Array<{ code: string; message: string }>
        }
        scopeCapabilities?: ScopeCapabilityContract[]
        validation: {
          ok: boolean
          warnings: Array<{ code: string }>
          errors: Array<{ code: string }>
          limitations: Array<{ code: string; message: string }>
          effectiveConfig?: {
            stored: Array<{ key: string; maskedValue: string; source: string; scope?: string; secret?: boolean }>
            effective: Array<{ key: string; maskedValue: string; source: string; scope?: string; secret?: boolean; shadowed?: boolean }>
            overrides: Array<{ key: string; kind: string; source: string; message: string; shadowed?: boolean }>
            shadowedKeys?: string[]
          }
          managedBoundaries?: Array<{ type: string; managedKeys: string[]; preservedKeys?: string[]; notes?: string[] }>
          secretReferences?: Array<{ key: string; source: string; present: boolean; maskedValue: string }>
        }
      }>
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          okCount: number
          warningCount: number
          limitationCount: number
          platformSummary?: {
            kind: string
            precedence?: string[]
            currentScope?: string
            composedFiles?: string[]
            facts: Array<{ code: string; message: string }>
          }
        }>
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('validate')
    expect(payload.data?.items[0]?.profileId).toBe('gemini-prod')
    expect(payload.data?.items[0]?.platform).toBe('gemini')
    expect(payload.data?.items[0]?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'system-defaults', detect: true, preview: true, use: false, rollback: false, writable: false }),
      expect.objectContaining({ scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true }),
      expect.objectContaining({ scope: 'system-overrides', detect: true, preview: true, use: false, rollback: false, writable: false }),
    ]))
    expect(payload.data?.items[0]?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
      facts: [
        { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
        { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
      ],
    })
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'gemini',
        profileCount: 1,
        okCount: 1,
        warningCount: 2,
        limitationCount: 3,
        platformSummary: expect.objectContaining({
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
        }),
      }),
    ]))
    expect(payload.data?.summary.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(payload.data?.summary.warnings).toContain('profile.source.apiKey 当前以明文 secret 存储；后续版本建议迁移到 secret_ref 或环境变量引用。')
    expect(payload.data?.summary.warnings).toContain('profile.apply.GEMINI_API_KEY 当前以明文 secret 存储；后续版本建议迁移到 secret_ref 或环境变量引用。')
    expect(payload.data?.summary.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.data?.items[0]?.validation.ok).toBe(true)
    expect(payload.data?.items[0]?.validation.errors).toEqual([])
    expect(payload.data?.items[0]?.validation.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INLINE_SECRET_IN_PROFILE', field: 'source.apiKey' }),
      expect.objectContaining({ code: 'INLINE_SECRET_IN_PROFILE', field: 'apply.GEMINI_API_KEY' }),
    ]))
    expect(payload.data?.items[0]?.validation.effectiveConfig?.stored?.[0]).toMatchObject({
      key: 'enforcedAuthType',
      maskedValue: 'gemini-api-key',
      source: 'stored',
      scope: 'user',
      secret: false,
    })
    expect(payload.data?.items[0]?.validation.effectiveConfig?.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'GEMINI_API_KEY',
        maskedValue: 'gm-l***56',
        source: 'env',
        scope: 'runtime',
        secret: true,
        shadowed: true,
      }),
    ]))
    expect(payload.data?.items[0]?.validation.effectiveConfig?.overrides).toEqual([
      {
        key: 'GEMINI_API_KEY',
        kind: 'env',
        source: 'env',
        message: 'Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。',
        shadowed: true,
      },
    ])
    expect(payload.data?.items[0]?.validation.effectiveConfig?.shadowedKeys).toEqual(['GEMINI_API_KEY'])
    expect(payload.data?.items[0]?.validation.managedBoundaries?.[0]).toMatchObject({
      type: 'managed-fields',
      managedKeys: ['enforcedAuthType'],
      preservedKeys: ['ui'],
      notes: ['Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。'],
    })
    expect(payload.data?.items[0]?.validation.secretReferences).toEqual([
      {
        key: 'GEMINI_API_KEY',
        source: 'env',
        present: true,
        maskedValue: 'gm-l***56',
      },
    ])
    expect(payload.data?.items[0]?.validation.limitations.map((item) => item.message)).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.data?.items[0]?.validation.limitations.map((item) => item.message)).toContain('当前仅稳定托管 settings.json 中已确认字段 enforcedAuthType。')
  })

  it('validate --json 支持 secret_ref/auth_reference profile 契约并提示写入链路未支持', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'claude-ref',
          name: 'claude-ref',
          platform: 'claude',
          source: {
            auth_reference: 'vault://claude/prod',
            baseURL: 'https://gateway.example.com/api',
          },
          apply: {
            auth_reference: 'vault://claude/prod',
            ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
          },
        },
      ],
    })

    const result = await runCli(['validate', 'claude-ref', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.items[0]?.validation.errors).toEqual([])
    expect(payload.data?.items[0]?.validation.warnings).toEqual([])
    expect(payload.data?.items[0]?.validation.limitations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SECRET_REFERENCE_WRITE_UNSUPPORTED',
        level: 'limitation',
      }),
    ]))
    expect(payload.data?.summary.warnings).toEqual([])
    expect(payload.data?.summary.limitations).toContain('当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。')
    expect(payload.data?.summary.referenceStats).toMatchObject({
      profileCount: 1,
      referenceProfileCount: 1,
      inlineProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      hasReferenceProfiles: true,
      hasInlineProfiles: false,
      hasWriteUnsupportedProfiles: true,
    })
    expect(payload.data?.summary.executabilityStats).toMatchObject({
      profileCount: 1,
      inlineReadyProfileCount: 0,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: false,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: true,
      hasSourceRedactedProfiles: false,
    })
    expect(payload.data?.summary.triageStats?.buckets.map((item: { id: string; totalCount: number }) => [item.id, item.totalCount])).toEqual([
      ['overview', 1],
      ['reference-governance', 1],
      ['write-readiness', 1],
    ])
    expect(payload.data?.summary.triageStats?.buckets.map((item: { id: string; totalCount: number }) => [item.id, item.totalCount])).toEqual([
      ['overview', 1],
      ['reference-governance', 1],
      ['write-readiness', 1],
    ])
    expect(payload.data?.summary.triageStats).toEqual({
      totalItems: 1,
      buckets: [
        {
          id: 'overview',
          title: 'Overview bucket',
          totalCount: 1,
          summaryFields: ['summary.platformStats'],
          itemFields: ['platformSummary'],
          recommendedNextStep: 'inspect-items',
        },
        {
          id: 'reference-governance',
          title: 'Reference governance bucket',
          totalCount: 1,
          summaryFields: ['summary.referenceStats'],
          itemFields: ['detections.referenceSummary', 'profiles.referenceSummary'],
          recommendedNextStep: 'review-reference-details',
        },
        {
          id: 'write-readiness',
          title: 'Write readiness bucket',
          totalCount: 1,
          summaryFields: ['summary.executabilityStats'],
          itemFields: ['detections.referenceSummary', 'profiles.referenceSummary'],
          recommendedNextStep: 'continue-to-write',
        },
      ],
    })
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'claude',
        referenceStats: expect.objectContaining({
          profileCount: 1,
          referenceProfileCount: 1,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 1,
          hasReferenceProfiles: true,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: true,
        }),
      }),
    ]))
    expect(payload.data?.items[0]?.referenceSummary).toMatchObject({
      hasReferenceFields: true,
      hasInlineSecrets: false,
      writeUnsupported: true,
      resolvedReferenceCount: 0,
      missingReferenceCount: 0,
      unsupportedReferenceCount: 2,
      missingValueCount: 0,
    })
  })

  it('current --json 会聚合 reference profile 的写入未启用 limitation', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'codex-ref',
          name: 'codex-ref',
          platform: 'codex',
          source: {
            secret_ref: 'vault://codex/prod',
            baseURL: 'https://gateway.example.com/openai/v1',
          },
          apply: {
            auth_reference: 'vault://codex/prod',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
      ],
    })

    const result = await runCli(['current', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.summary.limitations).toContain('当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。')
    expect(payload.limitations).toContain('当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。')
    expect(payload.data?.summary.referenceStats).toMatchObject({
      profileCount: 1,
      referenceProfileCount: 1,
      inlineProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      hasReferenceProfiles: true,
      hasInlineProfiles: false,
      hasWriteUnsupportedProfiles: true,
    })
    expect(payload.data?.summary.executabilityStats).toMatchObject({
      profileCount: 1,
      inlineReadyProfileCount: 0,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: false,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: true,
      hasSourceRedactedProfiles: false,
    })
    expect(payload.data?.summary.triageStats?.buckets.map((item: { id: string; totalCount: number }) => [item.id, item.totalCount])).toEqual([
      ['overview', 1],
      ['reference-governance', 1],
      ['write-readiness', 1],
    ])
    expect(payload.data?.summary.triageStats?.buckets.map((item: { id: string; totalCount: number }) => [item.id, item.totalCount])).toEqual([
      ['overview', 1],
      ['reference-governance', 1],
      ['write-readiness', 1],
    ])
    expect(payload.data?.summary.triageStats?.buckets.map((item: { id: string; totalCount: number }) => [item.id, item.totalCount])).toEqual([
      ['overview', 1],
      ['reference-governance', 1],
      ['write-readiness', 1],
    ])
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'codex',
        referenceStats: expect.objectContaining({
          profileCount: 1,
          referenceProfileCount: 1,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 1,
          hasReferenceProfiles: true,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: true,
        }),
      }),
    ]))
  })

  it('list --json 会聚合 reference profile 的写入未启用 limitation', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'claude-ref',
          name: 'claude-ref',
          platform: 'claude',
          source: {
            secret_ref: 'vault://claude/prod',
            baseURL: 'https://gateway.example.com/api',
          },
          apply: {
            auth_reference: 'vault://claude/prod',
            ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
          },
        },
      ],
    })

    const result = await runCli(['list', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.summary.limitations).toContain('当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。')
    expect(payload.limitations).toContain('当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。')
    expect(payload.data?.summary.referenceStats).toMatchObject({
      profileCount: 1,
      referenceProfileCount: 1,
      inlineProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      hasReferenceProfiles: true,
      hasInlineProfiles: false,
      hasWriteUnsupportedProfiles: true,
    })
    expect(payload.data?.summary.executabilityStats).toMatchObject({
      profileCount: 1,
      inlineReadyProfileCount: 0,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: false,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: true,
      hasSourceRedactedProfiles: false,
    })
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'claude',
        referenceStats: expect.objectContaining({
          profileCount: 1,
          referenceProfileCount: 1,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 1,
          hasReferenceProfiles: true,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: true,
        }),
      }),
    ]))
    expect(payload.data?.profiles?.[0]?.referenceSummary).toMatchObject({
      hasReferenceFields: true,
      hasInlineSecrets: false,
      writeUnsupported: true,
      resolvedReferenceCount: 0,
      missingReferenceCount: 0,
      unsupportedReferenceCount: 2,
      missingValueCount: 0,
    })
  })


  it('list 文本输出配置列表与 explainable 摘要', async () => {
    await new StateStore().markCurrent('gemini', 'gemini-prod', 'snapshot-gemini-001')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['list'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[list] 成功')
    expect(result.stdout).toContain('referenceStats 摘要:')
    expect(result.stdout).toContain('hasReferenceProfiles=')
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('  当前生效: 是')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('list 文本输出会提示 reference profile 当前不会被写入链路消费', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'codex-ref',
          name: 'codex-ref',
          platform: 'codex',
          source: {
            secret_ref: 'vault://codex/prod',
            baseURL: 'https://gateway.example.com/openai/v1',
          },
          apply: {
            auth_reference: 'vault://codex/prod',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
      ],
    })

    const result = await runCli(['list'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。')
    expect(result.stdout).toContain('referenceStats 摘要:')
    expect(result.stdout).toContain('profiles=1, reference=1, inline=0, writeUnsupported=1')
    expect(result.stdout).toContain('reference 摘要:')
    expect(result.stdout).toContain('hasReferenceFields=yes, hasInlineSecrets=no, writeUnsupported=yes')
  })

  it('list 文本输出非法 platform 的失败结果', async () => {
    const result = await runCli(['list', '--platform', 'openai'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[list] 失败')
    expect(result.stdout).toContain('不支持的平台：openai')
  })

  it('list 未注册平台时返回结构化失败对象并设置 exitCode 1', async () => {
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

    const result = await runCli(['list', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('list')
    expect(payload.error?.code).toBe('ADAPTER_NOT_REGISTERED')
    expect(payload.error?.message).toBe('未注册的平台适配器：openai')
  })

  it('validate --json 失败时返回错误状态并设置 exitCode 1', async () => {
    const result = await runCli(['validate', 'gemini-invalid', '--json'])
    const payload = parseJsonResult<{ items: Array<{ profileId: string }> }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('validate')
    expect(payload.data?.items[0]?.profileId).toBe('gemini-invalid')
  })

  it('validate 在空 profiles 下返回空 items', async () => {
    await new ProfilesStore().write({ version: 1, profiles: [] })

    const result = await runCli(['validate', '--json'])
    const payload = parseJsonResult<{ items: Array<{ profileId: string }> }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('validate')
    expect(payload.data?.items).toEqual([])
  })

  it('validate selector 不存在时返回结构化失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['validate', 'missing-profile', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('validate')
    expect(payload.error?.code).toBe('PROFILE_NOT_FOUND')
    expect(payload.error?.message).toBe('未找到配置档：missing-profile')
  })

  it('validate selector 不存在时文本输出 explainable 失败结果', async () => {
    const result = await runCli(['validate', 'missing-profile'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[validate] 失败')
    expect(result.stdout).toContain('未找到配置档：missing-profile')
  })

  it('validate 未注册平台时返回结构化失败对象并设置 exitCode 1', async () => {
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

    const result = await runCli(['validate', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('validate')
    expect(payload.error?.code).toBe('ADAPTER_NOT_REGISTERED')
    expect(payload.error?.message).toBe('未注册的平台适配器：openai')
  })

  it('export 未注册平台时返回结构化失败对象并设置 exitCode 1', async () => {
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

    const result = await runCli(['export', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('export')
    expect(payload.error?.code).toBe('ADAPTER_NOT_REGISTERED')
    expect(payload.error?.message).toBe('未注册的平台适配器：openai')
  })

  it('export 未注册平台时文本输出 explainable 失败结果', async () => {
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

    const result = await runCli(['export'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[export] 失败')
    expect(result.stdout).toContain('未注册的平台适配器：openai')
  })

  it('export --json 输出结构化 profiles 与 explainable 摘要', async () => {
    const result = await runCli(['export', '--json'])
    const payload = parseJsonResult<{
      profiles: Array<{
        profile: Profile
        platformSummary?: {
          kind: string
          precedence?: string[]
          currentScope?: string
          composedFiles?: string[]
          facts: Array<{ code: string; message: string }>
        }
        scopeCapabilities?: ScopeCapabilityContract[]
        scopeAvailability?: ScopeAvailabilityContract[]
        defaultWriteScope?: string
        observedAt?: string
        secretExportSummary?: {
          hasInlineSecrets: boolean
          hasRedactedInlineSecrets: boolean
          hasReferenceSecrets: boolean
          redactedFieldCount: number
          preservedReferenceCount: number
          details?: Array<{ field: string; kind: string }>
        }
        validation?: {
          ok: boolean
          errors: Array<{ code: string }>
          warnings: Array<{ code: string; message: string }>
          limitations: Array<{ code: string; message: string }>
          effectiveConfig?: {
            stored: Array<{ key: string; maskedValue: string; source: string; scope?: string; secret?: boolean }>
            effective: Array<{ key: string; maskedValue: string; source: string; scope?: string; secret?: boolean; shadowed?: boolean }>
          }
          managedBoundaries?: Array<{ type: string; managedKeys: string[]; preservedKeys?: string[] }>
          secretReferences?: Array<{ key: string; source: string; present: boolean; maskedValue: string }>
        }
      }>
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          okCount: number
          warningCount: number
          limitationCount: number
          platformSummary?: {
            kind: string
            precedence?: string[]
            currentScope?: string
            composedFiles?: string[]
            facts: Array<{ code: string; message: string }>
          }
        }>
        secretExportPolicy?: {
          mode: 'redacted-by-default' | 'include-secrets'
          inlineSecretsExported: number
          inlineSecretsRedacted: number
          referenceSecretsPreserved: number
          profilesWithRedactedSecrets: number
        }
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('export')
    expect(payload.data?.profiles).toHaveLength(4)
    expect(payload.data?.summary.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(payload.data?.summary.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(payload.data?.summary.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.data?.summary.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(payload.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(payload.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')

    const claudeProfile = payload.data?.profiles.find((item) => item.profile.id === 'claude-prod')
    const codexProfile = payload.data?.profiles.find((item) => item.profile.id === 'codex-prod')
    const geminiProfile = payload.data?.profiles.find((item) => item.profile.id === 'gemini-prod')

    expect(claudeProfile?.profile.source).toEqual({ token: '<redacted:inline-secret>', baseURL: 'https://gateway.example.com/api' })
    expect(claudeProfile?.profile.apply).toEqual({
      ANTHROPIC_AUTH_TOKEN: '<redacted:inline-secret>',
      ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
    })
    expect(claudeProfile?.secretExportSummary).toEqual({
      hasInlineSecrets: true,
      hasRedactedInlineSecrets: true,
      hasReferenceSecrets: false,
      redactedFieldCount: 2,
      preservedReferenceCount: 0,
      details: [
        { field: 'source.token', kind: 'inline-secret-redacted' },
        { field: 'apply.ANTHROPIC_AUTH_TOKEN', kind: 'inline-secret-redacted' },
      ],
    })
    expect(claudeProfile?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'local', use: true, rollback: true, writable: true }),
    ]))
    expect(claudeProfile?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['user', 'project', 'local'],
      facts: [
        { code: 'CLAUDE_SCOPE_PRECEDENCE', message: 'Claude 支持 user < project < local 三层 precedence。' },
        { code: 'CLAUDE_LOCAL_SCOPE_HIGHEST', message: '如果存在 local，同名字段最终以 local 为准。' },
      ],
    })
    expect(claudeProfile?.validation?.ok).toBe(true)
    expect(claudeProfile?.validation?.errors).toEqual([])
    expect(claudeProfile?.validation?.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INLINE_SECRET_IN_PROFILE', field: 'source.token' }),
      expect.objectContaining({ code: 'INLINE_SECRET_IN_PROFILE', field: 'apply.ANTHROPIC_AUTH_TOKEN' }),
    ]))
    expect(claudeProfile?.validation?.limitations.map((item) => item.message)).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(claudeProfile?.validation?.effectiveConfig?.stored?.[0]).toMatchObject({
      key: 'ANTHROPIC_AUTH_TOKEN',
      source: 'stored',
      scope: 'project',
      secret: true,
    })
    expect(claudeProfile?.validation?.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'scope-aware',
        managedKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'],
      }),
    ]))

    expect(codexProfile?.profile.source).toEqual({ apiKey: '<redacted:inline-secret>', baseURL: 'https://gateway.example.com/openai/v1' })
    expect(codexProfile?.profile.apply).toEqual({
      OPENAI_API_KEY: '<redacted:inline-secret>',
      base_url: 'https://gateway.example.com/openai/v1',
    })
    expect(codexProfile?.secretExportSummary).toEqual({
      hasInlineSecrets: true,
      hasRedactedInlineSecrets: true,
      hasReferenceSecrets: false,
      redactedFieldCount: 2,
      preservedReferenceCount: 0,
      details: [
        { field: 'source.apiKey', kind: 'inline-secret-redacted' },
        { field: 'apply.OPENAI_API_KEY', kind: 'inline-secret-redacted' },
      ],
    })
    expect(codexProfile?.platformSummary).toEqual({
      kind: 'multi-file-composition',
      composedFiles: [],
      facts: [
        { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
        { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
      ],
    })
    expect(codexProfile?.validation?.limitations.map((item) => item.message)).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(codexProfile?.validation?.managedBoundaries?.some((item) => item.type === 'multi-file-transaction')).toBe(true)

    expect(geminiProfile?.profile.source).toEqual({ apiKey: '<redacted:inline-secret>', authType: 'gemini-api-key' })
    expect(geminiProfile?.profile.apply).toEqual({
      GEMINI_API_KEY: '<redacted:inline-secret>',
      enforcedAuthType: 'gemini-api-key',
    })
    expect(geminiProfile?.secretExportSummary).toEqual({
      hasInlineSecrets: true,
      hasRedactedInlineSecrets: true,
      hasReferenceSecrets: false,
      redactedFieldCount: 2,
      preservedReferenceCount: 0,
      details: [
        { field: 'source.apiKey', kind: 'inline-secret-redacted' },
        { field: 'apply.GEMINI_API_KEY', kind: 'inline-secret-redacted' },
      ],
    })
    expect(geminiProfile?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'system-defaults', use: false, rollback: false, writable: false }),
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true }),
      expect.objectContaining({ scope: 'system-overrides', use: false, rollback: false, writable: false }),
    ]))
    expect(geminiProfile?.scopeAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', status: 'available', writable: true }),
      expect.objectContaining({ scope: 'project', status: 'available', writable: true, path: geminiProjectSettingsPath }),
    ]))
    expect(geminiProfile?.platformSummary).toEqual({
      kind: 'scope-precedence',
      precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
      facts: [
        { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
        { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
      ],
    })
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'claude',
        profileCount: 1,
        okCount: 1,
        warningCount: 2,
        limitationCount: 1,
        platformSummary: expect.objectContaining({
          kind: 'scope-precedence',
          precedence: ['user', 'project', 'local'],
        }),
      }),
      expect.objectContaining({
        platform: 'codex',
        profileCount: 1,
        okCount: 1,
        warningCount: 2,
        limitationCount: 1,
        platformSummary: expect.objectContaining({
          kind: 'multi-file-composition',
        }),
      }),
      expect.objectContaining({
        platform: 'gemini',
        profileCount: 2,
        okCount: 1,
        warningCount: 3,
        limitationCount: 6,
        platformSummary: expect.objectContaining({
          kind: 'scope-precedence',
          precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
        }),
      }),
    ]))
    expect(payload.data?.summary.secretExportPolicy).toEqual({
      mode: 'redacted-by-default',
      inlineSecretsExported: 0,
      inlineSecretsRedacted: 6,
      referenceSecretsPreserved: 0,
      profilesWithRedactedSecrets: 3,
    })
    expect(geminiProfile?.defaultWriteScope).toBe('user')
    expect(geminiProfile?.observedAt).toEqual(expect.any(String))
    expect(new Date(geminiProfile?.observedAt ?? '').toString()).not.toBe('Invalid Date')
    expect(claudeProfile?.observedAt).toBeUndefined()
    expect(geminiProfile?.validation?.limitations.map((item) => item.message)).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(geminiProfile?.validation?.managedBoundaries?.[0]?.managedKeys).toEqual(['enforcedAuthType'])
    expect(claudeProfile?.validation?.secretReferences).toEqual([
      {
        key: 'ANTHROPIC_AUTH_TOKEN',
        source: 'inline',
        present: true,
        maskedValue: 'sk-l***56',
      },
    ])
    expect(codexProfile?.validation?.secretReferences).toEqual([
      {
        key: 'OPENAI_API_KEY',
        source: 'inline',
        present: true,
        maskedValue: 'sk-c***56',
      },
    ])
    expect(geminiProfile?.validation?.secretReferences).toEqual([
      {
        key: 'GEMINI_API_KEY',
        source: 'env',
        present: true,
        maskedValue: 'gm-l***56',
      },
    ])
  })

  it('export --json 保留 secret_ref/auth_reference profile 契约并聚合 limitation', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'codex-ref',
          name: 'codex-ref',
          platform: 'codex',
          source: {
            secret_ref: 'vault://codex/prod',
            baseURL: 'https://gateway.example.com/openai/v1',
          },
          apply: {
            auth_reference: 'vault://codex/prod',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
      ],
    })

    const result = await runCli(['export', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.summary.warnings).toEqual([])
    expect(payload.data?.summary.limitations).toContain('当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。')
    expect(payload.data?.summary.referenceStats).toMatchObject({
      profileCount: 1,
      referenceProfileCount: 1,
      inlineProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      hasReferenceProfiles: true,
      hasInlineProfiles: false,
      hasWriteUnsupportedProfiles: true,
    })
    expect(payload.data?.summary.executabilityStats).toMatchObject({
      profileCount: 1,
      inlineReadyProfileCount: 0,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: false,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: true,
      hasSourceRedactedProfiles: false,
    })
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'codex',
        okCount: 1,
        warningCount: 0,
        limitationCount: 2,
        referenceStats: expect.objectContaining({
          profileCount: 1,
          referenceProfileCount: 1,
          inlineProfileCount: 0,
          writeUnsupportedProfileCount: 1,
          hasReferenceProfiles: true,
          hasInlineProfiles: false,
          hasWriteUnsupportedProfiles: true,
        }),
      }),
    ]))
    expect(payload.data?.profiles?.[0]?.referenceSummary).toMatchObject({
      hasReferenceFields: true,
      hasInlineSecrets: false,
      writeUnsupported: true,
      resolvedReferenceCount: 0,
      missingReferenceCount: 0,
      unsupportedReferenceCount: 2,
      missingValueCount: 0,
    })
    expect(payload.data?.profiles?.[0]?.secretExportSummary).toEqual({
      hasInlineSecrets: false,
      hasRedactedInlineSecrets: false,
      hasReferenceSecrets: true,
      redactedFieldCount: 0,
      preservedReferenceCount: 2,
      details: [
        { field: 'source.secret_ref', kind: 'reference-preserved' },
        { field: 'apply.auth_reference', kind: 'reference-preserved' },
      ],
    })
    expect(payload.data?.profiles?.[0]?.validation?.warnings).toEqual([])
    expect(payload.data?.profiles?.[0]?.validation?.errors).toEqual([])
    expect(payload.data?.profiles?.[0]?.validation?.limitations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SECRET_REFERENCE_WRITE_UNSUPPORTED',
        level: 'limitation',
      }),
    ]))
    expect(payload.data?.summary.secretExportPolicy).toEqual({
      mode: 'redacted-by-default',
      inlineSecretsExported: 0,
      inlineSecretsRedacted: 0,
      referenceSecretsPreserved: 2,
      profilesWithRedactedSecrets: 0,
    })
  })

  it('export --json --include-secrets 显式保留 inline secret 明文', async () => {
    const result = await runCli(['export', '--json', '--include-secrets'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)

    const claudeProfile = payload.data?.profiles.find((item: any) => item.profile.id === 'claude-prod')
    const codexProfile = payload.data?.profiles.find((item: any) => item.profile.id === 'codex-prod')
    const geminiProfile = payload.data?.profiles.find((item: any) => item.profile.id === 'gemini-prod')

    expect(claudeProfile?.profile.source?.token).toBe('sk-live-123456')
    expect(codexProfile?.profile.source?.apiKey).toBe('sk-codex-live-123456')
    expect(geminiProfile?.profile.source?.apiKey).toBe('gm-live-123456')
    expect(payload.data?.summary.secretExportPolicy).toEqual({
      mode: 'include-secrets',
      inlineSecretsExported: 6,
      inlineSecretsRedacted: 0,
      referenceSecretsPreserved: 0,
      profilesWithRedactedSecrets: 0,
    })
    expect(geminiProfile?.secretExportSummary).toEqual({
      hasInlineSecrets: true,
      hasRedactedInlineSecrets: false,
      hasReferenceSecrets: false,
      redactedFieldCount: 0,
      preservedReferenceCount: 0,
      details: [
        { field: 'source.apiKey', kind: 'inline-secret-exported' },
        { field: 'apply.GEMINI_API_KEY', kind: 'inline-secret-exported' },
      ],
    })
  })

  it('preview --json 输出 Codex 结构化预览结果与 warnings', async () => {
    const result = await runCli(['preview', 'codex-prod', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      risk: {
        allowed: boolean
        riskLevel: string
        reasons: string[]
        limitations: string[]
      }
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          profileId?: string
          targetScope?: string
          warningCount: number
          limitationCount: number
          changedFileCount?: number
          backupCreated?: boolean
          noChanges?: boolean
        }>
        referenceStats?: {
          profileCount: number
          referenceProfileCount: number
          inlineProfileCount: number
          writeUnsupportedProfileCount: number
        }
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
        warnings: string[]
        limitations: string[]
      }
      preview: {
        riskLevel: string
        requiresConfirmation: boolean
        backupPlanned: boolean
        noChanges?: boolean
        diffSummary: Array<{ path: string; changedKeys: string[]; managedKeys?: string[]; preservedKeys?: string[] }>
        managedBoundaries?: Array<{ type: string; target?: string; managedKeys: string[]; preservedKeys?: string[]; notes?: string[] }>
        secretReferences?: Array<{ key: string; source: string; present: boolean; maskedValue: string }>
        limitations?: Array<{ code: string; message: string }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.schemaVersion).toBe('2026-04-15.public-json.v1')
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('preview')
    expect(payload.data?.profile.id).toBe('codex-prod')
    expect(payload.data?.risk).toEqual(expect.objectContaining({
      allowed: false,
      riskLevel: 'medium',
    }))
    expect(payload.data?.summary).toEqual(expect.objectContaining({
      platformStats: expect.arrayContaining([
        expect.objectContaining({
          platform: 'codex',
          profileCount: 1,
          profileId: 'codex-prod',
          warningCount: payload.data?.risk.reasons.length ?? 0,
          limitationCount: payload.data?.risk.limitations.length ?? 0,
          changedFileCount: 2,
          backupCreated: true,
          noChanges: false,
        }),
      ]),
      referenceStats: expect.objectContaining({
        profileCount: 1,
        referenceProfileCount: 0,
        inlineProfileCount: 1,
        writeUnsupportedProfileCount: 0,
        hasReferenceProfiles: false,
        hasInlineProfiles: true,
        hasWriteUnsupportedProfiles: false,
      }),
      executabilityStats: expect.objectContaining({
        profileCount: 1,
        inlineReadyProfileCount: 1,
        referenceReadyProfileCount: 0,
        referenceMissingProfileCount: 0,
        writeUnsupportedProfileCount: 0,
        sourceRedactedProfileCount: 0,
        hasInlineReadyProfiles: true,
        hasReferenceReadyProfiles: false,
        hasReferenceMissingProfiles: false,
        hasWriteUnsupportedProfiles: false,
        hasSourceRedactedProfiles: false,
      }),
      warnings: payload.data?.risk.reasons ?? [],
      limitations: payload.data?.risk.limitations ?? [],
    }))
    expect(payload.data?.risk.reasons).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(payload.data?.risk.reasons).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(payload.data?.risk.reasons).toContain('Codex 将修改多个目标文件。')
    expect(payload.data?.risk.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.data?.preview.riskLevel).toBe('medium')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.diffSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: codexConfigPath,
        changedKeys: ['base_url'],
        managedKeys: ['base_url'],
        preservedKeys: ['default_provider'],
      }),
      expect.objectContaining({
        path: codexAuthPath,
        changedKeys: ['OPENAI_API_KEY'],
        managedKeys: ['OPENAI_API_KEY'],
        preservedKeys: ['user_id'],
      }),
    ]))
    expect(payload.data?.preview.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'multi-file-transaction',
        managedKeys: ['base_url', 'OPENAI_API_KEY'],
      }),
      expect.objectContaining({
        target: codexConfigPath,
        managedKeys: ['base_url'],
        preservedKeys: ['default_provider'],
      }),
      expect.objectContaining({
        target: codexAuthPath,
        managedKeys: ['OPENAI_API_KEY'],
        preservedKeys: ['user_id'],
      }),
    ]))
    expect(payload.data?.preview.secretReferences).toEqual([
      {
        key: 'OPENAI_API_KEY',
        source: 'inline',
        present: true,
        maskedValue: 'sk-c***56',
      },
    ])
    expect(payload.data?.preview.limitations?.map((item) => item.message)).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.warnings).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(payload.warnings).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(payload.warnings).toContain('Codex 将修改多个目标文件。')
  })

  it('preview --json 会提示 reference profile 当前不会被写入链路消费', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'codex-ref',
          name: 'codex-ref',
          platform: 'codex',
          source: {
            secret_ref: 'vault://codex/prod',
            baseURL: 'https://gateway.example.com/openai/v1',
          },
          apply: {
            auth_reference: 'vault://codex/prod',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
      ],
    })

    const result = await runCli(['preview', 'codex-ref', '--json'])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.action).toBe('preview')
    expect(payload.data?.validation.limitations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SECRET_REFERENCE_WRITE_UNSUPPORTED',
      }),
    ]))
    expect(payload.data?.summary.limitations).toContain('当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。')
    expect(payload.limitations).toContain('当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。')
    expect(payload.data?.summary.referenceStats).toMatchObject({
      profileCount: 1,
      referenceProfileCount: 1,
      inlineProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      hasReferenceProfiles: true,
      hasInlineProfiles: false,
      hasWriteUnsupportedProfiles: true,
    })
    expect(payload.data?.summary.executabilityStats).toMatchObject({
      profileCount: 1,
      inlineReadyProfileCount: 0,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: false,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: true,
      hasSourceRedactedProfiles: false,
    })
  })

  it('preview --json 输出 Gemini scope capability contract', async () => {
    const result = await runCli(['preview', 'gemini-prod', '--scope', 'project', '--json'])
    const payload = parseJsonResult<{
      scopePolicy?: {
        requestedScope?: string
        resolvedScope?: string
        defaultScope?: string
        explicitScope: boolean
        highRisk: boolean
        riskWarning?: string
        rollbackScopeMatchRequired: boolean
      }
      scopeCapabilities?: ScopeCapabilityContract[]
      preview: {
        targetFiles: Array<{ path: string; scope?: string }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('preview')
    expect(payload.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: geminiProjectSettingsPath,
        scope: 'project',
      }),
    ])
    expect(payload.data?.scopePolicy).toEqual({
      requestedScope: 'project',
      resolvedScope: 'project',
      defaultScope: 'user',
      explicitScope: true,
      highRisk: true,
      riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
      rollbackScopeMatchRequired: true,
    })
    expect(payload.data?.scopeCapabilities).toEqual([
      expect.objectContaining({
        scope: 'system-defaults',
        detect: true,
        preview: true,
        use: false,
        rollback: false,
        writable: false,
        risk: 'normal',
        confirmationRequired: false,
      }),
      expect.objectContaining({
        scope: 'user',
        detect: true,
        preview: true,
        use: true,
        rollback: true,
        writable: true,
        risk: 'normal',
        confirmationRequired: false,
      }),
      expect.objectContaining({
        scope: 'project',
        detect: true,
        preview: true,
        use: true,
        rollback: true,
        writable: true,
        risk: 'high',
        confirmationRequired: true,
      }),
      expect.objectContaining({
        scope: 'system-overrides',
        detect: true,
        preview: true,
        use: false,
        rollback: false,
        writable: false,
        risk: 'normal',
        confirmationRequired: false,
      }),
    ])
  })

  it('use --json 在 --force 下返回 Codex 结构化执行结果并写入 state', async () => {
    const result = await runCli(['use', 'codex-prod', '--force', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      backupId?: string
      platformSummary?: {
        kind: string
        precedence?: string[]
        currentScope?: string
        composedFiles?: string[]
        facts: Array<{ code: string; message: string }>
      }
      risk: {
        allowed: boolean
        riskLevel: string
        reasons: string[]
        limitations: string[]
      }
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          targetScope?: string
          warningCount: number
          limitationCount: number
          restoredFileCount?: number
          noChanges?: boolean
        }>
        referenceStats?: {
          profileCount: number
          referenceProfileCount: number
          inlineProfileCount: number
          writeUnsupportedProfileCount: number
        }
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
        warnings: string[]
        limitations: string[]
      }
      changedFiles: string[]
      preview?: {
        managedBoundaries?: Array<{ type: string; target?: string; managedKeys: string[]; preservedKeys?: string[] }>
        secretReferences?: Array<{ key: string; source: string; present: boolean; maskedValue: string }>
        limitations?: Array<{ code: string; message: string }>
        warnings?: Array<{ code: string; message: string }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('use')
    expect(payload.data?.profile.id).toBe('codex-prod')
    expect(payload.data?.backupId).toMatch(/^snapshot-codex-/)
    expect(payload.data?.risk).toEqual(expect.objectContaining({
      allowed: true,
      riskLevel: 'medium',
    }))
    expect(payload.data?.summary).toEqual(expect.objectContaining({
      platformStats: expect.arrayContaining([
        expect.objectContaining({
          platform: 'codex',
          profileCount: 1,
          profileId: 'codex-prod',
          warningCount: payload.data?.risk.reasons.length ?? 0,
          limitationCount: payload.data?.risk.limitations.length ?? 0,
          changedFileCount: 2,
          backupCreated: true,
          noChanges: false,
        }),
      ]),
      referenceStats: expect.objectContaining({
        profileCount: 1,
        referenceProfileCount: 0,
        inlineProfileCount: 1,
        writeUnsupportedProfileCount: 0,
      }),
      executabilityStats: expect.objectContaining({
        profileCount: 1,
        inlineReadyProfileCount: 1,
        referenceReadyProfileCount: 0,
        referenceMissingProfileCount: 0,
        writeUnsupportedProfileCount: 0,
        sourceRedactedProfileCount: 0,
      }),
      warnings: payload.data?.risk.reasons ?? [],
      limitations: payload.data?.risk.limitations ?? [],
    }))
    expect(payload.data?.risk.reasons).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(payload.data?.risk.reasons).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(payload.data?.risk.reasons).toContain('Codex 将修改多个目标文件。')
    expect(payload.data?.risk.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.data?.platformSummary).toEqual({
      kind: 'multi-file-composition',
      composedFiles: [codexConfigPath, codexAuthPath],
      facts: [
        { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
        { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
      ],
    })
    expect(payload.data?.changedFiles).toEqual([codexConfigPath, codexAuthPath])
    expect(payload.data?.preview?.managedBoundaries?.some((item) => item.type === 'multi-file-transaction')).toBe(true)
    expect(payload.data?.preview?.secretReferences).toEqual([
      {
        key: 'OPENAI_API_KEY',
        source: 'inline',
        present: true,
        maskedValue: 'sk-c***56',
      },
    ])
    expect(payload.data?.preview?.limitations?.map((item) => item.message)).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.data?.preview?.warnings?.some((item) => item.code === 'multi-file-overwrite')).toBe(true)
    expect(payload.warnings).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(payload.warnings).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(payload.warnings).toContain('Codex 将修改多个目标文件。')
    expect(payload.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')

    const state = await new StateStore().read()
    expect(state.current.codex).toBe('codex-prod')
  })

  it('use --dry-run --json 会执行写入前检查但不写入 Codex 双文件目标', async () => {
    const configBefore = await fs.readFile(codexConfigPath, 'utf8')
    const authBefore = await fs.readFile(codexAuthPath, 'utf8')
    const result = await runCli(['use', 'codex-prod', '--force', '--dry-run', '--json'])
    const payload = parseJsonResult<{
      dryRun: boolean
      backupId?: string
      changedFiles: string[]
      noChanges: boolean
      preview: {
        noChanges: boolean
        diffSummary: Array<{ path: string; hasChanges: boolean }>
      }
      summary: {
        platformStats?: Array<{
          changedFileCount?: number
          backupCreated?: boolean
          noChanges?: boolean
        }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('use')
    expect(payload.data?.dryRun).toBe(true)
    expect(payload.data?.backupId).toBeUndefined()
    expect(payload.data?.changedFiles).toEqual([])
    expect(payload.data?.noChanges).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.diffSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: codexConfigPath, hasChanges: true }),
      expect.objectContaining({ path: codexAuthPath, hasChanges: true }),
    ]))
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        changedFileCount: 0,
        backupCreated: false,
        noChanges: true,
      }),
    ]))
    await expect(fs.readFile(codexConfigPath, 'utf8')).resolves.toBe(configBefore)
    await expect(fs.readFile(codexAuthPath, 'utf8')).resolves.toBe(authBefore)
  })

  it('use --json 无 --force 时返回失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['use', 'gemini-prod', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('use')
    expect(payload.error?.code).toBe('CONFIRMATION_REQUIRED')
    expect(payload.error?.message).toBe('当前切换需要确认或 --force。')
    expect(payload.error?.details).toMatchObject({
      referenceGovernance: {
        hasReferenceProfiles: false,
        hasInlineProfiles: true,
        hasWriteUnsupportedProfiles: false,
        primaryReason: 'INLINE_SECRET_PRESENT',
        reasonCodes: ['INLINE_SECRET_PRESENT'],
      },
      risk: expect.objectContaining({
        allowed: false,
      }),
      scopeCapabilities: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          use: true,
          rollback: true,
          writable: true,
          risk: 'high',
          confirmationRequired: true,
        }),
        expect.objectContaining({
          scope: 'system-overrides',
          use: false,
          rollback: false,
          writable: false,
        }),
      ]),
      scopePolicy: expect.objectContaining({
        resolvedScope: 'user',
        defaultScope: 'user',
        explicitScope: false,
        highRisk: false,
        rollbackScopeMatchRequired: true,
      }),
    })
    expect(payload.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('use 文本失败时输出 explainable 摘要', async () => {
    const result = await runCli(['use', 'gemini-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[use] 失败')
    expect(result.stdout).toContain('当前切换需要确认或 --force。')
    expect(result.stdout).toContain('作用域策略:')
    expect(result.stdout).toContain('  - 默认目标: user scope')
    expect(result.stdout).toContain('  - 显式指定: 否')
    expect(result.stdout).toContain('  - 实际目标: user scope')
    expect(result.stdout).toContain('  - 高风险: 否')
    expect(result.stdout).toContain('  - 回滚约束: 必须匹配快照 scope')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('use 文本失败时输出 reference 解析摘要', async () => {
    const profilesStore = new ProfilesStore()
    const existing = await profilesStore.read()
    await profilesStore.write({
      ...existing,
      profiles: [
        ...existing.profiles,
        {
          id: 'claude-reference-local',
          name: 'claude-reference-local',
          platform: 'claude',
          source: { secret_ref: 'env://API_SWITCHER_MISSING_SECRET' },
          apply: {
            auth_reference: 'vault://claude/prod',
            secondary_auth_reference: 'env://API_SWITCHER_TEST_SECRET',
          },
        },
      ],
    })

    const result = await runCli(['use', 'claude-reference-local', '--scope', 'local'], {
      API_SWITCHER_TEST_SECRET: 'sk-live-123456',
    })

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[use] 失败')
    expect(result.stdout).toContain('reference 解析摘要:')
    expect(result.stdout).toContain('  - 未解析 env 引用:')
    expect(result.stdout).toContain('    - source.secret_ref -> env://API_SWITCHER_MISSING_SECRET')
    expect(result.stdout).toContain('  - 已解析但当前不会写入:')
    expect(result.stdout).toContain('    - apply.secondary_auth_reference -> env://API_SWITCHER_TEST_SECRET')
    expect(result.stdout).toContain('  - 不支持的引用 scheme:')
    expect(result.stdout).toContain('    - apply.auth_reference -> vault://claude/prod')
  })

  it('rollback --json 输出 Codex 结构化恢复结果并更新 state', async () => {
    const useResult = await runCli(['use', 'codex-prod', '--force', '--json'])
    const usePayload = parseJsonResult<{ backupId?: string }>(useResult.stdout)
    expect(usePayload.data?.backupId).toBeTruthy()

    await fs.writeFile(codexConfigPath, 'default_provider = "other"\n', 'utf8')
    await fs.writeFile(codexAuthPath, JSON.stringify({ OPENAI_API_KEY: 'sk-other' }, null, 2), 'utf8')
    const result = await runCli(['rollback', usePayload.data!.backupId!, '--json'])
    const payload = parseJsonResult<{
      backupId: string
      restoredFiles: string[]
      platformSummary?: {
        kind: string
        precedence?: string[]
        currentScope?: string
        composedFiles?: string[]
        facts: Array<{ code: string; message: string }>
      }
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          profileId?: string
          targetScope?: string
          warningCount: number
          limitationCount: number
          changedFileCount?: number
          backupCreated?: boolean
          noChanges?: boolean
        }>
        referenceStats?: {
          profileCount: number
          referenceProfileCount: number
          inlineProfileCount: number
          writeUnsupportedProfileCount: number
        }
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
        warnings: string[]
        limitations: string[]
      }
      rollback?: {
        targetFiles?: Array<{ path: string; managedKeys?: string[]; role?: string }>
        managedBoundaries?: Array<{ type: string; target?: string; managedKeys: string[]; preservedKeys?: string[] }>
        warnings?: Array<{ code: string; message: string }>
        limitations?: Array<{ code: string; message: string }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('rollback')
    expect(payload.data?.backupId).toBe(usePayload.data?.backupId)
    expect(payload.data?.summary.warnings).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(payload.data?.summary.warnings).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(payload.data?.summary.warnings).toContain('Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(payload.data?.summary.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'codex',
        profileCount: 1,
        warningCount: payload.data?.summary.warnings.length ?? 0,
        limitationCount: 1,
        restoredFileCount: 2,
        noChanges: false,
      }),
    ]))
    expect(payload.data?.summary.referenceStats).toMatchObject({
      profileCount: 1,
      referenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
    })
    expect(payload.data?.summary.executabilityStats).toMatchObject({
      profileCount: 1,
      inlineReadyProfileCount: 1,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
    })
    expect(payload.data?.platformSummary).toEqual({
      kind: 'multi-file-composition',
      composedFiles: [codexConfigPath, codexAuthPath],
      facts: [
        { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
        { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
      ],
    })
    expect(payload.data?.restoredFiles).toEqual([codexConfigPath, codexAuthPath])
    expect(payload.data?.rollback?.targetFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: codexConfigPath,
        managedKeys: ['base_url'],
        role: 'config',
      }),
      expect.objectContaining({
        path: codexAuthPath,
        managedKeys: ['OPENAI_API_KEY'],
        role: 'auth',
      }),
    ]))
    expect(payload.data?.rollback?.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'multi-file-transaction',
        managedKeys: ['base_url', 'OPENAI_API_KEY'],
      }),
      expect.objectContaining({
        target: codexConfigPath,
        preservedKeys: ['default_provider'],
      }),
      expect.objectContaining({
        target: codexAuthPath,
        preservedKeys: ['user_id'],
      }),
    ]))
    expect(payload.data?.rollback?.warnings?.some((item) => item.message.includes('default_provider'))).toBe(true)
    expect(payload.data?.rollback?.warnings?.some((item) => item.message.includes('user_id'))).toBe(true)
    expect(payload.data?.rollback?.warnings?.some((item) => item.message.includes('config.toml 与 auth.json'))).toBe(true)
    expect(payload.data?.rollback?.limitations?.map((item) => item.message)).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(payload.warnings).toContain('当前 Codex config.toml 存在非托管字段：default_provider')
    expect(payload.warnings).toContain('当前 Codex auth.json 存在非托管字段：user_id')
    expect(payload.warnings).toContain('Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(payload.limitations).toContain('当前会同时托管 Codex 的 config.toml 与 auth.json。')

    const state = await new StateStore().read()
    expect(state.current.codex).toBeUndefined()
    expect(state.lastSwitch?.status).toBe('rolled-back')
  })

  it('preview --json selector 不存在时返回失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['preview', 'missing-profile', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('preview')
    expect(payload.error?.code).toBe('PROFILE_NOT_FOUND')
    expect(payload.error?.message).toBe('未找到配置档：missing-profile')
  })

  it('preview 文本输出底层 settings 读取异常的失败结果', async () => {
    await fs.rm(geminiSettingsPath, { force: true, recursive: true })
    await fs.mkdir(geminiSettingsPath, { recursive: true })

    const result = await runCli(['preview', 'gemini-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain('[preview] 失败')
    expect(result.stdout).toContain('EISDIR')
  })

  it('preview --json 底层 settings 读取异常时返回失败对象并设置 exitCode 1', async () => {
    await fs.rm(geminiSettingsPath, { force: true, recursive: true })
    await fs.mkdir(geminiSettingsPath, { recursive: true })

    const result = await runCli(['preview', 'gemini-prod', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('preview')
    expect(payload.error?.code).toBe('PREVIEW_FAILED')
    expect(payload.error?.message).toContain('EISDIR')
  })

  it('use --json selector 不存在时返回失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['use', 'missing-profile', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('use')
    expect(payload.error?.code).toBe('PROFILE_NOT_FOUND')
    expect(payload.error?.message).toBe('未找到配置档：missing-profile')
  })

  it('use --json 底层 settings 读取异常时返回失败对象并设置 exitCode 1', async () => {
    await fs.rm(geminiSettingsPath, { force: true, recursive: true })
    await fs.mkdir(geminiSettingsPath, { recursive: true })

    const result = await runCli(['use', 'gemini-prod', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('use')
    expect(payload.error?.code).toBe('USE_FAILED')
    expect(payload.error?.message).toContain('EISDIR')
  })

  it('use --json 校验失败时返回 explainable 失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['use', 'gemini-invalid', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('use')
    expect(payload.error?.code).toBe('VALIDATION_FAILED')
    expect(payload.error?.message).toBe('配置校验失败')
    expect(payload.warnings).toContain('Gemini 首版仅稳定支持 enforcedAuthType = gemini-api-key。')
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('use 校验失败时文本输出 explainable 失败结果', async () => {
    const result = await runCli(['use', 'gemini-invalid'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[use] 失败')
    expect(result.stdout).toContain('配置校验失败')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - Gemini 首版仅稳定支持 enforcedAuthType = gemini-api-key。')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('rollback --json 无快照时返回失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['rollback', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('rollback')
    expect(payload.error?.code).toBe('BACKUP_NOT_FOUND')
    expect(payload.error?.message).toBe('没有可回滚的快照。')
  })

  it('rollback --json 非法 backupId 时返回失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['rollback', 'invalid-backup-id', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('rollback')
    expect(payload.error?.code).toBe('INVALID_BACKUP_ID')
    expect(payload.error?.message).toBe('无法从 backupId 推断平台：invalid-backup-id')
  })

  it('rollback 文本输出底层 manifest 读取异常的失败结果', async () => {
    const useResult = await runCli(['use', 'codex-prod', '--force', '--json'])
    const usePayload = parseJsonResult<{ backupId?: string }>(useResult.stdout)

    expect(usePayload.data?.backupId).toBeTruthy()

    const manifestPath = path.join(runtimeDir, 'backups', 'codex', usePayload.data!.backupId!, 'manifest.json')
    await fs.rm(manifestPath, { force: true, recursive: true })
    await fs.mkdir(manifestPath, { recursive: true })

    const result = await runCli(['rollback', usePayload.data!.backupId!])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain('[rollback] 失败')
    expect(result.stdout).toContain('EISDIR')
  })

  it('rollback --json 底层 manifest 读取异常时返回失败对象并设置 exitCode 1', async () => {
    const useResult = await runCli(['use', 'codex-prod', '--force', '--json'])
    const usePayload = parseJsonResult<{ backupId?: string }>(useResult.stdout)

    expect(usePayload.data?.backupId).toBeTruthy()

    const manifestPath = path.join(runtimeDir, 'backups', 'codex', usePayload.data!.backupId!, 'manifest.json')
    await fs.rm(manifestPath, { force: true, recursive: true })
    await fs.mkdir(manifestPath, { recursive: true })

    const result = await runCli(['rollback', usePayload.data!.backupId!, '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('rollback')
    expect(payload.error?.code).toBe('ROLLBACK_FAILED')
    expect(payload.error?.message).toContain('EISDIR')
  })


  it('add 输出文本结果、validate/preview explainable 摘要并落盘 profile', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'new-prod', '--key', 'sk-new-123', '--url', 'https://new.example.com'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[add] 成功')
    expect(result.stdout).toContain('- 配置: claude-new-prod (claude)')
    expect(result.stdout).toContain('  名称: new-prod')
    expect(result.stdout).toContain('  校验结果: 通过')
    expect(result.stdout).toContain('  警告: ANTHROPIC_BASE_URL 可能缺少 /api 后缀。')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')
    expect(result.stdout).toContain('  计划备份: 是')
    expect(result.stdout).toContain('  无变更: 否')
    expect(result.stdout).toContain('  目标文件:')
    expect(result.stdout).toContain(`  - ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-o***00 (scope=project, source=stored, secret)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-n***23 (scope=project, source=scope-project, secret)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(result.stdout).toContain('    保留字段: theme')
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - ANTHROPIC_AUTH_TOKEN: sk-n***23 (source=inline, present=yes)')
    expect(result.stdout).toContain('  变更摘要:')
    expect(result.stdout).toContain('  预览警告: 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('限制说明:')

    const profiles = await new ProfilesStore().list()
    expect(profiles.some((item) => item.id === 'claude-new-prod')).toBe(true)
  })

  it('add --json 支持 secret_ref/auth_reference 创建 profile，并明确写入链路未启用', async () => {
    const result = await runCli([
      'add',
      '--platform', 'codex',
      '--name', 'ref-profile',
      '--secret-ref', 'vault://codex/prod',
      '--auth-reference', 'vault://codex/prod',
      '--url', 'https://gateway.example.com/openai/v1',
      '--json',
    ])
    const payload = parseJsonResult<any>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.profile.source).toEqual({
      secret_ref: 'vault://codex/prod',
      baseURL: 'https://gateway.example.com/openai/v1',
    })
    expect(payload.data?.profile.apply).toEqual({
      auth_reference: 'vault://codex/prod',
      base_url: 'https://gateway.example.com/openai/v1',
    })
    expect(payload.data?.summary.referenceStats).toMatchObject({
      profileCount: 1,
      referenceProfileCount: 1,
      inlineProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      hasReferenceProfiles: true,
      hasInlineProfiles: false,
      hasWriteUnsupportedProfiles: true,
    })
    expect(payload.data?.summary.executabilityStats).toMatchObject({
      profileCount: 1,
      inlineReadyProfileCount: 0,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 1,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: false,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: true,
      hasSourceRedactedProfiles: false,
    })
    expect(payload.data?.summary.limitations).toContain('当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。')
    expect(payload.limitations).toContain('当前已识别 secret_ref/auth_reference，但 preview/use/import apply 尚未消费引用；后续写入仍需明文 secret 或运行时环境变量。')
  })

  it('add 同时传入 --key 与 reference 参数时返回结构化参数错误', async () => {
    const result = await runCli([
      'add',
      '--platform', 'claude',
      '--name', 'conflict-profile',
      '--key', 'sk-conflict-123',
      '--secret-ref', 'vault://claude/prod',
      '--json',
    ])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.error?.code).toBe('ADD_INPUT_CONFLICT')
    expect(payload.error?.message).toBe('不能同时提供 --key 与 --secret-ref/--auth-reference。')
  })

  it('add 输出低风险摘要时显示无需确认', async () => {
    await fs.writeFile(claudeProjectSettingsPath, JSON.stringify({}, null, 2), 'utf8')

    const result = await runCli(['add', '--platform', 'claude', '--name', 'new-low-risk', '--key', 'sk-new-789', '--url', 'https://new.example.com/api'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  风险等级: low')
    expect(result.stdout).toContain('  需要确认: 否')
    expect(result.stdout).toContain('  计划备份: 是')
    expect(result.stdout).toContain('  无变更: 否')
  })

  it('add 无变更时摘要显示 noChanges', async () => {
    await fs.writeFile(
      claudeProjectSettingsPath,
      JSON.stringify({ theme: 'dark', ANTHROPIC_AUTH_TOKEN: 'sk-same-123', ANTHROPIC_BASE_URL: 'https://same.example.com/api' }, null, 2),
      'utf8',
    )

    const result = await runCli(['add', '--platform', 'claude', '--name', 'same-config', '--key', 'sk-same-123', '--url', 'https://same.example.com/api'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  无变更: 是')
    expect(result.stdout).toContain('  需要确认: 是')
  })

  it('add --json 低风险摘要返回无需确认的 preview', async () => {
    await fs.writeFile(claudeProjectSettingsPath, JSON.stringify({}, null, 2), 'utf8')

    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-low-risk', '--key', 'sk-json-low-123', '--url', 'https://new.example.com/api', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      scopeCapabilities?: ScopeCapabilityContract[]
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; warnings: Array<{ code: string; message: string }> }
      risk: { allowed: boolean; riskLevel: string; reasons: string[]; limitations: string[] }
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          profileId?: string
          warningCount: number
          limitationCount: number
          changedFileCount?: number
          backupCreated?: boolean
          noChanges?: boolean
        }>
        referenceStats?: {
          profileCount: number
          referenceProfileCount: number
          inlineProfileCount: number
          writeUnsupportedProfileCount: number
        }
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.validation.ok).toBe(true)
    expect(payload.data?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'user', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'project', use: true, rollback: true, writable: true }),
      expect.objectContaining({ scope: 'local', use: true, rollback: true, writable: true }),
    ]))
    expect(payload.data?.validation.errors).toEqual([])
    expect(payload.data?.validation.warnings).toEqual([])
    expect(payload.data?.preview.riskLevel).toBe('low')
    expect(payload.data?.risk?.allowed).toBe(true)
    expect(payload.data?.risk?.riskLevel).toBe('low')
    expect(payload.data?.risk?.reasons).toEqual([])
    expect(payload.data?.risk?.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(payload.data?.summary).toEqual(expect.objectContaining({
      warnings: [],
      limitations: ['当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。'],
    }))
    expect(payload.data?.summary.platformStats).toEqual([
      expect.objectContaining({
        platform: 'claude',
        profileCount: 1,
        profileId: 'claude-json-low-risk',
        warningCount: 0,
        limitationCount: 1,
        changedFileCount: 1,
        backupCreated: true,
        noChanges: false,
      }),
    ])
    expect(payload.data?.preview.requiresConfirmation).toBe(false)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.warnings).toEqual([])
    expect(payload.warnings).toEqual([])
    expect(payload.limitations).toEqual(['当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。'])
  })



  it('add --json 在现有非托管字段下返回 medium 风险摘要', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-with-theme', '--key', 'sk-json-theme-123', '--url', 'https://new.example.com/api', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; warnings: Array<{ code: string; message: string }> }
      risk: { allowed: boolean; riskLevel: string; reasons: string[]; limitations: string[] }
      summary: { warnings: string[]; limitations: string[] }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.validation.warnings).toEqual([])
    expect(payload.data?.preview.riskLevel).toBe('medium')
    expect(payload.data?.risk?.riskLevel).toBe('medium')
    expect(payload.data?.risk?.allowed).toBe(false)
    expect(payload.data?.risk?.reasons).toContain('当前 Claude 配置存在非托管字段：theme')
    expect(payload.data?.summary?.warnings).toContain('当前 Claude 配置存在非托管字段：theme')
    expect(payload.data?.summary?.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.preview.warnings.some((item) => item.code === 'unmanaged-current-file')).toBe(true)
    expect(payload.warnings).toContain('当前 Claude 配置存在非托管字段：theme')
    expect(payload.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
  })


  it('add --json 为 claude 传入非 /api url 时返回 validation warning', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-claude-warning', '--key', 'sk-new-123', '--url', 'https://new.example.com', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; diffSummary: Array<{ path: string }> }
      risk: { allowed: boolean; riskLevel: string; reasons: string[]; limitations: string[] }
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          profileId?: string
          warningCount: number
          limitationCount: number
          changedFileCount?: number
          backupCreated?: boolean
          noChanges?: boolean
        }>
        referenceStats?: {
          profileCount: number
          referenceProfileCount: number
          inlineProfileCount: number
          writeUnsupportedProfileCount: number
        }
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('add')
    expect(payload.data?.profile.id).toBe('claude-json-claude-warning')
    expect(payload.data?.validation.ok).toBe(true)
    expect(payload.data?.validation.errors).toEqual([])
    expect(payload.data?.validation.warnings.some((item) => item.code === 'url-path-warning')).toBe(true)
    expect(payload.data?.risk.allowed).toBe(false)
    expect(payload.data?.risk.riskLevel).toBe('medium')
    expect(payload.data?.risk.reasons).toContain('ANTHROPIC_BASE_URL 可能缺少 /api 后缀。')
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'claude',
        profileCount: 1,
        profileId: 'claude-json-claude-warning',
        limitationCount: 1,
        changedFileCount: 1,
        backupCreated: true,
        noChanges: false,
      }),
    ]))
    expect(payload.data?.summary.platformStats?.[0]?.warningCount).toBeGreaterThanOrEqual(1)
    expect(payload.data?.summary.referenceStats).toMatchObject({
      profileCount: 1,
      referenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      hasReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
    })
    expect(payload.data?.summary.executabilityStats).toMatchObject({
      profileCount: 1,
      inlineReadyProfileCount: 1,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: true,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: false,
      hasSourceRedactedProfiles: false,
    })
    expect(payload.data?.summary.warnings).toContain('ANTHROPIC_BASE_URL 可能缺少 /api 后缀。')
    expect(payload.data?.summary.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(payload.data?.preview.riskLevel).toBe('medium')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.diffSummary[0]?.path).toBe(claudeProjectSettingsPath)
    expect(payload.warnings).toContain('ANTHROPIC_BASE_URL 可能缺少 /api 后缀。')
    expect(payload.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
  })


  it('add --json 为 claude 在空现有配置下返回低风险摘要', async () => {
    await fs.writeFile(claudeProjectSettingsPath, JSON.stringify({}, null, 2), 'utf8')

    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-claude', '--key', 'sk-new-123', '--url', 'https://new.example.com/api', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; diffSummary: Array<{ path: string }> }
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          profileId?: string
          warningCount: number
          limitationCount: number
          changedFileCount?: number
          backupCreated?: boolean
          noChanges?: boolean
        }>
        referenceStats?: {
          profileCount: number
          referenceProfileCount: number
          inlineProfileCount: number
          writeUnsupportedProfileCount: number
        }
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('add')
    expect(payload.data?.profile.id).toBe('claude-json-claude')
    expect(payload.data?.profile.platform).toBe('claude')
    expect(payload.data?.profile.source).toEqual({
      token: 'sk-n***23',
      baseURL: 'https://new.example.com/api',
    })
    expect(payload.data?.profile.apply).toEqual({
      ANTHROPIC_AUTH_TOKEN: 'sk-n***23',
      ANTHROPIC_BASE_URL: 'https://new.example.com/api',
    })
    expect(payload.data?.validation.ok).toBe(true)
    expect(payload.data?.validation.errors).toEqual([])
    expect(payload.data?.validation.warnings).toEqual([])
    expect(payload.data?.summary).toEqual(expect.objectContaining({
      warnings: [],
      limitations: ['当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。'],
    }))
    expect(payload.data?.summary.referenceStats).toMatchObject({
      profileCount: 1,
      referenceProfileCount: 0,
      inlineProfileCount: 1,
      writeUnsupportedProfileCount: 0,
      hasReferenceProfiles: false,
      hasInlineProfiles: true,
      hasWriteUnsupportedProfiles: false,
    })
    expect(payload.data?.summary.executabilityStats).toMatchObject({
      profileCount: 1,
      inlineReadyProfileCount: 1,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: true,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: false,
      hasSourceRedactedProfiles: false,
    })
    expect(payload.data?.summary.platformStats).toEqual([
      expect.objectContaining({
        platform: 'claude',
        profileCount: 1,
        profileId: 'claude-json-claude',
        warningCount: 0,
        limitationCount: 1,
        changedFileCount: 1,
        backupCreated: true,
        noChanges: false,
      }),
    ])
    expect(payload.data?.preview.riskLevel).toBe('low')
    expect(payload.data?.preview.requiresConfirmation).toBe(false)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.diffSummary[0]?.path).toBe(claudeProjectSettingsPath)
    expect(payload.warnings).toEqual([])
    expect(payload.limitations).toEqual(['当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。'])
  })

  it('add --json 为 claude 返回 profile 与 validate/preview 摘要', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-claude-legacy', '--key', 'sk-new-123', '--url', 'https://new.example.com', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; diffSummary: Array<{ path: string }> }
      risk: { allowed: boolean; riskLevel: string; reasons: string[]; limitations: string[] }
      summary: { warnings: string[]; limitations: string[] }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('add')
    expect(payload.data?.profile.id).toBe('claude-json-claude-legacy')
    expect(payload.data?.profile.platform).toBe('claude')
    expect(payload.data?.profile.source).toEqual({
      token: 'sk-n***23',
      baseURL: 'https://new.example.com',
    })
    expect(payload.data?.profile.apply).toEqual({
      ANTHROPIC_AUTH_TOKEN: 'sk-n***23',
      ANTHROPIC_BASE_URL: 'https://new.example.com',
    })
    expect(payload.data?.validation.ok).toBe(true)
    expect(payload.data?.validation.errors).toEqual([])
    expect(payload.data?.validation.warnings.some((item) => item.code === 'url-path-warning')).toBe(true)
    expect(payload.data?.risk.allowed).toBe(false)
    expect(payload.data?.risk.riskLevel).toBe('medium')
    expect(payload.data?.risk.reasons).toContain('ANTHROPIC_BASE_URL 可能缺少 /api 后缀。')
    expect(payload.data?.summary.warnings).toContain('ANTHROPIC_BASE_URL 可能缺少 /api 后缀。')
    expect(payload.data?.summary.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(payload.data?.preview.riskLevel).toBe('medium')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.diffSummary[0]?.path).toBe(claudeProjectSettingsPath)
    expect(payload.warnings).toContain('ANTHROPIC_BASE_URL 可能缺少 /api 后缀。')
    expect(payload.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
  })



  it('add --json 复用当前设置时返回 noChanges 摘要', async () => {
    await fs.writeFile(
      claudeProjectSettingsPath,
      JSON.stringify({ ANTHROPIC_AUTH_TOKEN: 'sk-nochange-123', ANTHROPIC_BASE_URL: 'https://same.example.com/api' }, null, 2),
      'utf8',
    )

    const result = await runCli(['add', '--platform', 'claude', '--name', 'json-nochange', '--key', 'sk-nochange-123', '--url', 'https://same.example.com/api', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; warnings: Array<{ code: string; message: string }> }
      summary: { warnings: string[]; limitations: string[] }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.preview.riskLevel).toBe('low')
    expect(payload.data?.preview.requiresConfirmation).toBe(false)
    expect(payload.data?.preview.backupPlanned).toBe(false)
    expect(payload.data?.preview.noChanges).toBe(true)
    expect(payload.data?.summary.warnings).toEqual([])
    expect(payload.data?.summary.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(payload.warnings).toEqual([])
    expect(payload.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
  })

  it('add 高风险/需确认摘要不会阻止新增 profile', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'needs-confirmation', '--key', 'gm-needs-confirmation-123'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[add] 成功')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')

    const profiles = await new ProfilesStore().list()
    expect(profiles.some((item) => item.id === 'gemini-needs-confirmation')).toBe(true)
  })

  it('add 校验失败时仍返回摘要并写入 profile', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'invalid-key', '--key', '', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string; message: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean }
      summary: { warnings: string[]; limitations: string[] }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.validation.ok).toBe(false)
    expect(payload.data?.validation.errors.some((item) => item.code === 'missing-anthropic-auth-token')).toBe(true)
    expect(payload.data?.summary.warnings).toContain('缺少 ANTHROPIC_AUTH_TOKEN')
    expect(payload.data?.summary.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(payload.data?.preview.riskLevel).toBe('high')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.warnings).toContain('缺少 ANTHROPIC_AUTH_TOKEN')
    expect(payload.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')

    const profiles = await new ProfilesStore().list()
    expect(profiles.some((item) => item.id === 'claude-invalid-key')).toBe(true)
  })

  it('add 先输出摘要再持久化，因此重复 ID 不会被预览阶段阻断', async () => {
    const first = await runCli(['add', '--platform', 'claude', '--name', 'preview-first', '--key', 'sk-preview-first-123', '--url', 'https://first.example.com/api'])
    expect(first.exitCode).toBe(0)

    const second = await runCli(['add', '--platform', 'claude', '--name', 'preview-first', '--key', 'sk-preview-first-456', '--url', 'https://second.example.com/api'])

    expect(second.stderr).toBe('')
    expect(second.exitCode).toBe(1)
    expect(second.stdout).toContain('[add] 失败')
    expect(second.stdout).toContain('配置 ID 已存在：claude-preview-first')
  })

  it('add 支持 codex 的 validate/preview 摘要', async () => {
    const result = await runCli(['add', '--platform', 'codex', '--name', 'codex-summary', '--key', 'sk-codex-summary-123', '--url', 'https://gateway.example.com/openai'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[add] 成功')
    expect(result.stdout).toContain('- 配置: codex-codex-summary (codex)')
    expect(result.stdout).toContain('  警告: base_url 可能缺少 /v1 或 /openai/v1 后缀。')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')
  })

  it('add 的摘要会根据当前文件内容给出非托管字段提示', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'with-unmanaged', '--key', 'sk-unmanaged-123', '--url', 'https://with-unmanaged.example.com/api'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  预览警告: 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('附加提示:')
  })

  it('add 的摘要在 JSON 输出中保留 preview warnings 细节', async () => {
    const result = await runCli(['add', '--platform', 'codex', '--name', 'json-preview-warnings', '--key', 'sk-codex-preview-123', '--url', 'https://gateway.example.com/openai', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; warnings: Array<{ code: string; message: string }> }
      summary: { warnings: string[]; limitations: string[] }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.preview.warnings.some((item) => item.code === 'multi-file-overwrite')).toBe(true)
    expect(payload.data?.preview.warnings.some((item) => item.code === 'unmanaged-current-file')).toBe(true)
    expect(payload.data?.summary.warnings?.length).toBeGreaterThan(0)
    expect(payload.warnings?.length).toBeGreaterThan(0)
  })

  it('add 成功后会把 profile 写入后续 list 可见的数据源', async () => {
    const addResult = await runCli(['add', '--platform', 'claude', '--name', 'listed-after-add', '--key', 'sk-listed-after-add-123', '--url', 'https://listed.example.com/api'])
    expect(addResult.exitCode).toBe(0)

    const listResult = await runCli(['list', '--platform', 'claude'])

    expect(listResult.stderr).toBe('')
    expect(listResult.exitCode).toBe(0)
    expect(listResult.stdout).toContain('- claude-listed-after-add (claude)')
  })

  it('add 的风险提示来源于 preview/validate 聚合结果', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'risk-reasons', '--key', 'gm-risk-reasons-123'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
  })

  it('add 文本输出会展示 preview targetFiles', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'target-files', '--key', 'gm-target-files-123'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  目标文件:')
    expect(result.stdout).toContain(`  - ${geminiSettingsPath}`)
  })

  it('add JSON 输出会展示 preview diffSummary path', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'diff-path', '--key', 'gm-diff-path-123', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; diffSummary: Array<{ path: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.preview.diffSummary[0]?.path).toBe(geminiSettingsPath)
  })

  it('add JSON 输出会保留 validation warnings', async () => {
    const result = await runCli(['add', '--platform', 'codex', '--name', 'json-validation-warning', '--key', 'sk-codex-validation-warning-123', '--url', 'https://gateway.example.com/openai', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean }
      risk: { allowed: boolean; riskLevel: string; reasons: string[]; limitations: string[] }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.validation.warnings.some((item) => item.code === 'url-path-warning')).toBe(true)
    expect(payload.data?.risk.allowed).toBe(false)
    expect(payload.data?.risk.riskLevel).toBe('medium')
    expect(payload.data?.risk.reasons).toContain('base_url 可能缺少 /v1 或 /openai/v1 后缀。')
    expect(payload.data?.preview.riskLevel).toBe('medium')
  })


  it('add JSON 输出会保留 preview 的 backupPlanned=false 情况', async () => {
    await fs.writeFile(
      geminiSettingsPath,
      JSON.stringify({ enforcedAuthType: 'gemini-api-key' }, null, 2),
      'utf8',
    )

    const result = await runCli(['add', '--platform', 'gemini', '--name', 'gemini-no-change', '--key', 'gm-gemini-no-change-123', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean }
      summary: { warnings: string[]; limitations: string[] }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.preview.backupPlanned).toBe(false)
    expect(payload.data?.preview.noChanges).toBe(true)
    expect(payload.data?.summary.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(payload.data?.summary.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('add 的文本摘要会展示 preview 生成的风险状态', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'text-risk', '--key', 'gm-text-risk-123'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')
  })

  it('add 的文本摘要会展示 validation errors', async () => {
    const result = await runCli(['add', '--platform', 'claude', '--name', 'text-validation-error', '--key', ''])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('  校验结果: 失败')
    expect(result.stdout).toContain('  错误: 缺少 ANTHROPIC_AUTH_TOKEN')
  })

  it('add --json 为 codex 构造匹配的 source/apply 字段', async () => {
    const result = await runCli(['add', '--platform', 'codex', '--name', 'json-codex', '--key', 'sk-codex-new-123', '--url', 'https://gateway.example.com/openai/v1', '--json'])
    const payload = parseJsonResult<{ profile: Profile }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('add')
    expect(payload.data?.profile.id).toBe('codex-json-codex')
    expect(payload.data?.profile.platform).toBe('codex')
    expect(payload.data?.profile.source).toEqual({
      apiKey: 'sk-c***23',
      baseURL: 'https://gateway.example.com/openai/v1',
    })
    expect(payload.data?.profile.apply).toEqual({
      OPENAI_API_KEY: 'sk-c***23',
      base_url: 'https://gateway.example.com/openai/v1',
    })
  })

  it('add --json 为 gemini 构造匹配字段并返回附加提示', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'json-prod', '--key', 'gm-new-123', '--json'])
    const payload = parseJsonResult<{
      profile: Profile
      validation: { ok: boolean; warnings: Array<{ code: string }>; errors: Array<{ code: string }> }
      preview: { riskLevel: string; requiresConfirmation: boolean; backupPlanned: boolean; noChanges?: boolean; warnings: Array<{ code: string; message: string }> }
      risk: { allowed: boolean; riskLevel: string; reasons: string[]; limitations: string[] }
      summary: { warnings: string[]; limitations: string[] }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('add')
    expect(payload.data?.profile.id).toBe('gemini-json-prod')
    expect(payload.data?.profile.platform).toBe('gemini')
    expect(payload.data?.profile.source).toEqual({
      apiKey: 'gm-n***23',
      authType: 'gemini-api-key',
    })
    expect(payload.data?.profile.apply).toEqual({
      GEMINI_API_KEY: 'gm-n***23',
      enforcedAuthType: 'gemini-api-key',
    })
    expect(payload.data?.validation.ok).toBe(true)
    expect(payload.data?.risk.allowed).toBe(false)
    expect(payload.data?.risk.riskLevel).toBe('medium')
    expect(payload.data?.risk.reasons).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(payload.data?.risk.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.data?.summary.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(payload.data?.summary.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(payload.data?.preview.riskLevel).toBe('medium')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.preview.backupPlanned).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.warnings.some((item) => item.code === 'env-auth-required')).toBe(true)
    expect(payload.warnings).toContain('Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效，当前仅托管 settings.json 中已确认的配置字段。')
    expect(payload.limitations).toContain('GEMINI_API_KEY 仍需通过环境变量生效。')
  })


  it('add 非法 platform 时返回结构化失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['add', '--platform', 'openai', '--name', 'bad-platform', '--key', 'sk-bad-123', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('add')
    expect(payload.error?.code).toBe('UNSUPPORTED_PLATFORM')
    expect(payload.error?.message).toBe('不支持的平台：openai')
  })

  it('add 文本参数失败时输出 explainable 失败结果', async () => {
    const result = await runCli(['add', '--platform', 'openai', '--name', 'bad-platform', '--key', 'sk-bad-123'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[add] 失败')
    expect(result.stdout).toContain('不支持的平台：openai')
  })

  it('add 为 gemini 传入 --url 时返回结构化失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['add', '--platform', 'gemini', '--name', 'bad-url', '--key', 'gm-bad-123', '--url', 'https://example.com', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('add')
    expect(payload.error?.code).toBe('GEMINI_URL_UNSUPPORTED')
    expect(payload.error?.message).toBe('gemini 平台暂不支持 --url，请改用默认官方链路。')
  })

  it('list 非法 platform 时返回结构化失败对象并设置 exitCode 1', async () => {
    const result = await runCli(['list', '--platform', 'openai', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('list')
    expect(payload.error?.code).toBe('UNSUPPORTED_PLATFORM')
    expect(payload.error?.message).toBe('不支持的平台：openai')
  })

  it('list 文本参数失败时输出 explainable 失败结果', async () => {
    const result = await runCli(['list', '--platform', 'openai'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[list] 失败')
    expect(result.stdout).toContain('不支持的平台：openai')
  })


  it('add 重复 ID 时返回 explainable 失败结果并保持已有 profiles 不变', async () => {
    const first = await runCli(['add', '--platform', 'claude', '--name', 'dup-prod', '--key', 'sk-new-123'])
    expect(first.stderr).toBe('')
    expect(first.exitCode).toBe(0)

    const second = await runCli(['add', '--platform', 'claude', '--name', 'dup-prod', '--key', 'sk-new-456'])

    expect(second.stdout).toContain('[add] 失败')
    expect(second.stderr).toBe('')
    expect(second.exitCode).toBe(1)
    expect(second.stdout).toContain('配置 ID 已存在：claude-dup-prod')

    const profiles = await new ProfilesStore().list()
    expect(profiles.filter((item) => item.id === 'claude-dup-prod')).toHaveLength(1)
  })

  it('list 输出文本结果并带出 current/health/risk', async () => {
    await new StateStore().markCurrent('gemini', 'gemini-prod', 'snapshot-gemini-001')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['list'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[list] 成功')
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('  当前生效: 是')
    expect(result.stdout).toContain('  健康状态: valid')
    expect(result.stdout).toContain('  风险等级: low')
    expect(result.stdout).toContain('- gemini-invalid (gemini)')
    expect(result.stdout).toContain('  当前生效: 否')
    expect(result.stdout).toContain('  健康状态: unknown')
    expect(result.stdout).toContain('  风险等级: low')
  })

  it('list 在 detectCurrent 命中但未被 state 标记时显示 warning/medium', async () => {
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['list', '--platform', 'gemini'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('  当前生效: 否')
    expect(result.stdout).toContain('  健康状态: warning')
    expect(result.stdout).toContain('  风险等级: medium')
  })

  it('list 会把当前生效项排序到前面', async () => {
    await new StateStore().markCurrent('gemini', 'gemini-prod', 'snapshot-gemini-001')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['list', '--platform', 'gemini'])
    const geminiCurrentIndex = result.stdout.indexOf('- gemini-prod (gemini)')
    const geminiOtherIndex = result.stdout.indexOf('- gemini-invalid (gemini)')

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(geminiCurrentIndex).toBeGreaterThanOrEqual(0)
    expect(geminiOtherIndex).toBeGreaterThan(geminiCurrentIndex)
  })

  it('list --json 输出结构化 profiles 列表与状态摘要', async () => {
    await new StateStore().markCurrent('gemini', 'gemini-prod', 'snapshot-gemini-001')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['list', '--json'])
    const payload = parseJsonResult<{
      profiles: Array<{
        profile: Profile & { meta?: { riskLevel?: string; healthStatus?: string } }
        current: boolean
        riskLevel: string
        healthStatus: string
      }>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('list')
    expect(payload.data?.profiles).toHaveLength(4)

    const currentGemini = payload.data?.profiles.find((item) => item.profile.id === 'gemini-prod')
    expect(currentGemini?.current).toBe(true)
    expect(currentGemini?.riskLevel).toBe('low')
    expect(currentGemini?.healthStatus).toBe('valid')
    expect(currentGemini?.profile.meta?.riskLevel).toBe('low')
    expect(currentGemini?.profile.meta?.healthStatus).toBe('valid')
  })

  it('list --platform --json 仅返回目标平台的 profiles 与状态摘要', async () => {
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['list', '--platform', 'gemini', '--json'])
    const payload = parseJsonResult<{
      profiles: Array<{
        profile: Profile & { meta?: { riskLevel?: string; healthStatus?: string } }
        current: boolean
        riskLevel: string
        healthStatus: string
      }>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('list')
    expect(payload.data?.profiles).toHaveLength(2)
    expect(payload.data?.profiles.every((item) => item.profile.platform === 'gemini')).toBe(true)

    const detectedGemini = payload.data?.profiles.find((item) => item.profile.id === 'gemini-prod')
    expect(detectedGemini?.current).toBe(false)
    expect(detectedGemini?.riskLevel).toBe('medium')
    expect(detectedGemini?.healthStatus).toBe('warning')
  })

  it('list 会保留已有 meta 中的状态值', async () => {
    await new ProfilesStore().write({
      version: 1,
      profiles: [
        {
          id: 'claude-meta',
          name: 'claude-meta',
          platform: 'claude',
          source: { token: 'sk-meta-123' },
          apply: { ANTHROPIC_AUTH_TOKEN: 'sk-meta-123' },
          meta: { riskLevel: 'high', healthStatus: 'invalid' },
        },
      ],
    })

    const result = await runCli(['list', '--json'])
    const payload = parseJsonResult<{
      profiles: Array<{
        profile: Profile & { meta?: { riskLevel?: string; healthStatus?: string } }
        current: boolean
        riskLevel: string
        healthStatus: string
      }>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.profiles[0]?.riskLevel).toBe('high')
    expect(payload.data?.profiles[0]?.healthStatus).toBe('invalid')
    expect(payload.data?.profiles[0]?.profile.meta?.riskLevel).toBe('high')
    expect(payload.data?.profiles[0]?.profile.meta?.healthStatus).toBe('invalid')
  })

  it('list 空列表时输出限制说明', async () => {
    await new ProfilesStore().write({ version: 1, profiles: [] })

    const result = await runCli(['list'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[list] 成功')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.stdout).toContain('  - 当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.stdout).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('list --json 空列表时返回空数组', async () => {
    await new ProfilesStore().write({ version: 1, profiles: [] })

    const result = await runCli(['list', '--json'])
    const payload = parseJsonResult<{ profiles: Array<unknown>; summary: { warnings: string[]; limitations: string[] } }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('list')
    expect(payload.data?.profiles).toEqual([])
    expect(payload.data?.summary.warnings).toEqual([])
    expect(payload.data?.summary.limitations).toContain('当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
  })

  it('list --platform 输出按平台过滤后的文本结果', async () => {
    const result = await runCli(['list', '--platform', 'gemini'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[list] 成功')
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('- gemini-invalid (gemini)')
    expect(result.stdout).not.toContain('- claude-prod (claude)')
    expect(result.stdout).not.toContain('- codex-prod (codex)')
  })

  it('current 输出文本 state 与检测结果', async () => {
    await new StateStore().markCurrent('gemini', 'gemini-prod', 'snapshot-gemini-001')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ ui: { theme: 'dark' }, enforcedAuthType: 'gemini-api-key' }, null, 2), 'utf8')

    const result = await runCli(['current'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[current] 成功')
    expect(result.stdout).toContain('referenceStats 摘要:')
    expect(result.stdout).toContain('hasReferenceProfiles=')
    expect(result.stdout).toContain('- gemini: gemini-prod')
    expect(result.stdout).toContain('检测结果:')
    expect(result.stdout).toContain('- 平台: claude')
    expect(result.stdout).toContain('  当前作用域: project')
    expect(result.stdout).toContain('  作用域说明:')
    expect(result.stdout).toContain('  - 检测范围: user, project, local')
    expect(result.stdout).toContain('  - 生效优先级: user < project < local')
    expect(result.stdout).toContain('  - 当前生效来源: project')
    expect(result.stdout).toContain('  - 默认写入目标: 未显式传入 --scope 时，先读取 API_SWITCHER_CLAUDE_TARGET_SCOPE，再回落到 user')
    expect(result.stdout).toContain('- 平台: gemini')
    expect(result.stdout).toContain('  托管识别: 是')
    expect(result.stdout).toContain('  匹配配置: gemini-prod')
    expect(result.stdout).toContain('  当前作用域: user')
    expect(result.stdout).toContain('  作用域说明:')
    expect(result.stdout).toContain('  - 检测范围: system-defaults, user, project, system-overrides')
    expect(result.stdout).toContain('  - 生效优先级: system-defaults < user < project < system-overrides')
    expect(result.stdout).toContain('  - 当前生效来源: user')
    expect(result.stdout).toContain('  - 当前写入策略: api-switcher 当前仅写入 user scope')
    expect(result.stdout).toContain(`  目标文件: ${geminiSettingsPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=stored)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=effective)')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: gm-l***56 (scope=runtime, source=env, secret, shadowed)')
    expect(result.stdout).toContain('    覆盖说明:')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: 最终生效的 API key 取决于环境变量，而不是 settings.json。')
    expect(result.stdout).toContain('    被覆盖字段: GEMINI_API_KEY')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${geminiSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: enforcedAuthType')
    expect(result.stdout).toContain('    保留字段: ui')
    expect(result.stdout).toContain('    说明: Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY: gm-l***56 (source=env, present=yes)')
    expect(result.stdout).toContain('  警告: Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(result.stdout).toContain('  限制: GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('validate 成功时输出 explainable 校验详情并保持 exitCode 0', async () => {
    const result = await runCli(['validate', 'gemini-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[validate] 成功')
    expect(result.stdout).toContain('referenceStats 摘要:')
    expect(result.stdout).toContain('profiles=1, reference=0, inline=1, writeUnsupported=0')
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=stored)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: gm-l***56 (scope=runtime, source=env, secret, shadowed)')
    expect(result.stdout).toContain('    覆盖说明:')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(result.stdout).toContain('    被覆盖字段: GEMINI_API_KEY')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${geminiSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: enforcedAuthType')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY: gm-l***56 (source=env, present=yes)')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
    expect(result.stdout).not.toContain('  平台限制:')
  })

  it('validate 失败时输出 explainable 校验详情并设置 exitCode 1', async () => {
    const result = await runCli(['validate', 'gemini-invalid'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[validate] 失败')
    expect(result.stdout).toContain('- gemini-invalid (gemini)')
    expect(result.stdout).toContain('  校验结果: 失败')
    expect(result.stdout).toContain('  错误: 缺少 GEMINI_API_KEY')
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - enforcedAuthType: oauth-personal (scope=user, source=stored)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - enforcedAuthType: oauth-personal (scope=user, source=effective)')
    expect(result.stdout).not.toContain('    - GEMINI_API_KEY:')
    expect(result.stdout).not.toContain('    覆盖说明:')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY:  (source=env, present=no)')
    expect(result.stdout).not.toContain('  平台限制:')
  })

  it('export 输出名称、校验摘要与限制说明', async () => {
    const result = await runCli(['export'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[export] 成功')
    expect(result.stdout).toContain('referenceStats 摘要:')
    expect(result.stdout).toContain('hasReferenceProfiles=')
    expect(result.stdout).toContain('- claude-prod (claude)')
    expect(result.stdout).toContain('  名称: claude-prod')
    expect(result.stdout).toContain('  校验结果: 通过')
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-l***56 (scope=project, source=stored, secret)')
    expect(result.stdout).toContain('  限制: 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.stdout).toContain('- codex-prod (codex)')
    expect(result.stdout).toContain('- gemini-prod (gemini)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - ANTHROPIC_AUTH_TOKEN: sk-l***56 (source=inline, present=yes)')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.stdout).toContain('  - 当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.stdout).toContain('  - GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('import --json 输出 exported/local observation、fidelity 与 decision', async () => {
    const importFile = path.join(runtimeDir, 'import-source.json')
    await fs.writeFile(importFile, JSON.stringify({
      schemaVersion: PUBLIC_JSON_SCHEMA_VERSION,
      ok: true,
      action: 'export',
      data: {
        profiles: [
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
        ],
        summary: {
          warnings: [],
          limitations: [],
        },
      },
    }, null, 2), 'utf8')

    await fs.rm(geminiProjectRoot, { recursive: true, force: true })

    const result = await runCli(['import', importFile, '--json'])
    const payload = parseJsonResult<{
      sourceFile: string
      items: Array<{
        platform: string
        platformSummary?: {
          kind: string
          precedence?: string[]
          currentScope?: string
          composedFiles?: string[]
          facts: Array<{ code: string; message: string }>
        }
        exportedObservation?: { defaultWriteScope?: string; observedAt?: string }
        localObservation?: { defaultWriteScope?: string; scopeAvailability?: ScopeAvailabilityContract[] }
        fidelity?: {
          status: string
          driftSummary: { blocking: number; warning: number; info: number }
          groupedMismatches: Array<{
            driftKind: string
            totalCount: number
            blockingCount: number
            warningCount: number
            infoCount: number
            mismatches: Array<{ field: string; scope?: string }>
          }>
          highlights: string[]
          mismatches: Array<{
            field: string
            scope?: string
            driftKind?: string
            severity?: string
            recommendedAction?: string
          }>
        }
        previewDecision: {
          canProceedToApplyDesign: boolean
          recommendedScope?: string
          requiresLocalResolution: boolean
          reasonCodes: string[]
          reasons: Array<{ code: string; blocking: boolean; message: string }>
        }
      }>
      summary: {
        totalItems: number
        matchCount: number
        mismatchCount: number
        partialCount: number
        insufficientDataCount: number
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
        triageStats?: {
          totalItems: number
          buckets: Array<{
            id: string
            totalCount: number
          }>
        }
        sourceExecutability: {
          totalItems: number
          applyReadyCount: number
          previewOnlyCount: number
          blockedCount: number
          blockedByCodeStats: Array<{
            code: string
            totalCount: number
          }>
        }
        decisionCodeStats: Array<{
          code: string
          totalCount: number
          blockingCount: number
          nonBlockingCount: number
        }>
        driftKindStats: Array<{
          driftKind: string
          totalCount: number
          blockingCount: number
          warningCount: number
          infoCount: number
        }>
        platformStats: Array<{
          platform: string
          totalItems: number
          matchCount: number
          mismatchCount: number
          partialCount: number
          insufficientDataCount: number
        }>
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import')
    expect(payload.data?.sourceFile).toBe(importFile)
    expect(payload.data?.items[0]).toEqual(expect.objectContaining({
      platform: 'gemini',
      platformSummary: {
        kind: 'scope-precedence',
        precedence: ['system-defaults', 'user', 'project', 'system-overrides'],
        facts: [
          { code: 'GEMINI_SCOPE_PRECEDENCE', message: 'Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。' },
          { code: 'GEMINI_PROJECT_OVERRIDES_USER', message: 'project scope 会覆盖 user 中的同名字段。' },
        ],
      },
      exportedObservation: expect.objectContaining({
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
      }),
      localObservation: expect.objectContaining({
        defaultWriteScope: 'user',
        scopeAvailability: expect.arrayContaining([
          expect.objectContaining({ scope: 'project', status: 'unresolved', reasonCode: 'PROJECT_ROOT_UNRESOLVED' }),
        ]),
      }),
      fidelity: expect.objectContaining({
        status: 'mismatch',
        driftSummary: {
          blocking: 1,
          warning: 0,
          info: 0,
        },
        groupedMismatches: [
          {
            driftKind: 'default-scope-drift',
            totalCount: 0,
            blockingCount: 0,
            warningCount: 0,
            infoCount: 0,
            mismatches: [],
          },
          {
            driftKind: 'availability-drift',
            totalCount: 1,
            blockingCount: 1,
            warningCount: 0,
            infoCount: 0,
            mismatches: [
              expect.objectContaining({
                field: 'scopeAvailability',
                scope: 'project',
              }),
            ],
          },
          {
            driftKind: 'capability-drift',
            totalCount: 0,
            blockingCount: 0,
            warningCount: 0,
            infoCount: 0,
            mismatches: [],
          },
        ],
        highlights: [
          '当前本地 scope availability 与导出观察不一致，应以本地实时环境为准。',
        ],
        mismatches: expect.arrayContaining([
          expect.objectContaining({
            field: 'scopeAvailability',
            scope: 'project',
            driftKind: 'availability-drift',
            severity: 'blocking',
            recommendedAction: '先修复本地 project scope 解析，再重新执行 import preview。',
          }),
        ]),
      }),
      previewDecision: {
        canProceedToApplyDesign: false,
        recommendedScope: 'user',
        requiresLocalResolution: true,
        reasonCodes: ['BLOCKED_BY_FIDELITY_MISMATCH', 'REQUIRES_LOCAL_SCOPE_RESOLUTION'],
        reasons: [
          {
            code: 'BLOCKED_BY_FIDELITY_MISMATCH',
            blocking: true,
            message: '导出观察与当前本地观察存在关键漂移，当前不应继续进入 apply 设计。',
          },
          {
            code: 'REQUIRES_LOCAL_SCOPE_RESOLUTION',
            blocking: true,
            message: '当前本地 scope 解析未完成，需先修复本地解析结果。',
          },
        ],
      },
    }))
    expect(payload.data?.summary?.totalItems).toBe(1)
    expect(payload.data?.summary?.matchCount).toBe(0)
    expect(payload.data?.summary?.mismatchCount).toBe(1)
    expect(payload.data?.summary?.partialCount).toBe(0)
    expect(payload.data?.summary?.insufficientDataCount).toBe(0)
    expect(payload.data?.summary?.executabilityStats).toEqual({
      profileCount: 1,
      inlineReadyProfileCount: 1,
      referenceReadyProfileCount: 0,
      referenceMissingProfileCount: 0,
      writeUnsupportedProfileCount: 0,
      sourceRedactedProfileCount: 0,
      hasInlineReadyProfiles: true,
      hasReferenceReadyProfiles: false,
      hasReferenceMissingProfiles: false,
      hasWriteUnsupportedProfiles: false,
      hasSourceRedactedProfiles: false,
    })
    expect(payload.data?.summary?.sourceExecutability).toEqual({
      totalItems: 1,
      applyReadyCount: 1,
      previewOnlyCount: 0,
      blockedCount: 0,
      blockedByCodeStats: [
        { code: 'REDACTED_INLINE_SECRET', totalCount: 0 },
      ],
    })
    expect(payload.data?.summary?.triageStats).toEqual({
      totalItems: 1,
      buckets: [
        {
          id: 'source-blocked',
          title: 'Source blocked bucket',
          totalCount: 0,
          summaryFields: ['summary.sourceExecutability'],
          itemFields: ['sourceCompatibility', 'items.previewDecision'],
          recommendedNextStep: 'repair-source-input',
        },
        {
          id: 'write-readiness',
          title: 'Write readiness bucket',
          totalCount: 1,
          summaryFields: ['summary.executabilityStats'],
          itemFields: ['items.previewDecision', 'items.fidelity'],
          recommendedNextStep: 'continue-to-write',
        },
        {
          id: 'platform-routing',
          title: 'Platform routing bucket',
          totalCount: 1,
          summaryFields: ['summary.platformStats'],
          itemFields: ['platformSummary'],
          recommendedNextStep: 'group-by-platform',
        },
      ],
    })
    expect(payload.data?.summary?.decisionCodeStats).toEqual([
      { code: 'READY_USING_LOCAL_OBSERVATION', totalCount: 0, blockingCount: 0, nonBlockingCount: 0 },
      { code: 'LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION', totalCount: 0, blockingCount: 0, nonBlockingCount: 0 },
      { code: 'BLOCKED_BY_INSUFFICIENT_OBSERVATION', totalCount: 0, blockingCount: 0, nonBlockingCount: 0 },
      { code: 'BLOCKED_BY_FIDELITY_MISMATCH', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
      { code: 'REQUIRES_LOCAL_SCOPE_RESOLUTION', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
    ])
    expect(payload.data?.summary?.driftKindStats).toEqual([
      { driftKind: 'default-scope-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
      { driftKind: 'availability-drift', totalCount: 1, blockingCount: 1, warningCount: 0, infoCount: 0 },
      { driftKind: 'capability-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
    ])
    expect(payload.data?.summary?.platformStats).toEqual([
      {
        platform: 'gemini',
        totalItems: 1,
        matchCount: 0,
        mismatchCount: 1,
        partialCount: 0,
        insufficientDataCount: 0,
      },
    ])
  })

  it('import --json 在混合批次下准确聚合 match、partial、mismatch 与 insufficient-data', async () => {
    const importFile = path.join(runtimeDir, 'import-source-mixed.json')
    await fs.writeFile(importFile, JSON.stringify({
      schemaVersion: PUBLIC_JSON_SCHEMA_VERSION,
      ok: true,
      action: 'export',
      data: {
        profiles: [
          {
            profile: {
              id: 'gemini-match',
              name: 'gemini-match',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
            ],
            scopeAvailability: [
              { scope: 'user', status: 'available', detected: true, writable: true, path: geminiSettingsPath },
            ],
          },
          {
            profile: {
              id: 'gemini-partial',
              name: 'gemini-partial',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
            ],
          },
          {
            profile: {
              id: 'gemini-mismatch',
              name: 'gemini-mismatch',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
            ],
            scopeAvailability: [
              { scope: 'project', status: 'available', detected: true, writable: true, path: geminiProjectSettingsPath },
            ],
          },
          {
            profile: {
              id: 'gemini-redacted',
              name: 'gemini-redacted',
              platform: 'gemini',
              source: { apiKey: '<redacted:inline-secret>', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: '<redacted:inline-secret>', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
            ],
            scopeAvailability: [
              { scope: 'user', status: 'available', detected: true, writable: true, path: geminiSettingsPath },
            ],
          },
          {
            profile: {
              id: 'gemini-insufficient',
              name: 'gemini-insufficient',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
          },
        ],
        summary: {
          warnings: [],
          limitations: [],
        },
      },
    }, null, 2), 'utf8')

    await fs.rm(geminiProjectRoot, { recursive: true, force: true })

    const result = await runCli(['import', importFile, '--json'])
    const payload = parseJsonResult<{
      items: Array<{
        profile: { id: string }
        fidelity?: { status: string }
        previewDecision: { reasonCodes: string[] }
      }>
      summary: {
        totalItems: number
        matchCount: number
        mismatchCount: number
        partialCount: number
        insufficientDataCount: number
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
        sourceExecutability: {
          totalItems: number
          applyReadyCount: number
          previewOnlyCount: number
          blockedCount: number
          blockedByCodeStats: Array<{
            code: string
            totalCount: number
          }>
        }
        decisionCodeStats: Array<{
          code: string
          totalCount: number
          blockingCount: number
          nonBlockingCount: number
        }>
        driftKindStats: Array<{
          driftKind: string
          totalCount: number
          blockingCount: number
          warningCount: number
          infoCount: number
        }>
        platformStats: Array<{
          platform: string
          totalItems: number
          matchCount: number
          mismatchCount: number
          partialCount: number
          insufficientDataCount: number
        }>
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.items.map((item) => [item.profile.id, item.fidelity?.status, item.previewDecision.reasonCodes])).toEqual([
      ['gemini-match', 'match', ['READY_USING_LOCAL_OBSERVATION']],
      ['gemini-partial', 'partial', ['LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION']],
      ['gemini-mismatch', 'mismatch', ['BLOCKED_BY_FIDELITY_MISMATCH', 'REQUIRES_LOCAL_SCOPE_RESOLUTION']],
      ['gemini-redacted', 'match', ['READY_USING_LOCAL_OBSERVATION']],
      ['gemini-insufficient', 'insufficient-data', ['BLOCKED_BY_INSUFFICIENT_OBSERVATION']],
    ])
    expect(payload.data?.summary).toEqual({
      totalItems: 5,
      matchCount: 2,
      mismatchCount: 1,
      partialCount: 1,
      insufficientDataCount: 1,
      executabilityStats: {
        profileCount: 5,
        inlineReadyProfileCount: 4,
        referenceReadyProfileCount: 0,
        referenceMissingProfileCount: 0,
        writeUnsupportedProfileCount: 0,
        sourceRedactedProfileCount: 1,
        hasInlineReadyProfiles: true,
        hasReferenceReadyProfiles: false,
        hasReferenceMissingProfiles: false,
        hasWriteUnsupportedProfiles: false,
        hasSourceRedactedProfiles: true,
      },
      sourceExecutability: {
        totalItems: 5,
        applyReadyCount: 4,
        previewOnlyCount: 1,
        blockedCount: 1,
        blockedByCodeStats: [
          { code: 'REDACTED_INLINE_SECRET', totalCount: 1 },
        ],
      },
      decisionCodeStats: [
        { code: 'READY_USING_LOCAL_OBSERVATION', totalCount: 2, blockingCount: 0, nonBlockingCount: 2 },
        { code: 'LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION', totalCount: 1, blockingCount: 0, nonBlockingCount: 1 },
        { code: 'BLOCKED_BY_INSUFFICIENT_OBSERVATION', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
        { code: 'BLOCKED_BY_FIDELITY_MISMATCH', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
        { code: 'REQUIRES_LOCAL_SCOPE_RESOLUTION', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
      ],
      driftKindStats: [
        { driftKind: 'default-scope-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
        { driftKind: 'availability-drift', totalCount: 1, blockingCount: 1, warningCount: 0, infoCount: 0 },
        { driftKind: 'capability-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
      ],
      platformStats: [
        {
          platform: 'gemini',
          totalItems: 5,
          matchCount: 2,
          mismatchCount: 1,
          partialCount: 1,
          insufficientDataCount: 1,
        },
      ],
      triageStats: {
        totalItems: 5,
        buckets: [
          {
            id: 'source-blocked',
            title: 'Source blocked bucket',
            totalCount: 1,
            summaryFields: ['summary.sourceExecutability'],
            itemFields: ['sourceCompatibility', 'items.previewDecision'],
            recommendedNextStep: 'repair-source-input',
          },
          {
            id: 'write-readiness',
            title: 'Write readiness bucket',
            totalCount: 2,
            summaryFields: ['summary.executabilityStats'],
            itemFields: ['items.previewDecision', 'items.fidelity'],
            recommendedNextStep: 'continue-to-write',
          },
          {
            id: 'platform-routing',
            title: 'Platform routing bucket',
            totalCount: 5,
            summaryFields: ['summary.platformStats'],
            itemFields: ['platformSummary'],
            recommendedNextStep: 'group-by-platform',
          },
        ],
      },
      warnings: ['project 作用域的可用性与当前本地环境不一致。'],
      limitations: [
        '导出文件的 scope observation 不完整，当前仅能做部分 fidelity 对比。',
        '导出文件缺少足够 observation，当前无法建立完整 fidelity 结论。',
      ],
    })
  })

  it('import --json 在跨平台 mixed batch 下准确聚合 claude/codex/gemini 状态', async () => {
    const importFile = path.join(runtimeDir, 'import-source-cross-platform-mixed.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-match',
          name: 'gemini-match',
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
      {
        profile: {
          id: 'claude-mismatch',
          name: 'claude-mismatch',
          platform: 'claude',
          source: { token: 'sk-live-123456', baseURL: 'https://gateway.example.com/api' },
          apply: {
            ANTHROPIC_AUTH_TOKEN: 'sk-live-123456',
            ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
          },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'local', detect: true, preview: true, use: true, rollback: true, writable: true },
        ],
      },
      {
        profile: {
          id: 'codex-partial',
          name: 'codex-partial',
          platform: 'codex',
          source: { apiKey: 'sk-codex-live-123456', baseURL: 'https://gateway.example.com/openai/v1' },
          apply: {
            OPENAI_API_KEY: 'sk-codex-live-123456',
            base_url: 'https://gateway.example.com/openai/v1',
          },
        },
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [],
      },
      {
        profile: {
          id: 'gemini-insufficient',
          name: 'gemini-insufficient',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
      },
    ])

    const result = await runCli(['import', importFile, '--json'])
    const payload = parseJsonResult<{
      items: Array<{
        profile: { id: string }
        platform: string
        fidelity?: { status: string }
        previewDecision: { reasonCodes: string[] }
      }>
      summary: {
        totalItems: number
        matchCount: number
        mismatchCount: number
        partialCount: number
        insufficientDataCount: number
        executabilityStats?: {
          profileCount: number
          inlineReadyProfileCount: number
          referenceReadyProfileCount: number
          referenceMissingProfileCount: number
          writeUnsupportedProfileCount: number
          sourceRedactedProfileCount: number
        }
        sourceExecutability: {
          totalItems: number
          applyReadyCount: number
          previewOnlyCount: number
          blockedCount: number
          blockedByCodeStats: Array<{
            code: string
            totalCount: number
          }>
        }
        decisionCodeStats: Array<{
          code: string
          totalCount: number
          blockingCount: number
          nonBlockingCount: number
        }>
        driftKindStats: Array<{
          driftKind: string
          totalCount: number
          blockingCount: number
          warningCount: number
          infoCount: number
        }>
        platformStats: Array<{
          platform: string
          totalItems: number
          matchCount: number
          mismatchCount: number
          partialCount: number
          insufficientDataCount: number
        }>
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.items.map((item) => [item.profile.id, item.platform, item.fidelity?.status, item.previewDecision.reasonCodes])).toEqual([
      ['gemini-match', 'gemini', 'match', ['READY_USING_LOCAL_OBSERVATION']],
      ['claude-mismatch', 'claude', 'mismatch', ['BLOCKED_BY_FIDELITY_MISMATCH']],
      ['codex-partial', 'codex', 'partial', ['LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION']],
      ['gemini-insufficient', 'gemini', 'insufficient-data', ['BLOCKED_BY_INSUFFICIENT_OBSERVATION']],
    ])
    expect(payload.data?.summary).toEqual({
      totalItems: 4,
      matchCount: 1,
      mismatchCount: 1,
      partialCount: 1,
      insufficientDataCount: 1,
      executabilityStats: {
        profileCount: 4,
        inlineReadyProfileCount: 4,
        referenceReadyProfileCount: 0,
        referenceMissingProfileCount: 0,
        writeUnsupportedProfileCount: 0,
        sourceRedactedProfileCount: 0,
        hasInlineReadyProfiles: true,
        hasReferenceReadyProfiles: false,
        hasReferenceMissingProfiles: false,
        hasWriteUnsupportedProfiles: false,
        hasSourceRedactedProfiles: false,
      },
      sourceExecutability: {
        totalItems: 4,
        applyReadyCount: 4,
        previewOnlyCount: 0,
        blockedCount: 0,
        blockedByCodeStats: [
          { code: 'REDACTED_INLINE_SECRET', totalCount: 0 },
        ],
      },
      decisionCodeStats: [
        { code: 'READY_USING_LOCAL_OBSERVATION', totalCount: 1, blockingCount: 0, nonBlockingCount: 1 },
        { code: 'LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION', totalCount: 1, blockingCount: 0, nonBlockingCount: 1 },
        { code: 'BLOCKED_BY_INSUFFICIENT_OBSERVATION', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
        { code: 'BLOCKED_BY_FIDELITY_MISMATCH', totalCount: 1, blockingCount: 1, nonBlockingCount: 0 },
        { code: 'REQUIRES_LOCAL_SCOPE_RESOLUTION', totalCount: 0, blockingCount: 0, nonBlockingCount: 0 },
      ],
      driftKindStats: [
        { driftKind: 'default-scope-drift', totalCount: 1, blockingCount: 0, warningCount: 1, infoCount: 0 },
        { driftKind: 'availability-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
        { driftKind: 'capability-drift', totalCount: 0, blockingCount: 0, warningCount: 0, infoCount: 0 },
      ],
      platformStats: [
        {
          platform: 'claude',
          totalItems: 1,
          matchCount: 0,
          mismatchCount: 1,
          partialCount: 0,
          insufficientDataCount: 0,
        },
        {
          platform: 'codex',
          totalItems: 1,
          matchCount: 0,
          mismatchCount: 0,
          partialCount: 1,
          insufficientDataCount: 0,
        },
        {
          platform: 'gemini',
          totalItems: 2,
          matchCount: 1,
          mismatchCount: 0,
          partialCount: 0,
          insufficientDataCount: 1,
        },
      ],
      triageStats: {
        totalItems: 4,
        buckets: [
          {
            id: 'source-blocked',
            title: 'Source blocked bucket',
            totalCount: 0,
            summaryFields: ['summary.sourceExecutability'],
            itemFields: ['sourceCompatibility', 'items.previewDecision'],
            recommendedNextStep: 'repair-source-input',
          },
          {
            id: 'write-readiness',
            title: 'Write readiness bucket',
            totalCount: 2,
            summaryFields: ['summary.executabilityStats'],
            itemFields: ['items.previewDecision', 'items.fidelity'],
            recommendedNextStep: 'continue-to-write',
          },
          {
            id: 'platform-routing',
            title: 'Platform routing bucket',
            totalCount: 4,
            summaryFields: ['summary.platformStats'],
            itemFields: ['platformSummary'],
            recommendedNextStep: 'group-by-platform',
          },
        ],
      },
      warnings: ['默认写入作用域不一致：导出时为 user，当前本地为 project。'],
      limitations: [
        '导出文件的 scope observation 不完整，当前仅能做部分 fidelity 对比。',
        '导出文件缺少足够 observation，当前无法建立完整 fidelity 结论。',
      ],
    })
  })

  it('import 文本输出会展示混合批次的整批 explainable 聚合', async () => {
    const importFile = path.join(runtimeDir, 'import-source-mixed-text.json')
    await fs.writeFile(importFile, JSON.stringify({
      schemaVersion: PUBLIC_JSON_SCHEMA_VERSION,
      ok: true,
      action: 'export',
      data: {
        profiles: [
          {
            profile: {
              id: 'gemini-match',
              name: 'gemini-match',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
            ],
            scopeAvailability: [
              { scope: 'user', status: 'available', detected: true, writable: true, path: geminiSettingsPath },
            ],
          },
          {
            profile: {
              id: 'gemini-partial',
              name: 'gemini-partial',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
            ],
          },
          {
            profile: {
              id: 'gemini-mismatch',
              name: 'gemini-mismatch',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
            defaultWriteScope: 'user',
            observedAt: '2026-04-16T00:00:00.000Z',
            scopeCapabilities: [
              { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
            ],
            scopeAvailability: [
              { scope: 'project', status: 'available', detected: true, writable: true, path: geminiProjectSettingsPath },
            ],
          },
          {
            profile: {
              id: 'gemini-insufficient',
              name: 'gemini-insufficient',
              platform: 'gemini',
              source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
              apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
            },
          },
        ],
        summary: {
          warnings: [],
          limitations: [],
        },
      },
    }, null, 2), 'utf8')

    await fs.rm(geminiProjectRoot, { recursive: true, force: true })

    const result = await runCli(['import', importFile])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[import] 成功')
    expect(result.stdout).toContain('汇总: total=4, match=1, mismatch=1, partial=1, insufficient-data=1')
    expect(result.stdout).toContain('决策代码汇总:')
    expect(result.stdout).toContain('  - READY_USING_LOCAL_OBSERVATION: total=1, blocking=0, non-blocking=1')
    expect(result.stdout).toContain('  - LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION: total=1, blocking=0, non-blocking=1')
    expect(result.stdout).toContain('  - BLOCKED_BY_INSUFFICIENT_OBSERVATION: total=1, blocking=1, non-blocking=0')
    expect(result.stdout).toContain('  - BLOCKED_BY_FIDELITY_MISMATCH: total=1, blocking=1, non-blocking=0')
    expect(result.stdout).toContain('  - REQUIRES_LOCAL_SCOPE_RESOLUTION: total=1, blocking=1, non-blocking=0')
    expect(result.stdout).toContain('Drift 类型汇总:')
    expect(result.stdout).toContain('  - availability-drift: total=1, blocking=1, warning=0, info=0')
    expect(result.stdout).toContain('- 配置: gemini-match (gemini)')
    expect(result.stdout).toContain('- 配置: gemini-partial (gemini)')
    expect(result.stdout).toContain('- 配置: gemini-mismatch (gemini)')
    expect(result.stdout).toContain('- 配置: gemini-insufficient (gemini)')
  })

  it('import 文本输出明确区分导出观察与当前本地观察', async () => {
    const importFile = path.join(runtimeDir, 'import-source-text.json')
    await fs.writeFile(importFile, JSON.stringify({
      schemaVersion: PUBLIC_JSON_SCHEMA_VERSION,
      ok: true,
      action: 'export',
      data: {
        profiles: [
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
            scopeAvailability: [
              { scope: 'project', status: 'available', detected: true, writable: true, path: geminiProjectSettingsPath },
            ],
          },
        ],
        summary: {
          warnings: [],
          limitations: [],
        },
      },
    }, null, 2), 'utf8')

    await fs.rm(geminiProjectRoot, { recursive: true, force: true })

    const result = await runCli(['import', importFile])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[import] 成功')
    expect(result.stdout).toContain(`导入文件: ${importFile}`)
    expect(result.stdout).toContain('汇总: total=1, match=0, mismatch=1, partial=0, insufficient-data=0')
    expect(result.stdout).toContain('决策代码汇总:')
    expect(result.stdout).toContain('  - BLOCKED_BY_FIDELITY_MISMATCH: total=1, blocking=1, non-blocking=0')
    expect(result.stdout).toContain('Drift 类型汇总:')
    expect(result.stdout).toContain('  - availability-drift: total=1, blocking=1, warning=0, info=0')
    expect(result.stdout).toContain('  导出时观察:')
    expect(result.stdout).toContain('  当前本地观察:')
    expect(result.stdout).toContain('  Fidelity: mismatch')
    expect(result.stdout).toContain('  Drift 分组: availability-drift, total=1, blocking=1, warning=0, info=0')
    expect(result.stdout).toContain('    导出值: {"status":"available","detected":true,"writable":true}')
    expect(result.stdout).toContain('    本地值: {"status":"unresolved","detected":false,"writable":false}')
    expect(result.stdout).toContain('  决策代码: BLOCKED_BY_FIDELITY_MISMATCH, REQUIRES_LOCAL_SCOPE_RESOLUTION')
    expect(result.stdout).toContain('  建议: 先修复本地作用域解析，再考虑进入 apply 设计。')
  })

  it('import 源文件不存在时返回结构化失败与 exitCode 1', async () => {
    const missingImportFile = path.join(runtimeDir, 'missing-import.json')
    const result = await runCli(['import', missingImportFile, '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('import')
    expect(payload.error).toEqual({
      code: 'IMPORT_SOURCE_NOT_FOUND',
      message: `未找到导入文件：${missingImportFile}`,
    })
  })

  it('import <file> 旧兼容路径仍会按 import preview 执行', async () => {
    const importFile = path.join(runtimeDir, 'import-legacy-compatible.json')
    await writeImportSourceFile(importFile, [
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
      },
    ])

    const result = await runCli(['import', importFile, '--json'])
    const payload = parseJsonResult<{
      sourceFile: string
      items: Array<{ profile: { id: string } }>
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import')
    expect(payload.data?.sourceFile).toBe(importFile)
    expect(payload.data?.items[0]?.profile.id).toBe('gemini-prod')
  })

  it('未知 import 子命令不会被改写成 preview', async () => {
    const result = await runCli(['import', 'foo'])

    expect(result.stdout).toBe('')
    expect(result.stderr).toContain("error: unknown command 'foo'")
    expect(result.exitCode).toBe(1)
  })

  it('import apply --json 会进入 import-apply 管道并返回结构化结果', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-success.json')
    await writeImportSourceFile(importFile, [
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

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.action).toBe('import-apply')
    expect(payload.error?.code).toBe('CONFIRMATION_REQUIRED')
  })

  it('import apply --json 可以成功应用 Codex profile 并写入双文件目标', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-codex-success.json')
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
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'codex-prod', '--force', '--json'])
    const payload = parseJsonResult<{
      sourceFile: string
      importedProfile: { id: string; platform: string }
      appliedScope?: string
      platformSummary?: {
        kind: string
        precedence?: string[]
        currentScope?: string
        composedFiles?: string[]
        facts: Array<{ code: string; message: string }>
      }
      backupId: string
      changedFiles: string[]
      noChanges: boolean
      summary: {
        platformStats?: Array<{
          platform: string
          profileCount: number
          profileId?: string
          targetScope?: string
          warningCount: number
          limitationCount: number
          changedFileCount?: number
          backupCreated?: boolean
          noChanges?: boolean
        }>
        warnings: string[]
        limitations: string[]
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.sourceFile).toBe(importFile)
    expect(payload.data?.importedProfile).toEqual(expect.objectContaining({
      id: 'codex-prod',
      platform: 'codex',
    }))
    expect(payload.data?.appliedScope).toBeUndefined()
    expect(payload.data?.platformSummary).toEqual({
      kind: 'multi-file-composition',
      composedFiles: [codexConfigPath, codexAuthPath],
      facts: [
        { code: 'CODEX_MULTI_FILE_CONFIGURATION', message: 'Codex 当前由 config.toml 与 auth.json 共同组成有效配置。' },
        { code: 'CODEX_LIST_IS_PROFILE_LEVEL', message: 'list 仅展示 profile 级状态，不表示单文件可独立切换。' },
      ],
    })
    expect(payload.data?.backupId).toMatch(/^snapshot-codex-/)
    expect(payload.data?.changedFiles).toEqual([codexConfigPath, codexAuthPath])
    expect(payload.data?.noChanges).toBe(false)
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        platform: 'codex',
        profileCount: 1,
        profileId: 'codex-prod',
        warningCount: payload.data?.summary.warnings.length ?? 0,
        limitationCount: 1,
        changedFileCount: 2,
        backupCreated: true,
        noChanges: false,
      }),
    ]))

    const codexConfig = await fs.readFile(codexConfigPath, 'utf8')
    const codexAuth = JSON.parse(await fs.readFile(codexAuthPath, 'utf8')) as Record<string, unknown>
    expect(codexConfig).toContain('base_url = "https://gateway.example.com/openai/v1"')
    expect(codexConfig).toContain('default_provider = "openai"')
    expect(codexAuth.OPENAI_API_KEY).toBe('sk-codex-live-123456')
    expect(codexAuth.user_id).toBe('u-1')
  })

  it('import apply --dry-run --json 会执行 apply 前检查但不写入 Codex 双文件目标', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-codex-dry-run.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'codex-prod',
          name: 'codex-prod',
          platform: 'codex',
          source: { apiKey: 'sk-codex-dry-run-123456', baseURL: 'https://dry-run.example.com/openai/v1' },
          apply: {
            OPENAI_API_KEY: 'sk-codex-dry-run-123456',
            base_url: 'https://dry-run.example.com/openai/v1',
          },
        },
      },
    ])

    const configBefore = await fs.readFile(codexConfigPath, 'utf8')
    const authBefore = await fs.readFile(codexAuthPath, 'utf8')
    const result = await runCli(['import', 'apply', importFile, '--profile', 'codex-prod', '--force', '--dry-run', '--json'])
    const payload = parseJsonResult<{
      dryRun: boolean
      backupId?: string
      changedFiles: string[]
      noChanges: boolean
      preview: { noChanges: boolean; diffSummary: Array<{ path: string; hasChanges: boolean }> }
      summary: {
        platformStats?: Array<{
          changedFileCount?: number
          backupCreated?: boolean
          noChanges?: boolean
        }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.dryRun).toBe(true)
    expect(payload.data?.backupId).toBeUndefined()
    expect(payload.data?.changedFiles).toEqual([])
    expect(payload.data?.noChanges).toBe(true)
    expect(payload.data?.preview.noChanges).toBe(false)
    expect(payload.data?.preview.diffSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: codexConfigPath, hasChanges: true }),
      expect.objectContaining({ path: codexAuthPath, hasChanges: true }),
    ]))
    expect(payload.data?.summary.platformStats).toEqual(expect.arrayContaining([
      expect.objectContaining({
        changedFileCount: 0,
        backupCreated: false,
        noChanges: true,
      }),
    ]))
    await expect(fs.readFile(codexConfigPath, 'utf8')).resolves.toBe(configBefore)
    await expect(fs.readFile(codexAuthPath, 'utf8')).resolves.toBe(authBefore)
  })

  it('import apply --dry-run 文本输出明确提示未写入且未创建备份', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-codex-dry-run-text.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'codex-prod',
          name: 'codex-prod',
          platform: 'codex',
          source: { apiKey: 'sk-codex-dry-run-text-123456', baseURL: 'https://dry-run-text.example.com/openai/v1' },
          apply: {
            OPENAI_API_KEY: 'sk-codex-dry-run-text-123456',
            base_url: 'https://dry-run-text.example.com/openai/v1',
          },
        },
      },
    ])

    const configBefore = await fs.readFile(codexConfigPath, 'utf8')
    const authBefore = await fs.readFile(codexAuthPath, 'utf8')
    const result = await runCli(['import', 'apply', importFile, '--profile', 'codex-prod', '--force', '--dry-run'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[import-apply] 成功')
    expect(result.stdout).toContain('Dry run: 是')
    expect(result.stdout).toContain('备份ID: 未创建')
    expect(result.stdout).toContain('无变更: 是')
    expect(result.stdout).toContain('已变更文件: 无')
    expect(result.stdout).toContain('changedFiles=0, backup=no, noChanges=yes')
    expect(result.stdout).toContain('变更摘要:')
    await expect(fs.readFile(codexConfigPath, 'utf8')).resolves.toBe(configBefore)
    await expect(fs.readFile(codexAuthPath, 'utf8')).resolves.toBe(authBefore)
  })

  it('import apply --json 命中 redacted inline secret 导入源时会直接阻断', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-redacted-inline-secret.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: '<redacted:inline-secret>', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: '<redacted:inline-secret>', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'user',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--json'])
    const payload = parseJsonResult<{
      sourceFile: string
      profileId: string
      redactedInlineSecretFields: string[]
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('import-apply')
    expect(payload.warnings).toContain('导入文件包含 2 个 redacted inline secret 占位值；import preview 会保留字段位置，但不会把它当作真实 secret 明文。')
    expect(payload.error?.code).toBe('IMPORT_SOURCE_REDACTED_INLINE_SECRETS')
    expect(payload.error?.details).toEqual({
      sourceFile: importFile,
      profileId: 'gemini-prod',
      redactedInlineSecretFields: ['source.apiKey', 'apply.GEMINI_API_KEY'],
    })
  })

  it('import apply --json 在 mixed source 下按 --profile 精确命中目标平台，不受同批其他 profile 干扰', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-cross-platform-mixed.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-blocked',
          name: 'gemini-blocked',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'project',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
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
          id: 'claude-sidecar',
          name: 'claude-sidecar',
          platform: 'claude',
          source: { token: 'sk-live-654321', baseURL: 'https://claude-sidecar.example.com/api' },
          apply: {
            ANTHROPIC_AUTH_TOKEN: 'sk-live-654321',
            ANTHROPIC_BASE_URL: 'https://claude-sidecar.example.com/api',
          },
        },
      },
    ])

    const originalGeminiSettings = await fs.readFile(geminiSettingsPath, 'utf8')
    const originalGeminiProjectSettings = await fs.readFile(geminiProjectSettingsPath, 'utf8')
    const originalClaudeProjectSettings = await fs.readFile(claudeProjectSettingsPath, 'utf8')
    const originalClaudeLocalExists = await fs.access(claudeLocalSettingsPath).then(() => true).catch(() => false)

    const result = await runCli(['import', 'apply', importFile, '--profile', 'codex-prod', '--force', '--json'])
    const payload = parseJsonResult<{
      sourceFile: string
      importedProfile: { id: string; platform: string }
      appliedScope?: string
      backupId: string
      changedFiles: string[]
      noChanges: boolean
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.sourceFile).toBe(importFile)
    expect(payload.data?.importedProfile).toEqual(expect.objectContaining({
      id: 'codex-prod',
      platform: 'codex',
    }))
    expect(payload.data?.appliedScope).toBeUndefined()
    expect(payload.data?.backupId).toMatch(/^snapshot-codex-/)
    expect(payload.data?.changedFiles).toEqual([codexConfigPath, codexAuthPath])
    expect(payload.data?.noChanges).toBe(false)

    const codexConfig = await fs.readFile(codexConfigPath, 'utf8')
    const codexAuth = JSON.parse(await fs.readFile(codexAuthPath, 'utf8')) as Record<string, unknown>
    expect(codexConfig).toContain('base_url = "https://gateway.example.com/openai/v1"')
    expect(codexAuth.OPENAI_API_KEY).toBe('sk-codex-live-123456')

    expect(await fs.readFile(geminiSettingsPath, 'utf8')).toBe(originalGeminiSettings)
    expect(await fs.readFile(geminiProjectSettingsPath, 'utf8')).toBe(originalGeminiProjectSettings)
    expect(await fs.readFile(claudeProjectSettingsPath, 'utf8')).toBe(originalClaudeProjectSettings)
    const localAfter = await fs.access(claudeLocalSettingsPath).then(() => true).catch(() => false)
    expect(localAfter).toBe(originalClaudeLocalExists)
  })

  it('import apply 缺少 --profile 时保持 Commander 用法失败', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-missing-profile.json')
    await writeImportSourceFile(importFile, [])

    const result = await runCli(['import', 'apply', importFile, '--json'])

    expect(result.stdout).toBe('')
    expect(result.stderr).toContain("error: required option '--profile <id>' not specified")
    expect(result.exitCode).toBe(1)
  })

  it('import apply 在默认 Claude project scope 下可成功应用并写入 project 文件', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-claude-project-success.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'claude-prod',
          name: 'claude-prod',
          platform: 'claude',
          source: { token: 'sk-live-123456', baseURL: 'https://gateway.example.com/api' },
          apply: {
            ANTHROPIC_AUTH_TOKEN: 'sk-live-123456',
            ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
          },
        },
        defaultWriteScope: 'project',
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'claude-prod', '--force', '--json'])
    const payload = parseJsonResult<{
      importedProfile: { id: string; platform: string }
      appliedScope?: string
      changedFiles: string[]
      noChanges: boolean
      preview: { targetFiles: Array<{ path: string; scope?: string }> }
      validation: {
        managedBoundaries?: Array<{ target?: string; notes?: string[] }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.importedProfile).toEqual(expect.objectContaining({
      id: 'claude-prod',
      platform: 'claude',
    }))
    expect(payload.data?.appliedScope).toBe('project')
    expect(payload.data?.changedFiles).toEqual([claudeProjectSettingsPath])
    expect(payload.data?.noChanges).toBe(false)
    expect(payload.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: claudeProjectSettingsPath,
        scope: 'project',
      }),
    ])
    expect(payload.data?.validation.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        target: claudeProjectSettingsPath,
        notes: ['当前写入目标为 Claude 项目级配置文件。'],
      }),
    ]))

    const projectSettings = JSON.parse(await fs.readFile(claudeProjectSettingsPath, 'utf8')) as Record<string, unknown>
    const localExists = await fs.access(claudeLocalSettingsPath).then(() => true).catch(() => false)
    expect(projectSettings.ANTHROPIC_AUTH_TOKEN).toBe('sk-live-123456')
    expect(projectSettings.ANTHROPIC_BASE_URL).toBe('https://gateway.example.com/api')
    expect(projectSettings.theme).toBe('dark')
    expect(localExists).toBe(false)
  })

  it('import apply --scope local 对 Claude 在未 --force 时返回 CONFIRMATION_REQUIRED', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-claude-local-confirmation.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'claude-prod',
          name: 'claude-prod',
          platform: 'claude',
          source: { token: 'sk-live-123456', baseURL: 'https://gateway.example.com/api' },
          apply: {
            ANTHROPIC_AUTH_TOKEN: 'sk-live-123456',
            ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
          },
        },
        defaultWriteScope: 'project',
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'claude-prod', '--scope', 'local', '--json'])
    const payload = parseJsonResult<{
      scopePolicy?: {
        requestedScope?: string
        resolvedScope?: string
        riskWarning?: string
      }
      risk?: {
        reasons?: string[]
        limitations?: string[]
      }
    }>(result.stdout)
    const confirmationDetails = payload.error?.details as {
      scopePolicy?: {
        requestedScope?: string
        resolvedScope?: string
        riskWarning?: string
      }
      risk?: {
        reasons?: string[]
        limitations?: string[]
      }
    } | undefined

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('import-apply')
    expect(payload.error?.code).toBe('CONFIRMATION_REQUIRED')
    expect(confirmationDetails?.scopePolicy?.requestedScope).toBe('local')
    expect(confirmationDetails?.scopePolicy?.resolvedScope).toBe('local')
    expect(confirmationDetails?.scopePolicy?.riskWarning).toBeUndefined()
    expect(confirmationDetails?.risk?.reasons).toEqual([
      'Claude local scope 高于 project 与 user；同名字段写入后会直接成为当前项目的最终生效值。',
    ])
    expect(confirmationDetails?.risk?.limitations).toEqual(expect.arrayContaining([
      '如果你只是想共享项目级配置，优先使用 project scope，而不是 local scope。',
    ]))
  })

  it('import apply 文本失败时输出 reference 解析摘要', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-reference-details.txt.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'claude-reference-local',
          name: 'claude-reference-local',
          platform: 'claude',
          source: { secret_ref: 'env://API_SWITCHER_MISSING_SECRET' },
          apply: {
            auth_reference: 'vault://claude/prod',
            secondary_auth_reference: 'env://API_SWITCHER_TEST_SECRET',
          },
        },
        defaultWriteScope: 'project',
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'claude-reference-local', '--scope', 'local'], {
      API_SWITCHER_TEST_SECRET: 'sk-live-123456',
    })

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[import-apply] 失败')
    expect(result.stdout).toContain('reference 解析摘要:')
    expect(result.stdout).toContain('  - 未解析 env 引用:')
    expect(result.stdout).toContain('    - source.secret_ref -> env://API_SWITCHER_MISSING_SECRET')
    expect(result.stdout).toContain('  - 已解析但当前不会写入:')
    expect(result.stdout).toContain('    - apply.secondary_auth_reference -> env://API_SWITCHER_TEST_SECRET')
    expect(result.stdout).toContain('  - 不支持的引用 scheme:')
    expect(result.stdout).toContain('    - apply.auth_reference -> vault://claude/prod')
  })

  it('import apply --scope local --force 对 Claude 可成功应用并只写入 local 文件', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-claude-local-success.json')
    await fs.writeFile(claudeLocalSettingsPath, JSON.stringify({ localFlag: true }, null, 2), 'utf8')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'claude-prod',
          name: 'claude-prod',
          platform: 'claude',
          source: { token: 'sk-live-123456', baseURL: 'https://gateway.example.com/api' },
          apply: {
            ANTHROPIC_AUTH_TOKEN: 'sk-live-123456',
            ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
          },
        },
        defaultWriteScope: 'project',
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'claude-prod', '--scope', 'local', '--force', '--json'])
    const payload = parseJsonResult<{
      importedProfile: { id: string; platform: string }
      appliedScope?: string
      changedFiles: string[]
      noChanges: boolean
      preview: { targetFiles: Array<{ path: string; scope?: string }> }
      validation: {
        effectiveConfig?: {
          stored: Array<{ key: string; scope?: string }>
        }
        managedBoundaries?: Array<{ target?: string; notes?: string[] }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.importedProfile).toEqual(expect.objectContaining({
      id: 'claude-prod',
      platform: 'claude',
    }))
    expect(payload.data?.appliedScope).toBe('local')
    expect(payload.data?.changedFiles).toEqual([claudeLocalSettingsPath])
    expect(payload.data?.noChanges).toBe(false)
    expect(payload.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: claudeLocalSettingsPath,
        scope: 'local',
      }),
    ])
    expect(payload.data?.validation.effectiveConfig?.stored?.[0]).toMatchObject({
      key: 'ANTHROPIC_AUTH_TOKEN',
      scope: 'local',
    })
    expect(payload.data?.validation.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        target: claudeLocalSettingsPath,
        notes: ['当前写入目标为 Claude 本地级配置文件。'],
      }),
    ]))

    const localSettings = JSON.parse(await fs.readFile(claudeLocalSettingsPath, 'utf8')) as Record<string, unknown>
    const projectSettings = JSON.parse(await fs.readFile(claudeProjectSettingsPath, 'utf8')) as Record<string, unknown>
    expect(localSettings.ANTHROPIC_AUTH_TOKEN).toBe('sk-live-123456')
    expect(localSettings.ANTHROPIC_BASE_URL).toBe('https://gateway.example.com/api')
    expect(localSettings.localFlag).toBe(true)
    expect(projectSettings.ANTHROPIC_AUTH_TOKEN).toBe('sk-old-000')
  })

  it('import apply 对 Codex 传入非法 --scope 时返回 INVALID_SCOPE', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-codex-invalid-scope.json')
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
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'codex-prod', '--scope', 'project', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('import-apply')
    expect(payload.error?.code).toBe('INVALID_SCOPE')
    expect(payload.error?.message).toContain('收到：project')
  })

  it('import apply --scope project 在 availability 不可用时先返回 IMPORT_SCOPE_UNAVAILABLE 而非 CONFIRMATION_REQUIRED', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-project-unavailable.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'project',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])
    await fs.rm(geminiProjectRoot, { recursive: true, force: true })

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--scope', 'project', '--json'])
    const payload = parseJsonResult<{
      scopeAvailability?: ScopeAvailabilityContract[]
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('import-apply')
    expect(payload.error?.code).toBe('IMPORT_SCOPE_UNAVAILABLE')
    expect(payload.error?.code).not.toBe('CONFIRMATION_REQUIRED')
    expect(payload.error?.details).toEqual(expect.objectContaining({
      resolvedScope: 'project',
      scopePolicy: expect.objectContaining({
        requestedScope: 'project',
        resolvedScope: 'project',
        defaultScope: 'user',
        explicitScope: true,
        highRisk: true,
        rollbackScopeMatchRequired: true,
      }),
      scopeCapabilities: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          risk: 'high',
          confirmationRequired: true,
          writable: true,
        }),
      ]),
      scopeAvailability: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          status: 'unresolved',
          reasonCode: 'PROJECT_ROOT_UNRESOLVED',
        }),
      ]),
    }))
  })

  it('import apply --scope project 在可用但未 --force 时返回 CONFIRMATION_REQUIRED', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-project-confirmation.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'project',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--scope', 'project', '--json'])
    const payload = parseJsonResult<{
      scopePolicy?: {
        requestedScope?: string
        resolvedScope?: string
        riskWarning?: string
      }
      scopeAvailability?: ScopeAvailabilityContract[]
    }>(result.stdout)
    const confirmationDetails = payload.error?.details as {
      scopePolicy?: {
        requestedScope?: string
        resolvedScope?: string
        riskWarning?: string
      }
      scopeAvailability?: ScopeAvailabilityContract[]
    } | undefined
    const projectAvailability = confirmationDetails?.scopeAvailability?.find((item) => item.scope === 'project')

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('import-apply')
    expect(payload.error?.code).toBe('CONFIRMATION_REQUIRED')
    expect(confirmationDetails?.scopePolicy?.requestedScope).toBe('project')
    expect(confirmationDetails?.scopePolicy?.resolvedScope).toBe('project')
    expect(confirmationDetails?.scopePolicy?.riskWarning).toBe('Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。')
    expect(projectAvailability).toEqual(expect.objectContaining({
      scope: 'project',
      status: 'available',
      writable: true,
      path: geminiProjectSettingsPath,
    }))
    expect(payload.error?.details).toEqual(expect.objectContaining({
      referenceGovernance: {
        hasReferenceProfiles: false,
        hasInlineProfiles: true,
        hasWriteUnsupportedProfiles: false,
        primaryReason: 'INLINE_SECRET_PRESENT',
        reasonCodes: ['INLINE_SECRET_PRESENT'],
      },
      risk: expect.objectContaining({
        allowed: false,
        riskLevel: 'high',
        reasons: expect.arrayContaining([
          'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
        ]),
      }),
      scopePolicy: expect.objectContaining({
        requestedScope: 'project',
        resolvedScope: 'project',
        defaultScope: 'user',
        explicitScope: true,
        highRisk: true,
        riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
        rollbackScopeMatchRequired: true,
      }),
      scopeCapabilities: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          risk: 'high',
          confirmationRequired: true,
          writable: true,
        }),
      ]),
      scopeAvailability: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          status: 'available',
          writable: true,
          path: geminiProjectSettingsPath,
        }),
      ]),
    }))

    const userSettings = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    const projectSettings = JSON.parse(await fs.readFile(geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    expect(userSettings.enforcedAuthType).toBe('oauth-personal')
    expect((userSettings.ui as { theme?: string }).theme).toBe('dark')
    expect(projectSettings.enforcedAuthType).toBeUndefined()
    expect(projectSettings.projectOnly).toBe(true)
  })

  it('import apply 在默认 user scope 下 --force 成功并写入 Gemini user settings', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-user-success.json')
    await writeImportSourceFile(importFile, [
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

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--force', '--json'])
    const payload = parseJsonResult<{
      sourceFile: string
      importedProfile: { id: string; platform: string }
      appliedScope: string
      backupId: string
      changedFiles: string[]
      scopePolicy: {
        requestedScope?: string
        resolvedScope?: string
        defaultScope?: string
        explicitScope: boolean
        highRisk: boolean
        rollbackScopeMatchRequired: boolean
      }
      preview: { targetFiles?: Array<{ path: string; scope?: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.sourceFile).toBe(importFile)
    expect(payload.data?.importedProfile).toEqual(expect.objectContaining({
      id: 'gemini-prod',
      platform: 'gemini',
    }))
    expect(payload.data?.appliedScope).toBe('user')
    expect(payload.data?.backupId).toMatch(/^snapshot-gemini-/)
    expect(payload.data?.changedFiles).toEqual([geminiSettingsPath])
    expect(payload.data?.scopePolicy).toEqual(expect.objectContaining({
      resolvedScope: 'user',
      defaultScope: 'user',
      explicitScope: false,
      highRisk: false,
      rollbackScopeMatchRequired: true,
    }))
    expect(payload.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: geminiSettingsPath,
        scope: 'user',
      }),
    ])

    const userSettings = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    const projectSettings = JSON.parse(await fs.readFile(geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    expect(userSettings.enforcedAuthType).toBe('gemini-api-key')
    expect((userSettings.ui as { theme?: string }).theme).toBe('dark')
    expect(projectSettings.enforcedAuthType).toBeUndefined()
  })

  it('import apply --scope project 在 --force 下成功并只写入 Gemini project settings', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-project-success.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'project',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--scope', 'project', '--force', '--json'])
    const payload = parseJsonResult<{
      appliedScope: string
      backupId: string
      changedFiles: string[]
      scopePolicy: {
        requestedScope?: string
        resolvedScope?: string
        defaultScope?: string
        explicitScope: boolean
        highRisk: boolean
        riskWarning?: string
        rollbackScopeMatchRequired: boolean
      }
      scopeAvailability?: ScopeAvailabilityContract[]
      preview: { targetFiles?: Array<{ path: string; scope?: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.action).toBe('import-apply')
    expect(payload.data?.appliedScope).toBe('project')
    expect(payload.data?.backupId).toMatch(/^snapshot-gemini-/)
    expect(payload.data?.changedFiles).toEqual([geminiProjectSettingsPath])
    expect(payload.data?.scopePolicy).toEqual({
      requestedScope: 'project',
      resolvedScope: 'project',
      defaultScope: 'user',
      explicitScope: true,
      highRisk: true,
      riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
      rollbackScopeMatchRequired: true,
    })
    expect(payload.data?.scopeAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'project',
        status: 'available',
        writable: true,
        path: geminiProjectSettingsPath,
      }),
    ]))
    expect(payload.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: geminiProjectSettingsPath,
        scope: 'project',
      }),
    ])

    const userSettings = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    const projectSettings = JSON.parse(await fs.readFile(geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    expect(userSettings.enforcedAuthType).toBe('oauth-personal')
    expect(projectSettings.enforcedAuthType).toBe('gemini-api-key')
    expect(projectSettings.projectOnly).toBe(true)
  })

  it('import apply --scope project 在导出默认 scope 仍为 user 时，也按显式目标写入 Gemini project settings', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-project-explicit-target-overrides-default.json')
    await writeImportSourceFile(importFile, [
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

    const result = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--scope', 'project', '--force', '--json'])
    const payload = parseJsonResult<{
      appliedScope: string
      changedFiles: string[]
      scopePolicy: {
        requestedScope?: string
        resolvedScope?: string
        defaultScope?: string
        explicitScope: boolean
        highRisk: boolean
        riskWarning?: string
        rollbackScopeMatchRequired: boolean
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.appliedScope).toBe('project')
    expect(payload.data?.changedFiles).toEqual([geminiProjectSettingsPath])
    expect(payload.data?.scopePolicy).toEqual({
      requestedScope: 'project',
      resolvedScope: 'project',
      defaultScope: 'user',
      explicitScope: true,
      highRisk: true,
      riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
      rollbackScopeMatchRequired: true,
    })

    const userSettings = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    const projectSettings = JSON.parse(await fs.readFile(geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    expect(userSettings.enforcedAuthType).toBe('oauth-personal')
    expect(projectSettings.enforcedAuthType).toBe('gemini-api-key')
    expect(projectSettings.projectOnly).toBe(true)
  })

  it('import apply 产出的 project scope 快照在 rollback 时必须匹配记录的 scope', async () => {
    const importFile = path.join(runtimeDir, 'import-apply-project-rollback-scope.json')
    await writeImportSourceFile(importFile, [
      {
        profile: {
          id: 'gemini-prod',
          name: 'gemini-prod',
          platform: 'gemini',
          source: { apiKey: 'gm-live-123456', authType: 'gemini-api-key' },
          apply: { GEMINI_API_KEY: 'gm-live-123456', enforcedAuthType: 'gemini-api-key' },
        },
        defaultWriteScope: 'project',
        observedAt: '2026-04-16T00:00:00.000Z',
        scopeCapabilities: [
          { scope: 'user', detect: true, preview: true, use: true, rollback: true, writable: true },
          { scope: 'project', detect: true, preview: true, use: true, rollback: true, writable: true, risk: 'high', confirmationRequired: true },
        ],
      },
    ])

    const applyResult = await runCli(['import', 'apply', importFile, '--profile', 'gemini-prod', '--scope', 'project', '--force', '--json'])
    const applyPayload = parseJsonResult<{ backupId?: string }>(applyResult.stdout)
    expect(applyResult.exitCode).toBe(0)
    expect(applyPayload.data?.backupId).toBeTruthy()

    await fs.writeFile(geminiProjectSettingsPath, JSON.stringify({ enforcedAuthType: 'mutated' }, null, 2), 'utf8')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ enforcedAuthType: 'user-mutated' }, null, 2), 'utf8')

    const mismatchRollback = await runCli(['rollback', applyPayload.data!.backupId!, '--scope', 'user', '--json'])
    const mismatchPayload = parseJsonResult<{
      scopePolicy?: {
        requestedScope?: string
        resolvedScope?: string
        defaultScope?: string
        explicitScope: boolean
        highRisk: boolean
        rollbackScopeMatchRequired: boolean
      }
      restoredFiles?: string[]
      rollback?: { targetFiles?: Array<{ path: string; scope?: string }> }
    }>(mismatchRollback.stdout)

    expect(mismatchRollback.stderr).toBe('')
    expect(mismatchRollback.exitCode).toBe(1)
    expect(mismatchPayload.ok).toBe(false)
    expect(mismatchPayload.error?.code).toBe('ROLLBACK_SCOPE_MISMATCH')
    expect(mismatchPayload.error?.details).toEqual(expect.objectContaining({
      scopePolicy: expect.objectContaining({
        requestedScope: 'project',
        resolvedScope: 'project',
        defaultScope: 'user',
        explicitScope: true,
        highRisk: true,
        riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
        rollbackScopeMatchRequired: true,
      }),
      scopeCapabilities: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          risk: 'high',
          confirmationRequired: true,
          writable: true,
        }),
      ]),
      rollback: expect.objectContaining({
        ok: false,
        restoredFiles: [],
        warnings: expect.arrayContaining([
          expect.objectContaining({
            code: 'rollback-scope-mismatch',
          }),
        ]),
      }),
    }))
    expect(mismatchPayload.data).toBeUndefined()
    expect(mismatchPayload.data?.restoredFiles).toBeUndefined()
    expect(mismatchPayload.data?.rollback?.targetFiles).toBeUndefined()

    const unchangedProjectAfterMismatch = JSON.parse(await fs.readFile(geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    const unchangedUserAfterMismatch = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    expect(unchangedProjectAfterMismatch.enforcedAuthType).toBe('mutated')
    expect(unchangedUserAfterMismatch.enforcedAuthType).toBe('user-mutated')

    const rollbackResult = await runCli(['rollback', applyPayload.data!.backupId!, '--scope', 'project', '--json'])
    const rollbackPayload = parseJsonResult<{
      restoredFiles: string[]
      rollback?: { targetFiles?: Array<{ path: string; scope?: string }> }
    }>(rollbackResult.stdout)

    expect(rollbackResult.stderr).toBe('')
    expect(rollbackResult.exitCode).toBe(0)
    expect(rollbackPayload.ok).toBe(true)
    expect(rollbackPayload.data?.restoredFiles).toEqual([geminiProjectSettingsPath])
    expect(rollbackPayload.data?.rollback?.targetFiles).toEqual([
      expect.objectContaining({
        path: geminiProjectSettingsPath,
        scope: 'project',
      }),
    ])

    const restoredProject = JSON.parse(await fs.readFile(geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    const untouchedUser = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    expect(restoredProject.enforcedAuthType).toBeUndefined()
    expect(restoredProject.projectOnly).toBe(true)
    expect(untouchedUser.enforcedAuthType).toBe('user-mutated')
  })

  it('preview 输出风险、explainable 细节与附加提示', async () => {
    const result = await runCli(['preview', 'gemini-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[preview] 成功')
    expect(result.stdout).toContain('- 配置: gemini-prod (gemini)')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  作用域说明:')
    expect(result.stdout).toContain('  - 生效优先级: system-defaults < user < project < system-overrides')
    expect(result.stdout).toContain('  - 预览视角: 先按四层 precedence 推导 current/effective，再评估本次写入')
    expect(result.stdout).toContain('  - 本次写入目标: user scope')
    expect(result.stdout).toContain('  - 覆盖提醒: 如果 project 或 system-overrides 存在同名字段，user 写入后仍可能不会成为最终生效值')
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - enforcedAuthType: oauth-personal (scope=user, source=stored)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - enforcedAuthType: gemini-api-key (scope=user, source=effective)')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: gm-l***56 (scope=user, source=effective, secret)')
    expect(result.stdout).toContain('    覆盖说明:')
    expect(result.stdout).toContain('    - GEMINI_API_KEY: 最终生效的 API key 取决于环境变量，而不是 settings.json。')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${geminiSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: enforcedAuthType')
    expect(result.stdout).toContain('    保留字段: ui')
    expect(result.stdout).toContain('    说明: Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - GEMINI_API_KEY: gm-l***56 (source=inline, present=yes)')
    expect(result.stdout).toContain('  变更摘要:')
    expect(result.stdout).toContain('附加提示:')
  })

  it('preview --scope project 输出 Gemini project 写入目标与高风险确认', async () => {
    const result = await runCli(['preview', 'gemini-prod', '--scope', 'project', '--json'])
    const payload = parseJsonResult<{
      preview: {
        targetFiles: Array<{ path: string; scope?: string }>
        diffSummary: Array<{ path: string; changedKeys: string[]; preservedKeys?: string[]; hasChanges: boolean }>
        riskLevel: string
        requiresConfirmation: boolean
      }
      risk: { allowed: boolean; riskLevel: string; reasons: string[] }
      scopeAvailability?: ScopeAvailabilityContract[]
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: geminiProjectSettingsPath,
        scope: 'project',
      }),
    ])
    expect(payload.data?.preview.diffSummary).toEqual([
      expect.objectContaining({
        path: geminiProjectSettingsPath,
        changedKeys: ['enforcedAuthType'],
        preservedKeys: ['projectOnly'],
        hasChanges: true,
      }),
    ])
    expect(payload.data?.preview.riskLevel).toBe('high')
    expect(payload.data?.preview.requiresConfirmation).toBe(true)
    expect(payload.data?.risk.allowed).toBe(false)
    expect(payload.data?.risk.reasons).toContain('Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。')
    expect(payload.data?.scopeAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'project',
        status: 'available',
        writable: true,
        path: geminiProjectSettingsPath,
      }),
    ]))
  })

  it('preview --scope project 在 project scope 无法解析时返回 availability 结构化失败', async () => {
    const result = await runCli(['preview', 'gemini-prod', '--scope', 'project', '--json'], {
      API_SWITCHER_GEMINI_PROJECT_ROOT: path.join(runtimeDir, 'missing-project-root'),
    })
    const payload = parseJsonResult<{
      requestedScope?: string
      scopeAvailability?: ScopeAvailabilityContract[]
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(payload.ok).toBe(false)
    expect(payload.error?.code).toBe('PREVIEW_FAILED')
    expect(payload.error?.details).toEqual(expect.objectContaining({
      requestedScope: 'project',
      scopeAvailability: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          status: 'unresolved',
          reasonCode: 'PROJECT_ROOT_UNRESOLVED',
        }),
      ]),
    }))
  })

  it('preview --scope project 文本失败时输出 project root 修复建议，而不是提示 --force', async () => {
    const result = await runCli(['preview', 'gemini-prod', '--scope', 'project'], {
      API_SWITCHER_GEMINI_PROJECT_ROOT: path.join(runtimeDir, 'missing-project-root'),
    })

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(result.stdout).toContain('[preview] 失败')
    expect(result.stdout).toContain('当前无法解析 Gemini project scope 的 project root。')
    expect(result.stdout).toContain('作用域策略:')
    expect(result.stdout).toContain('作用域可用性:')
    expect(result.stdout).toContain('  - project: status=unresolved, detected=no, writable=no')
    expect(result.stdout).toContain('    原因代码: PROJECT_ROOT_UNRESOLVED')
    expect(result.stdout).toContain('    建议: 请在项目目录中运行，或显式提供 API_SWITCHER_GEMINI_PROJECT_ROOT。')
    expect(result.stdout).not.toContain('当前切换需要确认或 --force。')
  })

  it('preview --scope project 文本输出明确 project 覆盖 user 且仍可能被 system-overrides 覆盖', async () => {
    const result = await runCli(['preview', 'gemini-prod', '--scope', 'project'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[preview] 成功')
    expect(result.stdout).toContain('  风险等级: high')
    expect(result.stdout).toContain('  - 本次写入目标: project scope')
    expect(result.stdout).toContain('  - 覆盖关系: project scope 高于 user scope，会覆盖 user 中的同名字段')
    expect(result.stdout).toContain('  - 覆盖提醒: system-overrides 仍高于 project，存在同名字段时 project 写入后仍可能不会成为最终生效值')
    expect(result.stdout).toContain(`  - ${geminiProjectSettingsPath}`)
    expect(result.stdout).toContain('Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。')
  })

  it('Gemini 非法 --scope 会返回明确 INVALID_SCOPE 失败', async () => {
    const result = await runCli(['preview', 'gemini-prod', '--scope', 'system-overrides', '--json'])
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(payload.ok).toBe(false)
    expect(payload.action).toBe('preview')
    expect(payload.error?.code).toBe('INVALID_SCOPE')
    expect(payload.error?.message).toBe('Gemini 当前仅支持写入 user/project scope；system-defaults/system-overrides 仅用于检测。收到：system-overrides')
  })

  it('use --scope project 需要 --force，带 --force 时只写入 Gemini project scope', async () => {
    const blocked = await runCli(['use', 'gemini-prod', '--scope', 'project', '--json'])
    const blockedPayload = parseJsonResult(blocked.stdout)

    expect(blocked.stderr).toBe('')
    expect(blocked.exitCode).toBe(1)
    expect(blockedPayload.ok).toBe(false)
    expect(blockedPayload.error?.code).toBe('CONFIRMATION_REQUIRED')
    expect(blockedPayload.error?.details).toEqual(expect.objectContaining({
      risk: expect.objectContaining({
        allowed: false,
        riskLevel: 'high',
        reasons: expect.arrayContaining([
          'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
        ]),
      }),
      scopePolicy: expect.objectContaining({
        requestedScope: 'project',
        resolvedScope: 'project',
        defaultScope: 'user',
        explicitScope: true,
        highRisk: true,
        riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
        rollbackScopeMatchRequired: true,
      }),
      scopeAvailability: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          status: 'available',
          writable: true,
          path: geminiProjectSettingsPath,
        }),
      ]),
    }))

    const blockedUserSettings = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    const blockedProjectSettings = JSON.parse(await fs.readFile(geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    expect(blockedUserSettings.enforcedAuthType).toBe('oauth-personal')
    expect((blockedUserSettings.ui as { theme?: string }).theme).toBe('dark')
    expect(blockedProjectSettings.enforcedAuthType).toBeUndefined()
    expect(blockedProjectSettings.projectOnly).toBe(true)

    const result = await runCli(['use', 'gemini-prod', '--scope', 'project', '--force', '--json'])
    const payload = parseJsonResult<{
      backupId?: string
      changedFiles: string[]
      preview: { targetFiles: Array<{ path: string; scope?: string }> }
      scopeCapabilities?: ScopeCapabilityContract[]
      scopeAvailability?: ScopeAvailabilityContract[]
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.backupId).toMatch(/^snapshot-gemini-/)
    expect(payload.data?.changedFiles).toEqual([geminiProjectSettingsPath])
    expect(payload.data?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'project',
        use: true,
        rollback: true,
        writable: true,
        risk: 'high',
        confirmationRequired: true,
      }),
      expect.objectContaining({
        scope: 'system-defaults',
        use: false,
        rollback: false,
        writable: false,
      }),
    ]))
    expect(payload.data?.scopeAvailability).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'project',
        status: 'available',
        writable: true,
        path: geminiProjectSettingsPath,
      }),
    ]))
    expect(payload.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: geminiProjectSettingsPath,
        scope: 'project',
      }),
    ])

    const userSettings = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    const projectSettings = JSON.parse(await fs.readFile(geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    expect(userSettings.enforcedAuthType).toBe('oauth-personal')
    expect(projectSettings.enforcedAuthType).toBe('gemini-api-key')
  })

  it('use --scope project 在 availability 不可用时先返回结构化失败而非 CONFIRMATION_REQUIRED', async () => {
    const result = await runCli(['use', 'gemini-prod', '--scope', 'project', '--json'], {
      API_SWITCHER_GEMINI_PROJECT_ROOT: path.join(runtimeDir, 'missing-project-root'),
    })
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(payload.ok).toBe(false)
    expect(payload.error?.code).toBe('USE_FAILED')
    expect(payload.error?.code).not.toBe('CONFIRMATION_REQUIRED')
    expect(payload.error?.details).toEqual(expect.objectContaining({
      requestedScope: 'project',
      scopeAvailability: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          status: 'unresolved',
          reasonCode: 'PROJECT_ROOT_UNRESOLVED',
        }),
      ]),
    }))
  })

  it('rollback --scope project 在 availability 不可用时先返回结构化失败而非 scope mismatch', async () => {
    const useResult = await runCli(['use', 'gemini-prod', '--scope', 'project', '--force', '--json'])
    const usePayload = parseJsonResult<{ backupId?: string }>(useResult.stdout)
    expect(usePayload.data?.backupId).toBeTruthy()

    const result = await runCli(['rollback', usePayload.data!.backupId!, '--scope', 'project', '--json'], {
      API_SWITCHER_GEMINI_PROJECT_ROOT: path.join(runtimeDir, 'missing-project-root'),
    })
    const payload = parseJsonResult(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(2)
    expect(payload.ok).toBe(false)
    expect(payload.error?.code).toBe('ROLLBACK_FAILED')
    expect(payload.error?.code).not.toBe('ROLLBACK_SCOPE_MISMATCH')
    expect(payload.error?.details).toEqual(expect.objectContaining({
      scopePolicy: {
        requestedScope: 'project',
        resolvedScope: 'project',
        defaultScope: 'user',
        explicitScope: true,
        highRisk: true,
        riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
        rollbackScopeMatchRequired: true,
      },
      scopeAvailability: expect.arrayContaining([
        expect.objectContaining({
          scope: 'project',
          status: 'unresolved',
          reasonCode: 'PROJECT_ROOT_UNRESOLVED',
        }),
      ]),
    }))
  })

  it('rollback --scope project 会按 Gemini project scope 快照恢复', async () => {
    const useResult = await runCli(['use', 'gemini-prod', '--scope', 'project', '--force', '--json'])
    const usePayload = parseJsonResult<{ backupId?: string }>(useResult.stdout)
    expect(usePayload.data?.backupId).toBeTruthy()

    await fs.writeFile(geminiProjectSettingsPath, JSON.stringify({ enforcedAuthType: 'mutated' }, null, 2), 'utf8')
    await fs.writeFile(geminiSettingsPath, JSON.stringify({ enforcedAuthType: 'user-mutated' }, null, 2), 'utf8')

    const result = await runCli(['rollback', usePayload.data!.backupId!, '--scope', 'project', '--json'])
    const payload = parseJsonResult<{
      restoredFiles: string[]
      scopePolicy?: {
        requestedScope?: string
        resolvedScope?: string
        defaultScope?: string
        explicitScope: boolean
        highRisk: boolean
        riskWarning?: string
        rollbackScopeMatchRequired: boolean
      }
      scopeCapabilities?: ScopeCapabilityContract[]
      rollback?: { targetFiles?: Array<{ path: string; scope?: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.restoredFiles).toEqual([geminiProjectSettingsPath])
    expect(payload.data?.scopePolicy).toEqual({
      requestedScope: 'project',
      resolvedScope: 'project',
      defaultScope: 'user',
      explicitScope: true,
      highRisk: true,
      riskWarning: 'Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。',
      rollbackScopeMatchRequired: true,
    })
    expect(payload.data?.scopeCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        scope: 'project',
        use: true,
        rollback: true,
        writable: true,
        risk: 'high',
        confirmationRequired: true,
      }),
      expect.objectContaining({
        scope: 'system-overrides',
        use: false,
        rollback: false,
        writable: false,
      }),
    ]))
    expect(payload.data?.rollback?.targetFiles).toEqual([
      expect.objectContaining({
        path: geminiProjectSettingsPath,
        scope: 'project',
      }),
    ])

    const restoredProject = JSON.parse(await fs.readFile(geminiProjectSettingsPath, 'utf8')) as Record<string, unknown>
    const untouchedUser = JSON.parse(await fs.readFile(geminiSettingsPath, 'utf8')) as Record<string, unknown>
    expect(restoredProject.enforcedAuthType).toBeUndefined()
    expect(restoredProject.projectOnly).toBe(true)
    expect(untouchedUser.enforcedAuthType).toBe('user-mutated')
  })

  it('rollback --scope project 遇到 user scope 快照时输出明确不匹配说明', async () => {
    const useResult = await runCli(['use', 'gemini-prod', '--force', '--json'])
    const usePayload = parseJsonResult<{ backupId?: string }>(useResult.stdout)
    expect(usePayload.data?.backupId).toBeTruthy()

    const result = await runCli(['rollback', usePayload.data!.backupId!, '--scope', 'project'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[rollback] 失败')
    expect(result.stdout).toContain('快照属于 user scope，不能按 project scope 回滚。')
    expect(result.stdout).toContain('作用域策略:')
    expect(result.stdout).toContain('  - 默认目标: user scope')
    expect(result.stdout).toContain('  - 实际目标: user scope')
    expect(result.stdout).toContain('  - 回滚约束: 必须匹配快照 scope')
  })

  it('preview 输出 Codex 双文件 explainable 摘要', async () => {
    const result = await runCli(['preview', 'codex-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[preview] 成功')
    expect(result.stdout).toContain('- 配置: codex-prod (codex)')
    expect(result.stdout).toContain('  校验结果: 通过')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')
    expect(result.stdout).toContain('  计划备份: 是')
    expect(result.stdout).toContain('  无变更: 否')
    expect(result.stdout).toContain('  目标文件:')
    expect(result.stdout).toContain(`  - ${codexConfigPath}`)
    expect(result.stdout).toContain(`  - ${codexAuthPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - base_url: https://old.example.com/v1 (source=stored)')
    expect(result.stdout).toContain('    - OPENAI_API_KEY: sk-o***00 (source=stored, secret)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - base_url: https://gateway.example.com/openai/v1 (source=effective)')
    expect(result.stdout).toContain('    - OPENAI_API_KEY: sk-c***56 (source=effective, secret)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain('  - 类型: multi-file-transaction')
    expect(result.stdout).toContain('    托管字段: base_url, OPENAI_API_KEY')
    expect(result.stdout).toContain('    说明: Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${codexConfigPath}`)
    expect(result.stdout).toContain('    托管字段: base_url')
    expect(result.stdout).toContain('    保留字段: default_provider')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${codexAuthPath}`)
    expect(result.stdout).toContain('    托管字段: OPENAI_API_KEY')
    expect(result.stdout).toContain('    保留字段: user_id')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - OPENAI_API_KEY: sk-c***56 (source=inline, present=yes)')
    expect(result.stdout).toContain('  变更摘要:')
    expect(result.stdout).toContain(`  - ${codexConfigPath}: base_url`)
    expect(result.stdout).toContain(`  - ${codexAuthPath}: OPENAI_API_KEY`)
    expect(result.stdout).toContain('  警告: 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  警告: 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  警告: Codex 将修改多个目标文件。')
    expect(result.stdout).toContain('  限制: 当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  - 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  - Codex 将修改多个目标文件。')
  })

  it('use 输出 Codex 双文件 explainable 摘要并写入 state', async () => {
    const result = await runCli(['use', 'codex-prod', '--force'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[use] 成功')
    expect(result.stdout).toContain('- 配置: codex-prod (codex)')
    expect(result.stdout).toContain('  备份ID: snapshot-codex-')
    expect(result.stdout).toContain('  无变更: 否')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  计划备份: 是')
    expect(result.stdout).toContain('  已变更文件:')
    expect(result.stdout).toContain(`  - ${codexConfigPath}`)
    expect(result.stdout).toContain(`  - ${codexAuthPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - base_url: https://old.example.com/v1 (source=stored)')
    expect(result.stdout).toContain('    - OPENAI_API_KEY: sk-o***00 (source=stored, secret)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - base_url: https://gateway.example.com/openai/v1 (source=effective)')
    expect(result.stdout).toContain('    - OPENAI_API_KEY: sk-c***56 (source=effective, secret)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain('  - 类型: multi-file-transaction')
    expect(result.stdout).toContain('    托管字段: base_url, OPENAI_API_KEY')
    expect(result.stdout).toContain('    说明: Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${codexConfigPath}`)
    expect(result.stdout).toContain('    保留字段: default_provider')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${codexAuthPath}`)
    expect(result.stdout).toContain('    保留字段: user_id')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - OPENAI_API_KEY: sk-c***56 (source=inline, present=yes)')
    expect(result.stdout).toContain('  变更摘要:')
    expect(result.stdout).toContain(`  - ${codexConfigPath}: base_url`)
    expect(result.stdout).toContain(`  - ${codexAuthPath}: OPENAI_API_KEY`)
    expect(result.stdout).toContain('  警告: 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  警告: 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  警告: Codex 将修改多个目标文件。')
    expect(result.stdout).toContain('  限制: 当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  - 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  - Codex 将修改多个目标文件。')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前会同时托管 Codex 的 config.toml 与 auth.json。')

    const state = await new StateStore().read()
    expect(state.current.codex).toBe('codex-prod')
  })

  it('rollback 输出 Codex 双文件恢复摘要并更新 state', async () => {
    const useResult = await runCli(['use', 'codex-prod', '--force'])
    const backupIdMatch = useResult.stdout.match(/备份ID: (snapshot-codex-[^\n]+)/)
    expect(backupIdMatch?.[1]).toBeTruthy()

    await fs.writeFile(codexConfigPath, 'default_provider = "other"\n', 'utf8')
    await fs.writeFile(codexAuthPath, JSON.stringify({ OPENAI_API_KEY: 'sk-other' }, null, 2), 'utf8')
    const result = await runCli(['rollback', backupIdMatch![1]])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[rollback] 成功')
    expect(result.stdout).toContain(`- 备份ID: ${backupIdMatch![1]}`)
    expect(result.stdout).toContain('  已恢复文件:')
    expect(result.stdout).toContain(`  - ${codexConfigPath}`)
    expect(result.stdout).toContain(`  - ${codexAuthPath}`)
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain('  - 类型: multi-file-transaction')
    expect(result.stdout).toContain('    托管字段: base_url, OPENAI_API_KEY')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${codexConfigPath}`)
    expect(result.stdout).toContain('    保留字段: default_provider')
    expect(result.stdout).toContain(`  - 类型: managed-fields / 目标: ${codexAuthPath}`)
    expect(result.stdout).toContain('    保留字段: user_id')
    expect(result.stdout).toContain('  回滚警告: 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  回滚警告: 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  回滚警告: Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(result.stdout).toContain('  回滚限制: 当前会同时托管 Codex 的 config.toml 与 auth.json。')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Codex config.toml 存在非托管字段：default_provider')
    expect(result.stdout).toContain('  - 当前 Codex auth.json 存在非托管字段：user_id')
    expect(result.stdout).toContain('  - Codex 配置切换会联动 config.toml 与 auth.json。')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前会同时托管 Codex 的 config.toml 与 auth.json。')

    const state = await new StateStore().read()
    expect(state.current.codex).toBeUndefined()
    expect(state.lastSwitch?.status).toBe('rolled-back')
  })

  it('preview 校验失败时仍输出预览摘要并设置 exitCode 1', async () => {
    const result = await runCli(['preview', 'gemini-invalid'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[preview] 失败')
    expect(result.stdout).toContain('- 配置: gemini-invalid (gemini)')
    expect(result.stdout).toContain('  校验结果: 失败')
    expect(result.stdout).toContain('  错误: 缺少 GEMINI_API_KEY')
    expect(result.stdout).toContain('  限制: GEMINI_API_KEY 仍需通过环境变量生效。')
  })

  it('preview 输出 Claude scope-aware explainable 摘要', async () => {
    const result = await runCli(['preview', 'claude-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[preview] 成功')
    expect(result.stdout).toContain('- 配置: claude-prod (claude)')
    expect(result.stdout).toContain('  校验结果: 通过')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('  需要确认: 是')
    expect(result.stdout).toContain('  计划备份: 是')
    expect(result.stdout).toContain('  无变更: 否')
    expect(result.stdout).toContain('  作用域说明:')
    expect(result.stdout).toContain('  - 生效优先级: user < project < local')
    expect(result.stdout).toContain('  - 预览视角: 先按 Claude 多层 scope 合并 current/effective，再评估本次写入')
    expect(result.stdout).toContain('  - 本次写入目标: project scope')
    expect(result.stdout).toContain('  - 覆盖关系: project scope 高于 user scope，但仍低于 local scope')
    expect(result.stdout).toContain('  - 覆盖提醒: 如果 local scope 存在同名字段，project 写入后仍可能不会成为最终生效值')
    expect(result.stdout).toContain('  目标文件:')
    expect(result.stdout).toContain(`  - ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-o***00 (scope=project, source=stored, secret)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-l***56 (scope=project, source=scope-project, secret)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(result.stdout).toContain('    保留字段: theme')
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - ANTHROPIC_AUTH_TOKEN: sk-l***56 (source=inline, present=yes)')
    expect(result.stdout).toContain('  变更摘要:')
    expect(result.stdout).toContain(`  - ${claudeProjectSettingsPath}: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL`)
    expect(result.stdout).toContain('  警告: 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('  限制: 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Claude 配置存在非托管字段：theme')
  })

  it('preview --scope user 会覆盖 Claude 环境默认 scope', async () => {
    await fs.writeFile(
      claudeUserSettingsPath,
      JSON.stringify({ userTheme: 'light', ANTHROPIC_AUTH_TOKEN: 'sk-user-000', ANTHROPIC_BASE_URL: 'https://user.example.com/api' }, null, 2),
      'utf8',
    )

    const result = await runCli(['preview', 'claude-prod', '--scope', 'user'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain(`  - ${claudeUserSettingsPath}`)
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${claudeUserSettingsPath}`)
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 用户级配置文件。')
    expect(result.stdout).not.toContain(`  - 类型: scope-aware / 目标: ${claudeProjectSettingsPath}`)
  })

  it('use --scope local 会覆盖 Claude 环境默认 scope，并只写入 local 文件', async () => {
    await fs.writeFile(claudeLocalSettingsPath, JSON.stringify({ localFlag: true }, null, 2), 'utf8')

    const result = await runCli(['use', 'claude-prod', '--scope', 'local', '--force', '--json'])
    const payload = parseJsonResult<{
      changedFiles: string[]
      preview: { targetFiles: Array<{ path: string; scope?: string }> }
      validation: {
        effectiveConfig?: {
          stored: Array<{ key: string; scope?: string }>
        }
        managedBoundaries?: Array<{ target?: string; notes?: string[] }>
      }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.changedFiles).toEqual([claudeLocalSettingsPath])
    expect(payload.data?.preview.targetFiles).toEqual([
      expect.objectContaining({
        path: claudeLocalSettingsPath,
        scope: 'local',
      }),
    ])
    expect(payload.data?.validation.effectiveConfig?.stored?.[0]).toMatchObject({
      key: 'ANTHROPIC_AUTH_TOKEN',
      scope: 'local',
    })
    expect(payload.data?.validation.managedBoundaries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        target: claudeLocalSettingsPath,
        notes: ['当前写入目标为 Claude 本地级配置文件。'],
      }),
    ]))

    const localSettings = JSON.parse(await fs.readFile(claudeLocalSettingsPath, 'utf8')) as Record<string, unknown>
    const projectSettings = JSON.parse(await fs.readFile(claudeProjectSettingsPath, 'utf8')) as Record<string, unknown>
    expect(localSettings.ANTHROPIC_AUTH_TOKEN).toBe('sk-live-123456')
    expect(projectSettings.ANTHROPIC_AUTH_TOKEN).toBe('sk-old-000')
  })

  it('rollback --scope local 会按 Claude local scope 快照恢复', async () => {
    await fs.writeFile(claudeLocalSettingsPath, JSON.stringify({ localFlag: true }, null, 2), 'utf8')
    const useResult = await runCli(['use', 'claude-prod', '--scope', 'local', '--force', '--json'])
    const usePayload = parseJsonResult<{ backupId?: string }>(useResult.stdout)
    expect(usePayload.data?.backupId).toBeTruthy()

    await fs.writeFile(claudeLocalSettingsPath, JSON.stringify({ localFlag: false }, null, 2), 'utf8')

    const result = await runCli(['rollback', usePayload.data!.backupId!, '--scope', 'local', '--json'])
    const payload = parseJsonResult<{
      restoredFiles: string[]
      rollback?: { targetFiles?: Array<{ path: string; scope?: string }> }
    }>(result.stdout)

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(payload.ok).toBe(true)
    expect(payload.data?.restoredFiles).toEqual([claudeLocalSettingsPath])
    expect(payload.data?.rollback?.targetFiles).toEqual([
      expect.objectContaining({
        path: claudeLocalSettingsPath,
        scope: 'local',
      }),
    ])
  })

  it('use 在 --force 下输出 explainable 摘要并写入 state', async () => {
    const result = await runCli(['use', 'claude-prod', '--force'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[use] 成功')
    expect(result.stdout).toContain('- 配置: claude-prod (claude)')
    expect(result.stdout).toContain('  备份ID: snapshot-claude-')
    expect(result.stdout).toContain('  风险等级: medium')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.stdout).toContain('  已变更文件:')
    expect(result.stdout).toContain(`  - ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('  生效配置:')
    expect(result.stdout).toContain('    已写入:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-o***00 (scope=project, source=stored, secret)')
    expect(result.stdout).toContain('    最终生效:')
    expect(result.stdout).toContain('    - ANTHROPIC_AUTH_TOKEN: sk-l***56 (scope=project, source=scope-project, secret)')
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(result.stdout).toContain('    保留字段: theme')
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(result.stdout).toContain('  敏感字段引用:')
    expect(result.stdout).toContain('  - ANTHROPIC_AUTH_TOKEN: sk-l***56 (source=inline, present=yes)')

    const state = await new StateStore().read()
    expect(state.current.claude).toBe('claude-prod')
  })

  it('use 无 --force 时对需要确认的预览返回失败与 exitCode 1', async () => {
    const result = await runCli(['use', 'gemini-prod'])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('[use] 失败')
    expect(result.stdout).toContain('当前切换需要确认或 --force。')
  })

  it('rollback 输出恢复文件并更新 state', async () => {
    const useResult = await runCli(['use', 'claude-prod', '--force'])
    const backupIdMatch = useResult.stdout.match(/备份ID: (snapshot-claude-[^\n]+)/)
    expect(backupIdMatch?.[1]).toBeTruthy()

    await fs.writeFile(claudeProjectSettingsPath, JSON.stringify({ theme: 'light' }, null, 2), 'utf8')
    const result = await runCli(['rollback', backupIdMatch![1]])

    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('[rollback] 成功')
    expect(result.stdout).toContain(`- 备份ID: ${backupIdMatch![1]}`)
    expect(result.stdout).toContain('  已恢复文件:')
    expect(result.stdout).toContain(`  - ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('  托管边界:')
    expect(result.stdout).toContain(`  - 类型: scope-aware / 目标: ${claudeProjectSettingsPath}`)
    expect(result.stdout).toContain('    托管字段: ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL')
    expect(result.stdout).toContain('    保留字段: theme')
    expect(result.stdout).toContain('    说明: 当前写入目标为 Claude 项目级配置文件。')
    expect(result.stdout).toContain('  回滚警告: 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('  回滚限制: 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')
    expect(result.stdout).toContain('附加提示:')
    expect(result.stdout).toContain('  - 当前 Claude 配置存在非托管字段：theme')
    expect(result.stdout).toContain('限制说明:')
    expect(result.stdout).toContain('  - 当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。')

    const state = await new StateStore().read()
    expect(state.current.claude).toBeUndefined()
    expect(state.lastSwitch?.status).toBe('rolled-back')
  })

  it('CLI 顶层未捕获异常时返回 stderr 并设置 exitCode 2', async () => {
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

  it('add 缺少必填参数时保持 Commander 的 stderr 失败出口', async () => {
    const result = await runCli(['add'])

    expect(result.stdout).toBe('')
    expect(result.stderr).toContain("error: required option '--platform <platform>' not specified")
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
    expect(rollback.stdout).toContain('Gemini: user/project）')
  })
})
