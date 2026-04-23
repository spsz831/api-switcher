# Public JSON Output Schema

本文档描述 `api-switcher --json` 输出中当前承诺稳定的公共字段。未列出的 adapter 内部细节仍可能随平台契约细化而扩展。

机器可读 JSON Schema 位于 [`docs/public-json-output.schema.json`](public-json-output.schema.json)。该 schema 只冻结公共 envelope、scope capability、scope policy 与命令级公共字段，不冻结 adapter 内部扩展对象。

CLI 也可以直接输出当前契约：

```bash
api-switcher schema --json
api-switcher schema --schema-version --json
api-switcher schema --json --consumer-profile readonly-import-batch
api-switcher schema --json --action import-apply
api-switcher schema --json --recommended-action continue-to-write
api-switcher schema --json --catalog-summary
```

## 文档分工

为避免 README 与 schema 文档长期双写漂移，当前约定如下：

- [`README.md`](../README.md) 负责 onboarding 和可直接复制的 JSON 示例，尤其是成功态、失败态、高风险确认态。
- 本文档负责稳定公共类型、字段语义、命令级 contract 边界，以及哪些字段属于“冻结公共契约”。
- 如果两者出现不一致，以机器可读 schema [`docs/public-json-output.schema.json`](public-json-output.schema.json) 和本文档的类型定义为准；README 示例应回补到与 schema 一致。

## Envelope

所有 `--json` 命令返回统一 envelope：

```ts
type CommandResult<T> = {
  schemaVersion: '2026-04-15.public-json.v1'
  ok: boolean
  action: string
  data?: T
  warnings?: string[]
  limitations?: string[]
  error?: {
    code: string
    message: string
    details?: unknown
  }
}
```

约定：

- `ok=true` 时，命令主体在 `data`。
- `ok=false` 时，失败信息在 `error`。
- `warnings` 与 `limitations` 是顶层 explainable 摘要，适合 CLI/UI 直接展示。

## ScopeCapability

`preview/use/rollback` 会在支持 scope policy 的平台上输出 `scopeCapabilities`。Codex 当前没有 scoped target，因此该数组为空或不存在。

```ts
type ScopeCapability = {
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
```

字段语义：

- `detect`: 该 scope 是否参与 `current` 检测。
- `preview`: 该 scope 是否参与 `preview` effective config 推导。
- `use`: 该 scope 是否允许作为 `use --scope <scope>` 的写入目标。
- `rollback`: 该 scope 是否允许作为 `rollback --scope <scope>` 的回滚目标。
- `writable`: 该 scope 是否对应可写目标文件。
- `risk`: 该 scope 的风险等级。`high` 表示写入影响范围更高或 precedence 更强。
- `confirmationRequired`: 为 `true` 时，`use` 必须显式确认，例如传入 `--force`。
- `note`: 面向人的说明，用于解释 detection-only 或高风险原因。

## ScopeAvailability

`current/list/export` 会输出平台当前探测到的作用域可用性；Gemini 在 `preview/use/rollback` 涉及 `project scope` 时，也会输出同一组结构化信息，用于区分“平台支持 project scope”与“当前机器/项目上 project scope 现在是否真的可解析、可写”。

```ts
type ScopeAvailability = {
  scope: string
  status: 'available' | 'unresolved' | 'blocked'
  detected: boolean
  writable: boolean
  path?: string
  reasonCode?: string
  reason?: string
  remediation?: string
}
```

字段语义：

- `status`: 当前 scope 的实时可用状态。`available` 表示可解析且可用；`unresolved` 表示目标路径或 project root 当前无法解析；`blocked` 预留给未来更明确的阻塞场景。
- `detected`: 当前运行环境是否识别到了该 scope。
- `writable`: 当前 scope 在当前环境下是否可写。
- `path`: 当前解析到的真实目标文件路径。
- `reasonCode` / `reason` / `remediation`: 不可用时的结构化原因、面向人的错误说明与修复建议。

约定：

- `scopeCapabilities` 回答“平台理论上支持什么”。
- `scopeAvailability` 回答“这次命令所在环境里，这个 scope 现在到底能不能用”。
- 对 Gemini `project` 来说，即使 `scopeCapabilities.project.use=true`，`scopeAvailability.project.status` 仍可能是 `unresolved`，此时 `preview/use/rollback --scope project` 会直接失败，而不是继续进入确认门槛或回滚逻辑。
- 对 Gemini `project` 的 availability 失败，顶层错误码当前仍可能保持 action 级通用失败码，例如 `PREVIEW_FAILED`、`USE_FAILED`、`ROLLBACK_FAILED`；机器消费方应以 `error.details.scopeAvailability` 中的 `project.status`、`reasonCode`、`reason`、`remediation` 作为稳定判定依据。

## Gemini Scope Matrix

Gemini 当前输出四层 scope：

| Scope | Detect/current | Preview/effective | Use/write | Rollback | Risk |
| --- | --- | --- | --- | --- | --- |
| `system-defaults` | yes | yes | no | no | normal |
| `user` | yes | yes | yes | yes | normal |
| `project` | yes | yes | yes | yes | high, requires `--force` |
| `system-overrides` | yes | yes | no | no | normal |

约定：

- `system-defaults` 和 `system-overrides` 是 detection-only scope，只参与 effective config 推导，不允许写入或回滚。
- `project` 是显式 opt-in 写入目标，`use --scope project` 没有 `--force` 时会返回 `CONFIRMATION_REQUIRED`。
- Gemini rollback 要求快照 scope 与请求 scope 匹配，不匹配时返回 `ROLLBACK_SCOPE_MISMATCH`。

## Claude Scope Matrix

Claude 当前输出三层可写 scope：

| Scope | Detect/current | Preview/effective | Use/write | Rollback | Risk |
| --- | --- | --- | --- | --- | --- |
| `user` | yes | yes | yes | yes | normal |
| `project` | yes | yes | yes | yes | normal |
| `local` | yes | yes | yes | yes | normal |

约定：

- CLI `--scope` 优先级高于环境变量默认值。
- `API_SWITCHER_CLAUDE_TARGET_SCOPE` 只提供默认目标。
- Claude rollback 当前不强制 scope mismatch 拒绝。

## ScopePolicy

`use` 确认失败、`rollback` 成功或 scope mismatch 失败时，可能输出 `scopePolicy`。

```ts
type SnapshotScopePolicy = {
  requestedScope?: string
  resolvedScope?: string
  defaultScope?: string
  explicitScope: boolean
  highRisk: boolean
  riskWarning?: string
  rollbackScopeMatchRequired: boolean
}
```

字段语义：

- `requestedScope`: 用户通过 CLI 显式请求的 scope。
- `resolvedScope`: adapter 实际解析后的目标 scope。
- `defaultScope`: 平台默认写入 scope。
- `explicitScope`: 是否显式传入 `--scope`。
- `highRisk`: 目标 scope 是否属于高风险。
- `riskWarning`: 高风险或切换写入目标时的解释。
- `rollbackScopeMatchRequired`: 回滚时是否必须匹配快照记录的 scope。

## PlatformExplainableSummary

`current/list/validate/export/import preview/import apply` 会输出 `platformSummary`，用于给机器消费者提供与文本摘要等价的结构化平台语义。它不是 adapter 私有详情，而是稳定公共 contract。

```ts
type PlatformExplainableSummary = {
  kind: 'scope-precedence' | 'multi-file-composition'
  facts: Array<{
    code: string
    message: string
  }>
  precedence?: string[]
  currentScope?: string
  composedFiles?: string[]
}
```

字段语义：

- `kind='scope-precedence'`: 平台存在 scope precedence，消费者应按 `precedence` 理解同名字段覆盖关系。
- `kind='multi-file-composition'`: 平台有效配置由多个文件共同组成，消费者不应把单个文件当完整状态。
- `facts[].code`: 稳定机器码，适合 UI 映射本地化文案或聚合统计。
- `facts[].message`: 面向人的默认说明。
- `precedence`: 从低到高的生效优先级。
- `currentScope`: 当前检测到的生效 scope；如果该命令没有本地检测结果，则可能不存在。
- `composedFiles`: 多文件平台当前观测到的组成文件；在 `list` 中如果没有对应 detection，可能为空数组。

当前稳定机器码：

| Code | 出现位置 | 语义 |
| --- | --- | --- |
| `GEMINI_SCOPE_PRECEDENCE` | Gemini `current/list` | Gemini 按 `system-defaults < user < project < system-overrides` 四层 precedence 推导最终生效值。 |
| `GEMINI_PROJECT_OVERRIDES_USER` | Gemini `current/list` | Gemini `project` scope 会覆盖 `user` 中的同名字段。 |
| `CLAUDE_SCOPE_PRECEDENCE` | Claude `current/list` | Claude 按 `user < project < local` 三层 precedence 推导最终生效值。 |
| `CLAUDE_LOCAL_SCOPE_HIGHEST` | Claude `current/list` | Claude `local` scope 高于 `project` 与 `user`。 |
| `CODEX_MULTI_FILE_CONFIGURATION` | Codex `current/list` | Codex 当前由 `config.toml` 与 `auth.json` 共同组成有效配置。 |
| `CODEX_CURRENT_REQUIRES_BOTH_FILES` | Codex `current` | Codex `current` 检测不能把单个文件视为完整状态。 |
| `CODEX_LIST_IS_PROFILE_LEVEL` | Codex `list` | Codex `list` 仅展示 profile 级状态，不表示单文件可独立切换。 |

## Common Explainable Fields

下面这组字段是 `current / list / validate / export` 共同复用的 explainable 公共层。它们服务于 UI、脚本和外部调用方，不应被理解成某个 adapter 的临时私有返回。

### `platformSummary`

- 作用：表达平台级 precedence 或多文件组合语义。
- 稳定性：稳定公共 contract。
- 出现位置：
  - `current.detections[]`
  - `list.profiles[]`
  - `validate.items[]`
  - `export.profiles[]`
- 说明：`current` 可能带 `currentScope`；`list`/`validate`/`export` 更偏 profile 级摘要，不保证存在实时检测态。

### `scopeCapabilities`

- 作用：表达平台支持哪些 scope，以及每个 scope 是否可 `detect / preview / use / rollback / write`，是否高风险、是否需要确认。
- 稳定性：稳定公共 contract。
- 出现位置：
  - `current.detections[]`
  - `list.profiles[]`
  - `validate.items[]`
  - `export.profiles[]`
- 说明：这是平台能力矩阵，不等同于当前机器是否真的可写入某个 scope；后者由 `scopeAvailability` 表达。

### `scopeAvailability`

- 作用：表达当前运行环境里某个 scope 是否被探测到、是否可写，以及关联路径。
- 稳定性：环境观察型公共 contract。
- 出现位置：
  - `current.detections[]`
  - `list.profiles[]`
  - `export.profiles[]`
- 说明：它是“当前机器观察结果”，不是可迁移真相。`validate` 不做本地环境探测，因此不返回这个字段。

### `defaultWriteScope`

- 作用：表达平台在未显式指定目标 scope 时的默认写入层。
- 稳定性：稳定公共 contract。
- 出现位置：
  - `export.profiles[]`
- 说明：当前主要用于把导出时的平台写入默认值暴露给迁移工具或外部 UI。

### `observedAt`

- 作用：表达 `scopeAvailability` 是在什么时间点观测到的。
- 稳定性：环境观察型公共 contract。
- 出现位置：
  - `export.profiles[]`
- 说明：必须与 `scopeAvailability` 一起理解；它只代表导出机当时的观察时间，不代表导入机或未来执行时的可用性真相。

### Field Presence Matrix

| Field | `current` | `list` | `validate` | `export` | `import preview` | `import apply` | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `platformSummary` | yes | yes | yes | yes | yes | yes | 平台 explainable 摘要主入口 |
| `scopeCapabilities` | yes | yes | yes | yes | via observation | yes | 平台能力矩阵 |
| `scopeAvailability` | yes | yes | no | yes | via observation | conditional | 当前机器环境观察或 observation |
| `defaultWriteScope` | no | no | no | yes | via observation | no | 导出或导入观察里的默认写入目标 |
| `observedAt` | no | no | no | yes | via observation | no | 导出或导入观察里的观测时间 |

## Cross-Command Alignment

这组对齐规则用于约束 `current / list / validate / export / import preview / import apply` 之间的公共 contract 边界，避免后续新功能继续把稳定字段和 adapter 私有字段混在一起。

### Stable Shared Fields

以下字段已经形成跨命令的稳定公共 contract。新增命令如果复用这些语义，应优先沿用同名字段，而不是重新发明近义字段：

| Field | 当前命令面 | 语义 |
| --- | --- | --- |
| `platformSummary` | `current` / `list` / `validate` / `export` / `import preview` / `import apply` | 平台级 precedence 或多文件组合摘要 |
| `scopeCapabilities` | `current` / `list` / `validate` / `export` / `import preview` / `import apply` | 平台理论能力矩阵 |
| `scopeAvailability` | `current` / `list` / `export` / `import preview` / `import apply` | 当前环境或 observation 中的 scope 可用性 |
| `defaultWriteScope` | `export` / `import preview` | 默认写入目标 |
| `observedAt` | `export` / `import preview` | 观测时间戳，必须按 observation 语义理解 |

### Stable Import-Only Fields

以下字段当前是 `import preview / import apply` 这一条产品线上的稳定公共 contract。它们不是四个只读命令的公共字段，但在 import 线内应保持命名和语义一致：

| Field | 当前命令面 | 语义 |
| --- | --- | --- |
| `exportedObservation` | `import preview` / `import apply` failure details | 导出文件里的历史观察 |
| `localObservation` | `import preview` / `import apply` failure details | 当前本地重新解析后的实时观察 |
| `fidelity` | `import preview` / `import apply` failure details | 导出观察与本地观察的结构化对比 |
| `previewDecision` | `import preview` / `import apply` failure details | 是否允许继续进入 apply 设计，以及原因码 |
| `sourceCompatibility` | `import preview` | 导入源是否为严格 schema 模式 |

### Action-Specific Stable Fields

以下字段属于动作专属 contract，可以稳定消费，但不应被误解成所有命令都该统一复用：

| Field | 当前命令面 | 语义 |
| --- | --- | --- |
| `currentScope` | `current`，部分 `list` / `platformSummary` | 当前检测到的生效 scope |
| `scopePolicy` | `preview` / `use` / `rollback` / `import apply` | 目标 scope 的请求值、解析值、风险和回滚约束 |
| `preview` | `add` / `use` / `import apply` | 本次写入前预估结果 |
| `risk` | `add` / `use` / `import apply` | 当前动作风险结论 |
| `backupId` | `use` / `rollback` / `import apply` | 快照或恢复链路标识 |

### Adapter-Private Or Expandable Fields

以下字段当前允许按 adapter 或动作扩展，不应在外部接入里被当成统一 contract 主入口：

- `details`
- `effectiveConfig`
- `managedBoundaries`
- `targetFiles`
- `changedFiles`
- 文本摘要、highlight、message 类字段之外未在本文件明确列为稳定 code/enum 的自由扩展内容

约束：

- 机器消费方应优先读取本节和前文已列明的稳定字段，不应先依赖 adapter 私有 `details` 推断主语义。
- 如果顶层 `error.code` 仍保留 action 级通用失败码，应继续读取稳定的 `error.details.scopeAvailability`、`previewDecision`、`fidelity` 等结构化字段判定真实失败原因。
- 后续若有新命令复用“导出观察 vs 本地观察”的语义，应继续沿用 `exportedObservation` / `localObservation` / `fidelity`，不要再引入新的近义命名。

