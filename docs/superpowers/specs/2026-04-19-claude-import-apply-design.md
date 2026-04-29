# Claude Import Apply Design

## Context

当前仓库已经具备：

- `import preview` 的稳定输出与 explainable 结构
- `import apply` 对 Gemini / Codex 的执行链路
- Claude 平台真实 adapter，包含：
  - `validate`
  - `preview`
  - `apply`
  - `rollback`
- Claude 三层可写 scope：
  - `user`
  - `project`
  - `local`

当前仓库仍然没有：

- Claude `import apply`
- Claude 三层 scope 在导入写入场景下的明确确认策略
- Claude `local` scope 在导入写入场景下的产品级风险定义

因此这份文档的目标不是重构 `import apply` 主流程，而是先冻结 Claude 第一版导入写入边界。

## Scope

本文档只覆盖：

- `import apply` 从 Gemini + Codex 扩到 Gemini + Codex + Claude
- Claude 单条 profile 的 `import apply`
- Claude `user / project / local` 三层 scope 的执行边界
- `local` scope 的确认门槛
- 成功 / 失败 contract 的平台语义

本文档不覆盖：

- 批量 apply
- 交互式确认
- 更强的跨机器 fidelity gate
- Claude adapter 的大规模重构
- Claude rollback 语义全面升级为 Gemini 式严格 scope mismatch

## Decision Summary

本设计采用 `full-scope support with asymmetric risk` 模型。

结论：

- 第一版开放 Claude `user / project / local` 全部三层 scope 的 `import apply`
- 不做“只开 user/project”的阉割版本
- 不引入 Gemini 式 availability gate
- `local` 作为 Claude 第一版的高敏感导入目标，要求显式确认
- `user / project` 继续沿用现有 Claude `use` 的风险模型，不额外抬高门槛
- `ImportApplyService` 只做必要的平台感知扩展，不重构主链

## Product Goals

- 让 Claude `import apply` 与现有 Claude `preview / use / rollback` 产品面一致
- 避免出现“平时能 `use --scope local`，导入时却不能 `import apply --scope local`”的能力断裂
- 把风险真正集中到 Claude `local` 这个最高优先级 scope 上，而不是假装三层 scope 完全等价
- 保持实现成本可控，尽量复用现有 adapter / snapshot / risk 体系

## Non-Goals

- 不把 Claude scope 语义改造成 Gemini 那样的 availability-first 模型
- 不要求 Claude `project` / `local` 在导入时先做 project root availability 结构化探测
- 不在本阶段把 Claude rollback 升级成必须严格匹配 scope
- 不引入新的 Claude scope
- 不把 `import apply` 抽象成更大的平台策略框架

## Why This Shape

Claude 与 Gemini / Codex 的差异在于：

- 它不是无 scope 平台
- 也不是需要 availability gate 的平台
- 它已经具备三层真实可写 scope

所以 Claude 不是 Codex 式“简单接入”，也不是 Gemini 式“高完整性 gate 接入”。

最合理的第一版是：

- scope 全开
- 风险分级不对称
- 只在最敏感的 `local` 上增加更明确确认

## Approach Options

### Option A. 保守版，只开 `user / project`

做法：

- Claude 支持 `import apply`
- 但拒绝 `--scope local`

优点：

- 规则更简单
- 短期文案成本更低

缺点：

- 产品面不一致
- 用户会质疑为什么 `use --scope local` 可用、`import apply --scope local` 却不可用

### Option B. 全 scope 开放，但 `local` 单独抬高确认门槛

做法：

- `user / project / local` 全部开放
- `user / project` 沿用现有 Claude 风险模型
- `local` 视为高敏感 scope，需要更明确确认

优点：

- 产品面完整
- 风险控制集中且可解释
- 最符合现有 Claude scope 真实能力

缺点：

- 需要额外定义 `local` 的风险文案
- 文档和测试比 Option A 多一些

### Option C. 三层全开放且同权

做法：

