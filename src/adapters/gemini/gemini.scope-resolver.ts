import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathExists } from '../../utils/file-system'
import { resolveDevelopmentSandboxPath, shouldUseDevelopmentSandbox } from '../../utils/development-sandbox'
import { assertTargetScope, resolveTargetScope } from '../../services/scope-options'
import type { ScopeAvailabilityStatus } from '../../types/capabilities'

export type GeminiScope = 'system-defaults' | 'user' | 'project' | 'system-overrides'
export type GeminiWritableScope = 'user' | 'project'

export type GeminiScopeTarget = {
  scope: GeminiScope
  path?: string
  exists: boolean
  writable: boolean
  role: 'settings'
  status: ScopeAvailabilityStatus
  detected: boolean
  reasonCode?: 'PROJECT_ROOT_UNRESOLVED' | 'PROJECT_SCOPE_PATH_UNAVAILABLE'
  reason?: string
  remediation?: string
}

export const GEMINI_SCOPE_ORDER: GeminiScope[] = ['system-defaults', 'user', 'project', 'system-overrides']

export function resolveGeminiWritableScope(scope?: string): GeminiWritableScope {
  assertTargetScope('gemini', scope)
  return resolveTargetScope('gemini', scope) as GeminiWritableScope
}

function resolveGeminiProjectRoot(): string {
  return process.env.API_SWITCHER_GEMINI_PROJECT_ROOT || process.cwd()
}

function resolveGeminiProjectRootCandidate(): string | null {
  const configuredRoot = process.env.API_SWITCHER_GEMINI_PROJECT_ROOT?.trim()
  if (configuredRoot) {
    return configuredRoot
  }

  const workingRoot = process.cwd().trim()
  if (workingRoot) {
    return workingRoot
  }

  return null
}

export function resolveGeminiScopePath(scope: GeminiScope): string {
  if (scope === 'system-defaults') {
    if (shouldUseDevelopmentSandbox()) {
      return process.env.API_SWITCHER_GEMINI_SYSTEM_DEFAULTS_SETTINGS_PATH
        || resolveDevelopmentSandboxPath('gemini', 'system-defaults.json')
    }

    return process.env.API_SWITCHER_GEMINI_SYSTEM_DEFAULTS_SETTINGS_PATH
      || path.join(os.homedir(), '.gemini', 'system-defaults.json')
  }

  if (scope === 'user') {
    if (shouldUseDevelopmentSandbox()) {
      return process.env.API_SWITCHER_GEMINI_USER_SETTINGS_PATH
        || process.env.API_SWITCHER_GEMINI_SETTINGS_PATH
        || resolveDevelopmentSandboxPath('gemini', 'user', 'settings.json')
    }

    return process.env.API_SWITCHER_GEMINI_USER_SETTINGS_PATH
      || process.env.API_SWITCHER_GEMINI_SETTINGS_PATH
      || path.join(os.homedir(), '.gemini', 'settings.json')
  }

  if (scope === 'project') {
    return path.join(resolveGeminiProjectRoot(), '.gemini', 'settings.json')
  }

  return process.env.API_SWITCHER_GEMINI_SYSTEM_OVERRIDES_SETTINGS_PATH
    || (shouldUseDevelopmentSandbox()
      ? resolveDevelopmentSandboxPath('gemini', 'system-overrides.json')
      : path.join(os.homedir(), '.gemini', 'system-overrides.json'))
}

async function resolveGeminiProjectRootState(): Promise<string | null> {
  const projectRoot = resolveGeminiProjectRootCandidate()
  if (!projectRoot) {
    return null
  }

  try {
    const stat = await fs.stat(projectRoot)
    return stat.isDirectory() ? projectRoot : null
  } catch {
    return null
  }
}

function toAvailableScopeTarget(scope: GeminiScope, scopePath: string, writable: boolean): Promise<GeminiScopeTarget> {
  return pathExists(scopePath).then((exists) => ({
    scope,
    path: scopePath,
    exists,
    writable,
    role: 'settings' as const,
    status: 'available' as const,
    detected: true,
  }))
}

export async function resolveGeminiProjectScopeTarget(): Promise<GeminiScopeTarget> {
  const scope = 'project' as const
  const projectRoot = await resolveGeminiProjectRootState()
  if (!projectRoot) {
    return {
      scope,
      exists: false,
      writable: false,
      role: 'settings' as const,
      status: 'unresolved' as const,
      detected: false,
      reasonCode: 'PROJECT_ROOT_UNRESOLVED' as const,
      reason: '当前无法解析 Gemini project scope 的 project root。',
      remediation: '请在项目目录中运行，或显式提供 API_SWITCHER_GEMINI_PROJECT_ROOT。',
    }
  }

  const geminiDir = path.join(projectRoot, '.gemini')
  try {
    const geminiDirStat = await fs.stat(geminiDir)
    if (!geminiDirStat.isDirectory()) {
      return {
        scope,
        exists: false,
        writable: false,
        role: 'settings' as const,
        status: 'unresolved' as const,
        detected: false,
        reasonCode: 'PROJECT_SCOPE_PATH_UNAVAILABLE' as const,
        reason: 'Gemini project scope 的 settings.json 路径当前不可用。',
        remediation: '请检查 project root 是否有效，以及 .gemini/settings.json 目标路径是否可解析。',
      }
    }
  } catch {
    // Missing ".gemini" directory is acceptable; settings.json may still be created later.
  }

  return toAvailableScopeTarget(scope, path.join(geminiDir, 'settings.json'), true)
}

export async function resolveGeminiScopeTarget(scope: GeminiScope): Promise<GeminiScopeTarget> {
  if (scope === 'project') {
    return resolveGeminiProjectScopeTarget()
  }

  return toAvailableScopeTarget(scope, resolveGeminiScopePath(scope), scope === 'user')
}

export async function resolveGeminiScopeTargets(): Promise<GeminiScopeTarget[]> {
  return Promise.all(GEMINI_SCOPE_ORDER.map((scope) => resolveGeminiScopeTarget(scope)))
}

export async function resolveGeminiWritableScopePath(scope?: string): Promise<{ scope: GeminiWritableScope; path: string; target: GeminiScopeTarget }> {
  const writableScope = resolveGeminiWritableScope(scope)
  const target = await resolveGeminiScopeTarget(writableScope)
  if (!target.path || target.status !== 'available') {
    throw new Error(target.reason ?? `Gemini ${writableScope} scope is unavailable.`)
  }

  return {
    scope: writableScope,
    path: target.path,
    target,
  }
}