## Command-Specific Contracts

### schema --json

完整 schema 输出会返回当前契约版本、schema ID 和机器可读 JSON Schema：

`schema --json --consumer-profile <id>` 是同一份 schema catalog 的轻量过滤入口。它只过滤 `commandCatalog.consumerProfiles[]`，不会裁剪 `commandCatalog.actions[]` 或 `schema`，适合只接入 `readonly-state-audit`、`readonly-import-batch` 或 `single-platform-write` 其中一类产品面。未知 id 返回 `SCHEMA_CONSUMER_PROFILE_NOT_FOUND`。

`schema --json --action <action>` 是对称的命令级轻量过滤入口。它只过滤 `commandCatalog.actions[]`，不会裁剪 `commandCatalog.consumerProfiles[]` 或 `schema`，适合只接入 `current`、`import-apply` 等单个命令的调用方。未知 action 返回 `SCHEMA_ACTION_NOT_FOUND`。

`schema --json --recommended-action <code>` 是稳定动作词表的轻量直取入口。它只过滤 `commandCatalog.recommendedActions[]`，不会裁剪 `commandCatalog.actions[]`、`commandCatalog.consumerProfiles[]` 或 `schema`，适合只接入 `continue-to-write`、`fix-input-and-retry` 这类动作短码目录。未知 code 返回 `SCHEMA_RECOMMENDED_ACTION_NOT_FOUND`。

`schema --json --catalog-summary` 是 schema catalog 的轻量目录模式。它直接返回 `data.catalogSummary`，只暴露 `consumerProfiles / actions / recommendedActions` 的稳定摘要和计数，不再展开完整 `commandCatalog`、`schemaId` 或 `schema`，适合只想先发现入口、还不需要下载整份 catalog 的调用方。`consumerProfiles[]` 还会额外公开 `hasStarterTemplate`、`starterTemplateId` 与 `recommendedEntryMode`，让调用方在不下载完整 `commandCatalog.consumerProfiles[]` 的前提下，先判断某条画像是否已经提供最小机器消费模板，以及下一步更推荐走 `starter-template` 还是完整 `consumerProfile`。

推荐的最小发现顺序可以固定为：先读取 `catalogSummary` 判断该走哪类画像、命令或推荐动作；如果需要字段级 contract，再切到完整 `schema --json`；如果只需要某一小块 catalog，则继续走 `--consumer-profile`、`--action` 或 `--recommended-action` 这三条过滤入口。

`schema --json --catalog-summary` 的最小成功样例：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "schema",
  "data": {
    "schemaVersion": "2026-04-15.public-json.v1",
    "catalogSummary": {
      "counts": {
        "consumerProfiles": 3,
        "actions": 11,
        "recommendedActions": 15
      },
      "consumerProfiles": [
        {
          "id": "readonly-state-audit",
          "bestEntryAction": "current",
          "recommendedEntryMode": "starter-template",
          "hasStarterTemplate": true,
          "starterTemplateId": "readonly-state-audit-minimal-reader"
        },
        {
          "id": "single-platform-write",
          "bestEntryAction": "preview",
          "recommendedEntryMode": "full-consumer-profile"
        },
        {
          "id": "readonly-import-batch",
          "bestEntryAction": "import",
          "recommendedEntryMode": "starter-template",
          "hasStarterTemplate": true,
          "starterTemplateId": "readonly-import-batch-minimal-reader"
        }
      ],
      "actions": [
        { "action": "add" },
        { "action": "current" },
        { "action": "export" }
      ],
      "recommendedActions": [
        { "code": "inspect-items", "family": "inspect" },
        { "code": "continue-to-write", "family": "execute" },
        { "code": "migrate-inline-secret", "family": "repair" }
      ]
    }
  }
}
```

文本模式下，`schema --catalog-summary` 会使用同一份 `catalogSummary.consumerProfiles[]` 输出推荐入口提示，避免非 JSON 调用方还要先读完整文档才能知道下一步该直取 `starterTemplate` 还是完整 `consumerProfile`：

```text
Catalog Summary:
  - consumerProfiles=3, actions=11, recommendedActions=15
  - 推荐画像入口:
    - readonly-state-audit: entry=current, recommended=starter-template, starterTemplate=readonly-state-audit-minimal-reader, next=api-switcher schema --json --consumer-profile readonly-state-audit
    - single-platform-write: entry=preview, recommended=full-consumer-profile, next=api-switcher schema --json --consumer-profile single-platform-write
    - readonly-import-batch: entry=import, recommended=starter-template, starterTemplate=readonly-import-batch-minimal-reader, next=api-switcher schema --json --consumer-profile readonly-import-batch
```

```ts
type SchemaCommandOutput = {
  schemaVersion: '2026-04-15.public-json.v1'
  schemaId: 'https://api-switcher.local/schemas/public-json-output.schema.json'
  catalogSummary?: {
    counts: {
      consumerProfiles: number
      actions: number
      recommendedActions: number
    }
    consumerProfiles: Array<{
      id: 'single-platform-write' | 'readonly-import-batch' | 'readonly-state-audit'
      bestEntryAction: 'add' | 'preview' | 'use' | 'rollback' | 'current' | 'list' | 'validate' | 'export' | 'import' | 'import-apply'
      hasStarterTemplate?: boolean
      starterTemplateId?: 'readonly-state-audit-minimal-reader' | 'readonly-import-batch-minimal-reader'
      recommendedEntryMode?: 'starter-template' | 'full-consumer-profile'
    }>
    actions: Array<{
      action: 'add' | 'current' | 'export' | 'import' | 'import-apply' | 'list' | 'preview' | 'rollback' | 'schema' | 'use' | 'validate'
    }>
    recommendedActions: Array<{
      code:
        | 'inspect-items'
        | 'review-reference-details'
        | 'repair-source-input'
        | 'group-by-platform'
        | 'continue-to-write'
        | 'fix-input-and-retry'
        | 'select-existing-resource'
        | 'resolve-scope-before-retry'
        | 'confirm-before-write'
        | 'check-platform-support'
        | 'inspect-runtime-details'
        | 'check-import-source'
        | 'fix-reference-input'
        | 'resolve-reference-support'
        | 'migrate-inline-secret'
      family: 'inspect' | 'repair' | 'route' | 'execute'
    }>
  }
  commandCatalog?: {
    recommendedActions?: Array<{
      code:
        | 'inspect-items'
        | 'review-reference-details'
        | 'repair-source-input'
        | 'group-by-platform'
        | 'continue-to-write'
        | 'fix-input-and-retry'
        | 'select-existing-resource'
        | 'resolve-scope-before-retry'
        | 'confirm-before-write'
        | 'check-platform-support'
        | 'inspect-runtime-details'
        | 'check-import-source'
        | 'fix-reference-input'
        | 'resolve-reference-support'
        | 'migrate-inline-secret'
      title: string
      family: 'inspect' | 'repair' | 'route' | 'execute'
      availability: Array<'readonly' | 'failure'>
      purpose: string
    }>
    consumerProfiles?: Array<{
      id: 'single-platform-write' | 'readonly-import-batch' | 'readonly-state-audit'
      title: string
      appliesToActions: Array<'add' | 'preview' | 'use' | 'rollback' | 'current' | 'list' | 'validate' | 'export' | 'import' | 'import-apply'>
      exampleActions: Array<'add' | 'preview' | 'use' | 'rollback' | 'current' | 'list' | 'validate' | 'export' | 'import' | 'import-apply'>
      bestEntryAction: 'add' | 'preview' | 'use' | 'rollback' | 'current' | 'list' | 'validate' | 'export' | 'import' | 'import-apply'
      sharedSummaryFields: string[]
      sharedItemFields: string[]
      sharedFailureFields: string[]
      optionalScopeFields: string[]
      optionalItemFields: string[]
      optionalFailureFields: string[]
      optionalArtifactFields: string[]
      recommendedStages: Array<'summary' | 'selection' | 'items' | 'detail' | 'artifacts'>
      summarySectionGuidance?: Array<{
        id: 'platform' | 'reference' | 'executability' | 'source-executability'
        title: string
        priority: number
        fields: string[]
        purpose: string
        recommendedUses: Array<'overview' | 'governance' | 'gating' | 'routing'>
      }>
      followUpHints?: Array<{
        use: 'overview' | 'governance' | 'gating' | 'routing'
        nextStep: 'inspect-items' | 'review-reference-details' | 'repair-source-input' | 'group-by-platform' | 'continue-to-write'
        primaryFields: string[]
        purpose: string
      }>
      triageBuckets?: Array<{
        id: 'overview' | 'reference-governance' | 'write-readiness' | 'source-blocked' | 'platform-routing'
        title: string
        summaryFields: string[]
        itemFields?: string[]
        purpose: string
        recommendedNextStep: 'inspect-items' | 'review-reference-details' | 'repair-source-input' | 'group-by-platform' | 'continue-to-write'
      }>
      consumerActions?: Array<{
        id: string
        title: string
        priority: number
        use: 'overview' | 'governance' | 'gating' | 'routing'
        appliesWhen: string
        triggerFields: string[]
        summarySectionIds: Array<'platform' | 'reference' | 'executability' | 'source-executability'>
        triageBucketIds?: Array<'overview' | 'reference-governance' | 'write-readiness' | 'source-blocked' | 'platform-routing'>
        nextStep: 'inspect-items' | 'review-reference-details' | 'repair-source-input' | 'group-by-platform' | 'continue-to-write'
        primaryFields: string[]
        purpose: string
      }>
      defaultConsumerFlowId?: string
      consumerFlow?: Array<{
        id: string
        title: string
        priority: number
        defaultEntry: boolean
        defaultOnBucket: boolean
        selectionReason: string
        summarySectionIds: Array<'platform' | 'reference' | 'executability' | 'source-executability'>
        triageBucketIds?: Array<'overview' | 'reference-governance' | 'write-readiness' | 'source-blocked' | 'platform-routing'>
        readFields: string[]
        consumerActionId: string
        nextStep: 'inspect-items' | 'review-reference-details' | 'repair-source-input' | 'group-by-platform' | 'continue-to-write'
        purpose: string
      }>
    }>
    actions: Array<{
      action: 'add' | 'current' | 'export' | 'import' | 'import-apply' | 'list' | 'preview' | 'rollback' | 'schema' | 'use' | 'validate'
      hasPlatformSummary: boolean
      hasPlatformStats: boolean
      hasScopeCapabilities: boolean
      hasScopeAvailability: boolean
      hasScopePolicy: boolean
      consumerProfileIds?: Array<'single-platform-write' | 'readonly-import-batch' | 'readonly-state-audit'>
      primaryFields: string[]
      primaryErrorFields: string[]
      failureCodes: Array<{
        code: string
        priority: number
        category: 'input' | 'state' | 'scope' | 'confirmation' | 'platform' | 'runtime' | 'source'
        recommendedHandling:
          | 'fix-input-and-retry'
          | 'select-existing-resource'
          | 'resolve-scope-before-retry'
          | 'confirm-before-write'
          | 'check-platform-support'
          | 'inspect-runtime-details'
          | 'check-import-source'
      }>
      fieldPresence: Array<{
        path: string
        channel: 'success' | 'failure'
        presence: 'always' | 'conditional'
        conditionCode?: string
      }>
      fieldSources: Array<{
        path: string
        channel: 'success' | 'failure'
        source:
          | 'command-service'
          | 'platform-adapter'
          | 'schema-service'
          | 'write-pipeline'
          | 'import-analysis'
          | 'error-envelope'
      }>
      fieldStability: Array<{
        path: string
        channel: 'success' | 'failure'
        stabilityTier: 'stable' | 'bounded' | 'expandable'
      }>
      readOrderGroups: {
        success: Array<{
          stage: 'summary' | 'selection' | 'items' | 'detail' | 'artifacts'
          fields: string[]
          purpose?: string
        }>
        failure: Array<{
          stage: 'error-core' | 'error-details' | 'error-recovery'
          fields: string[]
          purpose?: string
        }>
      }
      summarySections?: Array<{
        id: 'platform' | 'reference' | 'executability' | 'source-executability'
        title: string
        priority: number
        fields: string[]
        purpose: string
        recommendedWhen?: string[]
      }>
      primaryFieldSemantics: Array<{ path: string; semantic: string }>
      primaryErrorFieldSemantics: Array<{ path: string; semantic: string }>
      referenceGovernanceCodes?: Array<{
        code: 'REFERENCE_INPUT_CONFLICT' | 'REFERENCE_MISSING' | 'REFERENCE_WRITE_UNSUPPORTED' | 'INLINE_SECRET_PRESENT'
        priority: number
        category: 'reference' | 'inline-secret' | 'input'
        recommendedHandling:
          | 'inspect-items'
          | 'review-reference-details'
          | 'repair-source-input'
          | 'group-by-platform'
          | 'continue-to-write'
          | 'fix-input-and-retry'
          | 'select-existing-resource'
          | 'resolve-scope-before-retry'
          | 'confirm-before-write'
          | 'check-platform-support'
          | 'inspect-runtime-details'
          | 'check-import-source'
          | 'fix-reference-input'
          | 'resolve-reference-support'
          | 'migrate-inline-secret'
      }>
    }>
  }
  schema: Record<string, unknown>
}
```

`commandCatalog.actions[]` 是 `schema --json` 的稳定命令级能力索引，适合接入方先判断某个 action 是否会输出 `platformSummary`、`summary.platformStats`、`summary.referenceStats`、`summary.executabilityStats`、`summary.triageStats`、`scopeCapabilities`、`scopeAvailability`、`scopePolicy`。其中 `primaryFields` 表示 success payload 的机器消费优先顺序，`primaryErrorFields` 表示 action 级失败 envelope 的优先读取顺序，均使用点路径表达；`readOrderGroups` 把 success / failure 两侧的推荐阅读阶段结构化；`summarySections` 则专门把 summary 这一层内部再拆成稳定 section 导航，避免外部调用方从自然语言说明或测试里反推“先看哪一个 summary 字段”。`commandCatalog.consumerProfiles[]` 则补了一层共享消费画像，适合先识别“这是不是某类共同产品面”，再复用同一套读取骨架。当前已公开三条画像：`readonly-state-audit` 统一 `current / list / validate / export` 这条只读状态审计面；`readonly-import-batch` 统一 `import / import preview` 这条只读批量导入分析面；`single-platform-write` 统一 `add / preview / use / rollback / import-apply` 这条单平台写入面。现在每条画像还会额外公开 `sharedItemFields` / `optionalItemFields` 与 `sharedFailureFields` / `optionalFailureFields`，帮助调用方直接发现 item 级和 failure 级的优先字段与可选 explainable；只读画像还会额外公开 `starterTemplate`，把 `summary / items / failure / flow` 四层最小读取骨架直接作为稳定模板暴露出来，目前仅对 `readonly-state-audit` 和 `readonly-import-batch` 开放；`exampleActions` 与 `bestEntryAction` 则补了一层接入起点导航。建议固定分工如下：

- `primaryFields`：先读哪些字段。
- `readOrderGroups`：先读哪一层，再读哪一层。
- `summarySections`：summary 这一层内部，再先读哪一段。
- `consumerProfiles`：这一整类 action 共享什么消费形状。
- `sharedItemFields`：这一整类 action 的 item 级优先字段。
- `optionalItemFields`：不同 action 可能额外补充的 item 级 explainable。
- `sharedFailureFields`：这一整类 action 的失败态优先字段。
- `optionalFailureFields`：不同 action 可能额外补充的失败态 explainable。
- `starterTemplate`：只读画像的最小机器消费模板，直接告诉调用方 summary / item / failure / flow 四层先读哪些字段。
- `exampleActions`：这一类画像有哪些代表命令。
- `bestEntryAction`：第一次接入这类画像时优先参考哪个 action。
- `summarySectionGuidance`：这一类画像里的 summary section 适合拿来做 overview、governance、gating 还是 routing。
- `followUpHints`：看完 summary 之后，下一步更适合展开哪些字段，或者走哪种处理动作。
- `triageBuckets`：把 summary 和 item explainable 进一步归成稳定分流桶，便于 dashboard、告警或自动化流程直接按桶接入。
- `consumerActions`：把 `summarySections / triageBuckets / followUpHints` 收口成可直接消费的动作目录，回答“现在最适合执行什么消费动作、应读哪些 section/字段、下一步走什么短码”。
- `consumerActions[].appliesWhen / triggerFields`：补一层动作 discoverability，回答“什么情况下优先选这个动作”和“先看哪些稳定字段”。
- `consumerFlow`：把“命中哪段 summary / 哪个 triage bucket”稳定映射到“该读哪些字段、该选哪个动作卡片、下一步短码是什么”。
- `consumerFlow[].defaultEntry / defaultOnBucket`：补一层轻量 discoverability，回答“默认先从哪条 flow 开始”以及“命中当前 bucket 时优先走哪条 flow”。
- `consumerFlow[].selectionReason`：解释为什么推荐该 flow 作为默认入口或 bucket 命中后的优先路径，方便 UI/自动化直接展示原因。
- `defaultConsumerFlowId`：给只读画像补一层默认 flow 直取索引，调用方不必每次扫描 `consumerFlow[]` 再找 `defaultEntry: true`。
- `failureCodes[].appliesWhen / triggerFields`、`referenceGovernanceCodes[].appliesWhen / triggerFields`：补一层失败恢复 discoverability，回答“什么情况下优先按这个失败码处理”和“先看哪些稳定错误字段”。
- `recommendedActions`：公开全局稳定动作词表，让 `nextStep`、`recommendedNextStep` 和 `recommendedHandling` 都能落到同一套短码目录。

对只读命令本身，运行时 `summary.triageStats` 会把这些分流桶实例化成当前批次的真实计数；`consumerProfiles[].triageBuckets[]` 则是 schema catalog 里的稳定目录层，回答“有哪些桶、每个桶建议读哪些字段、下一步通常走什么动作”。

如果外部调用方想避免按 action 名字硬编码，可以先消费 `consumerProfiles[]`，用 `bestEntryAction` 找参考样例，再用 `sharedSummaryFields / sharedItemFields / sharedFailureFields` 构建稳定基础读取器，最后按 `optional*Fields` 做增量绑定。对于只读画像，还可以额外读取 `summarySectionGuidance[]`，直接知道哪一段 summary 更适合 overview、哪一段适合 governance 或 gating；再读取 `followUpHints[]`，直接知道 summary 看完之后下一步该展开哪些 detail 字段；如果需要更偏自动化的接入，再读取 `triageBuckets[]`，直接按稳定桶做分流；如果想直接拿一层已经拼好的动作目录，则直接读取 `consumerActions[]`。最小接入流程建议固定为：

1. 从 `data.commandCatalog.consumerProfiles[]` 里选中目标产品面，例如 `readonly-import-batch`。
2. 读取 `bestEntryAction`，先用这条 action 的成功/失败样例校准解析器。
3. 按 `sharedSummaryFields -> sharedItemFields -> sharedFailureFields` 建立默认读取顺序。
4. 仅在需要更细 explainable 时，再按 `optionalScopeFields / optionalItemFields / optionalFailureFields / optionalArtifactFields` 做条件绑定。

```ts
const profile = schema.data.commandCatalog.consumerProfiles.find(
  (item) => item.id === 'readonly-import-batch',
)