- `user / project / local` 全开
- 不为 `local` 增加任何额外门槛

优点：

- 实现最直接

缺点：

- 对 `local` 过于宽松
- 导入写入场景下更容易让用户直接覆盖 `project / user`

## Chosen Approach

采用 `Option B`。

冻结规则：

- `user`: 直接开放，默认低风险
- `project`: 直接开放，不额外引入新 gate
- `local`: 直接开放，但必须进入更明确确认门槛

## Command Model

命令保持不变：

```bash
api-switcher import apply <file> --profile <profile-id> [--scope <scope>] [--force]
```

Claude 平台语义：

- 支持 `--scope user|project|local`
- 未显式传入 `--scope` 时，继续按 Claude 当前默认解析：
  - CLI `--scope` 优先
  - 其次 `API_SWITCHER_CLAUDE_TARGET_SCOPE`
  - 最后回落 `user`
- `local` 没有 `--force` 时，应返回 `CONFIRMATION_REQUIRED`

## Execution Semantics

### Shared

Claude 继续复用 `import apply` 主链：

1. source gate
2. platform support gate
3. local detect + previewDecision gate
4. validate
5. preview
6. risk / confirmation gate
7. backup / apply gate

### Claude-Specific

Claude 第一版执行语义冻结如下：

1. 接受 Claude profile
2. 支持 `user / project / local` 三层 scope
3. 不引入 Gemini 式 availability gate
4. 不因为导入 observation 缺失就天然阻断 apply 设计
5. 允许像 Codex 一样更多依赖本地 observation 继续
6. 成功结果中的 `appliedScope` 必须反映最终解析出的 Claude scope
7. backup provenance 继续标记 `origin = import-apply`

## Risk Policy

这是 Claude 设计里的核心。

### user

- 保持低风险默认目标
- 不额外要求确认

### project

- 保持可写
- 继续遵循现有 Claude precedence 解释：
  - `project` 高于 `user`
  - 但低于 `local`
- 是否需要确认，只由现有 risk engine 决定

### local

- 第一版定义为高敏感导入目标
- 没有 `--force` 时必须返回 `CONFIRMATION_REQUIRED`
- 风险文案必须强调：
  - `local` 高于 `project` 与 `user`
  - 同名字段写入后会直接成为当前项目的最终生效值
  - 如果用户只是想共享项目级配置，应该优先考虑 `project`

## Fidelity and Observation Rules

Claude 第一版不应被 Gemini 的导出 observation 规则绑死。

冻结如下：

- Claude imported profile 缺少 `exportedObservation` 时，不应直接判定为不可 apply
- 对 Claude 来说，只要本地 target scope 可解析、validate / preview / risk 可正常完成，就允许进入 apply 设计
- `exportedObservation` 仍主要用于 explainable，不是执行授权来源
- `previewDecision` 仍保留，但 Claude 第一版应允许“基于本地 observation 足够继续”的路径

换句话说：

- Gemini：更强调 observation fidelity
- Codex：更强调本地真实写入载体
- Claude：应更接近 Codex 的“本地可继续”，但仍保留 scope-aware explainable

## Scope Contract Rules

Claude 第一版不需要新的 contract 类型，只需要明确平台语义：

- `appliedScope` 对 Claude 必须存在，且值为 `user` / `project` / `local`
- `scopePolicy` 继续存在，并反映：
  - `requestedScope`
  - `resolvedScope`
  - `defaultScope`
  - `explicitScope`
  - `highRisk`
  - `riskWarning`
  - `rollbackScopeMatchRequired`
- `scopeCapabilities` 继续返回 Claude 三层矩阵
- `scopeAvailability` 对 Claude 可以继续缺省，不必伪造

## Confirmation Semantics

Claude 第一版至少需要两类确认来源：

### 1. 现有 risk engine 确认

例如：

- 预览层给出了需要确认的理由
- 当前写入会覆盖非托管字段

### 2. local scope 显式确认

即使现有 risk engine 没把 `local` 判成高风险，也应在 `import apply` 层明确抬高：

