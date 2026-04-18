import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const readmePath = path.resolve(__dirname, '../../README.md')
const readme = fs.readFileSync(readmePath, 'utf8')
const publicJsonSchemaDocPath = path.resolve(__dirname, '../../docs/public-json-schema.md')
const publicJsonSchemaDoc = fs.readFileSync(publicJsonSchemaDocPath, 'utf8')
const changelogPath = path.resolve(__dirname, '../../CHANGELOG.md')
const changelog = fs.readFileSync(changelogPath, 'utf8')
const releaseChecklistPath = path.resolve(__dirname, '../../docs/release-checklist.md')
const releaseChecklist = fs.readFileSync(releaseChecklistPath, 'utf8')

describe('docs consistency', () => {
  it('README 首屏能力摘要包含 schema 命令，避免公开命令面与首页摘要漂移', () => {
    expect(readme).toContain('`preview / use / rollback / current / list / validate / export / add / schema`')
  })

  it('README / schema / changelog 对 import apply 的 Gemini-only 与单 profile 边界保持一致', () => {
    expect(readme).toContain('`import apply` 当前仅支持 Gemini')
    expect(readme).toContain('一次只应用单个 imported profile')

    expect(publicJsonSchemaDoc).toContain('仅支持 Gemini profile（Gemini-only）。')
    expect(publicJsonSchemaDoc).toContain('一次只应用单个 profile（必须显式传 `--profile`）。')

    expect(changelog).toContain('`import apply` 当前仅支持 Gemini，不支持 Claude / Codex。')
    expect(changelog).toContain('一次仅支持应用单个 imported profile')
  })

  it('CHANGELOG 首版能力摘要包含 schema 命令，避免 release note 与 README 首页命令面漂移', () => {
    expect(changelog).toContain('`add / list / current / validate / preview / use / rollback / export / schema`')
  })

  it('release checklist 保留 smoke:release 发布前入口，避免自动化基线文档漂移', () => {
    expect(releaseChecklist).toContain('corepack pnpm smoke:release')
    expect(releaseChecklist).toContain('发布前一键 smoke 入口')
    expect(releaseChecklist).toContain('CLI help / schema --json')
  })
})
