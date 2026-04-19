import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PUBLIC_JSON_SCHEMA_VERSION } from '../../src/constants/public-json-schema'

const readmePath = path.resolve(__dirname, '../../README.md')
const readme = fs.readFileSync(readmePath, 'utf8')
const publicJsonSchemaDocPath = path.resolve(__dirname, '../../docs/public-json-schema.md')
const publicJsonSchemaDoc = fs.readFileSync(publicJsonSchemaDocPath, 'utf8')
const changelogPath = path.resolve(__dirname, '../../CHANGELOG.md')
const changelog = fs.readFileSync(changelogPath, 'utf8')
const releaseChecklistPath = path.resolve(__dirname, '../../docs/release-checklist.md')
const releaseChecklist = fs.readFileSync(releaseChecklistPath, 'utf8')
const machineReadableSchemaPath = path.resolve(__dirname, '../../docs/public-json-output.schema.json')
const machineReadableSchema = JSON.parse(fs.readFileSync(machineReadableSchemaPath, 'utf8')) as {
  $id?: string
  properties?: {
    schemaVersion?: {
      const?: string
    }
  }
}

describe('docs consistency', () => {
  it('README 首屏能力摘要包含 schema 命令，避免公开命令面与首页摘要漂移', () => {
    expect(readme).toContain('`preview / use / rollback / current / list / validate / export / add / schema`')
  })

  it('README 保留 smoke:release 入口与验证范围，避免公开开发入口落后于实际脚本', () => {
    expect(readme).toContain('corepack pnpm smoke:release')
    expect(readme).toContain('顶层 `--help` 可发现性')
    expect(readme).toContain('`schema --schema-version --json` 成功态 contract')
    expect(readme).toContain('`current/list --json` platformSummary contract')
    expect(readme).toContain('稳定 stderr 失败出口')
    expect(readme).toContain('稳定 `--json` 失败 envelope')
  })

  it('README / schema / changelog 对 import apply 的平台边界与单 profile 约束保持一致', () => {
    expect(readme).toContain('`import apply` 当前支持 Gemini / Codex / Claude')
    expect(readme).toContain('一次只应用单个 imported profile')
    expect(readme).toContain('Codex 不使用 `--scope`')

    expect(publicJsonSchemaDoc).toContain('当前支持 Gemini / Codex / Claude profile。')
    expect(publicJsonSchemaDoc).toContain('一次只应用单个 profile（必须显式传 `--profile`）。')
    expect(publicJsonSchemaDoc).toContain('Codex 不支持 `--scope`')

    expect(changelog).toContain('`import apply` 当前支持 Gemini / Codex / Claude。')
    expect(changelog).toContain('一次仅支持应用单个 imported profile')
    expect(changelog).toContain('Codex 不支持 `--scope`')
  })

  it('README / schema 文档对 current/list platformSummary contract 保持一致', () => {
    expect(readme).toContain('`current --json` 会在 `detections[]` 里同时返回当前生效来源 `currentScope`、机器可消费的 `platformSummary`')
    expect(readme).toContain('`list --json` 会在每个 profile 条目上带出所属平台的 `platformSummary`')
    expect(readme).toContain('"code": "GEMINI_SCOPE_PRECEDENCE"')
    expect(readme).toContain('"code": "CODEX_LIST_IS_PROFILE_LEVEL"')
    expect(readme).toContain('"code": "CODEX_CURRENT_REQUIRES_BOTH_FILES"')

    expect(publicJsonSchemaDoc).toContain('`current/list` 会输出 `platformSummary`')
    expect(publicJsonSchemaDoc).toContain('system-defaults < user < project < system-overrides')
    expect(publicJsonSchemaDoc).toContain('user < project < local')
    expect(publicJsonSchemaDoc).toContain('multi-file-composition')
    expect(publicJsonSchemaDoc).toContain('GEMINI_SCOPE_PRECEDENCE')
    expect(publicJsonSchemaDoc).toContain('CLAUDE_SCOPE_PRECEDENCE')
    expect(publicJsonSchemaDoc).toContain('CODEX_MULTI_FILE_CONFIGURATION')
  })

  it('CHANGELOG 首版能力摘要包含 schema 命令，避免 release note 与 README 首页命令面漂移', () => {
    expect(changelog).toContain('`add / list / current / validate / preview / use / rollback / export / schema`')
  })

  it('CHANGELOG 记录当前 release smoke 护栏能力，避免自动化演进只落在脚本里', () => {
    expect(changelog).toContain('`smoke:release` 现在会校验 `dist` 构建产物的顶层 `--help` 关键命令面')
    expect(changelog).toContain('`schema --schema-version --json` 成功态 contract')
    expect(changelog).toContain('未知命令保持 Commander `stderr` 失败行为')
    expect(changelog).toContain('`import <missing-file> --json` 返回 `schemaVersion / ok=false / action / error.code`')
  })

  it('release checklist 保留 smoke:release 发布前入口，避免自动化基线文档漂移', () => {
    expect(releaseChecklist).toContain('corepack pnpm smoke:release')
    expect(releaseChecklist).toContain('发布前一键 smoke 入口')
    expect(releaseChecklist).toContain('CLI help / schema --json')
    expect(releaseChecklist).toContain('schema --schema-version --json')
    expect(releaseChecklist).toContain('`dist` 构建产物')
    expect(releaseChecklist).toContain('当前公开 contract')
    expect(releaseChecklist).toContain('可发现性')
    expect(releaseChecklist).toContain('顶层 `--help` 仍保留关键命令面')
    expect(releaseChecklist).toContain('preview / use / rollback / current / list / validate / export / add / schema / import')
    expect(releaseChecklist).toContain('current/list --json')
    expect(releaseChecklist).toContain('platformSummary')
    expect(releaseChecklist).toContain('scope-precedence')
    expect(releaseChecklist).toContain('multi-file-composition')
    expect(releaseChecklist).toContain('未知命令仍保持稳定的 Commander 失败出口')
    expect(releaseChecklist).toContain('exit code `1`')
    expect(releaseChecklist).toContain('stderr` 含 `unknown command`')
    expect(releaseChecklist).toContain('JSON 失败态')
    expect(releaseChecklist).toContain('import <missing-file> --json')
    expect(releaseChecklist).toContain('schemaVersion / ok=false / action / error.code')
  })

  it('schema 文档示例与源码常量、machine-readable schema 的版本和 schemaId 保持一致', () => {
    expect(machineReadableSchema.properties?.schemaVersion?.const).toBe(PUBLIC_JSON_SCHEMA_VERSION)

    expect(publicJsonSchemaDoc).toContain(`schemaVersion: '${PUBLIC_JSON_SCHEMA_VERSION}'`)
    expect(publicJsonSchemaDoc).toContain(`schemaId: '${machineReadableSchema.$id}'`)
  })

  it('README 保留 schema --json 最小公开元字段示例，避免示例与真实 contract 漂移', () => {
    expect(readme).toContain('"action": "schema"')
    expect(readme).toContain(`"schemaVersion": "${PUBLIC_JSON_SCHEMA_VERSION}"`)
    expect(readme).toContain(`"schemaId": "${machineReadableSchema.$id}"`)
    expect(readme).toContain('"$schema": "https://json-schema.org/draft/2020-12/schema"')
    expect(readme).toContain(`"$id": "${machineReadableSchema.$id}"`)
  })

  it('README 保留 schema --schema-version --json 轻量返回示例，避免版本探测 contract 漂移', () => {
    expect(readme).toContain('api-switcher schema --schema-version --json')
    expect(readme).toContain('"ok": true')
    expect(readme).toContain('"action": "schema"')
    expect(readme).toContain(`"schemaVersion": "${PUBLIC_JSON_SCHEMA_VERSION}"`)
    expect(readme).toContain('"data": {')
  })
})