const readOrder = {
  entryAction: profile?.bestEntryAction,
  summary: profile?.sharedSummaryFields ?? [],
  items: profile?.sharedItemFields ?? [],
  failure: profile?.sharedFailureFields ?? [],
  optional: {
    scope: profile?.optionalScopeFields ?? [],
    item: profile?.optionalItemFields ?? [],
    failure: profile?.optionalFailureFields ?? [],
    artifacts: profile?.optionalArtifactFields ?? [],
  },
  summaryGuidance: profile?.summarySectionGuidance ?? [],
  followUps: profile?.followUpHints ?? [],
  triageBuckets: profile?.triageBuckets ?? [],
  consumerActions: profile?.consumerActions ?? [],
  defaultConsumerFlowId: profile?.defaultConsumerFlowId,
  consumerFlow: profile?.consumerFlow ?? [],
  recommendedActions: schema.data.commandCatalog.recommendedActions ?? [],
}
```

如果外部调用方只想拿“最小可用模板”，不想自己再拼 `sharedSummaryFields / sharedItemFields / sharedFailureFields / defaultConsumerFlowId`，可以直接消费 `starterTemplate`。当前稳定暴露的模板 id 包括 `readonly-state-audit-minimal-reader` 与 `readonly-import-batch-minimal-reader`：

```ts
const profile = schema.data.commandCatalog.consumerProfiles.find(
  (item) => item.id === 'readonly-import-batch',
)

const starterTemplate = profile?.starterTemplate

const minimalReader = {
  templateId: starterTemplate?.id ?? 'readonly-import-batch-minimal-reader',
  entryAction: profile?.bestEntryAction,
  summary: starterTemplate?.summary.fields ?? profile?.sharedSummaryFields ?? [],
  items: starterTemplate?.items.sharedFields ?? [],
  failure: starterTemplate?.failure.fields ?? [],
  defaultFlowId:
    starterTemplate?.flow.defaultConsumerFlowId ?? profile?.defaultConsumerFlowId,
}
```

如果外部调用方不想自己把 section、bucket 和 next step 再拼装一次，可以直接消费 `consumerActions[]`：

```ts
const actionCards = (profile?.consumerActions ?? []).map((action) => ({
  id: action.id,
  appliesWhen: action.appliesWhen,
  triggerFields: action.triggerFields,
  summarySections: action.summarySectionIds,
  triageBuckets: action.triageBucketIds ?? [],
  nextStep: action.nextStep,
  primaryFields: action.primaryFields,
}))
```

如果外部调用方希望直接拿到“该先看什么，再走什么动作”的稳定映射，而不是自己把 section、bucket 和 action 目录再 join 一遍，可以直接消费 `consumerFlow[]`。只读画像的最轻量入口是 `defaultConsumerFlowId -> consumerFlow[] -> consumerActions[] -> recommendedActions[]`，这条链路复用现有字段即可得到默认读取字段、动作卡片和稳定下一步短码：

```ts
const defaultFlow = (profile?.consumerFlow ?? []).find(
  (step) => step.id === profile?.defaultConsumerFlowId,
)
const defaultAction = (profile?.consumerActions ?? []).find(
  (action) => action.id === defaultFlow?.consumerActionId,
)
const defaultRecommendedAction = schema.data.commandCatalog.recommendedActions.find(
  (action) => action.code === defaultFlow?.nextStep,
)

const defaultReadonlyConsumerPath = {
  flowId: defaultFlow?.id,
  readFields: defaultFlow?.readFields ?? [],
  actionId: defaultAction?.id,
  nextStep: defaultRecommendedAction?.code ?? defaultFlow?.nextStep,
  nextStepFamily: defaultRecommendedAction?.family,
  reason: defaultFlow?.selectionReason,
}

const flowCards = (profile?.consumerFlow ?? []).map((step) => ({
  id: step.id,
  defaultEntry: step.defaultEntry,
  defaultOnBucket: step.defaultOnBucket,
  selectionReason: step.selectionReason,
  summarySections: step.summarySectionIds,
  triageBuckets: step.triageBucketIds ?? [],
  readFields: step.readFields,
  consumerActionId: step.consumerActionId,
  nextStep: step.nextStep,
}))
```

这条“只读 summary 导航”当前只覆盖五个只读命令：

| Action | 固定 `summarySections` 顺序 | 语义 |
| --- | --- | --- |
| `current` / `list` / `validate` / `export` | `platform -> reference -> executability` | 先看平台分布，再看 secret/reference 形态，最后看后续写入可执行性 |
| `import preview` | `source-executability -> executability -> platform` | 先看导入源能不能继续进入 apply，再看目标侧写入可执行性，最后看 mixed-batch 平台分布 |

`preview / use / rollback / import apply` 不在这条只读 `summarySections` contract 内；它们继续通过 `primaryFields` 与 `readOrderGroups` 暴露推荐消费顺序。换句话说，对 `current/list/validate/export`，`summary.referenceStats` 回答“这一批里有多少 reference / inline / write unsupported profile”，`summary.executabilityStats` 回答“这一批里有多少 inline-ready / reference-ready / reference-missing / write-unsupported / source-redacted profile”；对 `import preview`，`summary.sourceExecutability` 先回答“导入源本身还能不能继续进入 apply”，`summary.executabilityStats` 再回答“目标平台侧从 profile 形态看是否具备写入条件”，`summary.platformStats` 最后回答“这批结果分布到了哪些平台”。`referenceSummary` 回答“这一条为什么被归到该类，以及 resolver 目前看到的字段级状态”。失败态不要读取或等待 `summary.referenceStats`，治理类失败应先读取 `error.details.referenceGovernance.primaryReason/reasonCodes`，再按需展开 `error.details.referenceGovernance.referenceDetails[]`。`failureCodes` 进一步公开该 action 已稳定承诺的 `error.code` 列表，并给出推荐处理顺序 `priority`、失败类别 `category` 和建议动作 `recommendedHandling`；`referenceGovernanceCodes` 只在 `use` / `import-apply` 这类可能产生 secret/reference 治理失败的写入 action 上出现，公开稳定 `reasonCodes` 的推荐处理顺序，例如 `REFERENCE_INPUT_CONFLICT`、`REFERENCE_MISSING`、`REFERENCE_WRITE_UNSUPPORTED`、`INLINE_SECRET_PRESENT`；`fieldPresence` 进一步回答这些字段是 `always` 还是 `conditional` 出现，并通过 `conditionCode` 暴露稳定条件短码；`fieldSources` 进一步回答字段主要由谁产出，当前固定来源桶包括 `command-service`、`platform-adapter`、`schema-service`、`write-pipeline`、`import-analysis`、`error-envelope`；`fieldStability` 进一步回答字段适合被外部绑定到什么强度，`stable` 表示适合长期强绑定，`bounded` 表示语义稳定但依赖上下文或条件，`expandable` 表示可展示但不建议被锁死为长期强 contract，通常应与 `fieldPresence`、`fieldSources` 联合读取。success 侧固定沿 `summary` -> `selection` -> `items` -> `detail` -> `artifacts` 这条语义轴按需裁剪，failure 侧固定沿 `error-core` -> `error-details` -> `error-recovery` 这条语义轴按需裁剪。failure 侧推荐顺序是先读 `error.code`，再读 `error.details.referenceGovernance.primaryReason/reasonCodes`，再按需展开 `error.details.referenceGovernance.referenceDetails[]`，最后按需展开 `risk/scope/validation` 细节。`fieldPresence` 当前使用 `always` / `conditional` 两档，典型条件短码包括 `WHEN_SCOPE_AVAILABILITY_IS_RESOLVED`、`WHEN_SCOPE_FAILURE_PROVIDES_AVAILABILITY_DETAILS`、`WHEN_REFERENCE_GOVERNANCE_FAILURE_IS_DETECTED`、`WHEN_ITEM_HAS_REFERENCE_OR_INLINE_SECRET_CONTEXT`、`WHEN_SCHEMA_DOCUMENT_IS_REQUESTED`。当前稳定建议动作包括 `fix-input-and-retry`、`select-existing-resource`、`resolve-scope-before-retry`、`confirm-before-write`、`check-platform-support`、`inspect-runtime-details`、`check-import-source`。`primaryFieldSemantics` / `primaryErrorFieldSemantics` 则把这些点路径再映射到稳定语义标签，方便调用方做分类消费。

`schema --schema-version --json` 是轻量版本探测，只返回版本字段：

```ts
type SchemaVersionCommandOutput = {
  schemaVersion: '2026-04-15.public-json.v1'
}
```

### JSON 示例导航

| Command | 适合谁读 | 成功重点字段 | 失败重点字段 / 失败码 |
| --- | --- | --- | --- |
| [`current --json`](#current---json) | CLI 用户、UI 接入方 | `currentScope`、`platformSummary`、`summary.platformStats`、`summary.referenceStats`、`summary.executabilityStats`、`detections[].referenceSummary`、`scopeCapabilities`、`scopeAvailability`。推荐消费顺序：先读 `summary.platformStats[]` 和 `summary.referenceStats` 拿平台级聚合与 reference 聚合，再补读 `summary.executabilityStats` 拿写入可执行性聚合，再读 `detections[].platform/currentScope`，最后按需展开 `detections[].referenceSummary` 与 `scopeCapabilities/scopeAvailability`。 | 通常无 action-specific 失败样例，优先读取统一 envelope / `error.code` |
| [`list --json`](#list---json) | CLI 用户、UI 接入方 | profile 级 `platformSummary`、`summary.platformStats`、`summary.referenceStats`、`summary.executabilityStats`、`profiles[].referenceSummary`、Gemini `scopeAvailability`。推荐消费顺序：先读 `summary.platformStats[]` 和 `summary.referenceStats` 做平台分组与治理分层，再补读 `summary.executabilityStats` 做写入前分层，再读 `profiles[]` 的平台与 selector，最后按需读取 `profiles[].referenceSummary` 与 `scopeAvailability`。 | 通常无 action-specific 失败样例，优先读取统一 envelope / `error.code` |
| [`preview --json`](#preview---json) | CLI 用户、自动化脚本 | `preview`、`risk`、`summary.platformStats`、`summary.referenceStats`、`summary.executabilityStats`、`scopeCapabilities`、`scopeAvailability`。推荐消费顺序：先读 `summary.platformStats[0]` 看平台级目标 scope、warning/limitation 与变更计数，再读 `summary.referenceStats` 与 `summary.executabilityStats` 做 secret 形态和写入可执行性判断，最后展开 `preview`。 | `scopeAvailability`、`scopePolicy`、`PREVIEW_FAILED` |
| [`use --json`](#use---json) | CLI 用户、自动化脚本 | `platformSummary`、`summary.platformStats`、`summary.referenceStats`、`summary.executabilityStats`、`scopeCapabilities`、`scopeAvailability`、`changedFiles`、`backupId`。推荐消费顺序：先读 `summary.platformStats[0]` 看平台级写入聚合，再读 `summary.referenceStats` 与 `summary.executabilityStats` 做 secret 形态和写入可执行性判断，最后再展开 `preview/platformSummary`。 | `referenceGovernance`、`risk`、`scopePolicy`、`scopeCapabilities`、`scopeAvailability`、`CONFIRMATION_REQUIRED` / `USE_FAILED`。推荐顺序：`error.code` -> `error.details.referenceGovernance.primaryReason/reasonCodes` -> `error.details.referenceGovernance.referenceDetails[]` -> `risk/scope/validation` |
| [`rollback --json`](#rollback---json) | CLI 用户、自动化脚本 | `platformSummary`、`summary.platformStats`、`summary.referenceStats`、`summary.executabilityStats`、`scopePolicy`、`scopeCapabilities`、`scopeAvailability`、`restoredFiles`。推荐消费顺序：先读 `summary.platformStats[0]` 看平台级恢复聚合，再读 `summary.referenceStats` 与 `summary.executabilityStats` 看快照上一版 profile 的 secret 形态与写入可执行性，最后展开 `rollback`。 | `scopePolicy`、`scopeCapabilities`、`scopeAvailability`、`ROLLBACK_SCOPE_MISMATCH` / `ROLLBACK_FAILED` |
| [`validate --json`](#validate---json) | UI 接入方、自动化脚本 | item 级 `platformSummary`、`scopeCapabilities`、`summary.platformStats`、`summary.referenceStats`、`summary.executabilityStats`、`items[].referenceSummary`。推荐消费顺序：先读 `summary.platformStats[]` 和 `summary.referenceStats` 看平台级通过/限制聚合与 reference 聚合，再补读 `summary.executabilityStats` 看写入可执行性聚合，再看 `validation.ok/errors/warnings`，最后按需展示 `items[].referenceSummary` 与 `scopeCapabilities`。 | 通常无 action-specific 失败样例，优先读取统一 envelope / `error.code` |
| [`export --json`](#export---json) | 自动化脚本、导入迁移工具 | `platformSummary`、`summary.platformStats`、`summary.referenceStats`、`summary.executabilityStats`、`summary.secretExportPolicy`、`profiles[].referenceSummary`、`profiles[].secretExportSummary`、`defaultWriteScope`、`observedAt`、Gemini `scopeAvailability`。推荐消费顺序：先读 `summary.platformStats[]`、`summary.referenceStats` 和 `summary.secretExportPolicy` 看平台级聚合与本次 secret 导出策略，再补读 `summary.executabilityStats` 看后续写入可执行性聚合，最后结合 `profiles[].referenceSummary`、`profiles[].secretExportSummary`、`observedAt` 理解 item 级状态与 `scopeAvailability`。 | 通常无 action-specific 失败样例，优先读取统一 envelope / `error.code` |
| [`import preview --json`](#import-preview---json) | UI 接入方、导入迁移工具 | `summary.sourceExecutability`、`summary.executabilityStats`、item 级 `platformSummary`、`exportedObservation`、`localObservation`、`previewDecision`、`summary` | 重点先看 `summary.sourceExecutability` 与 `summary.executabilityStats`，再看 `previewDecision`、`fidelity`、`sourceCompatibility`；命令本身通常不以 item 阻塞作为顶层失败 |
| [`import apply --json`](#import-apply---json) | 自动化脚本、导入迁移工具 | `platformSummary`、`summary.platformStats`、`summary.referenceStats`、`summary.executabilityStats`、`scopePolicy`、`preview`、`dryRun`、`backupId`、`changedFiles`。推荐消费顺序：先读 `summary.platformStats[0]` 看平台级 apply 聚合，再读 `summary.referenceStats` 与 `summary.executabilityStats` 做 secret 形态和写入可执行性判断，最后展开 `platformSummary/preview`。 | `referenceGovernance`、`risk`、`scopePolicy`、`scopeCapabilities`、`scopeAvailability`、`CONFIRMATION_REQUIRED` / scope unavailable 类失败。推荐顺序：`error.code` -> `error.details.referenceGovernance.primaryReason/reasonCodes` -> `error.details.referenceGovernance.referenceDetails[]` -> `risk/scope/validation` |

### current --json

`current` 会在每个平台检测结果里输出当前检测态、scope 能力矩阵、当前环境里的 scope 可用性，以及机器可消费的平台语义摘要。`summary.platformStats[]` 进一步把每个平台的 profile 数、当前 state 记录、当前检测命中和 explainable 摘要做成稳定聚合；`summary.referenceStats` 则把这一批 profile 中 reference profile、inline profile、write unsupported profile 的总量做成单独入口，并用 `resolvedReferenceProfileCount` / `missingReferenceProfileCount` / `unsupportedReferenceProfileCount` 区分 `env://` 可解析、缺失和暂不支持的引用 scheme，适合 UI 或治理脚本先决定是否提示“仍有明文 profile”或“当前仍有不可直接写入的 profile”。`summary.executabilityStats` 则补一层后续写入可执行性入口，回答当前批次里有多少 profile 仍是 `inline-ready`，以及有多少已经落入 `reference-missing`、`write-unsupported` 或 `source-redacted`。如果需要解释单条 detection 为什么落在某个 secret/reference 类别，再读 `detections[].referenceSummary`；这里会稳定给出 `hasReferenceFields`、`hasInlineSecrets`、`writeUnsupported` 和字段级 `referenceDetails[]`。文本输出也沿同一顺序组织：先看“按平台汇总”，再看“referenceStats 摘要”和“executabilityStats 摘要”，最后再展开 detection。`details`、`effectiveConfig`、`managedBoundaries` 等 adapter 细节允许扩展；稳定字段是 envelope、`summary`、`detections[].platform/managed/targetFiles/currentScope/platformSummary/referenceSummary/scopeCapabilities/scopeAvailability`。

