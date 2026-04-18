# Codex Import Apply Design

## Context

当前仓库已经具备：

- `import preview` 的稳定输出与 explainable 结构
- Gemini `import apply` 第一版执行链路
- Codex 平台的真实 adapter，包含 `validate`、`preview`、`apply`、`rollback`
- Codex 双文件写入模型：
  - `config.toml`
  - `auth.json`

当前仓库仍然没有：

- Codex `import apply`
- `import apply` 的平台通用准入规则
- 对“无 scoped target 平台”的 `import apply` 成功 contract 统一口径

因此这份文档的目标不是重构整个 `import apply` 架构，而是先把 Codex 第一版扩展的执行边界定死。

## Scope

本文档只覆盖：

- `import apply` 从 Gemini-only 扩到 Gemini + Codex
- Codex 单条 profile 的 `import apply`
- 平台准入规则
- 无 scope 平台的 apply contract
- 需要补齐的测试与文档边界

本文档不覆盖：

- Claude `import apply`
- 批量 apply
- 导入机 / 导出机之间更强 fidelity gate
- 交互式确认
- 针对 Codex 引入新的 scoped target
- `import apply` 的大规模通用 pipeline 重构

## Decision Summary

本设计采用 `minimal platform expansion` 模型。

结论：

- 第一版把 `import apply` 支持范围从 `Gemini` 扩到 `Gemini + Codex`
- Claude 继续保持 `IMPORT_PLATFORM_NOT_SUPPORTED`
- Gemini 现有 gate、风险门槛、快照语义保持不变
- Codex 复用现有 adapter 的双文件写入能力，不新增 scope 语义
- `ImportApplyService` 只做必要的平台感知改造，不做重构式抽象
- 对外 contract 从“`appliedScope` 固定为 `user | project`”放宽为“平台解析后的 scope 字符串，Codex 可为空”

## Product Goals

- 让导入写入能力覆盖下一个真实平台，而不是停留在 Gemini-only
- 保持 Codex `preview/use/rollback` 与 `import apply` 的执行载体一致
- 不把 Gemini 的 scope 复杂度强行套到 Codex
- 为后续接入更多平台保留轻量扩展点，但不提前过度抽象

## Non-Goals

- 不尝试统一 Claude / Codex / Gemini 的全部 gate 逻辑
- 不把 Codex 伪装成有 `user/project/local` 之类的 scope
- 不把 `defaultWriteScope` 变成 Codex 的强语义字段
- 不修改 Codex adapter 的目标文件模型
- 不在本阶段引入 project root 发现、scope 可用性或额外确认门槛

## Why This Shape

`import apply` 当前主流程已经基本平台无关：

1. 读取导入源
2. 选中 profile
3. 本地 detect / previewDecision gate
4. validate
5. preview
6. 风险评估
7. 建立 backup
8. apply

真正强平台耦合的只有三处：

- 平台是否开放 `import apply`
- 是否存在额外的 scope availability gate
- 输出 contract 是否假定“所有平台都有 `user/project`”

Codex 正好只需要解决这三处，不需要新执行面。

## Approach Options

### Option A. 最小平台扩展

做法：

- 保持 `ImportApplyService` 主流程
- 把平台准入从“仅 Gemini”改成“Gemini / Codex”
- Gemini `project` 保持 availability gate
- Codex 直接跳过这层 gate
- 类型与 schema 放宽为平台兼容 contract

优点：

- 改动最小
- 风险最低
- 最符合当前“基础版”目标

缺点：

- `ImportApplyService` 里仍会有少量平台条件分支

### Option B. 轻度策略表

做法：

- 抽出小型平台策略 helper
- 把“是否支持 apply”“是否需要 availability gate”“如何解析 applied scope”移出 service

优点：

- 结构更干净
- 后续接 Claude 更顺

缺点：

- 第一版改动面更大
- 文档、测试、实现同时会多出一层心智负担

### Option C. 完整通用 gate pipeline

做法：

- 先重构整个 `import apply`
- 再把 Gemini / Codex 接成统一平台 pipeline

优点：

- 长期结构最好

缺点：

- 明显过度设计
- 与当前交付目标不匹配

## Chosen Approach

采用 `Option A`，但允许加入极小 helper，避免把平台判断散落在多个 if 分支里。

允许的最小抽象：

- `supportsImportApply(platform)`
- `needsScopeAvailabilityGate(platform, resolvedScope)`

不允许扩展成新的 service 层或策略注册表。

## Command Model

命令保持不变：

```bash
api-switcher import apply <file> --profile <profile-id> [--scope <scope>] [--force]
```

第一版平台语义：

- Gemini：
  - 支持 `--scope user|project`
  - `project` 继续要求本地 availability 可用
  - `project` 继续要求 `--force`
- Codex：
  - 不使用 `--scope`
  - 继续按 adapter 的真实目标文件执行
  - `--scope` 对 Codex 仍视为非法输入
- Claude：
  - 继续返回 `IMPORT_PLATFORM_NOT_SUPPORTED`

## Execution Semantics

### Gemini

Gemini 完全保持现状：

- `previewDecision` 先于写入
- `project scope availability` 先于 validation / confirmation
- `project` 是高风险写入
- backup / rollback 按实际 scope 独立记录与恢复

### Codex

Codex 第一版执行语义冻结如下：

1. 只接受 Codex profile
2. 不引入新的 scope resolution
3. `resolveTargetScope('codex')` 结果视为无 scope
4. 不读取或依赖 `scopeAvailability`
5. 直接进入：
   - detectCurrent
   - previewDecision gate
   - validate
   - preview
   - risk evaluation
   - backup
   - apply
6. 成功结果中的 `changedFiles` 必须反映真实双文件写入结果
7. backup provenance 继续标记 `origin = import-apply`

