# Gemini import apply Read-Only Design

## Context

当前仓库已经具备：

- `import <file>` preview-only 入口
- `import preview` 的 item-level / batch-level explainable
- Gemini `user/project` scope 的 capability、availability、risk、integrity 模型
- `use/rollback` 的 Gemini scope gate、确认门槛和回滚完整性约束

当前仍然没有：

- `import apply`
- 基于导入源的写入 contract
- 导入写入的 scope gate、确认门槛和 rollback provenance 设计

因此这份文档的目标不是进入实现，而是先冻结 `Gemini import apply` 第一版的执行边界。

## Scope

本文档只覆盖：

- Gemini
- 单条 profile 的 `import apply`
- 执行边界
- 确认门槛
- local re-resolve 原则
- 成功/失败 contract 轮廓
- rollback 语义

本文档不覆盖：

- Claude / Codex 的 `import apply`
- 批量 apply
- interactive prompt
- 具体实现计划

## Decision Summary

本设计采用 `local-first apply` 模型。

结论：

- 第一版 `import apply` 只支持 Gemini
- 第一版一次只允许 apply 单条 profile
- `import <file>` 继续保持 preview-only
- `import apply` 读取导入文件中的 profile 内容，但所有执行判断都必须重新基于本地环境解析
- 导出 observation 只用于 explainable，不参与执行授权
- `project` 仍然是显式 opt-in 高风险写入目标
- `--force` 只承担确认责任，不承担环境修复责任

## Product Goals

- 为未来 Gemini 导入写入定义稳定、安全、可解释的执行边界
- 保持 `import preview` 与 `import apply` 在 explainable 语言上的连续性
- 避免把导出机环境观察误当成导入机执行真相
- 复用现有 Gemini `use/rollback` 的 scope gate、确认门槛和回滚完整性

## Non-Goals

- 不做跨平台通用 `import apply`
- 不做批量 apply
- 不自动创建 project root
- 不从导出文件 path 反推本地 project root
- 不允许 `--force` 越过 availability gate
- 不把 `previewDecision.recommendedScope` 当成隐式执行目标

## Command Model

建议新增显式命令：

```bash
api-switcher import apply <file> --profile <profile-id> [--scope user|project] [--force]
```

命令语义：

- `import <file>` 继续表示 preview-only
- `import apply` 是单独的写入入口
- `--profile` 必填，用于显式选择单条导入 profile
- `--scope` 可选；未显式提供时，按 Gemini 当前默认写入目标解析
- `--force` 只在高风险但 availability 已通过时生效

## Execution Boundary

`import apply` 本质上是：

- 从导入文件中读取一条 Gemini profile
- 再按当前本地 Gemini policy 执行一次受控写入

它不是：

- 把导出机环境原样恢复到导入机
- 按导出文件里的 scope/path 直接恢复
- 用导出 observation 取代本地 scope 解析

冻结边界如下：

1. 不自动创建 project root
2. 不根据导出文件中的 path 猜测本地目标目录
3. 不因为导出时 `project` 可用，就默认按 `project` 写入
4. 不允许 `previewDecision.canProceedToApplyDesign = false` 时继续执行
5. 不允许 `--force` 越过 availability gate
6. 成功写入后仍按实际写入 scope 建立独立快照并要求 scope 一致回滚

## Gate Order

`import apply` 应采用固定的五段闸门：

1. `source gate`
2. `local resolution gate`
3. `availability gate`
4. `confirmation gate`
5. `backup/apply gate`

### 1. Source Gate

这一层解决“导入源能不能作为候选输入”：

- 文件必须可读取
- 文件必须是 `export --json` 兼容输出
- 必须能解析出 `--profile` 指定的 profile
- profile 必须是 `gemini`
- profile source 必须满足最基本完整性要求

这一层失败只属于导入源问题，不进入 scope 语义。

### 2. Local Resolution Gate

这一层只决定“请求目标”：

- 如果显式传了 `--scope`，按显式 scope 解析
- 如果没有传 `--scope`，按当前本地 Gemini 默认写入目标解析
- 不允许用导出文件中的 `defaultWriteScope` 取代本地解析结果

