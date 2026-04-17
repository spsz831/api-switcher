# Public JSON Output Schema

本文档描述 `api-switcher --json` 输出中当前承诺稳定的公共字段。未列出的 adapter 内部细节仍可能随平台契约细化而扩展。

机器可读 JSON Schema 位于 [`docs/public-json-output.schema.json`](public-json-output.schema.json)。该 schema 只冻结公共 envelope、scope capability、scope policy 与命令级公共字段，不冻结 adapter 内部扩展对象。

CLI 也可以直接输出当前契约：

```bash
api-switcher schema --json
api-switcher schema --schema-version --json
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

## Command-Specific Contracts

### schema --json

完整 schema 输出会返回当前契约版本、schema ID 和机器可读 JSON Schema：

```ts
type SchemaCommandOutput = {
  schemaVersion: '2026-04-15.public-json.v1'
  schemaId: 'https://api-switcher.local/schemas/public-json-output.schema.json'
  schema: Record<string, unknown>
}
```

`schema --schema-version --json` 是轻量版本探测，只返回版本字段：

```ts
type SchemaVersionCommandOutput = {
  schemaVersion: '2026-04-15.public-json.v1'
}
```

### current --json

`current` 会在每个平台检测结果里输出当前检测态、scope 能力矩阵与当前环境里的 scope 可用性。`details`、`effectiveConfig`、`managedBoundaries` 等 adapter 细节允许扩展；稳定字段是 envelope、`summary`、`detections[].platform/managed/targetFiles/currentScope/scopeCapabilities/scopeAvailability`。

语义补充：

- 对 Gemini 来说，`currentScope` 是在 `system-defaults < user < project < system-overrides` 四层 precedence 推导后的当前生效来源。
- 完整 JSON 样例见 [`README.md`](../README.md) 中的 `current --json` 示例。

```ts
type CurrentCommandOutput = {
  current: Record<string, string>
  lastSwitch?: unknown
  detections: CurrentProfileResult[]
  summary: Summary
}

type CurrentProfileResult = {
  platform: string
  matchedProfileId?: string
  managed: boolean
  targetFiles: unknown[]
  currentScope?: string
  scopeCapabilities?: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
}
```

### list --json

`list` 的每个 profile 条目会带出该 profile 所属平台的 scope 能力矩阵；Gemini 还会附带当前环境里的 `scopeAvailability`，便于 UI 同时判断“入口该不该显示”和“入口点了之后当前会不会失败”。

```ts
type ListCommandOutput = {
  profiles: ListCommandItem[]
  summary: Summary
}

type ListCommandItem = {
  profile: Profile
  current: boolean
  healthStatus: string
  riskLevel: string
  scopeCapabilities?: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
}
```

### validate --json

`validate` 的每个 item 会带出对应 profile 平台的 scope 能力矩阵，便于 UI 在校验结果页展示该平台可写 scope、只读 scope 和确认门槛。

```ts
type ValidateCommandOutput = {
  items: ValidateCommandItem[]
  summary: Summary
}

type ValidateCommandItem = {
  profileId: string
  platform: string
  validation: ValidationResult
  scopeCapabilities?: ScopeCapability[]
}
```

### export --json

`export` 的每个导出 profile 条目会带出所属平台的 scope 能力矩阵；Gemini 还会导出当前探测到的 `scopeAvailability` 与 `defaultWriteScope`，便于迁移工具或 UI 保留“默认写到哪一层”以及“导出时当前环境里 project scope 是否可用”。

```ts
type ExportCommandOutput = {
  profiles: ExportedProfileItem[]
  summary: Summary
}

type ExportedProfileItem = {
  profile: Profile
  validation?: ValidationResult
  observedAt?: string
  defaultWriteScope?: string
  scopeCapabilities?: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
}
```

约定：

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
  platformStats: ImportPreviewPlatformStat[]
  decisionCodeStats: ImportPreviewDecisionCodeStat[]
  driftKindStats: ImportPreviewDriftKindStat[]
  warnings: string[]
  limitations: string[]
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
  exportedObservation?: ImportObservation
  localObservation?: ImportObservation
  fidelity?: ImportFidelityReport
  previewDecision: ImportPreviewDecision
}
```

约定：

- `exportedObservation` 与 `localObservation` 不得相互覆盖，也不得被合并成一份模糊对象。
- `fidelity.status='mismatch'` 表示导出环境与当前本地环境在关键执行语义上存在偏差。
- `driftKind` 用来区分 mismatch 的来源：默认作用域漂移、availability 漂移、capability 漂移。
- `severity` 用来表达该 drift 对后续 apply 设计的影响强度；当前 `availability-drift` 中的 Gemini `project` 不可解析会被标为 `blocking`。
- `groupedMismatches` 是对 `mismatches[]` 的稳定结构化分组，固定按 `driftKind` 输出，便于机器消费方直接读取每类 drift 的数量和明细，而不必自行二次聚合。
- `previewDecision.canProceedToApplyDesign=false` 仅表示当前不应继续进入未来 apply 设计，不代表整个 `import preview` 命令失败。
- `previewDecision.reasonCodes` / `previewDecision.reasons` 用来稳定表达“为什么当前可以或不可以继续进入 apply 设计”；上层调用方应优先消费 `code`，`message` 只用于展示。
- `summary.decisionCodeStats` 用来聚合整批 item 的 decision reasons，适合列表页、面板页直接显示“本批次阻塞主要来自哪些 decision code”。
- `summary.driftKindStats` 用来聚合整批 item 的 drift 类型，适合快速判断当前导入批次主要是 default scope 漂移、availability 漂移还是 capability 漂移。
- `sourceCompatibility` 用来说明导入源是严格 schema 模式，还是“缺少 schemaVersion 但仍可兼容读取”的降级模式。
- `summary` 提供整批导入项的状态统计，便于 UI/CLI 先给总览，再展开单项差异。
- 更完整的 mixed-batch 接入实践见 [`docs/import-preview-consumer-guide.md`](./import-preview-consumer-guide.md)。