## Scope Contract Rules

这是本次设计里最重要的 contract 调整。

当前 `import apply` 成功输出把 `appliedScope` 硬编码为 `'user' | 'project'`，这与 Codex 不兼容。

第一版统一规则：

- `appliedScope` 表示“平台最终解析出的写入 scope”
- 对有 scoped target 的平台，它是显式 scope 字符串
- 对无 scoped target 的平台，它允许为空

由此带来的 contract 结论：

- `ImportApplyCommandOutput.appliedScope` 不能再限定为 `'user' | 'project'`
- `ImportScopeUnavailableDetails.resolvedScope` 应改为通用字符串类型
- `ImportObservation.defaultWriteScope` 继续保留，但仅表示平台默认写入目标；Codex 可以缺省
- `scopePolicy` 仍只在平台具备 `scopePolicy` 时输出；Codex 若本地策略仍返回默认对象，则允许出现 `resolvedScope` 缺省

机器消费方应这样理解：

- `scopeCapabilities` 回答“平台理论上支不支持 scoped target”
- `appliedScope` 回答“这次写入最终落在哪个 scope”
- 对 Codex，这两个字段都不应被强行补造成 Gemini 语义

## Gate Order

统一 gate 顺序保持不变：

1. source gate
2. platform support gate
3. local detect + previewDecision gate
4. platform-specific scope availability gate
5. validate
6. preview
7. risk / confirmation gate
8. backup / apply gate

其中只有第 4 层是平台分支：

- Gemini `project`: 启用
- Gemini `user`: 跳过
- Codex: 跳过
- Claude: 不会进入，因为在第 2 层已失败

## Failure Taxonomy

第一版错误语义保持如下：

### 1. 导入源 / 目标 profile 失败

- `IMPORT_SOURCE_NOT_FOUND`
- `IMPORT_SOURCE_INVALID`
- `IMPORT_UNSUPPORTED_SCHEMA`
- `IMPORT_PROFILE_NOT_FOUND`

### 2. 平台准入失败

- `IMPORT_PLATFORM_NOT_SUPPORTED`

第一版约定：

- Gemini：支持
- Codex：支持
- Claude：不支持

因此原先“non-Gemini 一律失败”的测试与文档要改成“non-supported platform 失败”。

### 3. 执行前置失败

- `IMPORT_APPLY_NOT_READY`
- `IMPORT_SCOPE_UNAVAILABLE`

其中：

- `IMPORT_SCOPE_UNAVAILABLE` 仍只对 Gemini `project` 有意义
- Codex 不应伪造该类失败

### 4. 写入前确认或校验失败

- `CONFIRMATION_REQUIRED`
- `VALIDATION_FAILED`

Codex 是否会进入 `CONFIRMATION_REQUIRED`，完全由通用风险评估结果决定，而不是 scope 风险策略。

### 5. 最终写入失败

- `IMPORT_APPLY_FAILED`

## Testing Scope

实现必须按 TDD 进入，至少补齐以下测试。

### Unit

`tests/unit/import-apply.service.test.ts`

至少新增：

- Codex profile 不再返回 `IMPORT_PLATFORM_NOT_SUPPORTED`
- Codex success path
- Codex 不进入 Gemini `project availability` gate
- Codex apply context 中 `targetScope` 为空或缺省
- Codex 成功结果保留真实 `changedFiles`
- Claude 仍然返回 `IMPORT_PLATFORM_NOT_SUPPORTED`

### Integration

`tests/integration/cli-commands.test.ts`

至少新增：

- `import apply --json` 成功应用 Codex profile
- 成功后 `config.toml` / `auth.json` 被真实更新
- 返回的 `backupId`、`changedFiles`、`noChanges` 合同正确
- `--scope project` 对 Codex 仍属于非法 scope
- 原来“non-Gemini not supported”的断言改成“Claude not supported”

### Schema / Type Contract

`tests/unit/public-json-schema.test.ts`

至少新增或调整：

- `ImportApplyCommandOutput.appliedScope` 类型放宽
- success sample 覆盖 Codex
- schema 不再把 `appliedScope` 限死为 `user|project`
- 文档类型断言不再把 Codex 排除在 `import apply` 成功 contract 之外

## Documentation Scope

至少同步更新：

- `README.md`
- `docs/public-json-schema.md`
- `docs/public-json-output.schema.json`
- `CHANGELOG.md`

文档口径必须改成：

- `import apply` 当前支持 `Gemini / Codex`
- Gemini 有 scope 与高风险门槛
- Codex 没有 scoped target，按双文件真实目标写入
- Claude 仍未开放 `import apply`

## Compatibility Notes

这次改动属于“扩展支持平台”，不是“推翻既有 Gemini contract”。

兼容性要求：

- Gemini 现有成功 / 失败路径 contract 不得回归
- 现有 `import preview` explainable 结构不变
- 现有 rollback manifest / provenance 语义不变
- 对已有 Gemini 消费方，最多只会看到文档与 schema 更宽，不会看到原字段被删除

## Risks

### 1. 类型放宽导致旧测试或 schema 断言失效

这是预期改动，不是副作用。

### 2. 把 Gemini gate 错误地套到 Codex

这会导致 Codex 虚构 `IMPORT_SCOPE_UNAVAILABLE` 或错误 confirmation 文案，必须避免。

### 3. 文档仍保留 Gemini-only 口径

这会让外部调用方继续误判能力边界，必须与实现同步更新。

## Out of Scope Follow-Ups

后续可以再评估：

- Claude `import apply`
- 更强的跨机器 fidelity gate
- 批量 apply
- 更细粒度的平台策略 helper
- import apply 的 mixed-platform 消费指南

但这些都不属于本设计的交付范围。