- `resolvedScope = local`
- 且未传 `--force`
- 返回 `CONFIRMATION_REQUIRED`

理由：

- `local` 在 Claude precedence 中最高
- 导入写入场景下更容易被误用成“临时覆盖”，但实际会立即成为最终生效配置

## Rollback Semantics

Claude 第一版继续复用现有 rollback 语义，不升级成 Gemini 式严格 scope mismatch。

冻结如下：

- 导入写入成功后的快照仍记录实际写入 scope
- `rollback` 继续按 Claude 当前既有规则恢复
- 暂不要求“快照 scope 与请求 scope 必须严格一致”
- 但应保留 scopePolicy / provenance，使未来升级为更严格策略时不需要推翻快照模型

## Failure Taxonomy

Claude 第一版错误语义如下：

### 1. 导入源失败

- `IMPORT_SOURCE_NOT_FOUND`
- `IMPORT_SOURCE_INVALID`
- `IMPORT_UNSUPPORTED_SCHEMA`
- `IMPORT_PROFILE_NOT_FOUND`

### 2. 平台准入失败

- `IMPORT_PLATFORM_NOT_SUPPORTED`

第一版约定：

- Gemini：支持
- Codex：支持
- Claude：支持

### 3. 执行前置失败

- `IMPORT_APPLY_NOT_READY`

Claude 第一版不应新增 Gemini 风格的 `IMPORT_SCOPE_UNAVAILABLE`

### 4. 确认 / 校验失败

- `CONFIRMATION_REQUIRED`
- `VALIDATION_FAILED`

其中 `local` 未确认属于稳定的 `CONFIRMATION_REQUIRED`

### 5. 最终写入失败

- `IMPORT_APPLY_FAILED`

## Testing Scope

实现时至少需要补齐以下测试。

### Unit

`tests/unit/import-apply.service.test.ts`

至少新增：

- Claude profile 不再返回 `IMPORT_PLATFORM_NOT_SUPPORTED`
- Claude `user` success path
- Claude `project` success path
- Claude `local` 未 `--force` 时返回 `CONFIRMATION_REQUIRED`
- Claude `local` 带 `--force` 时 success
- Claude 不进入 Gemini availability gate

### Integration

`tests/integration/cli-commands.test.ts`

至少新增：

- `import apply --json` 成功应用 Claude `user`
- `import apply --scope project --json` 成功应用 Claude `project`
- `import apply --scope local --json` 未 `--force` 返回 `CONFIRMATION_REQUIRED`
- `import apply --scope local --force --json` 成功应用 Claude `local`
- rollback 继续沿用 Claude 既有 scope 行为

### Schema / Type Contract

至少确认：

- 现有 `ImportApplyCommandOutput.appliedScope?: string` 已可容纳 Claude
- 成功样例补充 Claude `local`
- 文档明确 `scopeAvailability` 对 Claude 可缺省

## Documentation Scope

至少同步更新：

- `README.md`
- `docs/public-json-schema.md`
- `CHANGELOG.md`

文档口径必须明确：

- Claude `import apply` 已开放
- 支持 `user / project / local`
- `local` 需要显式确认
- Claude 不走 Gemini 的 availability-first 失败分支

## Risks

### 1. local 风险文案不清晰

如果只说“需要 `--force`”，但不说明它是最高优先级 scope，用户会误解成普通确认门槛。

### 2. 把 Claude 强行套进 Gemini availability 模型

这会引入不必要复杂度，也会让 Claude 出现虚假的 `scopeAvailability` 失败。

### 3. fidelity 过于保守

如果 Claude 继续沿用 Gemini 的“缺 observation 就阻断”策略，会让导入写入能力表面开放、实际不可用。

## Out of Scope Follow-Ups

后续可以再评估：

- Claude rollback 是否升级为严格 scope mismatch
- 更强的 Claude import fidelity gate
- 批量 apply
- 平台策略 helper 进一步抽象

但这些都不属于本设计交付范围。
