# Gemini Import Preview Design

## Context

当前仓库已经具备：

- `export --json` 导出 Gemini `scopeCapabilities`
- `export --json` 导出 Gemini `scopeAvailability`
- `export --json` 导出 Gemini `defaultWriteScope`
- `export --json` 导出 Gemini `observedAt`
- `preview/use/rollback` 已区分 capability、availability、risk、integrity

但仓库仍然 **没有** `import` 命令。

这意味着当前 export 已经能表达“导出时的环境观察”，却还没有一个正式入口去回答下面几个问题：

1. 导入文件里的 Gemini scope fidelity 与本地当前环境是否一致
2. 如果导出时 `project` 可用、本地现在不可用，应该怎么展示
3. 用户未来真正 apply import 之前，应该先看到什么 preview

因此 Phase 3 的第一步不是直接做写入，而是先做 `import preview`。

## Decision Summary

本设计采用 **preview-first, apply-later** 模型。

结论：

- 先实现 `import preview`
- 不在本阶段实现 `import apply`
- `import preview` 负责比较“导出观察值”和“本地重解析值”
- 所有本地写入结论都以 **local re-resolved availability** 为准
- 导出文件中的 `scopeAvailability` / `observedAt` 只用于展示 fidelity，不参与最终写入判定

## Product Goals

- 让用户在导入前看清楚导出环境与本地环境的差异
- 防止用户把 export 中的 project 可用性误当成导入机上的执行真相
- 为未来 `import apply` 建立稳定的 preview contract
- 让 UI/CLI 能稳定表达：
  - exported observation
  - local availability
  - fidelity mismatch
  - recommended next step

## Non-Goals

- 不实现 `import apply`
- 不直接根据导出结果写入任何平台配置
- 不自动创建或迁移 Gemini project root
- 不因为导出里有 `project` 路径就尝试恢复或写入本地 project scope
- 不让 `--force` 越过本地 availability gate

## Core Principle

`import preview` 要同时保留两类真相，但不能混淆：

1. **Exported Observation**
   - 导出文件里记录的当时环境观察
   - 例如：导出机上 `project` 是 `available`
2. **Local Runtime Reality**
   - 当前导入机重新解析后的真实状态
   - 例如：本机上 `project` 是 `unresolved`

所有真正与执行相关的判断，都必须以第 2 类为准。

## User Stories

### Story 1

作为用户，我希望在导入前知道：

- 这个导出文件原来默认写到哪一层
- 导出时 Gemini `project scope` 是否可用
- 我现在这台机器上 Gemini `project scope` 是否还可用

### Story 2

作为用户，如果导出机和本地机的 scope 状态不一致，我希望 CLI 直接告诉我：

- 差异在哪
- 哪一边是“历史观察”
- 哪一边是“当前真实环境”
- 我接下来应该修环境、改 scope，还是停在 preview

### Story 3

作为后续实现 `import apply` 的开发者，我希望 `import preview` 的结构化输出足够稳定，不需要未来推翻现有 contract。

## Command Shape

建议新增：

```bash
api-switcher import <file> --preview
```

为了与现有 CLI 习惯保持一致，也可以直接设计为：

```bash
api-switcher import <file>
```

且在本阶段只提供 preview 语义。

建议不要在第一版同时引入：

- `import --force`
- `import --apply`
- `import --scope project`

这些都属于第二阶段之后的 apply 语义。

## Input Model

输入文件默认来自 `export --json` 的输出。

`import preview` 至少需要读取：

- `profiles[]`
- `profiles[].profile`
- `profiles[].scopeCapabilities`
- `profiles[].scopeAvailability`
- `profiles[].defaultWriteScope`
- `profiles[].observedAt`

如果某些字段缺失：

- 不报 schema 级硬失败
- 但要在 preview 里标注 fidelity 信息不完整

## Output Model

建议新增独立输出类型：

```ts
type ImportPreviewCommandOutput = {
  sourceFile: string
  items: ImportPreviewItem[]
  summary: {
    warnings: string[]
    limitations: string[]
  }
}

type ImportPreviewItem = {
  profile: Profile
  platform: PlatformName
  exportedObservation?: {
    scopeCapabilities?: ScopeCapability[]
    scopeAvailability?: ScopeAvailability[]
    defaultWriteScope?: string
    observedAt?: string
  }
  localObservation?: {
    scopeCapabilities?: ScopeCapability[]
    scopeAvailability?: ScopeAvailability[]
    defaultWriteScope?: string
  }
  fidelity?: ImportFidelityReport
  previewDecision: {
    canProceedToApplyDesign: boolean
    recommendedScope?: string
    requiresLocalResolution: boolean
  }
}

type ImportFidelityReport = {
  status: 'match' | 'mismatch' | 'partial' | 'insufficient-data'
  mismatches: Array<{
    field: 'defaultWriteScope' | 'scopeAvailability' | 'scopeCapabilities'
    scope?: string
    exportedValue?: unknown
    localValue?: unknown
    message: string
  }>
}
```

