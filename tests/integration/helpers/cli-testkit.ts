import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ProfilesStore } from '../../../src/stores/profiles.store'
import { StateStore } from '../../../src/stores/state.store'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../../../src/constants/public-json-schema'
import type { CommandResult } from '../../../src/types/command'
import type { Profile } from '../../../src/types/profile'
import { validateSchema, type JsonSchema } from '../../helpers/public-json-schema'

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(__dirname, '../../..')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
export const publicJsonSchemaPath = path.join(repoRoot, 'docs', 'public-json-output.schema.json')

export type CliRunResult = {
  stdout: string
  stderr: string
  exitCode: number
}

export type ScopeCapabilityContract = {
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

export type ScopeAvailabilityContract = {
  scope: string
  status: 'available' | 'unresolved' | 'blocked'
  detected: boolean
  writable: boolean
  path?: string
  reasonCode?: string
  reason?: string
  remediation?: string
}

export type CliIntegrationContext = {
  runtimeDir: string
  claudeProjectRoot: string
  claudeUserSettingsPath: string
  claudeProjectSettingsPath: string
  claudeLocalSettingsPath: string
  codexConfigPath: string
  codexAuthPath: string
  geminiSettingsPath: string
  geminiProjectRoot: string
  geminiProjectSettingsPath: string
}

let currentContext: CliIntegrationContext | undefined

function getContext(): CliIntegrationContext {
  if (!currentContext) {
    throw new Error('CLI integration context is not initialized.')
  }

  return currentContext
}

export async function setupCliIntegrationContext(): Promise<CliIntegrationContext> {
  const runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-switcher-cli-it-'))
  const claudeProjectRoot = path.join(runtimeDir, 'workspace')
  const claudeUserSettingsPath = path.join(runtimeDir, 'claude-user-settings.json')
  const claudeProjectSettingsPath = path.join(claudeProjectRoot, '.claude', 'settings.json')
  const claudeLocalSettingsPath = path.join(claudeProjectRoot, '.claude', 'settings.local.json')
  const codexConfigPath = path.join(runtimeDir, 'config.toml')
  const codexAuthPath = path.join(runtimeDir, 'auth.json')
  const geminiSettingsPath = path.join(runtimeDir, 'gemini-settings.json')
  const geminiProjectRoot = path.join(runtimeDir, 'gemini-workspace')
  const geminiProjectSettingsPath = path.join(geminiProjectRoot, '.gemini', 'settings.json')

  currentContext = {
    runtimeDir,
    claudeProjectRoot,
    claudeUserSettingsPath,
    claudeProjectSettingsPath,
    claudeLocalSettingsPath,
    codexConfigPath,
    codexAuthPath,
    geminiSettingsPath,
    geminiProjectRoot,
    geminiProjectSettingsPath,
  }

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

  return currentContext
}

export async function teardownCliIntegrationContext(): Promise<void> {
  const context = currentContext

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

  currentContext = undefined

  if (context) {
    await fs.rm(context.runtimeDir, { recursive: true, force: true })
  }
}

export async function runCli(argv: string[], envOverrides: NodeJS.ProcessEnv = {}): Promise<CliRunResult> {
  const context = getContext()
  const env = {
    ...process.env,
    API_SWITCHER_RUNTIME_DIR: context.runtimeDir,
    API_SWITCHER_CLAUDE_PROJECT_ROOT: context.claudeProjectRoot,
    API_SWITCHER_CLAUDE_USER_SETTINGS_PATH: context.claudeUserSettingsPath,
    API_SWITCHER_CLAUDE_PROJECT_SETTINGS_PATH: context.claudeProjectSettingsPath,
    API_SWITCHER_CLAUDE_LOCAL_SETTINGS_PATH: context.claudeLocalSettingsPath,
    API_SWITCHER_CLAUDE_TARGET_SCOPE: 'project',
    API_SWITCHER_CODEX_CONFIG_PATH: context.codexConfigPath,
    API_SWITCHER_CODEX_AUTH_PATH: context.codexAuthPath,
    API_SWITCHER_GEMINI_SETTINGS_PATH: context.geminiSettingsPath,
    API_SWITCHER_GEMINI_PROJECT_ROOT: context.geminiProjectRoot,
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

export function parseJsonResult<T = unknown>(stdout: string): CommandResult<T> {
  const payload = JSON.parse(stdout) as CommandResult<T>
  if (payload.schemaVersion !== PUBLIC_JSON_SCHEMA_VERSION) {
    throw new Error(`Unexpected schema version: ${payload.schemaVersion}`)
  }
  return payload
}

export function validatePayloadAgainstPublicSchema(schema: JsonSchema, payload: unknown): boolean {
  return validateSchema(schema, payload, schema)
}

export async function writeImportSourceFile(
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

export async function markCurrent(platform: Profile['platform'], profileId: string, backupId: string): Promise<void> {
  await new StateStore().markCurrent(platform, profileId, backupId)
}