语义补充：

- 对 Gemini 来说，`currentScope` 是在 `system-defaults < user < project < system-overrides` 四层 precedence 推导后的当前生效来源。
- 对 Claude 来说，`platformSummary.precedence` 固定为 `user < project < local`。
- 对 Codex 来说，`platformSummary.kind` 为 `multi-file-composition`，`composedFiles` 表示当前检测到的 `config.toml` / `auth.json` 组成文件。
- 完整 JSON 样例见 [`README.md`](../README.md) 中的 `current --json` 示例。
- 相关示例：[`list --json`](#list---json)、[`validate --json`](#validate---json)、[`export --json`](#export---json)

```ts
type CurrentCommandOutput = {
  current: Record<string, string>
  lastSwitch?: unknown
  detections: CurrentProfileResult[]
  summary: CurrentSummary
}

type CurrentSummary = {
  platformStats?: CurrentListPlatformStat[]
  referenceStats?: SecretReferenceStats
  executabilityStats?: ExecutabilityStats
  warnings: string[]
  limitations: string[]
}

type SecretReferenceStats = {
  profileCount: number
  referenceProfileCount: number
  resolvedReferenceProfileCount: number
  missingReferenceProfileCount: number
  unsupportedReferenceProfileCount: number
  inlineProfileCount: number
  writeUnsupportedProfileCount: number
  hasReferenceProfiles: boolean
  hasResolvedReferenceProfiles: boolean
  hasMissingReferenceProfiles: boolean
  hasUnsupportedReferenceProfiles: boolean
  hasInlineProfiles: boolean
  hasWriteUnsupportedProfiles: boolean
}

type ExecutabilityStats = {
  profileCount: number
  inlineReadyProfileCount: number
  referenceReadyProfileCount: number
  referenceMissingProfileCount: number
  writeUnsupportedProfileCount: number
  sourceRedactedProfileCount: number
  hasInlineReadyProfiles: boolean
  hasReferenceReadyProfiles: boolean
  hasReferenceMissingProfiles: boolean
  hasWriteUnsupportedProfiles: boolean
  hasSourceRedactedProfiles: boolean
}

type CurrentListPlatformStat = {
  platform: string
  profileCount: number
  currentProfileId?: string
  detectedProfileId?: string
  managed: boolean
  currentScope?: string
  platformSummary?: PlatformExplainableSummary
}

type CurrentProfileResult = {
  platform: string
  matchedProfileId?: string
  managed: boolean
  targetFiles: unknown[]
  currentScope?: string
  platformSummary?: PlatformExplainableSummary
  scopeCapabilities?: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
}
```

完整 JSON 样例：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "current",
  "data": {
    "current": {
      "claude": "claude-prod",
      "gemini": "gemini-prod"
    },
    "detections": [
      {
        "platform": "claude",
        "managed": true,
        "matchedProfileId": "claude-prod",
        "currentScope": "local",
        "platformSummary": {
          "kind": "scope-precedence",
          "precedence": ["user", "project", "local"],
          "currentScope": "local",
          "facts": [
            {
              "code": "CLAUDE_SCOPE_PRECEDENCE",
              "message": "Claude 支持 user < project < local 三层 precedence。"
            },
            {
              "code": "CLAUDE_LOCAL_SCOPE_HIGHEST",
              "message": "如果存在 local，同名字段最终以 local 为准。"
            }
          ]
        },
        "targetFiles": [
          {
            "path": "C:/work/.claude/settings.local.json",
            "scope": "local"
          }
        ],
        "scopeCapabilities": [
          {
            "scope": "user",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          },
          {
            "scope": "project",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          },
          {
            "scope": "local",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          }
        ]
      },
      {
        "platform": "gemini",
        "managed": true,
        "matchedProfileId": "gemini-prod",
        "currentScope": "user",
        "platformSummary": {
          "kind": "scope-precedence",
          "precedence": ["system-defaults", "user", "project", "system-overrides"],
          "currentScope": "user",
          "facts": [
            {
              "code": "GEMINI_SCOPE_PRECEDENCE",
              "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
            },
            {
              "code": "GEMINI_PROJECT_OVERRIDES_USER",
              "message": "project scope 会覆盖 user 中的同名字段。"
            }
          ]
        },
        "targetFiles": [
          {
            "path": "C:/Users/test/.gemini/settings.json",
            "scope": "user"
          }
        ],
        "scopeCapabilities": [
          {
            "scope": "system-defaults",
            "detect": true,
            "preview": true,
            "use": false,
            "rollback": false,
            "writable": false,
            "risk": "normal"
          },
          {
            "scope": "user",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          },
          {
            "scope": "project",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "high",
            "confirmationRequired": true
          },
          {
            "scope": "system-overrides",
            "detect": true,
            "preview": true,
            "use": false,
            "rollback": false,
            "writable": false,
            "risk": "normal"
          }
        ],
        "scopeAvailability": [
          {
            "scope": "user",
            "status": "available",
            "detected": true,
            "writable": true,
            "path": "C:/Users/test/.gemini/settings.json"
          },
          {
            "scope": "project",
            "status": "available",
            "detected": true,
            "writable": true,
            "path": "C:/work/.gemini/settings.json"
          }
        ]
      },
      {
        "platform": "codex",
        "managed": true,
        "matchedProfileId": "codex-prod",
        "platformSummary": {
          "kind": "multi-file-composition",
          "composedFiles": [
            "C:/Users/test/.codex/config.toml",
            "C:/Users/test/.codex/auth.json"
          ],
          "facts": [
            {
              "code": "CODEX_MULTI_FILE_CONFIGURATION",
              "message": "Codex 当前由 config.toml 与 auth.json 共同组成有效配置。"
            },
            {
              "code": "CODEX_CURRENT_REQUIRES_BOTH_FILES",
              "message": "current 检测不能把单个文件视为完整状态。"
            }
          ]
        },
        "targetFiles": [
          {
            "path": "C:/Users/test/.codex/config.toml",
            "role": "config"
          },
          {
            "path": "C:/Users/test/.codex/auth.json",
            "role": "auth"
          }
        ]
      }
    ],
    "summary": {
      "platformStats": [
        {
          "platform": "claude",
          "profileCount": 1,
          "currentProfileId": "claude-prod",
          "detectedProfileId": "claude-prod",
          "managed": true,
          "currentScope": "local",
          "platformSummary": {
            "kind": "scope-precedence",
            "precedence": ["user", "project", "local"],
            "currentScope": "local",
            "facts": [
              {
                "code": "CLAUDE_SCOPE_PRECEDENCE",
                "message": "Claude 支持 user < project < local 三层 precedence。"
              },
              {
                "code": "CLAUDE_LOCAL_SCOPE_HIGHEST",
                "message": "如果存在 local，同名字段最终以 local 为准。"
              }
            ]
          }
        }
      ],
      "warnings": [],
      "limitations": []
    }
  }
}
```

### list --json

`list` 的每个 profile 条目会带出该 profile 所属平台的 scope 能力矩阵与平台语义摘要；Gemini 还会附带当前环境里的 `scopeAvailability`，便于 UI 同时判断“入口该不该显示”和“入口点了之后当前会不会失败”。`summary.platformStats[]` 提供当前返回批次的 platform-aware 聚合；`summary.referenceStats` 则补充当前列表里 reference / inline / write unsupported 的批次摘要，并区分 `env://` 可解析、缺失和暂不支持 scheme 的 reference profile，调用方可以先做平台分组与 secret 治理分层，再决定是否展开单个 profile。`summary.executabilityStats` 则补一层写入前分层入口，用同一批 profile 直接回答“哪些 profile 仍可进入后续写入，哪些已经被 `writeUnsupported` 或 `sourceRedacted` 阻断”。需要下钻时，再读 `profiles[].referenceSummary` 看单条 profile 是否含 reference 字段、是否仍含 inline secret，以及 resolver 当前看到的是 `resolved / missing / unsupported-scheme / missing-value` 哪一类字段级状态。文本输出也与此对齐：先读“按平台汇总”，再读“referenceStats 摘要”和“executabilityStats 摘要”，最后再看 profile 列表。

