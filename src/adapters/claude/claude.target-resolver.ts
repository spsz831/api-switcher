import os from 'node:os'
import path from 'node:path'

export type ClaudeScope = 'user' | 'project' | 'local'

export const CLAUDE_SCOPE_ORDER: ClaudeScope[] = ['user', 'project', 'local']

function isClaudeScope(value: string | undefined): value is ClaudeScope {
  return value === 'user' || value === 'project' || value === 'local'
}

export function resolveClaudeProjectRoot(): string {
  return process.env.API_SWITCHER_CLAUDE_PROJECT_ROOT || process.cwd()
}

export function resolveClaudeTargetScope(): ClaudeScope {
  const targetScope = process.env.API_SWITCHER_CLAUDE_TARGET_SCOPE
  return isClaudeScope(targetScope) ? targetScope : 'user'
}

export function resolveClaudeSettingsPath(scope: ClaudeScope = resolveClaudeTargetScope()): string {
  if (scope === 'user') {
    return process.env.API_SWITCHER_CLAUDE_USER_SETTINGS_PATH
      || process.env.API_SWITCHER_CLAUDE_SETTINGS_PATH
      || path.join(os.homedir(), '.claude', 'settings.json')
  }

  if (scope === 'project') {
    return process.env.API_SWITCHER_CLAUDE_PROJECT_SETTINGS_PATH
      || path.join(resolveClaudeProjectRoot(), '.claude', 'settings.json')
  }

  return process.env.API_SWITCHER_CLAUDE_LOCAL_SETTINGS_PATH
    || path.join(resolveClaudeProjectRoot(), '.claude', 'settings.local.json')
}

export function resolveClaudeScopeTargets(): Array<{ scope: ClaudeScope; path: string }> {
  return CLAUDE_SCOPE_ORDER.map((scope) => ({
    scope,
    path: resolveClaudeSettingsPath(scope),
  }))
}
