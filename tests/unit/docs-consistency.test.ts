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
  it('README 命令概览包含全部 10 个命令', () => {
    expect(readme).toContain('`preview / use / rollback / current / list / validate / export / add / schema / import`')
  })

  it('README 保留 smoke:release 入口', () => {
    expect(readme).toContain('corepack pnpm smoke:release')
  })

  it('README 保留完整的 scope 矩阵，覆盖 Gemini / Claude / Codex 三层差异', () => {
    expect(readme).toContain('| Gemini | `user`, `project` | project 为高风险，需 `--force` |')
    expect(readme).toContain('| Claude | `user`, `project`, `local` | 三层独立读写 |')
    expect(readme).toContain('| Codex | 无 | 直接写入双文件目标 |')
  })

  it('README 平台说明节保持一致', () => {
    expect(readme).toContain('system-defaults < user < project < system-overrides')
    expect(readme).toContain('`rollback` 严格校验 scope 匹配，不匹配会拒绝恢复')
    expect(readme).toContain('CLI `--scope` 优先，其次 `API_SWITCHER_CLAUDE_TARGET_SCOPE` 环境变量')
    expect(readme).toContain('无 scope 概念，直接写入 `config.toml` 与 `auth.json`')
  })

  it('README 当前版本摘要覆盖 v0.1.3 关键能力线', () => {
    expect(readme).toContain('**v0.1.3**')
    expect(readme).toContain('`import preview` / `import apply`（单条 + 同平台批量）')
    expect(readme).toContain('Schema catalog consumer profiles 系统')
    expect(readme).toContain('Reference governance（`env://` 方案解析 + `--secret-ref` 输入）')
    expect(readme).toContain('`--dry-run` 覆盖 `use` / `import apply`')
    expect(readme).toContain('稳定公共 JSON contract + machine-readable schema')
  })

  it('README JSON 输出节保留 envelope 示例和 schemaVersion', () => {
    expect(readme).toContain(`"schemaVersion": "${PUBLIC_JSON_SCHEMA_VERSION}"`)
    expect(readme).toContain('"action": "preview"')
    expect(readme).toContain('"data": {}')
    expect(readme).toContain('"warnings": []')
    expect(readme).toContain('"limitations": []')
    expect(readme).toContain('"code": "CONFIRMATION_REQUIRED"')
    expect(readme).toContain('完整字段说明、error code 词典、consumer profiles 系统和 machine-readable schema 见 [docs/public-json-schema.md]')
  })

  it('README 文档导航指向所有 doc 入口', () => {
    expect(readme).toContain('[docs/public-json-schema.md](docs/public-json-schema.md)')
    expect(readme).toContain('[docs/public-json-output.schema.json](docs/public-json-output.schema.json)')
    expect(readme).toContain('[docs/import-preview-consumer-guide.md](docs/import-preview-consumer-guide.md)')
    expect(readme).toContain('[docs/release-checklist.md](docs/release-checklist.md)')
    expect(readme).toContain('[CHANGELOG.md](CHANGELOG.md)')
  })

  it('README 不包含应移至 schema 文档的详细 catalog 描述', () => {
    // The README should delegate detailed schema catalog info to docs/
    // It should NOT contain detailed consumer profile, starter template field listings
    expect(readme).not.toContain('sharedItemFields')
    expect(readme).not.toContain('optionalItemFields')
    expect(readme).not.toContain('summarySectionGuidance')
    expect(readme).not.toContain('triageBuckets')
    expect(readme).not.toContain('followUpHints')
    expect(readme).not.toContain('consumerActions')
    expect(readme).not.toContain('starterTemplate')
    expect(readme).not.toContain('failureTextActions')
    expect(readme).not.toContain('successTextEntries')
  })

  // --- schema 文档自身结构验证 ---

  it('schema 文档保留公共 explainable 字段总览', () => {
    expect(publicJsonSchemaDoc).toContain('## Common Explainable Fields')
    expect(publicJsonSchemaDoc).toContain('### `platformSummary`')
    expect(publicJsonSchemaDoc).toContain('### `scopeCapabilities`')
    expect(publicJsonSchemaDoc).toContain('### `scopeAvailability`')
    expect(publicJsonSchemaDoc).toContain('### `defaultWriteScope`')
    expect(publicJsonSchemaDoc).toContain('### `observedAt`')
    expect(publicJsonSchemaDoc).toContain('### Field Presence Matrix')
  })

  it('schema 文档保留跨命令字段对齐边界', () => {
    expect(publicJsonSchemaDoc).toContain('## Cross-Command Alignment')
    expect(publicJsonSchemaDoc).toContain('### Stable Shared Fields')
    expect(publicJsonSchemaDoc).toContain('### Stable Import-Only Fields')
    expect(publicJsonSchemaDoc).toContain('### Action-Specific Stable Fields')
    expect(publicJsonSchemaDoc).toContain('### Adapter-Private Or Expandable Fields')
  })

  it('schema 文档对所有命令保留成功与失败样例', () => {
    expect(publicJsonSchemaDoc).toContain('### current --json')
    expect(publicJsonSchemaDoc).toContain('### list --json')
    expect(publicJsonSchemaDoc).toContain('### preview --json')
    expect(publicJsonSchemaDoc).toContain('### use --json')
    expect(publicJsonSchemaDoc).toContain('### rollback --json')
    expect(publicJsonSchemaDoc).toContain('### add --json')
    expect(publicJsonSchemaDoc).toContain('### validate --json')
    expect(publicJsonSchemaDoc).toContain('### export --json')
    expect(publicJsonSchemaDoc).toContain('### import preview --json')
    expect(publicJsonSchemaDoc).toContain('### import apply --json')
  })

  it('schema 文档 JSON 示例导航表保留完整的 action 与 consumer 入口', () => {
    expect(publicJsonSchemaDoc).toContain('### JSON 示例导航')
    expect(publicJsonSchemaDoc).toContain('| Command | 适合谁读 | 成功重点字段 | 失败重点字段 / 失败码 |')
    expect(publicJsonSchemaDoc).toContain('CLI 用户、UI 接入方')
    expect(publicJsonSchemaDoc).toContain('自动化脚本、导入迁移工具')
    expect(publicJsonSchemaDoc).toContain('UI 接入方、导入迁移工具')
  })

  it('schema 文档 reference preview/use contract 完整保留', () => {
    expect(publicJsonSchemaDoc).toContain('`preview/use` 第一阶段已消费 `env://VAR_NAME` 引用')
    expect(publicJsonSchemaDoc).toContain('`referenceReadiness`')
    expect(publicJsonSchemaDoc).toContain('`referenceReadiness` 只是 `preview` 成功态的轻量汇总入口')
    expect(publicJsonSchemaDoc).toContain('不替代 `referenceDecision` / `referenceGovernance`')
    expect(publicJsonSchemaDoc).toContain('`native-reference-write`')
    expect(publicJsonSchemaDoc).toContain('`inline-fallback-write`')
    expect(publicJsonSchemaDoc).toContain('`reference-blocked`')
    expect(publicJsonSchemaDoc).toContain('如继续执行，将以明文写入目标配置文件。')
  })

  it('schema 文档 current/list platformSummary contract 完整保留', () => {
    expect(publicJsonSchemaDoc).toContain('`current/list/validate/export/import preview/import apply` 会输出 `platformSummary`')
    expect(publicJsonSchemaDoc).toContain('GEMINI_SCOPE_PRECEDENCE')
    expect(publicJsonSchemaDoc).toContain('CLAUDE_SCOPE_PRECEDENCE')
    expect(publicJsonSchemaDoc).toContain('CODEX_MULTI_FILE_CONFIGURATION')
    expect(publicJsonSchemaDoc).toContain('system-defaults < user < project < system-overrides')
    expect(publicJsonSchemaDoc).toContain('user < project < local')
    expect(publicJsonSchemaDoc).toContain('multi-file-composition')
    expect(publicJsonSchemaDoc).toContain('CurrentListPlatformStat')
    expect(publicJsonSchemaDoc).toContain('SecretReferenceStats')
  })

  it('schema 文档 add contract 完整保留', () => {
    expect(publicJsonSchemaDoc).toContain('### add --json')
    expect(publicJsonSchemaDoc).toContain('`add` 的 secret 输入面支持两类互斥模式：明文 `--key`，或 reference-only 的 `--secret-ref` / `--auth-reference`。')
    expect(publicJsonSchemaDoc).toContain('`add` 只负责录入 reference 输入，不在该阶段解析当前环境能否执行')
    expect(publicJsonSchemaDoc).toContain('若既没有 key 也没有 reference，失败码为 `ADD_INPUT_REQUIRED`；若同时传入明文 key 与 reference，失败码为 `ADD_INPUT_CONFLICT`。')
  })

  it('schema 文档 import preview/apply contract 完整保留', () => {
    expect(publicJsonSchemaDoc).toContain('### import preview --json')
    expect(publicJsonSchemaDoc).toContain('### import apply --json')
    expect(publicJsonSchemaDoc).toContain('当前支持 Gemini / Codex / Claude profile。')
    expect(publicJsonSchemaDoc).toContain('`--profile` 用于单条 apply，`--profiles` 用于同平台批量 apply。')
    expect(publicJsonSchemaDoc).toContain('第一版批量 apply 只支持同平台 profile，且按传入顺序逐条执行。')
    expect(publicJsonSchemaDoc).toContain('`IMPORT_APPLY_BATCH_PLATFORM_MISMATCH`')
    expect(publicJsonSchemaDoc).toContain('`IMPORT_APPLY_BATCH_PARTIAL_FAILURE`')
    expect(publicJsonSchemaDoc).toContain('Codex 不支持 `--scope`')
    expect(publicJsonSchemaDoc).toContain('"action": "import-apply"')
    expect(publicJsonSchemaDoc).toContain('"code": "CONFIRMATION_REQUIRED"')
  })

  it('schema 文档 import-apply 批量失败 discoverability 样例完整保留', () => {
    expect(publicJsonSchemaDoc).toContain('"path": "error.details.results[].failureCategory"')
    expect(publicJsonSchemaDoc).toContain('"path": "error.details.results[].reasonCodes"')
    expect(publicJsonSchemaDoc).toContain('"conditionCode": "WHEN_BATCH_PARTIAL_FAILURE_RESULTS_ARE_EMITTED"')
    expect(publicJsonSchemaDoc).toContain('"primaryErrorFields": ["error.code", "error.message", "error.details.results[].failureCategory", "error.details.results[].reasonCodes"]')
    expect(publicJsonSchemaDoc).toContain('批量部分失败样例：')
    expect(publicJsonSchemaDoc).toContain('"totalProfiles": 2')
    expect(publicJsonSchemaDoc).toContain('"appliedCount": 1')
    expect(publicJsonSchemaDoc).toContain('"failedCount": 1')
  })

  it('schema 文档 use/rollback contract 完整保留', () => {
    expect(publicJsonSchemaDoc).toContain('成功时，`data.platformSummary` 会把平台 precedence 或多文件组合语义一起返回。')
    expect(publicJsonSchemaDoc).toContain('成功时，`data.platformSummary` 会把恢复目标所属平台的 explainable 摘要一起返回。')
    expect(publicJsonSchemaDoc).toContain('"action": "use"')
    expect(publicJsonSchemaDoc).toContain('"action": "rollback"')
    expect(publicJsonSchemaDoc).toContain('"code": "CONFIRMATION_REQUIRED"')
    expect(publicJsonSchemaDoc).toContain('"code": "ROLLBACK_SCOPE_MISMATCH"')
    expect(publicJsonSchemaDoc).toContain('`use --dry-run --json` 与 `import apply --dry-run --json` 保持同一 execution contract')
  })

  it('schema 文档 validate/export contract 完整保留', () => {
    expect(publicJsonSchemaDoc).toContain('### validate --json')
    expect(publicJsonSchemaDoc).toContain('### export --json')
    expect(publicJsonSchemaDoc).toContain('ValidateExportPlatformStat')
    expect(publicJsonSchemaDoc).toContain('`summary.referenceStats` 则补充当前校验批次里 reference / inline / write unsupported 的治理摘要')
    expect(publicJsonSchemaDoc).toContain('<redacted:inline-secret>')
  })

  it('schema 文档 consumer profiles / starter templates / recipes 系统完整保留', () => {
    expect(publicJsonSchemaDoc).toContain('`consumerProfiles`：这一整类 action 共享什么消费形状。')
    expect(publicJsonSchemaDoc).toContain('`readonly-state-audit` 统一 `current / list / validate / export` 这条只读状态审计面')
    expect(publicJsonSchemaDoc).toContain('`readonly-import-batch` 统一 `import / import preview` 这条只读批量导入分析面')
    expect(publicJsonSchemaDoc).toContain('`starterTemplate`：只读画像的最小机器消费模板')
    expect(publicJsonSchemaDoc).toContain('`starterRecipes`：画像级最小命令跳转 recipe')
    expect(publicJsonSchemaDoc).toContain('`bestEntryAction`：第一次接入这类画像时优先参考哪个 action。')
    expect(publicJsonSchemaDoc).toContain('`defaultConsumerActionId / defaultCommandExample / defaultCommandPurpose`')
    expect(publicJsonSchemaDoc).toContain('`summarySectionGuidance`：这一类画像里的 summary section 适合拿来做 overview、governance、gating 还是 routing。')
    expect(publicJsonSchemaDoc).toContain('`triageBuckets`：把 summary 和 item explainable 进一步归成稳定分流桶')
    expect(publicJsonSchemaDoc).toContain('`consumerActions`：把 `summarySections / triageBuckets / followUpHints` 收口成可直接消费的动作目录')
    expect(publicJsonSchemaDoc).toContain('`recommendedActions`：公开全局稳定动作词表')
  })

  it('schema 文档 failure recovery template / text entry 系统完整保留', () => {
    expect(publicJsonSchemaDoc).toContain('`failureTextActions[]`：把某个非 JSON 文本入口继续映射到稳定恢复动作分组')
    expect(publicJsonSchemaDoc).toContain('同一个 `textEntryPoint` 可以合法出现多条记录')
    expect(publicJsonSchemaDoc).toContain('`successTextEntries[]`')
    expect(publicJsonSchemaDoc).toContain('const failureTemplate = {')
    expect(publicJsonSchemaDoc).toContain('byTextEntryPoint: new Map<string, string[]>()')
    expect(publicJsonSchemaDoc).toContain('`failureCodes[].textEntryPoint` 找')
    expect(publicJsonSchemaDoc).toContain('fieldPresence')
    expect(publicJsonSchemaDoc).toContain('fieldSources')
    expect(publicJsonSchemaDoc).toContain('fieldStability')
    expect(publicJsonSchemaDoc).toContain('readOrderGroups')
    expect(publicJsonSchemaDoc).toContain('`stable`')
    expect(publicJsonSchemaDoc).toContain('`bounded`')
    expect(publicJsonSchemaDoc).toContain('`expandable`')
    expect(publicJsonSchemaDoc).toContain('`always` / `conditional`')
    expect(publicJsonSchemaDoc).toContain('`error.code`，再读 `error.details.referenceGovernance.primaryReason/reasonCodes`')
    expect(publicJsonSchemaDoc).toContain('再按需展开 `error.details.referenceGovernance.referenceDetails[]`')
  })

  it('schema 文档 version / schemaId 与源码常量及 machine-readable schema 一致', () => {
    expect(machineReadableSchema.properties?.schemaVersion?.const).toBe(PUBLIC_JSON_SCHEMA_VERSION)
    expect(publicJsonSchemaDoc).toContain(`schemaVersion: '${PUBLIC_JSON_SCHEMA_VERSION}'`)
    expect(publicJsonSchemaDoc).toContain(`schemaId: '${machineReadableSchema.$id}'`)
  })

  it('schema 文档 catalog-summary 样例完整保留', () => {
    expect(publicJsonSchemaDoc).toContain('`schema --json --catalog-summary` 是 schema catalog 的轻量目录模式')
    expect(publicJsonSchemaDoc).toContain('`data.catalogSummary`')
    expect(publicJsonSchemaDoc).toContain('"catalogSummary": {')
    expect(publicJsonSchemaDoc).toContain('"consumerProfiles": 3')
    expect(publicJsonSchemaDoc).toContain('"recommendedActions": 15')
    expect(publicJsonSchemaDoc).toContain('"id": "readonly-state-audit"')
    expect(publicJsonSchemaDoc).toContain('"bestEntryAction": "current"')
    expect(publicJsonSchemaDoc).toContain('"recommendedEntryMode": "starter-template"')
    expect(publicJsonSchemaDoc).toContain('"starterTemplateId": "readonly-state-audit-minimal-reader"')
  })

  // --- CHANGELOG 一致性 ---

  it('CHANGELOG 首版能力摘要包含全部命令', () => {
    expect(changelog).toContain('`add / list / current / validate / preview / use / rollback / export / schema`')
  })

  it('CHANGELOG 记录 release smoke 护栏能力', () => {
    expect(changelog).toContain('`smoke:release` 现在会校验 `dist` 构建产物的顶层 `--help` 关键命令面')
    expect(changelog).toContain('`schema --schema-version --json` 成功态 contract')
    expect(changelog).toContain('未知命令保持 Commander `stderr` 失败行为')
    expect(changelog).toContain('`import <missing-file> --json` 返回 `schemaVersion / ok=false / action / error.code`')
  })

  it('CHANGELOG reference governance 记录完整', () => {
    expect(changelog).toContain('`preview / use` 第一阶段已消费 `env://VAR_NAME` secret reference')
    expect(changelog).toContain('`import apply` 当前支持 Gemini / Codex / Claude。')
    expect(changelog).toContain('一次仅支持应用单个 imported profile')
    expect(changelog).toContain('Codex 不支持 `--scope`')
  })

  // --- release checklist 一致性 ---

  it('release checklist 保留 smoke:release 发布前入口', () => {
    expect(releaseChecklist).toContain('corepack pnpm smoke:release')
    expect(releaseChecklist).toContain('发布前一键 smoke 入口')
    expect(releaseChecklist).toContain('CLI help / schema --json')
    expect(releaseChecklist).toContain('schema --schema-version --json')
    expect(releaseChecklist).toContain('schema --json --consumer-profile readonly-import-batch')
    expect(releaseChecklist).toContain('schema --json --action import-apply')
    expect(releaseChecklist).toContain('schema --json --recommended-action continue-to-write')
    expect(releaseChecklist).toContain('schema --json --catalog-summary')
    expect(releaseChecklist).toContain('`dist` 构建产物')
    expect(releaseChecklist).toContain('可发现性')
    expect(releaseChecklist).toContain('顶层 `--help` 仍保留关键命令面')
    expect(releaseChecklist).toContain('preview / use / rollback / current / list / validate / export / add / schema / import')
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
})