相关示例：[`current --json`](#current---json)、[`validate --json`](#validate---json)、[`export --json`](#export---json)

```ts
type ListCommandOutput = {
  profiles: ListCommandItem[]
  summary: ListSummary
}

type ListCommandItem = {
  profile: Profile
  current: boolean
  healthStatus: string
  riskLevel: string
  platformSummary?: PlatformExplainableSummary
  scopeCapabilities?: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
}

type ListSummary = {
  platformStats?: CurrentListPlatformStat[]
  referenceStats?: SecretReferenceStats
  executabilityStats?: ExecutabilityStats
  warnings: string[]
  limitations: string[]
}
```

完整 JSON 样例：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "list",
  "data": {
    "profiles": [
      {
        "profile": {
          "id": "claude-prod",
          "platform": "claude",
          "name": "Claude 生产",
          "source": {
            "apiKey": "sk-ant-123456"
          }
        },
        "current": false,
        "healthStatus": "warning",
        "riskLevel": "medium",
        "platformSummary": {
          "kind": "scope-precedence",
          "precedence": ["user", "project", "local"],
          "currentScope": "local",
          "facts": [
            {
              "code": "CLAUDE_SCOPE_PRECEDENCE",
              "message": "Claude 支持 user < project < local 三层 precedence。"
            },
            {
              "code": "CLAUDE_LOCAL_SCOPE_HIGHEST",
              "message": "如果存在 local，同名字段最终以 local 为准。"
            }
          ]
        },
        "scopeCapabilities": [
          {
            "scope": "user",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          },
          {
            "scope": "project",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          },
          {
            "scope": "local",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          }
        ]
      },
      {
        "profile": {
          "id": "gemini-prod",
          "platform": "gemini",
          "name": "Gemini 生产",
          "source": {
            "apiKey": "gm-live-123456",
            "authType": "gemini-api-key"
          }
        },
        "current": true,
        "healthStatus": "valid",
        "riskLevel": "low",
        "platformSummary": {
          "kind": "scope-precedence",
          "precedence": ["system-defaults", "user", "project", "system-overrides"],
          "currentScope": "user",
          "facts": [
            {
              "code": "GEMINI_SCOPE_PRECEDENCE",
              "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
            },
            {
              "code": "GEMINI_PROJECT_OVERRIDES_USER",
              "message": "project scope 会覆盖 user 中的同名字段。"
            }
          ]
        },
        "scopeCapabilities": [
          {
            "scope": "user",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          },
          {
            "scope": "project",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "high",
            "confirmationRequired": true
          }
        ],
        "scopeAvailability": [
          {
            "scope": "user",
            "status": "available",
            "detected": true,
            "writable": true,
            "path": "C:/Users/test/.gemini/settings.json"
          },
          {
            "scope": "project",
            "status": "available",
            "detected": true,
            "writable": true,
            "path": "C:/work/.gemini/settings.json"
          }
        ]
      },
      {
        "profile": {
          "id": "codex-prod",
          "platform": "codex",
          "name": "Codex 生产"
        },
        "current": false,
        "healthStatus": "unknown",
        "riskLevel": "low",
        "platformSummary": {
          "kind": "multi-file-composition",
          "composedFiles": [],
          "facts": [
            {
              "code": "CODEX_MULTI_FILE_CONFIGURATION",
              "message": "Codex 当前由 config.toml 与 auth.json 共同组成有效配置。"
            },
            {
              "code": "CODEX_LIST_IS_PROFILE_LEVEL",
              "message": "list 仅展示 profile 级状态，不表示单文件可独立切换。"
            }
          ]
        }
      }
    ],
    "summary": {
      "platformStats": [
        {
          "platform": "claude",
          "profileCount": 1,
          "managed": false,
          "currentScope": "local",
          "platformSummary": {
            "kind": "scope-precedence",
            "precedence": ["user", "project", "local"],
            "currentScope": "local",
            "facts": [
              {
                "code": "CLAUDE_SCOPE_PRECEDENCE",
                "message": "Claude 支持 user < project < local 三层 precedence。"
              },
              {
                "code": "CLAUDE_LOCAL_SCOPE_HIGHEST",
                "message": "如果存在 local，同名字段最终以 local 为准。"
              }
            ]
          }
        }
      ],
      "warnings": [],
      "limitations": []
    }
  }
}
```

### validate --json

`validate` 的每个 item 会带出对应 profile 平台的 `platformSummary` 与 scope 能力矩阵，便于 UI 在校验结果页同时展示平台 precedence / 多文件语义，以及该平台可写 scope、只读 scope 和确认门槛。`summary.platformStats[]` 提供当前校验批次的 platform-aware 聚合；`summary.referenceStats` 则补充当前校验批次里 reference / inline / write unsupported 的治理摘要，并区分 `env://` 可解析、缺失和暂不支持 scheme 的 reference profile，调用方可先判断这是“校验问题”还是“secret 形态治理问题”，再决定是否展开单条 item。`summary.executabilityStats` 则补一层“从 secret 形态看是否还适合继续进入写入链路”的聚合。需要 item 级 explainable 时，再读 `items[].referenceSummary`；这里不会替代失败态的 `referenceGovernance`，只描述成功只读结果中的单条 secret/reference 形态。文本输出同样先给出“按平台汇总”和“referenceStats 摘要”，再进入 item 级校验结果。文本输出同样先给出“按平台汇总”“referenceStats 摘要”和“executabilityStats 摘要”，再进入 item 级校验结果。