## Fidelity Rules

### Match

当以下内容一致时：

- exported `defaultWriteScope`
- local default write scope
- Gemini `project` availability status

则 `fidelity.status = "match"`。

### Mismatch

当 exported 与 local 在关键执行语义上不同：

- exported `project = available`
- local `project = unresolved`

或：

- exported `defaultWriteScope = user`
- local 产品策略已变化

则 `fidelity.status = "mismatch"`。

### Partial

当 exported 有部分 observation，但不完整，例如：

- 没有 `observedAt`
- 没有 `scopeAvailability`

则 `fidelity.status = "partial"`。

### Insufficient Data

当导出文件缺乏足够上下文，无法做有效对比时：

- 没有 Gemini scope 信息
- profile 本身不完整

则 `fidelity.status = "insufficient-data"`。

## Gemini-Specific Rules

### Rule 1: Local Availability Wins

如果 exported `project` 是 `available`，但 local `project` 是 `unresolved`：

- preview 必须明确显示 mismatch
- 不得给出“可直接 apply”暗示
- `previewDecision.requiresLocalResolution = true`
- `previewDecision.canProceedToApplyDesign = false`

### Rule 2: Exported Availability Is Historical Context Only

CLI 文本必须明确区分：

- `导出时观察`
- `当前本地观察`

避免用户误解为：

- “导出文件说可以，所以现在也可以”

### Rule 3: No Automatic Scope Upgrade

如果 exported `defaultWriteScope = user`，而 local `project` 可用：

- preview 可以提示本地 `project` 现在可用
- 但不得把这解释为默认会升级到 `project`

### Rule 4: No Automatic Project Root Repair

如果 local `project` 是 `PROJECT_ROOT_UNRESOLVED`：

- preview 只输出 remediation
- 不尝试推断 project root
- 不尝试从 export path 反推出本地路径

## Decision Table

### Case A: exported project available, local project available

- `fidelity = match` 或 `partial`
- 可以标记未来存在 apply 设计空间
- 仍不在本阶段执行写入

### Case B: exported project available, local project unresolved

- `fidelity = mismatch`
- 强调“导出时可用，本地当前不可用”
- 推荐修复本地 project root
- 不给 apply-ready 信号

### Case C: exported project unresolved, local project available

- `fidelity = mismatch`
- 提示“本地当前更完整，但导出时未处于可用状态”
- 仍以 local reality 为后续 apply 前提
- 不自动升级 scope

### Case D: exported only has capability, no availability

- `fidelity = partial`
- 提示导出文件缺少环境观察
- 仅展示 local observation

## Text Output Requirements

`import preview` 文本输出建议分 4 块：

1. 导入文件
2. 导出时观察
3. 当前本地观察
4. fidelity 结论与建议

Gemini 至少应显示：

- `默认写入作用域`
- `作用域能力`
- `作用域可用性`
- `导出观测时间`
- `fidelity: match/mismatch/...`
- `建议`

当 mismatch 发生时，应优先讲：

- exported vs local 的差异
- 是否需要修复本地环境
- 当前不能进入 apply 设计

而不是讲风险确认。

## JSON Output Requirements

JSON 需要让调用方可以稳定分离：

- historical exported observation
- current local observation
- fidelity result
- apply-readiness hint

这意味着不应把 local observation 覆盖写回 exported 字段，也不应合并成一份模糊对象。

## Error Model

第一版 `import preview` 建议只保留这几类失败：

- `IMPORT_SOURCE_NOT_FOUND`
- `IMPORT_SOURCE_INVALID`
- `IMPORT_UNSUPPORTED_SCHEMA`
- `IMPORT_PREVIEW_FAILED`

注意：

- Gemini project availability failure **不属于** import 顶层命令失败
- 它属于某个 item 的 fidelity / previewDecision 结果
- 除非连导入文件都读不出来，否则 import preview 应尽量成功返回结构化 items

## Testing Requirements

第一版 `import preview` 应覆盖：

1. 读取 export JSON 文件
2. Gemini exported/local observation 同时存在时的 match
3. exported project available vs local unresolved 的 mismatch
4. exported observation 缺失时的 partial / insufficient-data
5. 文本输出明确区分“导出时观察”和“当前本地观察”
6. JSON 输出包含 `fidelity` 与 `previewDecision`

## Recommendation

按下面顺序推进：

1. 先做 `import preview` spec
2. 再做 `import preview` plan
3. 实现时先只支持读取 `export --json`
4. 不做 apply
5. 等 preview contract 稳定后，再单独开 `import apply` spec