### 3. Availability Gate

这一层决定“本地现在能不能写”：

- `user` 按本地 user scope 可写性判断
- `project` 必须重新解析 project root 与目标路径
- 如果 `project` 解析失败、路径不可用或不可写，直接失败
- 失败时必须返回 availability failure 与 remediation
- 此时不得提示“加 `--force` 即可”

### 4. Confirmation Gate

这一层只在 availability 已通过后才有意义：

- `resolvedScope = user` 时，不需要额外确认
- `resolvedScope = project` 时，继续作为高风险操作
- `project` 且未传 `--force` 时，返回确认门槛失败

确认门槛的风险文案必须持续强调：

- `project` 会覆盖 `user`
- 影响范围是当前项目，不是全局用户目录
- 即使 project 写入成功，更高 precedence 的 `system-overrides` 仍可能覆盖最终生效值

### 5. Backup/Apply Gate

这一层只在前四层都通过时执行：

- 先建立与实际目标 scope 绑定的独立快照
- 再执行写入
- 结果中的 `appliedScope`、快照 manifest 和后续 rollback 都以实际写入 scope 为准

## Local Re-Resolve Principle

这是 `import apply` 的最高优先级原则。

核心定义：

- 导入文件提供“要写什么”
- 本地 re-resolve 决定“能不能写、写到哪、需要什么门槛”

冻结为以下六条：

### 1. Exported Observation Is Explainable Only

以下字段只允许用于 explainable，不允许直接驱动执行：

- `defaultWriteScope`
- `scopeCapabilities`
- `scopeAvailability`
- `observedAt`
- 导出时记录的任何 path

### 2. Local Policy Wins

真正参与执行的 policy 必须来自当前本地：

- 当前 Gemini `scopeCapabilities`
- 当前 Gemini `scopePolicy`
- 当前 precedence 规则
- 当前环境重新解析得到的 `scopeAvailability`

### 3. recommendedScope Is Suggestion Only

`import preview.previewDecision.recommendedScope` 可以作为展示建议，但不能成为隐式执行目标。

因此：

- 没有 `--scope` 时，仍走本地默认写入目标
- 不能因为 preview 推荐 `project` 就自动切换到 `project`
- 不能因为导出时默认是 `project` 就自动切换到 `project`

### 4. Project Root Must Be Re-Discovered Locally

对 Gemini `project` 来说：

- project root 必须在导入机本地重新发现
- `.gemini/settings.json` 必须在导入机本地重新解析
- 不允许从导出 path 映射本地 project root
- 不允许根据导出目录结构猜本地目标目录

### 5. Preview Pass Does Not Grant Apply Pass

即使先前的 `import preview` 结果是：

- `canProceedToApplyDesign = true`
- `recommendedScope = user|project`

`import apply` 执行前仍必须重新做本地解析，因为 preview 和 apply 之间环境可能变化。

### 6. Imported Profile Content Is Reusable, Execution Carrier Is Local

真正可复用的是 profile 的业务内容，例如：

- API key
- auth type
- Gemini 托管字段

但写入目标、确认门槛、rollback 约束都必须由本地决定。

## Failure Taxonomy

建议按四层分类：

### 1. 导入源失败

- `IMPORT_SOURCE_NOT_FOUND`
- `IMPORT_SOURCE_INVALID`
- `IMPORT_UNSUPPORTED_SCHEMA`
- `IMPORT_PROFILE_NOT_FOUND`
- `IMPORT_PLATFORM_NOT_SUPPORTED`

其中 `IMPORT_PLATFORM_NOT_SUPPORTED` 在第一版里专指：

- 找到了 profile
- 但它不是 `gemini`
- 或当前 `import apply` 仍未对该平台开放

### 2. 本地执行前置失败

- `IMPORT_APPLY_NOT_READY`
- `IMPORT_SCOPE_UNAVAILABLE`

语义区分：

- `IMPORT_APPLY_NOT_READY` 用于 explainable 层面的执行阻断，例如当前 item 不应继续进入 apply
- `IMPORT_SCOPE_UNAVAILABLE` 用于 availability gate 失败，例如 project root unresolved 或 target path unavailable