相关示例：[`current --json`](#current---json)、[`list --json`](#list---json)、[`export --json`](#export---json)

```ts
type ValidateCommandOutput = {
  items: ValidateCommandItem[]
  summary: ValidateSummary
}

type ValidateCommandItem = {
  profileId: string
  platform: string
  validation: ValidationResult
  platformSummary?: PlatformExplainableSummary
  scopeCapabilities?: ScopeCapability[]
}

type ValidateSummary = {
  platformStats?: ValidateExportPlatformStat[]
  referenceStats?: SecretReferenceStats
  executabilityStats?: ExecutabilityStats
  warnings: string[]
  limitations: string[]
}

type ValidateExportPlatformStat = {
  platform: string
  profileCount: number
  okCount: number
  warningCount: number
  limitationCount: number
  platformSummary?: PlatformExplainableSummary
}
```

### export --json

`export` 的每个导出 profile 条目会带出所属平台的 `platformSummary` 与 scope 能力矩阵；Gemini 还会导出当前探测到的 `scopeAvailability` 与 `defaultWriteScope`，便于迁移工具或 UI 同时保留平台语义、“默认写到哪一层”以及“导出时当前环境里 project scope 是否可用”。`summary.platformStats[]` 把当前导出批次按平台聚合；`summary.referenceStats` 则补出本次导出里 reference / inline / write unsupported 的批次聚合，并区分 `env://` 可解析、缺失和暂不支持 scheme 的 reference profile。`summary.executabilityStats` 则补一层后续写入可执行性聚合，帮助调用方在消费导出结果前就判断后续导入 / 写入的阻塞面。`export` 还固定补了一层 secret 导出策略：默认不导出 inline secret 明文，而是保留字段位置并写成 `"<redacted:inline-secret>"`；批次级策略看 `summary.secretExportPolicy`，单条 profile 在当前导出模式下发生了什么，看 `profiles[].secretExportSummary`。需要逐条判断时，再读 `profiles[].referenceSummary` 与 `profiles[].secretExportSummary`；前者解释 secret/reference 形态，后者解释当前导出动作是否 redacted / preserved。文本输出也采用同一顺序：先看“按平台汇总”，再看“referenceStats 摘要”“executabilityStats 摘要”和“secret 导出策略”，最后再进入 profile 导出明细。

相关示例：[`current --json`](#current---json)、[`list --json`](#list---json)、[`validate --json`](#validate---json)

```ts
type ExportCommandOutput = {
  profiles: ExportedProfileItem[]
  summary: ExportSummary
}

type ExportedProfileItem = {
  profile: Profile
  validation?: ValidationResult
  platformSummary?: PlatformExplainableSummary
  observedAt?: string
  defaultWriteScope?: string
  scopeCapabilities?: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  referenceSummary?: ReferenceSummary
  secretExportSummary?: SecretExportItemSummary
}

type ExportSummary = {
  platformStats?: ValidateExportPlatformStat[]
  referenceStats?: SecretReferenceStats
  executabilityStats?: ExecutabilityStats
  secretExportPolicy?: SecretExportPolicySummary
  warnings: string[]
  limitations: string[]
}

type SecretExportPolicySummary = {
  mode: 'redacted-by-default' | 'include-secrets'
  inlineSecretsExported: number
  inlineSecretsRedacted: number
  referenceSecretsPreserved: number
  profilesWithRedactedSecrets: number
}

type SecretExportItemSummary = {
  hasInlineSecrets: boolean
  hasRedactedInlineSecrets: boolean
  hasReferenceSecrets: boolean
  redactedFieldCount: number
  preservedReferenceCount: number
  details?: Array<{
    field: string
    kind: 'inline-secret-redacted' | 'inline-secret-exported' | 'reference-preserved'
  }>
}
```

约定：

- 默认 `export` / `export --json` 会把 inline secret 导出成 `"<redacted:inline-secret>"`；只有显式 `--include-secrets` 才会保留 inline secret 明文。
- `summary.secretExportPolicy` 回答本次导出采用的 secret 策略；外部调用方应在消费 `profile` 之前先读它，而不是只看字段值猜测。
- `profiles[].secretExportSummary` 回答单条 profile 里哪些字段被 redacted、哪些 reference 被原样保留。
- `observedAt` 仅表示导出时记录 `scopeAvailability` 的时间戳。
- `observedAt` 与 `scopeAvailability` 都属于导出环境观察，不属于可迁移执行真相。
- 未来如果实现 `import`，必须重新解析本地 availability，不能直接信任导出文件中的 `observedAt` / `scopeAvailability`。

### import preview --json

`import preview` 的公共 contract 必须显式区分两类事实：

- `exportedObservation`: 导出文件里的历史观察
- `localObservation`: 当前本地重新解析后的实时观察

其中真正与后续 apply 设计相关的判断，必须以后者为准；前者只用于 fidelity 对比与解释。

```ts
type ImportObservation = {
  scopeCapabilities?: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  defaultWriteScope?: string
  observedAt?: string
}

type ImportFidelityMismatch = {
  field: 'defaultWriteScope' | 'scopeAvailability' | 'scopeCapabilities'
  driftKind: 'default-scope-drift' | 'availability-drift' | 'capability-drift'
  severity: 'blocking' | 'warning' | 'info'
  scope?: string
  exportedValue?: unknown
  localValue?: unknown
  message: string
  recommendedAction?: string
}

type ImportFidelityDriftSummary = {
  blocking: number
  warning: number
  info: number
}

type ImportFidelityMismatchGroup = {
  driftKind: 'default-scope-drift' | 'availability-drift' | 'capability-drift'
  totalCount: number
  blockingCount: number
  warningCount: number
  infoCount: number
  mismatches: ImportFidelityMismatch[]
}

type ImportFidelityReport = {
  status: 'match' | 'mismatch' | 'partial' | 'insufficient-data'
  mismatches: ImportFidelityMismatch[]
  driftSummary: ImportFidelityDriftSummary
  groupedMismatches: ImportFidelityMismatchGroup[]
  highlights: string[]
}

type ImportSourceCompatibility = {
  mode: 'strict' | 'schema-version-missing'
  schemaVersion?: string
  warnings: string[]
}

type ImportPreviewDecision = {
  canProceedToApplyDesign: boolean
  recommendedScope?: string
  requiresLocalResolution: boolean
  reasonCodes: ImportPreviewDecisionReasonCode[]
  reasons: ImportPreviewDecisionReason[]
}

type ImportPreviewDecisionReasonCode =
  | 'READY_USING_LOCAL_OBSERVATION'
  | 'LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION'
  | 'BLOCKED_BY_INSUFFICIENT_OBSERVATION'
  | 'BLOCKED_BY_FIDELITY_MISMATCH'
  | 'REQUIRES_LOCAL_SCOPE_RESOLUTION'

type ImportPreviewDecisionReason = {
  code: ImportPreviewDecisionReasonCode
  blocking: boolean
  message: string
}

type ImportPreviewCommandOutput = {
  sourceFile: string
  sourceCompatibility: ImportSourceCompatibility
  items: ImportPreviewItem[]
  summary: ImportPreviewSummary
}

type ImportPreviewSummary = {
  totalItems: number
  matchCount: number
  mismatchCount: number
  partialCount: number
  insufficientDataCount: number
  sourceExecutability: ImportSourceExecutabilitySummary
  executabilityStats?: ExecutabilityStats
  platformStats: ImportPreviewPlatformStat[]
  decisionCodeStats: ImportPreviewDecisionCodeStat[]
  driftKindStats: ImportPreviewDriftKindStat[]
  warnings: string[]
  limitations: string[]
}

type ImportSourceExecutabilitySummary = {
  totalItems: number
  applyReadyCount: number
  previewOnlyCount: number
  blockedCount: number
  blockedByCodeStats: ImportSourceExecutabilityCodeStat[]
}

type ImportSourceExecutabilityCodeStat = {
  code: 'REDACTED_INLINE_SECRET'
  totalCount: number
}

type ImportPreviewPlatformStat = {
  platform: string
  totalItems: number
  matchCount: number
  mismatchCount: number
  partialCount: number
  insufficientDataCount: number
}

type ImportPreviewDecisionCodeStat = {
  code: ImportPreviewDecisionReasonCode
  totalCount: number
  blockingCount: number
  nonBlockingCount: number
}

type ImportPreviewDriftKindStat = {
  driftKind: 'default-scope-drift' | 'availability-drift' | 'capability-drift'
  totalCount: number
  blockingCount: number
  warningCount: number
  infoCount: number
}

type ImportPreviewItem = {
  profile: Profile
  platform: string
  platformSummary?: PlatformExplainableSummary
  exportedObservation?: ImportObservation
  localObservation?: ImportObservation
  fidelity?: ImportFidelityReport
  previewDecision: ImportPreviewDecision
}
```

约定：

- `exportedObservation` 与 `localObservation` 不得相互覆盖，也不得被合并成一份模糊对象。
- `platformSummary` 是 item 级稳定平台摘要；Gemini / Claude 用它表达 precedence，Codex 用它表达双文件组合语义。
- `fidelity.status='mismatch'` 表示导出环境与当前本地环境在关键执行语义上存在偏差。
- `driftKind` 用来区分 mismatch 的来源：默认作用域漂移、availability 漂移、capability 漂移。
- `severity` 用来表达该 drift 对后续 apply 设计的影响强度；当前 `availability-drift` 中的 Gemini `project` 不可解析会被标为 `blocking`。
- `groupedMismatches` 是对 `mismatches[]` 的稳定结构化分组，固定按 `driftKind` 输出，便于机器消费方直接读取每类 drift 的数量和明细，而不必自行二次聚合。
- `previewDecision.canProceedToApplyDesign=false` 仅表示当前不应继续进入未来 apply 设计，不代表整个 `import preview` 命令失败。
- `previewDecision.reasonCodes` / `previewDecision.reasons` 用来稳定表达“为什么当前可以或不可以继续进入 apply 设计”；上层调用方应优先消费 `code`，`message` 只用于展示。
- `summary.sourceExecutability` 是批次级第一读取入口，用来回答“这批导入源里有多少条可以继续进入 apply，有多少条只能停留在 preview”。
- `summary.executabilityStats` 是另一层稳定批次级入口，用来回答“这批 profile 从 secret 形态上看，有多少条后续仍是 `inline-ready / reference-ready`，有多少条已经落入 `reference-missing / write-unsupported / source-redacted`”。
- `summary.sourceExecutability.blockedByCodeStats[]` 当前首批稳定短码为 `REDACTED_INLINE_SECRET`，表示导入源只保留了 redacted placeholder，没有可执行 secret 明文。
- `summary.decisionCodeStats` 用来聚合整批 item 的 decision reasons，适合列表页、面板页直接显示“本批次阻塞主要来自哪些 decision code”。
- `summary.driftKindStats` 用来聚合整批 item 的 drift 类型，适合快速判断当前导入批次主要是 default scope 漂移、availability 漂移还是 capability 漂移。
- `sourceCompatibility` 用来说明导入源是严格 schema 模式，还是“缺少 schemaVersion 但仍可兼容读取”的降级模式。
- `summary` 提供整批导入项的状态统计，便于 UI/CLI 先给总览，再展开单项差异。
- 更完整的 mixed-batch 接入实践见 [`docs/import-preview-consumer-guide.md`](./import-preview-consumer-guide.md)。

推荐消费顺序：

1. 先读取 `sourceCompatibility`，判断当前导入源是否是严格 schema 模式，还是兼容降级模式。
2. 再读取 `summary.sourceExecutability`，优先做“apply-ready / preview-only / blocked”批次分流。
3. 同时读取 `summary.executabilityStats`，补上 profile 形态层的写入可执行性聚合；它不替代 `summary.sourceExecutability`，而是回答另一层问题。
4. 继续读取 `summary.totalItems`、`summary.matchCount`、`summary.mismatchCount`、`summary.partialCount`、`summary.insufficientDataCount`，确认整批结果分布。
5. 对 batch-level UI、批处理脚本或路由决策，优先消费 `summary.decisionCodeStats` 与 `summary.driftKindStats`，不要先遍历 `items[]` 自己重算。
6. 只有在需要展开单条 profile 细节时，再读取 `items[]` 下的 `fidelity`、`previewDecision`、`exportedObservation` 与 `localObservation`。
7. 对单条 item，机器消费方应优先使用 `previewDecision.reasonCodes`、`previewDecision.reasons[].code`、`fidelity.groupedMismatches[].driftKind` 这类稳定 code/enum；`message`、`highlights` 和文本摘要主要用于展示。

最小 Gemini `import preview --json` item 样例：

```json
{
  "profile": {
    "id": "gemini-prod",
    "name": "gemini-prod",
    "platform": "gemini",
    "source": {},
    "apply": {}
  },
  "platform": "gemini",
  "platformSummary": {
    "kind": "scope-precedence",
    "precedence": ["system-defaults", "user", "project", "system-overrides"],
    "facts": [
      {
        "code": "GEMINI_SCOPE_PRECEDENCE",
        "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
      },
      {
        "code": "GEMINI_PROJECT_OVERRIDES_USER",
        "message": "project scope 会覆盖 user 中的同名字段。"
      }
    ]
  },
  "exportedObservation": {
    "defaultWriteScope": "user",
    "observedAt": "2026-04-16T00:00:00.000Z"
  },
  "localObservation": {
    "defaultWriteScope": "user",
    "scopeAvailability": [
      {
        "scope": "project",
        "status": "unresolved",
        "detected": false,
        "writable": false,
        "reasonCode": "PROJECT_ROOT_UNRESOLVED"
      }
    ]
  },
  "previewDecision": {
    "canProceedToApplyDesign": false,
    "recommendedScope": "user",
    "requiresLocalResolution": true,
    "reasonCodes": [
      "BLOCKED_BY_FIDELITY_MISMATCH",
      "REQUIRES_LOCAL_SCOPE_RESOLUTION"
    ],
    "reasons": [
      {
        "code": "BLOCKED_BY_FIDELITY_MISMATCH",
        "blocking": true,
        "message": "导出观察与当前本地观察存在关键漂移，当前不应继续进入 apply 设计。"
      },
      {
        "code": "REQUIRES_LOCAL_SCOPE_RESOLUTION",
        "blocking": true,
        "message": "当前本地 scope 解析未完成，需先修复本地解析结果。"
      }
    ]
  }
}
```

### import apply --json

命令语法：

```bash
api-switcher import apply <file> --profile <id> [--scope <scope>] [--force] [--dry-run] [--json]
```

当前契约边界：

- 当前支持 Gemini / Codex / Claude profile。
- 一次只应用单个 profile（必须显式传 `--profile`）。
- apply 相关决策遵循 local-first：真正进入 apply 的判定以后者 `localObservation` 为准，`exportedObservation` 只用于 fidelity 对比与解释。
- gate 顺序固定为 availability-before-confirmation：Gemini `project` 先判定目标 scope 当前是否可用，再评估确认门槛（`CONFIRMATION_REQUIRED`）。
- Gemini 支持 `--scope user|project`；Claude 支持 `--scope user|project|local`，其中 `local` 未 `--force` 时会进入更严格的确认门槛；Codex 不支持 `--scope`，会直接按平台真实双文件目标写入。
- 对 Gemini 显式 `--scope project` 的失败态，如果当前 project root 无法解析，应该把它视为 availability failure；此时即使顶层 `error.code` 仍是 `USE_FAILED`，也应继续读取 `error.details.scopeAvailability.project.status = "unresolved"` 与 `reasonCode = "PROJECT_ROOT_UNRESOLVED"`。
- apply 成功后的 rollback 依赖快照 provenance；当前 provenance 会绑定 `origin=import-apply`、`sourceFile` 与 `importedProfileId`。
- `--dry-run` 会执行同一套 apply 前检查，但不会写入文件、不会创建快照；成功态返回 `dryRun=true`、`changedFiles=[]`、`noChanges=true`，计划差异仍保留在 `preview.diffSummary[]`。
- machine-readable schema 已接通 action-specific envelope：`action='import-apply'` 时，`ok=true` 要求 `data` 匹配 `ImportApplyCommandOutput`；`ok=false` 要求 `error.details` 匹配稳定 failure detail 联合。

成功态稳定字段：

```ts
type ImportApplyRiskSummary = {
  allowed: true
  riskLevel: string
  reasons: string[]
  limitations: string[]
}

type ImportApplySummary = {
  platformStats?: SinglePlatformStat[]
  warnings: string[]
  limitations: string[]
}

type ImportApplyCommandOutput = {
  sourceFile: string
  importedProfile: Profile
  appliedScope?: string
  dryRun?: boolean
  platformSummary?: PlatformExplainableSummary
  scopePolicy: SnapshotScopePolicy
  scopeCapabilities: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  validation: ValidationResult
  preview: PreviewResult
  risk: ImportApplyRiskSummary
  backupId?: string
  changedFiles: string[]
  noChanges: boolean
  summary: ImportApplySummary
}
```

补充语义：

- `appliedScope` 表示本次写入最终解析出的平台 scope。
- `dryRun=true` 表示本次只执行 apply 前检查，不落盘、不创建备份；此时 `backupId` 不存在，`changedFiles=[]`，`noChanges=true`。
- `platformSummary` 是 success payload 上的平台摘要；它与 `current/list/validate/export/import preview` 的同名字段保持语义一致。
- `summary.platformStats[]` 是 success payload 上的单平台聚合入口；它包含平台、profile、目标 scope、warning/limitation、变更文件计数、是否创建备份和 `noChanges`。
- `summary.referenceStats` 会把本次 apply 的导入 profile 归类为 `reference / inline / write unsupported` 三类治理形态，适合脚本先做 secret 形态判断。
- `summary.executabilityStats` 会把同一条 profile 再映射到 `inline-ready / reference-ready / reference-missing / write-unsupported / source-redacted` 这层稳定可执行性入口，适合在继续串联后续写入动作前先做阻塞判断。
- 对 Gemini，它通常是 `user` 或 `project`。
- 对 Claude，它通常是 `user`、`project` 或 `local`。
- 对 Codex 这类无 scoped target 平台，它可以缺省；机器消费方不应把缺省误解为失败。

失败态稳定 detail（只冻结稳定字段）：

```ts
type ImportApplySourceDetails = {
  sourceFile: string
  profileId?: string
}

type ImportApplyNotReadyDetails = {
  sourceFile: string
  profileId: string
  previewDecision: ImportPreviewDecision
  fidelity?: ImportFidelityReport
  localObservation?: ImportObservation
  exportedObservation?: ImportObservation
}

type ImportScopeUnavailableDetails = {
  requestedScope?: string
  resolvedScope: 'user' | 'project'
  scopePolicy: SnapshotScopePolicy
  scopeCapabilities: ScopeCapability[]
  scopeAvailability: ScopeAvailability[]
}
```

约定：

- `CONFIRMATION_REQUIRED` 继续复用通用 `ConfirmationRequiredDetails`。
- `IMPORT_APPLY_FAILED`、`VALIDATION_FAILED` 等失败的 `error.details` 只保证保留结构化对象，不冻结 adapter 内部字段。
- `referenceGovernance` 是失败态的治理类索引，只表达分类和原因码，不替代成功态的 `summary.referenceStats` 聚合。
- machine-readable schema 只冻结失败路径里的稳定字段，不对失败 `code` 与 adapter 私有 detail 做过度枚举。

样例阅读方式：

- 成功样例重点看 success payload 中的 `platformSummary`、`scopePolicy`、`preview`、`backupId` 与 `changedFiles`。
- 失败样例重点看 `CONFIRMATION_REQUIRED` 或 scope unavailable 类失败下的 `referenceGovernance`、`risk`、`scopePolicy`、`scopeCapabilities` 与 `scopeAvailability`；推荐先读 `error.code`，再读 `error.details.referenceGovernance.primaryReason/reasonCodes`，再按需展开 `error.details.referenceGovernance.referenceDetails[]`，最后再展开 `risk/scope/validation` 细节。

成功样例：

Gemini `import apply --json` 成功样例：

```bash
api-switcher import apply E:/tmp/exported-gemini.json --profile gemini-prod --scope project --force --json
```

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "import-apply",
  "data": {
    "sourceFile": "E:/tmp/exported-gemini.json",
    "importedProfile": {
      "id": "gemini-prod",
      "name": "gemini-prod",
      "platform": "gemini",
      "source": {
        "apiKey": "gm-l***56",
        "authType": "gemini-api-key"
      },
      "apply": {
        "GEMINI_API_KEY": "gm-l***56",
        "enforcedAuthType": "gemini-api-key"
      }
    },
    "appliedScope": "project",
    "platformSummary": {
      "kind": "scope-precedence",
      "precedence": ["system-defaults", "user", "project", "system-overrides"],
      "facts": [
        {
          "code": "GEMINI_SCOPE_PRECEDENCE",
          "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
        },
        {
          "code": "GEMINI_PROJECT_OVERRIDES_USER",
          "message": "project scope 会覆盖 user 中的同名字段。"
        }
      ]
    },
    "scopePolicy": {
      "requestedScope": "project",
      "resolvedScope": "project",
      "defaultScope": "user",
      "explicitScope": true,
      "highRisk": true,
      "riskWarning": "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。",
      "rollbackScopeMatchRequired": true
    },
    "scopeCapabilities": [
      {
        "scope": "user",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true
      },
      {
        "scope": "project",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true,
        "risk": "high",
        "confirmationRequired": true
      }
    ],
    "scopeAvailability": [
      {
        "scope": "user",
        "status": "available",
        "detected": true,
        "writable": true,
        "path": "C:/Users/test/.gemini/settings.json"
      },
      {
        "scope": "project",
        "status": "available",
        "detected": true,
        "writable": true,
        "path": "E:/repo/.gemini/settings.json"
      }
    ],
    "validation": {
      "ok": true,
      "errors": [],
      "warnings": [],
      "limitations": [
        {
          "code": "GEMINI_API_KEY_ENV_REQUIRED",
          "message": "GEMINI_API_KEY 仍需通过环境变量生效。"
        }
      ],
      "managedBoundaries": [
        {
          "type": "scope-aware",
          "target": "E:/repo/.gemini/settings.json",
          "managedKeys": [
            "enforcedAuthType"
          ],
          "notes": [
            "Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。"
          ]
        }
      ],
      "secretReferences": [
        {
          "key": "GEMINI_API_KEY",
          "source": "env",
          "present": true,
          "maskedValue": "gm-l***56"
        }
      ]
    },
    "preview": {
      "platform": "gemini",
      "profileId": "gemini-prod",
      "targetFiles": [
        {
          "path": "E:/repo/.gemini/settings.json",
          "format": "json",
          "exists": true,
          "managedScope": "partial-fields",
          "scope": "project",
          "role": "settings",
          "managedKeys": [
            "enforcedAuthType"
          ]
        }
      ],
      "effectiveFields": [],
      "storedOnlyFields": [],
      "diffSummary": [
        {
          "path": "E:/repo/.gemini/settings.json",
          "changedKeys": [
            "enforcedAuthType"
          ],
          "hasChanges": true
        }
      ],
      "warnings": [
        {
          "code": "GEMINI_API_KEY_ENV_REQUIRED",
          "message": "Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。"
        }
      ],
      "limitations": [],
      "riskLevel": "high",
      "requiresConfirmation": true,
      "backupPlanned": true,
      "noChanges": false
    },
    "risk": {
      "allowed": true,
      "riskLevel": "high",
      "reasons": [
        "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。"
      ],
      "limitations": [
        "GEMINI_API_KEY 仍需通过环境变量生效。"
      ]
    },
    "backupId": "snapshot-gemini-20260419120000-abcdef",
    "changedFiles": [
      "E:/repo/.gemini/settings.json"
    ],
    "noChanges": false,
    "summary": {
      "platformStats": [
        {
          "platform": "gemini",
          "profileCount": 1,
          "profileId": "gemini-prod",
          "targetScope": "project",
          "warningCount": 1,
          "limitationCount": 1,
          "changedFileCount": 1,
          "backupCreated": true,
          "noChanges": false
        }
      ],
      "warnings": [
        "Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。"
      ],
      "limitations": [
        "GEMINI_API_KEY 仍需通过环境变量生效。"
      ]
    }
  },
  "warnings": [
    "Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。"
  ],
  "limitations": [
    "GEMINI_API_KEY 仍需通过环境变量生效。"
  ]
}
```

这个样例对应的是 Gemini `project scope` 的标准成功路径。它和 `user scope` 的差异有两点：一是 `appliedScope` 会显式返回 `project`；二是 `scopePolicy.rollbackScopeMatchRequired = true`，后续回滚时必须带同一 scope，不能按 `user` 去恢复 `project` 快照。

Codex `import apply --json` 成功样例：

```bash
api-switcher import apply E:/tmp/exported-codex.json --profile codex-prod --force --json
```

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "import-apply",
  "data": {
    "sourceFile": "E:/tmp/exported-codex.json",
    "importedProfile": {
      "id": "codex-prod",
      "name": "codex-prod",
      "platform": "codex",
      "source": {
        "apiKey": "sk-c***56",
        "baseURL": "https://gateway.example.com/openai/v1"
      },
      "apply": {
        "OPENAI_API_KEY": "sk-c***56",
        "base_url": "https://gateway.example.com/openai/v1"
      }
    },
    "platformSummary": {
      "kind": "multi-file-composition",
      "composedFiles": [
        "C:/Users/test/.codex/config.toml",
        "C:/Users/test/.codex/auth.json"
      ],
      "facts": [
        {
          "code": "CODEX_MULTI_FILE_CONFIGURATION",
          "message": "Codex 当前由 config.toml 与 auth.json 共同组成有效配置。"
        },
        {
          "code": "CODEX_LIST_IS_PROFILE_LEVEL",
          "message": "list 仅展示 profile 级状态，不表示单文件可独立切换。"
        }
      ]
    },
    "scopePolicy": {
      "explicitScope": false,
      "highRisk": false,
      "rollbackScopeMatchRequired": false
    },
    "scopeCapabilities": [],
    "validation": {
      "ok": true,
      "errors": [],
      "warnings": [],
      "limitations": [
        {
          "code": "CODEX_MULTI_FILE_MANAGED",
          "message": "当前会同时托管 Codex 的 config.toml 与 auth.json。"
        }
      ],
      "managedBoundaries": [
        {
          "type": "managed-fields",
          "target": "C:/Users/test/.codex/config.toml",
          "managedKeys": [
            "base_url"
          ]
        },
        {
          "type": "managed-fields",
          "target": "C:/Users/test/.codex/auth.json",
          "managedKeys": [
            "OPENAI_API_KEY"
          ]
        },
        {
          "type": "multi-file-transaction",
          "targets": [
            "C:/Users/test/.codex/config.toml",
            "C:/Users/test/.codex/auth.json"
          ],
          "notes": [
            "Codex 导入应用会同时更新 config.toml 与 auth.json。"
          ]
        }
      ],
      "secretReferences": [
        {
          "key": "OPENAI_API_KEY",
          "source": "config",
          "present": true,
          "maskedValue": "sk-c***56"
        }
      ]
    },
    "preview": {
      "platform": "codex",
      "profileId": "codex-prod",
      "targetFiles": [
        {
          "path": "C:/Users/test/.codex/config.toml",
          "format": "toml",
          "exists": true,
          "managedScope": "multi-file",
          "role": "config",
          "managedKeys": [
            "base_url"
          ]
        },
        {
          "path": "C:/Users/test/.codex/auth.json",
          "format": "json",
          "exists": true,
          "managedScope": "multi-file",
          "role": "auth",
          "managedKeys": [
            "OPENAI_API_KEY"
          ]
        }
      ],
      "effectiveFields": [],
      "storedOnlyFields": [],
      "diffSummary": [
        {
          "path": "C:/Users/test/.codex/config.toml",
          "changedKeys": [
            "base_url"
          ],
          "hasChanges": true
        },
        {
          "path": "C:/Users/test/.codex/auth.json",
          "changedKeys": [
            "OPENAI_API_KEY"
          ],
          "hasChanges": true
        }
      ],
      "warnings": [],
      "limitations": [],
      "riskLevel": "low",
      "requiresConfirmation": false,
      "backupPlanned": true,
      "noChanges": false
    },
    "risk": {
      "allowed": true,
      "riskLevel": "low",
      "reasons": [],
      "limitations": []
    },
    "backupId": "snapshot-codex-20260419120000-abcdef",
    "changedFiles": [
      "C:/Users/test/.codex/config.toml",
      "C:/Users/test/.codex/auth.json"
    ],
    "noChanges": false,
    "summary": {
      "platformStats": [
        {
          "platform": "codex",
          "profileCount": 1,
          "profileId": "codex-prod",
          "warningCount": 0,
          "limitationCount": 1,
          "changedFileCount": 2,
          "backupCreated": true,
          "noChanges": false
        }
      ],
      "warnings": [],
      "limitations": [
        "当前会同时托管 Codex 的 config.toml 与 auth.json。"
      ]
    }
  },
  "warnings": [],
  "limitations": [
    "当前会同时托管 Codex 的 config.toml 与 auth.json。"
  ]
}
```

这个样例对应的是 Codex 的标准成功路径。因为 Codex 当前没有 scoped target，返回里可以没有 `appliedScope`；机器消费方不应把这个缺省误解为失败。

Claude `import apply --json` 成功样例：

```bash
api-switcher import apply E:/tmp/exported-claude.json --profile claude-prod --scope local --force --json
```

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "import-apply",
  "data": {
    "sourceFile": "E:/tmp/exported-claude.json",
    "importedProfile": {
      "id": "claude-prod",
      "name": "claude-prod",
      "platform": "claude",
      "source": {
        "token": "sk-l***56",
        "baseURL": "https://gateway.example.com/api"
      },
      "apply": {
        "ANTHROPIC_AUTH_TOKEN": "sk-l***56",
        "ANTHROPIC_BASE_URL": "https://gateway.example.com/api"
      }
    },
    "appliedScope": "local",
    "platformSummary": {
      "kind": "scope-precedence",
      "precedence": ["user", "project", "local"],
      "facts": [
        {
          "code": "CLAUDE_SCOPE_PRECEDENCE",
          "message": "Claude 支持 user < project < local 三层 precedence。"
        },
        {
          "code": "CLAUDE_LOCAL_SCOPE_HIGHEST",
          "message": "如果存在 local，同名字段最终以 local 为准。"
        }
      ]
    },
    "scopePolicy": {
      "requestedScope": "local",
      "resolvedScope": "local",
      "defaultScope": "project",
      "explicitScope": true,
      "highRisk": true,
      "rollbackScopeMatchRequired": false
    },
    "scopeCapabilities": [
      {
        "scope": "user",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true
      },
      {
        "scope": "project",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true
      },
      {
        "scope": "local",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true,
        "risk": "high",
        "confirmationRequired": true
      }
    ],
    "validation": {
      "ok": true,
      "errors": [],
      "warnings": [],
      "limitations": [
        {
          "code": "CLAUDE_MANAGED_FIELDS_ONLY",
          "message": "当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。"
        }
      ],
      "effectiveConfig": {
        "stored": [
          {
            "key": "ANTHROPIC_AUTH_TOKEN",
            "maskedValue": "sk-l***56",
            "source": "stored",
            "scope": "local",
            "secret": true
          },
          {
            "key": "ANTHROPIC_BASE_URL",
            "maskedValue": "https://gateway.example.com/api",
            "source": "stored",
            "scope": "local",
            "secret": false
          }
        ],
        "effective": [
          {
            "key": "ANTHROPIC_AUTH_TOKEN",
            "maskedValue": "sk-l***56",
            "source": "effective",
            "scope": "local",
            "secret": true
          },
          {
            "key": "ANTHROPIC_BASE_URL",
            "maskedValue": "https://gateway.example.com/api",
            "source": "effective",
            "scope": "local",
            "secret": false
          }
        ],
        "overrides": []
      },
      "managedBoundaries": [
        {
          "type": "scope-aware",
          "target": "E:/repo/.claude/settings.local.json",
          "managedKeys": [
            "ANTHROPIC_AUTH_TOKEN",
            "ANTHROPIC_BASE_URL"
          ],
          "notes": [
            "当前写入目标为 Claude 本地级配置文件。"
          ]
        }
      ],
      "secretReferences": [
        {
          "key": "ANTHROPIC_AUTH_TOKEN",
          "source": "config",
          "present": true,
          "maskedValue": "sk-l***56"
        }
      ]
    },
    "preview": {
      "platform": "claude",
      "profileId": "claude-prod",
      "targetFiles": [
        {
          "path": "E:/repo/.claude/settings.local.json",
          "format": "json",
          "exists": true,
          "managedScope": "partial-fields",
          "scope": "local",
          "role": "settings",
          "managedKeys": [
            "ANTHROPIC_AUTH_TOKEN",
            "ANTHROPIC_BASE_URL"
          ]
        }
      ],
      "effectiveFields": [
        {
          "key": "ANTHROPIC_AUTH_TOKEN",
          "maskedValue": "sk-l***56",
          "source": "effective",
          "scope": "local",
          "secret": true
        },
        {
          "key": "ANTHROPIC_BASE_URL",
          "maskedValue": "https://gateway.example.com/api",
          "source": "effective",
          "scope": "local",
          "secret": false
        }
      ],
      "storedOnlyFields": [],
      "diffSummary": [
        {
          "path": "E:/repo/.claude/settings.local.json",
          "changedKeys": [
            "ANTHROPIC_AUTH_TOKEN",
            "ANTHROPIC_BASE_URL"
          ],
          "hasChanges": true
        }
      ],
      "warnings": [],
      "limitations": [],
      "riskLevel": "high",
      "requiresConfirmation": true,
      "backupPlanned": true,
      "noChanges": false
    },
    "risk": {
      "allowed": true,
      "riskLevel": "high",
      "reasons": [],
      "limitations": []
    },
    "backupId": "snapshot-claude-20260419120000-abcdef",
    "changedFiles": [
      "E:/repo/.claude/settings.local.json"
    ],
    "noChanges": false,
    "summary": {
      "platformStats": [
        {
          "platform": "claude",
          "profileCount": 1,
          "profileId": "claude-prod",
          "targetScope": "local",
          "warningCount": 0,
          "limitationCount": 1,
          "changedFileCount": 1,
          "backupCreated": true,
          "noChanges": false
        }
      ],
      "warnings": [],
      "limitations": [
        "当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。"
      ]
    }
  },
  "warnings": [],
  "limitations": [
    "当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。"
  ]
}
```

这个样例对应“显式指定 `--scope local` 且带 `--force`”的成功路径。如果去掉 `--force`，Claude 会先返回 `CONFIRMATION_REQUIRED`，并把更高确认门槛的解释放进 `error.details.risk.reasons` 与 `limitations`。

失败样例：

对应的高风险失败样例如下：

```bash
api-switcher import apply E:/tmp/exported-claude.json --profile claude-prod --scope local --json
```

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": false,
  "action": "import-apply",
  "error": {
    "code": "CONFIRMATION_REQUIRED",
    "message": "当前操作风险较高，需要显式确认。请重新执行并附加 --force。",
    "details": {
      "referenceGovernance": {
        "hasReferenceProfiles": false,
        "hasInlineProfiles": true,
        "hasWriteUnsupportedProfiles": false,
        "primaryReason": "INLINE_SECRET_PRESENT",
        "reasonCodes": [
          "INLINE_SECRET_PRESENT"
        ],
        "referenceDetails": [
          {
            "code": "REFERENCE_ENV_UNRESOLVED",
            "field": "apiKey",
            "status": "missing",
            "reference": "env://GEMINI_API_KEY",
            "scheme": "env",
            "message": "引用 env://GEMINI_API_KEY 当前未解析，导入写入不会注入真实 secret。"
          },
          {
            "code": "REFERENCE_SCHEME_UNSUPPORTED",
            "field": "oauthToken",
            "status": "unsupported-scheme",
            "reference": "keychain://gemini/oauth-token",
            "scheme": "keychain",
            "message": "当前写入链路不支持 keychain:// 引用。"
          }
        ]
      },
      "risk": {
        "allowed": false,
        "riskLevel": "high",
        "reasons": [
          "Claude local scope 高于 project 与 user；同名字段写入后会直接成为当前项目的最终生效值。"
        ],
        "limitations": [
          "如果你只是想共享项目级配置，优先使用 project scope，而不是 local scope。"
        ]
      },
      "scopePolicy": {
        "requestedScope": "local",
        "resolvedScope": "local",
        "defaultScope": "project",
        "explicitScope": true,
        "highRisk": true,
        "rollbackScopeMatchRequired": false
      },
      "scopeCapabilities": [
        {
          "scope": "user",
          "detect": true,
          "preview": true,
          "use": true,
          "rollback": true,
          "writable": true
        },
        {
          "scope": "project",
          "detect": true,
          "preview": true,
          "use": true,
          "rollback": true,
          "writable": true
        },
        {
          "scope": "local",
          "detect": true,
          "preview": true,
          "use": true,
          "rollback": true,
          "writable": true,
          "risk": "high",
          "confirmationRequired": true
        }
      ]
    }
  },
  "warnings": [],
  "limitations": []
}
```