推荐消费顺序：

1. 先读取 `sourceCompatibility`，判断当前导入源是否是严格 schema 模式，还是兼容降级模式。
2. 再读取 `summary.totalItems`、`summary.matchCount`、`summary.mismatchCount`、`summary.partialCount`、`summary.insufficientDataCount`，确认整批结果分布。
3. 对 batch-level UI、批处理脚本或路由决策，优先消费 `summary.decisionCodeStats` 与 `summary.driftKindStats`，不要先遍历 `items[]` 自己重算。
4. 只有在需要展开单条 profile 细节时，再读取 `items[]` 下的 `fidelity`、`previewDecision`、`exportedObservation` 与 `localObservation`。
5. 对单条 item，机器消费方应优先使用 `previewDecision.reasonCodes`、`previewDecision.reasons[].code`、`fidelity.groupedMismatches[].driftKind` 这类稳定 code/enum；`message`、`highlights` 和文本摘要主要用于展示。

### import apply --json

命令语法：

```bash
api-switcher import apply <file> --profile <id> [--scope <scope>] [--force] [--json]
```

当前契约边界：

- 仅支持 Gemini profile（Gemini-only）。
- 一次只应用单个 profile（必须显式传 `--profile`）。
- apply 相关决策遵循 local-first：真正进入 apply 的判定以后者 `localObservation` 为准，`exportedObservation` 只用于 fidelity 对比与解释。
- gate 顺序固定为 availability-before-confirmation：先判定目标 scope 当前是否可用，再评估确认门槛（`CONFIRMATION_REQUIRED`）。
- apply 成功后的 rollback 依赖快照 provenance；当前 provenance 会绑定 `origin=import-apply`、`sourceFile` 与 `importedProfileId`。
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
  warnings: string[]
  limitations: string[]
}

type ImportApplyCommandOutput = {
  sourceFile: string
  importedProfile: Profile
  appliedScope: 'user' | 'project'
  scopePolicy: SnapshotScopePolicy
  scopeCapabilities: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  validation: ValidationResult
  preview: PreviewResult
  risk: ImportApplyRiskSummary
  backupId: string
  changedFiles: string[]
  noChanges: boolean
  summary: ImportApplySummary
}
```

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
- machine-readable schema 只冻结失败路径里的稳定字段，不对失败 `code` 与 adapter 私有 detail 做过度枚举。

### add --json

`add` 成功返回的摘要也会带出当前平台的 scope 能力矩阵，便于 UI 在“新增 profile 后”的确认页继续展示后续可写 scope 与确认门槛。

```ts
type AddCommandOutput = {
  profile: Profile
  validation: ValidationResult
  preview: PreviewResult
  risk: PreviewRiskSummary
  summary: Summary
  scopeCapabilities?: ScopeCapability[]
}
```

### preview --json

`data.scopeCapabilities` 描述当前平台的 scope 操作能力。

语义补充：

- 对 Gemini 来说，`preview` 是先按四层 precedence 推导 effective config，再评估本次写入目标 scope 的风险、备份和变更结果。
- 完整 JSON 样例见 [`README.md`](../README.md) 中的 `preview --json` 示例。

```ts
type PreviewCommandOutput = {
  profile: Profile
  validation: ValidationResult
  preview: PreviewResult
  risk: PreviewRiskSummary
  summary: PreviewSummary
  scopeCapabilities?: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
}
```

### use --json

成功时，`data.scopeCapabilities` 描述本次平台能力矩阵。

语义补充：

- 成功态与 `CONFIRMATION_REQUIRED` 失败态都属于公共契约面；失败时结构化信息位于 `error.details`。
- 完整 JSON 样例见 [`README.md`](../README.md) 中的 `use --json` 成功/失败示例。

```ts
type UseCommandOutput = {
  profile: Profile
  backupId?: string
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
}
```

### rollback --json

成功时，`data.scopePolicy` 来自快照 manifest，`data.scopeCapabilities` 来自当前平台 policy；Gemini `project` 回滚还会附带当前环境里的 `scopeAvailability`。

语义补充：

- Gemini scope mismatch 失败时，`ROLLBACK_SCOPE_MISMATCH` 也应返回结构化 `error.details.scopePolicy`、`error.details.scopeCapabilities` 与 `error.details.scopeAvailability`。
- Gemini `project` scope 当前不可解析时，`ROLLBACK_FAILED` 会先返回 `scopeAvailability` 失败，不进入 scope mismatch 判定。
- 完整 JSON 样例见 [`README.md`](../README.md) 中的 `rollback --json` 成功/失败示例。

```ts
type RollbackCommandOutput = {
  backupId: string
  restoredFiles: string[]
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
