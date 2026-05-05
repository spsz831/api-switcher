# Audit and Overlay Foundations Design

> Status: draft for review

## Goal

为 `current / validate / preview / list` 补一层更稳定、更可读的审计汇总，同时预留一个只读的 overlay 解释层，用来承接后续 overlay 管理能力，但本版不开放任何 overlay 写入命令或实际存储路径。

## Scope

This design only covers:
- 审计信息的统一汇总和展示
- overlay 的只读结构层与解释入口
- 现有 `current / validate / preview / list` 的 summary 增强

This design does not cover:
- `overlay add/list/remove/apply` 命令
- overlay 的持久化存储
- overlay 写入、合并、迁移或回滚
- 任何现有写入闭环的行为变化

## Recommended Approach

采用 **方案 B**:

- 新增 `auditSummary`
- 新增 `overlaySummary`
- 两者都只读，只作为现有 summary 的补充视图

Trade-offs:

- 优点: 现有审计信息更容易消费，overlay 也有明确的结构落点
- 优点: 不扩大写入面，风险可控
- 缺点: 这次不会交付真实 overlay 管理能力，只是把抽象层先稳定下来

## Architecture

### 1. Audit Summary

`auditSummary` 是一个面向消费方的稳定汇总层，用来回答：

- 当前系统总共有多少 profile
- 有多少平台参与
- 是否存在 reference profile
- 是否存在 inline secret
- 是否存在 write-unsupported profile
- 是否存在高风险项
- 下一步应该看什么

它的定位不是替代现有 `referenceStats`、`executabilityStats`、`triageStats`，而是在它们之上提供更短路径的入口。

### 2. Overlay Summary

`overlaySummary` 只做解释，不做写入。它用于承接未来 overlay 管理能力，最小字段只描述：

- 是否存在 overlay 层
- overlay 项数量
- overlay 类型集合
- 保留字段
- runtime-only 字段
- 备注说明

如果当前没有真实 overlay 数据源，`overlaySummary` 允许返回一个稳定的空视图，而不是强行引入存储实现。

### 3. Summary Placement

这两个 summary 只挂在现有只读和写入命令的结果里：

- `current`
- `validate`
- `preview`
- `list`

不修改 command 行为，不修改写入流程。

## Data Model

### Audit Summary

Recommended fields:

- `totalProfiles`
- `platformCount`
- `hasReferenceProfiles`
- `hasInlineSecrets`
- `hasWriteUnsupportedProfiles`
- `hasHighRiskItems`
- `recommendedNextStep`

Recommended `nextStep` values:

- `inspect-overview`
- `review-reference-details`
- `continue-to-write`
- `repair-input`
- `group-by-platform`

### Overlay Summary

Recommended fields:

- `hasOverlayLayer`
- `overlayItemCount`
- `overlayKinds`
- `preservedKeys`
- `runtimeOnlyKeys`
- `notes`

`overlayKinds` should remain a small string union or string array at first, not a large schema.

## Implementation Boundaries

### Reuse Existing Signals

The design should reuse current audit signals already available in code:

- `referenceStats`
- `executabilityStats`
- `triageStats`
- `platformSummary`
- `scopeCapabilities`
- `scopeAvailability`

No new duplicate computation should be introduced if existing helpers already expose the required facts.

### Minimal New Abstractions

Only add the minimal helper(s) needed to derive the two new summaries from existing outputs.

Avoid:

- introducing a separate overlay storage service
- introducing overlay mutation APIs
- moving write logic into the new summaries

## Error Handling

The new summaries must be fail-safe:

- If overlay data is absent, return an empty/stub overlay summary.
- If a platform does not expose a relevant audit signal, omit the optional field rather than fail the command.
- The new summaries must never turn a successful read into a failure.

## Testing Strategy

### Unit Tests

Add unit coverage for:

- audit summary derivation from existing profile collections
- overlay summary derivation from empty and populated inputs
- stability of `recommendedNextStep`
- consistency of JSON/text consumers where summary sections are surfaced

### Integration Tests

Update the existing CLI integration coverage so that:

- `current`, `validate`, `preview`, and `list` expose the new summary blocks
- text output renders the new audit/overlay sections in a stable order
- JSON output preserves the new fields for automation consumers

### Docs Consistency

Update the public docs and schema docs so that:

- the new summary fields are discoverable
- the overlay section is clearly documented as read-only scaffolding
- existing summary sections remain valid and unchanged

## Non-Goals

- No overlay file format
- No overlay persistence
- No overlay mutation commands
- No write-path behavior change
- No change to current risk gating semantics

## Open Questions

1. Should `overlaySummary` be surfaced on all four commands from day one, or only on the commands that already expose full summary sections?
2. Should `recommendedNextStep` be derived only from existing `triageStats`, or should it also consider scope and platform risk?
3. Should overlay notes be user-facing text only, or should we also expose machine-friendly reason codes in the first pass?