如果导入源来自默认 `export --json`，其中 inline secret 会被写成 `"<redacted:inline-secret>"`。这种导出可以继续用于 `import preview`，因为 preview 只需要保留字段位置、做 fidelity / drift / scope 分析；但它不能直接进入 `import apply`，因为 apply 需要可执行 secret 明文，而当前 contract 明确禁止从 redacted placeholder 反推真实值。

对应的 redacted-source 失败样例如下：

```bash
api-switcher import apply E:/tmp/exported-redacted.json --profile gemini-prod --json
```

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": false,
  "action": "import-apply",
  "warnings": [
    "导入文件包含 2 个 redacted inline secret 占位值；import preview 会保留字段位置，但不会把它当作真实 secret 明文。"
  ],
  "error": {
    "code": "IMPORT_SOURCE_REDACTED_INLINE_SECRETS",
    "message": "导入文件中的 inline secret 已被 redacted；当前不能直接进入 import apply。",
    "details": {
      "sourceFile": "E:/tmp/exported-redacted.json",
      "profileId": "gemini-prod",
      "redactedInlineSecretFields": [
        "source.apiKey",
        "apply.GEMINI_API_KEY"
      ]
    }
  }
}
```

这个失败入口的推荐消费顺序是：

1. 先读 `error.code`，确认当前是导入源不可执行，而不是 scope / confirmation / validation 类失败。
2. 再读 `warnings[]`，向用户解释“为什么 preview 还能继续看，但 apply 不允许继续执行”。
3. 最后读 `error.details.redactedInlineSecretFields[]`，把需要重新补 secret 明文的字段位置明确展示出来。

### add --json

`add` 成功返回的摘要也会带出当前平台的 scope 能力矩阵，便于 UI 在“新增 profile 后”的确认页继续展示后续可写 scope 与确认门槛。`data.summary.platformStats[]` 是 add 成功态的单平台聚合入口，适合先读取 warning/limitation 计数、变更文件计数、是否计划备份与平台 explainable 摘要。`data.summary.referenceStats` 会补出当前新增 profile 的 secret/reference 形态聚合，`data.summary.executabilityStats` 会补出同一条 profile 的写入可执行性聚合。推荐顺序是先读 `summary.platformStats[0]`，再读 `summary.referenceStats` 与 `summary.executabilityStats`，最后再展开 `risk`、`preview` 与 `scopeCapabilities`。文本输出也按这条顺序组织：先看“按平台汇总”，再看“referenceStats 摘要”和“executabilityStats 摘要”，最后进入 add 细节。

`add` 的 secret 输入面支持两类互斥模式：明文 `--key`，或 reference-only 的 `--secret-ref` / `--auth-reference`。reference-only 成功时，`profile.source.secret_ref` 与 `profile.apply.auth_reference` 会保留原始引用字符串，便于外部系统继续消费；同时 `summary.limitations` 会提示 `preview/use/import apply` 暂未消费该引用。若既没有 key 也没有 reference，失败码为 `ADD_INPUT_REQUIRED`；若同时传入明文 key 与 reference，失败码为 `ADD_INPUT_CONFLICT`。

```ts
type AddCommandOutput = {
  profile: Profile
  validation: ValidationResult
  preview: PreviewResult
  risk: PreviewRiskSummary
  summary: {
    platformStats?: SinglePlatformStat[]
    referenceStats?: SecretReferenceStats
    executabilityStats?: ExecutabilityStats
    warnings: string[]
    limitations: string[]
  }
  scopeCapabilities?: ScopeCapability[]
}
```

### preview --json

`data.scopePolicy` 描述本次预览请求的目标 scope 语义；`data.scopeCapabilities` 描述当前平台的 scope 操作能力。
`data.summary.platformStats[]` 是单平台命令的稳定平台级聚合入口；对 `preview`，它包含目标 scope、warning/limitation 计数、变更文件计数、是否计划备份和 `noChanges`。`data.summary.referenceStats` 会补出当前写入 profile 的 secret/reference 形态聚合，`data.summary.executabilityStats` 会补出同一条 profile 的写入可执行性聚合。推荐顺序是先读 `summary.platformStats[0]`，再读 `summary.referenceStats` 与 `summary.executabilityStats`，最后再展开 `preview`、`risk`、`scopePolicy` 与 scope 相关细节。文本输出也按这条顺序组织：先看“按平台汇总”，再看“referenceStats 摘要”和“executabilityStats 摘要”，最后进入 preview 细节。

语义补充：

- 对 Gemini 来说，`preview` 是先按四层 precedence 推导 effective config，再评估本次写入目标 scope 的风险、备份和变更结果。
- 完整 JSON 样例见 [`README.md`](../README.md) 中的 `preview --json` 示例。

样例阅读方式：

- 成功样例重点看 success payload 中的 `summary.platformStats`、`summary.referenceStats`、`summary.executabilityStats`、`preview`、`risk`、`scopePolicy`、`scopeCapabilities` 与 `scopeAvailability`。
- 失败样例重点看 action 级失败 envelope，以及 `error.details.scopePolicy`、`scopeAvailability` 里的稳定 failure details。

成功样例：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "preview",
  "data": {
    "profile": {
      "id": "gemini-prod",
      "platform": "gemini",
      "name": "Gemini 生产"
    },
    "preview": {
      "requiresConfirmation": true,
      "backupPlanned": true,
      "noChanges": false,
      "targetFiles": [
        {
          "path": "C:/Users/test/.gemini/settings.json",
          "scope": "project"
        }
      ]
    },
    "risk": {
      "allowed": false,
      "riskLevel": "high",
      "reasons": [
        "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。"
      ],
      "limitations": [
        "GEMINI_API_KEY 仍需通过环境变量生效。"
      ]
    },
    "summary": {
      "platformStats": [
        {
          "platform": "gemini",
          "profileCount": 1,
          "profileId": "gemini-prod",
          "targetScope": "project",
          "warningCount": 1,
          "limitationCount": 1,
          "changedFileCount": 1,
          "backupCreated": true,
          "noChanges": false
        }
      ],
      "warnings": [
        "高风险操作需要确认"
      ],
      "limitations": [
        "Gemini 最终认证结果仍受环境变量影响。"
      ]
    },
    "scopePolicy": {
      "requestedScope": "project",
      "resolvedScope": "project",
      "defaultScope": "user",
      "explicitScope": true,
      "highRisk": true,
      "riskWarning": "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。",
      "rollbackScopeMatchRequired": true
    },
    "scopeAvailability": [
      {
        "scope": "project",
        "status": "available",
        "detected": true,
        "writable": true,
        "path": "C:/work/.gemini/settings.json"
      }
    ],
    "scopeCapabilities": [
      {
        "scope": "project",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true,
        "risk": "high",
        "confirmationRequired": true
      }
    ],
    "summary": {
      "platformStats": [
        {
          "platform": "gemini",
          "profileCount": 1,
          "profileId": "gemini-prod",
          "targetScope": "project",
          "warningCount": 1,
          "limitationCount": 1,
          "changedFileCount": 1,
          "backupCreated": true,
          "noChanges": false
        }
      ],
      "warnings": [
        "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。"
      ],
      "limitations": [
        "GEMINI_API_KEY 仍需通过环境变量生效。"
      ]
    }
  }
}
```