### 3. 确认门槛失败

- `CONFIRMATION_REQUIRED`

继续复用现有 Gemini `use` 的确认失败语义。

### 4. 执行阶段失败

- `VALIDATION_FAILED`
- `APPLY_FAILED`
- `IMPORT_APPLY_FAILED`

约束：

- `VALIDATION_FAILED` 只用于 profile 内容校验失败
- `APPLY_FAILED` 只用于 adapter 实际写入失败
- `IMPORT_APPLY_FAILED` 只作为 orchestration 级兜底错误

## Success Contract Shape

成功态建议至少包含：

```ts
type ImportApplyCommandOutput = {
  sourceFile: string
  importedProfile: Profile
  appliedScope: 'user' | 'project'
  scopePolicy: SnapshotScopePolicy
  scopeCapabilities: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  validation: ValidationResult
  preview: PreviewResult
  risk: {
    allowed: true
    riskLevel: 'low' | 'medium' | 'high'
    reasons: string[]
    limitations: string[]
  }
  backupId: string
  changedFiles: string[]
  noChanges: boolean
  summary: {
    warnings: string[]
    limitations: string[]
  }
}
```

设计意图：

- 保留 `validation` / `preview`，让 `import apply` 与现有 `use` 结果模型保持可比
- `appliedScope` 明确表达实际写入目标
- `scopePolicy` / `scopeCapabilities` / `scopeAvailability` 继续承担结构化 explainable

## Failure Details Shape

建议冻结以下最小结构：

### 导入源失败

- `sourceFile`
- `profileId`（如果有）

### `IMPORT_APPLY_NOT_READY`

- `sourceFile`
- `profileId`
- `previewDecision`
- `fidelity`
- `localObservation`
- 必要时附 `exportedObservation`

### `IMPORT_SCOPE_UNAVAILABLE`

- `scopePolicy`
- `scopeCapabilities`
- `scopeAvailability`

### `CONFIRMATION_REQUIRED`

- `risk`
- `scopePolicy`
- `scopeCapabilities`
- `scopeAvailability`

### `VALIDATION_FAILED` / `APPLY_FAILED`

- 继续沿用现有 `validation` / `apply` details

## Rollback Semantics

`import apply` 不应引入独立 rollback 模型，而应继续沿用现有 Gemini scope integrity：

- `import apply` 成功后建立独立快照
- 快照 manifest 必须记录实际写入 scope
- 如果写的是 `project`，rollback 仍要求 scope 匹配
- import 产生的快照与普通 `use` 产生的快照在 rollback 语义上应完全等价

建议仅增加 provenance 信息用于审计：

```ts
type SnapshotProvenance = {
  origin: 'import-apply'
  sourceFile: string
  importedProfileId: string
}
```

该字段只用于追踪来源，不参与 rollback 判定。

## UX Rules

1. availability failure 优先级高于 confirmation failure
2. confirmation failure 优先级高于 apply failure
3. `--force` 不能把 availability failure 伪装成可继续执行
4. `project` 的风险文案必须稳定表达“覆盖 user、影响当前项目、仍可能被更高 precedence 覆盖”
5. `import preview` 与 `import apply` 应复用同一套 scope / fidelity / decision 语言

## Acceptance Criteria

本设计落地后，应满足：

1. 第一版 `import apply` 只支持 Gemini 单条 profile
2. `import <file>` 继续保持 preview-only
3. `import apply` 不信任导出 observation 作为执行真相
4. `project` 仍然先过 availability gate，再过 confirmation gate
5. `--force` 不可绕过 availability failure
6. import 写入后的快照与普通 `use` 快照在 rollback 语义上保持一致
7. 成功态与失败态都能稳定输出 scope-aware explainable

## Recommendation

建议把这份 spec 作为 `Gemini import apply` 第一版的产品冻结基线。

下一步如果继续推进，应先基于本 spec 写实现计划，再进入代码阶段。实现时优先复用现有：

- Gemini `use` 的 risk / confirmation 模型
- Gemini `rollback` 的 scope integrity 模型
- `import preview` 的 fidelity / previewDecision explainable
