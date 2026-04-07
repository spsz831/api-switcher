import { afterEach, describe, expect, it } from 'vitest'
import {
  resolveClaudeProjectRoot,
  resolveClaudeScopeTargets,
  resolveClaudeSettingsPath,
  resolveClaudeTargetScope,
} from '../../src/adapters/claude/claude.target-resolver'

describe('claude target resolver', () => {
  const originalEnv = {
    API_SWITCHER_CLAUDE_PROJECT_ROOT: process.env.API_SWITCHER_CLAUDE_PROJECT_ROOT,
    API_SWITCHER_CLAUDE_USER_SETTINGS_PATH: process.env.API_SWITCHER_CLAUDE_USER_SETTINGS_PATH,
    API_SWITCHER_CLAUDE_PROJECT_SETTINGS_PATH: process.env.API_SWITCHER_CLAUDE_PROJECT_SETTINGS_PATH,
    API_SWITCHER_CLAUDE_LOCAL_SETTINGS_PATH: process.env.API_SWITCHER_CLAUDE_LOCAL_SETTINGS_PATH,
    API_SWITCHER_CLAUDE_SETTINGS_PATH: process.env.API_SWITCHER_CLAUDE_SETTINGS_PATH,
    API_SWITCHER_CLAUDE_TARGET_SCOPE: process.env.API_SWITCHER_CLAUDE_TARGET_SCOPE,
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key]
        continue
      }

      process.env[key] = value
    }
  })

  it('默认解析 user scope', () => {
    delete process.env.API_SWITCHER_CLAUDE_TARGET_SCOPE

    expect(resolveClaudeTargetScope()).toBe('user')
  })

  it('会根据环境变量解析 project 与 local scope 路径', () => {
    process.env.API_SWITCHER_CLAUDE_PROJECT_ROOT = '/tmp/api-switcher-workspace'
    process.env.API_SWITCHER_CLAUDE_USER_SETTINGS_PATH = '/tmp/claude-user.json'
    process.env.API_SWITCHER_CLAUDE_PROJECT_SETTINGS_PATH = '/tmp/project/.claude/settings.json'
    process.env.API_SWITCHER_CLAUDE_LOCAL_SETTINGS_PATH = '/tmp/project/.claude/settings.local.json'

    expect(resolveClaudeProjectRoot()).toBe('/tmp/api-switcher-workspace')
    expect(resolveClaudeSettingsPath('user')).toBe('/tmp/claude-user.json')
    expect(resolveClaudeSettingsPath('project')).toBe('/tmp/project/.claude/settings.json')
    expect(resolveClaudeSettingsPath('local')).toBe('/tmp/project/.claude/settings.local.json')
    expect(resolveClaudeScopeTargets()).toEqual([
      { scope: 'user', path: '/tmp/claude-user.json' },
      { scope: 'project', path: '/tmp/project/.claude/settings.json' },
      { scope: 'local', path: '/tmp/project/.claude/settings.local.json' },
    ])
  })

  it('会忽略非法 scope 并回退到 user', () => {
    process.env.API_SWITCHER_CLAUDE_TARGET_SCOPE = 'workspace'

    expect(resolveClaudeTargetScope()).toBe('user')
  })

  it('会读取合法 target scope', () => {
    process.env.API_SWITCHER_CLAUDE_TARGET_SCOPE = 'local'

    expect(resolveClaudeTargetScope()).toBe('local')
    expect(resolveClaudeSettingsPath()).toContain('settings.local.json')
  })
})