失败样例：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": false,
  "action": "preview",
  "error": {
    "code": "PREVIEW_FAILED",
    "message": "当前无法解析 Gemini project scope 的 project root。",
    "details": {
      "requestedScope": "project",
      "resolvedScope": "project",
      "scopePolicy": {
        "requestedScope": "project",
        "resolvedScope": "project",
        "defaultScope": "user",
        "explicitScope": true,
        "highRisk": true,
        "riskWarning": "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。",
        "rollbackScopeMatchRequired": true
      },
      "scopeCapabilities": [
        {
          "scope": "user",
          "detect": true,
          "preview": true,
          "use": true,
          "rollback": true,
          "writable": true,
          "risk": "normal"
        },
        {
          "scope": "project",
          "detect": true,
          "preview": true,
          "use": true,
          "rollback": true,
          "writable": true,
          "risk": "high",
          "confirmationRequired": true
        }
      ],
      "scopeAvailability": [
        {
          "scope": "project",
          "status": "unresolved",
          "detected": false,
          "writable": false,
          "reasonCode": "PROJECT_ROOT_UNRESOLVED",
          "reason": "当前无法解析 Gemini project scope 的 project root。",
          "remediation": "请确认当前命令位于 Gemini project 根目录内，或显式设置 API_SWITCHER_GEMINI_PROJECT_ROOT。"
        }
      ]
    }
  }
}
```

```ts
type PreviewCommandOutput = {
  profile: Profile
  validation: ValidationResult
  preview: PreviewResult
  risk: PreviewRiskSummary
  summary: PreviewSummary
  scopePolicy?: SnapshotScopePolicy
  scopeCapabilities?: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
}
```

### use --json

成功时，`data.platformSummary` 会把平台 precedence 或多文件组合语义一起返回。
`data.scopeCapabilities` 描述本次平台能力矩阵。
`data.summary.platformStats[]` 是成功态的单平台聚合入口，包含目标 scope、warning/limitation 计数、变更文件计数、是否创建备份和 `noChanges`。`data.summary.referenceStats` 会补出当前写入 profile 的 secret 形态聚合，`data.summary.executabilityStats` 会补出当前写入 profile 的可执行性聚合。推荐顺序是先读 `summary.platformStats[0]`，再读 `summary.referenceStats` 与 `summary.executabilityStats`，最后再展开 `platformSummary`、`preview` 与写入产物字段。

语义补充：

- 成功态与 `CONFIRMATION_REQUIRED` 失败态都属于公共契约面；失败时结构化信息位于 `error.details`。
- 如果失败涉及 secret/reference 治理，`error.details.referenceGovernance` 会给出稳定的 `primaryReason` 与 `reasonCodes`；失败态不要读取 `summary.referenceStats`，需要 resolver 级 explainable 时再读 `referenceDetails[]`。
- 完整 JSON 样例见 [`README.md`](../README.md) 中的 `use --json` 成功/失败示例。

样例阅读方式：

- 成功样例重点看 success payload 中的 `summary.platformStats`、`platformSummary`、`scopeCapabilities`、`scopeAvailability` 与写入结果字段。
- 失败样例重点看 `CONFIRMATION_REQUIRED` 下的 `referenceGovernance`、`risk`、`scopePolicy`、`scopeCapabilities` 与 `scopeAvailability`；推荐先读 `error.code`，再读 `error.details.referenceGovernance.primaryReason/reasonCodes`，再按需展开 `error.details.referenceGovernance.referenceDetails[]`，最后再展开 `risk/scope/validation` 细节。

成功样例：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "use",
  "data": {
    "profile": {
      "id": "gemini-prod",
      "platform": "gemini",
      "name": "Gemini 生产"
    },
    "backupId": "snapshot-gemini-001",
    "changedFiles": [
      "C:/work/.gemini/settings.json"
    ],
    "noChanges": false,
    "platformSummary": {
      "kind": "scope-precedence",
      "precedence": [
        "system-defaults",
        "user",
        "project",
        "system-overrides"
      ],
      "currentScope": "project",
      "facts": [
        {
          "code": "GEMINI_SCOPE_PRECEDENCE",
          "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
        },
        {
          "code": "GEMINI_PROJECT_OVERRIDES_USER",
          "message": "project scope 会覆盖 user 中的同名字段。"
        }
      ]
    },
    "scopeAvailability": [
      {
        "scope": "project",
        "status": "available",
        "detected": true,
        "writable": true,
        "path": "C:/work/.gemini/settings.json"
      }
    ],
    "scopeCapabilities": [
      {
        "scope": "user",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true,
        "risk": "normal"
      },
      {
        "scope": "project",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true,
        "risk": "high",
        "confirmationRequired": true
      }
    ]
  }
}
```

失败样例：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": false,
  "action": "use",
  "warnings": [
    "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。"
  ],
  "limitations": [
    "GEMINI_API_KEY 仍需通过环境变量生效。"
  ],
  "error": {
    "code": "CONFIRMATION_REQUIRED",
    "message": "当前切换需要确认或 --force。",
    "details": {
      "referenceGovernance": {
        "hasReferenceProfiles": false,
        "hasInlineProfiles": true,
        "hasWriteUnsupportedProfiles": false,
        "primaryReason": "INLINE_SECRET_PRESENT",
        "reasonCodes": [
          "INLINE_SECRET_PRESENT"
        ],
        "referenceDetails": [
          {
            "code": "REFERENCE_ENV_UNRESOLVED",
            "field": "apiKey",
            "status": "missing",
            "reference": "env://GEMINI_API_KEY",
            "scheme": "env",
            "message": "引用 env://GEMINI_API_KEY 当前未解析，写入前仍需要人工确认。"
          },
          {
            "code": "REFERENCE_ENV_RESOLVED",
            "field": "secondaryApiKey",
            "status": "resolved",
            "reference": "env://GEMINI_SECONDARY_API_KEY",
            "scheme": "env",
            "message": "引用 env://GEMINI_SECONDARY_API_KEY 可在当前环境解析，但写入链路不会直接写入真实 secret。"
          }
        ]
      },
      "risk": {
        "allowed": false,
        "riskLevel": "high",
        "reasons": [
          "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。"
        ],
        "limitations": [
          "GEMINI_API_KEY 仍需通过环境变量生效。"
        ]
      },
      "scopePolicy": {
        "requestedScope": "project",
        "resolvedScope": "project",
        "defaultScope": "user",
        "explicitScope": true,
        "highRisk": true,
        "riskWarning": "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。",
        "rollbackScopeMatchRequired": true
      },
      "scopeCapabilities": [
        {
          "scope": "project",
          "detect": true,
          "preview": true,
          "use": true,
          "rollback": true,
          "writable": true,
          "risk": "high",
          "confirmationRequired": true
        }
      ],
      "scopeAvailability": [
        {
          "scope": "project",
          "status": "available",
          "detected": true,
          "writable": true,
          "path": "C:/work/.gemini/settings.json"
        }
      ]
    }
  }
}
```

```ts
type UseCommandOutput = {
  profile: Profile
  backupId?: string
  platformSummary?: PlatformExplainableSummary
  validation?: ValidationResult
  preview: PreviewResult
  risk: UseRiskSummary
  summary: UseSummary
  changedFiles: string[]
  noChanges: boolean
  scopeCapabilities?: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
}
```

确认失败时，`error.details` 至少包含：

```ts
type ConfirmationRequiredDetails = {
  risk: UseRiskSummary
  scopePolicy?: SnapshotScopePolicy
  scopeCapabilities?: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  referenceGovernance?: ReferenceGovernanceFailureDetails
}
```

其中 resolver-aware 失败细节会进一步展开为：

```ts
type ReferenceGovernanceFailureDetails = {
  hasReferenceProfiles: boolean
  hasInlineProfiles: boolean
  hasWriteUnsupportedProfiles: boolean
  primaryReason?: ReferenceGovernanceReasonCode
  reasonCodes: ReferenceGovernanceReasonCode[]
  referenceDetails?: ReferenceGovernanceDetail[]
}

type ReferenceGovernanceDetail = {
  code:
    | 'REFERENCE_VALUE_MISSING'
    | 'REFERENCE_ENV_RESOLVED'
    | 'REFERENCE_ENV_UNRESOLVED'
    | 'REFERENCE_SCHEME_UNSUPPORTED'
  field: string
  status: 'resolved' | 'missing' | 'unsupported-scheme'
  reference?: string
  scheme?: string
  message: string
}
```

### rollback --json

成功时，`data.platformSummary` 会把恢复目标所属平台的 explainable 摘要一起返回。
`data.scopePolicy` 来自快照 manifest，`data.scopeCapabilities` 来自当前平台 policy；Gemini `project` 回滚还会附带当前环境里的 `scopeAvailability`。
`data.summary.platformStats[]` 是成功态的单平台聚合入口，包含目标 scope、warning/limitation 计数、恢复文件计数和 `noChanges`。`data.summary.referenceStats` 会补出快照上一版 profile 的 secret 形态聚合，`data.summary.executabilityStats` 会补出同一条 profile 的写入可执行性聚合。推荐顺序是先读 `summary.platformStats[0]`，再读 `summary.referenceStats` 与 `summary.executabilityStats`，最后再展开 `platformSummary`、`rollback` 与恢复产物字段。文本输出也按这条顺序组织：先看“按平台汇总”，再看“referenceStats 摘要”和“executabilityStats 摘要”，最后进入恢复细节。

语义补充：

- Gemini scope mismatch 失败时，`ROLLBACK_SCOPE_MISMATCH` 也应返回结构化 `error.details.scopePolicy`、`error.details.scopeCapabilities` 与 `error.details.scopeAvailability`。
- Gemini `project` scope 当前不可解析时，`ROLLBACK_FAILED` 会先返回 `scopeAvailability` 失败，不进入 scope mismatch 判定。
- 对这类 Gemini availability 失败，机器消费方不应只依赖顶层 `ROLLBACK_FAILED`；稳定语义在 `error.details.scopeAvailability.project.status = "unresolved"` 以及配套的 `reasonCode` / `reason` / `remediation`。
- 完整 JSON 样例见 [`README.md`](../README.md) 中的 `rollback --json` 成功/失败示例。

样例阅读方式：

- 成功样例重点看 success payload 中的 `summary.platformStats`、`platformSummary`、`scopePolicy`、`scopeCapabilities`、`scopeAvailability` 与恢复结果字段。
- 失败样例重点看 `ROLLBACK_SCOPE_MISMATCH` 或 `ROLLBACK_FAILED` 下的 `scopePolicy`、`scopeCapabilities` 与 `scopeAvailability`。

成功样例：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "rollback",
  "data": {
    "backupId": "snapshot-gemini-001",
    "restoredFiles": [
      "C:/work/.gemini/settings.json"
    ],
    "platformSummary": {
      "kind": "scope-precedence",
      "precedence": [
        "system-defaults",
        "user",
        "project",
        "system-overrides"
      ],
      "currentScope": "project",
      "facts": [
        {
          "code": "GEMINI_SCOPE_PRECEDENCE",
          "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
        },
        {
          "code": "GEMINI_PROJECT_OVERRIDES_USER",
          "message": "project scope 会覆盖 user 中的同名字段。"
        }
      ]
    },
    "scopePolicy": {
      "requestedScope": "project",
      "resolvedScope": "project",
      "defaultScope": "user",
      "explicitScope": true,
      "highRisk": true,
      "riskWarning": "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。",
      "rollbackScopeMatchRequired": true
    },
    "scopeCapabilities": [
      {
        "scope": "project",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true,
        "risk": "high",
        "confirmationRequired": true
      }
    ],
    "scopeAvailability": [
      {
        "scope": "project",
        "status": "available",
        "detected": true,
        "writable": true,
        "path": "C:/work/.gemini/settings.json"
      }
    ],
    "summary": {
      "platformStats": [
        {
          "platform": "gemini",
          "profileCount": 1,
          "targetScope": "project",
          "warningCount": 1,
          "limitationCount": 1,
          "restoredFileCount": 1,
          "noChanges": false
        }
      ],
      "warnings": [
        "已恢复快照中的托管文件"
      ],
      "limitations": [
        "回滚仅恢复快照覆盖的托管文件。"
      ]
    }
  }
}
```

失败样例：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": false,
  "action": "rollback",
  "error": {
    "code": "ROLLBACK_SCOPE_MISMATCH",
    "message": "快照属于 user scope，不能按 project scope 回滚。",
    "details": {
      "scopePolicy": {
        "requestedScope": "project",
        "resolvedScope": "user",
        "defaultScope": "user",
        "explicitScope": true,
        "highRisk": true,
        "rollbackScopeMatchRequired": true
      },
      "scopeCapabilities": [
        {
          "scope": "project",
          "detect": true,
          "preview": true,
          "use": true,
          "rollback": true,
          "writable": true,
          "risk": "high",
          "confirmationRequired": true
        }
      ],
      "scopeAvailability": [
        {
          "scope": "project",
          "status": "available",
          "detected": true,
          "writable": true,
          "path": "C:/work/.gemini/settings.json"
        }
      ]
    }
  }
}
```

```ts
type RollbackCommandOutput = {
  backupId: string
  restoredFiles: string[]
  platformSummary?: PlatformExplainableSummary
  rollback?: RollbackResult
  scopePolicy?: SnapshotScopePolicy
  scopeCapabilities?: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  summary: RollbackSummary
}
```

失败且 adapter 已返回 rollback 结果时，`error.details` 至少包含：

```ts
type RollbackErrorDetails = {
  rollback?: RollbackResult
  scopePolicy?: SnapshotScopePolicy
  scopeCapabilities?: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
}
```
