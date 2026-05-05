# Audit and Overlay Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `current / validate / preview / list` 补一层统一审计汇总，并增加只读的 overlay 解释骨架，但不新增 overlay 写命令或任何写入路径。

**Architecture:** 复用现有 `referenceStats / executabilityStats / triageStats / platformSummary / scopeCapabilities` 信号，在服务层增加一个轻量 `auditSummary` 汇总层和一个只读 `overlaySummary` 解释层。现有写入流程保持不变；`current / validate / preview / list` 只是在现有 summary 上补充更稳定的消费入口，文本和 JSON 输出共用同一份数据。

**Tech Stack:** TypeScript、Vitest、Commander CLI、现有 command service / renderer / docs consistency 测试体系。

---

## File Structure

- Modify: `src/types/command.ts`
  - 增加 `AuditSummary`、`OverlaySummary`，并把它们挂到现有 summary 结构上。
- Modify: `src/services/readonly-triage-summary.ts`
  - 复用现有 triage 结果，提供 auditSummary / overlaySummary 的最小派生入口。
- Modify: `src/services/current-state.service.ts`
  - 在 current/list summary 中补充 auditSummary / overlaySummary。
- Modify: `src/services/validate.service.ts`
  - 在 validate summary 中补充 auditSummary / overlaySummary。
- Modify: `src/services/preview.service.ts`
  - 在 preview summary 中补充 auditSummary / overlaySummary。
- Modify: `src/renderers/text-renderer.ts`
  - 为 current / validate / preview / list 增加稳定的 audit / overlay 文本 section。
- Modify: `src/services/schema.service.ts`
  - 让 public schema / consumer profile 暴露新 summary sections 的 discoverability。
- Modify: `src/constants/readonly-summary-sections.ts`
  - 如有必要，扩展只读 summary sections 的稳定顺序。
- Modify: `tests/unit/readonly-summary-sections.test.ts`
  - 锁定新 summary section 顺序和 guidance。
- Modify: `tests/unit/text-renderer.test.ts`
  - 锁定 audit / overlay 文本输出。
- Modify: `tests/unit/public-json-schema.test.ts`
  - 锁定新字段在 JSON schema 中的 discoverability。
- Modify: `tests/integration/readonly-cli-commands.test.ts`
  - 覆盖 current / list / validate / preview 的 JSON 结果。
- Modify: `tests/integration/cli-top-level-contracts.test.ts`
  - 覆盖 schema catalog 中新 summary section 的契约。
- Modify: `tests/unit/docs-consistency.test.ts`
  - 保证 README / schema 文档与新 summary 结构一致。
- Modify: `README.md`
  - 更新只读审计说明与 overlay 只读骨架说明。
- Modify: `docs/public-json-schema.md`
  - 补充 audit / overlay 只读结构说明和样例。
- Modify: `docs/public-json-output.schema.json`
  - 反映新 summary 字段和 section discoverability。

## Task 1: Freeze the New Summary Contract

**Files:**
- Modify: `src/types/command.ts`
- Modify: `tests/unit/public-json-schema.test.ts`
- Modify: `tests/unit/readonly-summary-sections.test.ts`

- [ ] **Step 1: Write the failing tests for the new summary contract**

补最小断言，锁定：

- `current / validate / preview / list` 的 summary 里出现 `auditSummary`
- `overlaySummary` 以只读形式出现
- `readonly summary sections` 公开与新 section 对应的稳定顺序

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run:

```bash
corepack pnpm test -- tests/unit/public-json-schema.test.ts tests/unit/readonly-summary-sections.test.ts
```

Expected:
- 新字段与新 section 目前未声明，测试失败。

- [ ] **Step 3: Add the minimal types and section definitions**

只补最小契约类型，不改写入行为：

- `AuditSummary`
- `OverlaySummary`
- 必要时扩展只读 summary sections 定义

- [ ] **Step 4: Run the focused tests again**

Run:

```bash
corepack pnpm test -- tests/unit/public-json-schema.test.ts tests/unit/readonly-summary-sections.test.ts
```

Expected:
- 两个测试文件通过。

## Task 2: Derive Audit and Overlay Summaries from Existing Signals

**Files:**
- Modify: `src/services/readonly-triage-summary.ts`
- Modify: `src/services/current-state.service.ts`
- Modify: `src/services/validate.service.ts`
- Modify: `src/services/preview.service.ts`

- [ ] **Step 1: Write failing tests for derived summary data**

新增或修改单测，验证：

- `auditSummary` 能从现有 profile / detection / summary signals 计算出来
- `overlaySummary` 在没有 overlay 数据源时返回稳定空视图
- `recommendedNextStep` 与当前 triage 信号一致

- [ ] **Step 2: Run the focused service tests and confirm failures**

Run:

```bash
corepack pnpm test -- tests/unit/current-state.service.test.ts tests/unit/validate.service.test.ts tests/unit/preview.service.test.ts
```

Expected:
- 新 summary 断言失败，但现有行为保持稳定。

- [ ] **Step 3: Implement minimal derivation helpers**

在服务层复用现有信号，避免重复计算：

- `totalProfiles`
- `platformCount`
- `hasReferenceProfiles`
- `hasInlineSecrets`
- `hasWriteUnsupportedProfiles`
- `hasHighRiskItems`
- `recommendedNextStep`
- `overlaySummary` 空视图

- [ ] **Step 4: Re-run the focused tests**

Run:

```bash
corepack pnpm test -- tests/unit/current-state.service.test.ts tests/unit/validate.service.test.ts tests/unit/preview.service.test.ts
```

Expected:
- 通过。

## Task 3: Surface the New Sections in Text and JSON Output

**Files:**
- Modify: `src/renderers/text-renderer.ts`
- Modify: `src/services/schema.service.ts`
- Modify: `tests/unit/text-renderer.test.ts`
- Modify: `tests/integration/readonly-cli-commands.test.ts`
- Modify: `tests/integration/cli-top-level-contracts.test.ts`

- [ ] **Step 1: Write failing renderer and CLI tests**

锁定：

- 文本输出中 audit section 和 overlay section 的顺序
- JSON 输出里 summary 字段的 discoverability
- schema catalog 中 consumer profile / summary section 的稳定暴露

- [ ] **Step 2: Run the renderer / CLI tests and confirm failures**

Run:

```bash
corepack pnpm test -- tests/unit/text-renderer.test.ts tests/integration/readonly-cli-commands.test.ts tests/integration/cli-top-level-contracts.test.ts
```

Expected:
- 文本和 schema 断言失败，说明新 section 还未接入。

- [ ] **Step 3: Implement rendering and schema exposure**

让文本 renderer 和 schema service 消费同一份 summary 结构。

- [ ] **Step 4: Re-run the renderer / CLI tests**

Run:

```bash
corepack pnpm test -- tests/unit/text-renderer.test.ts tests/integration/readonly-cli-commands.test.ts tests/integration/cli-top-level-contracts.test.ts
```

Expected:
- 通过。

## Task 4: Update Docs and Consistency Checks

**Files:**
- Modify: `README.md`
- Modify: `docs/public-json-schema.md`
- Modify: `docs/public-json-output.schema.json`
- Modify: `tests/unit/docs-consistency.test.ts`

- [ ] **Step 1: Write the failing docs consistency tests**

锁定 README / schema 文档中对 audit / overlay 的说明。

- [ ] **Step 2: Run docs consistency tests and confirm failures**

Run:

```bash
corepack pnpm test -- tests/unit/docs-consistency.test.ts
```

Expected:
- 文档断言失败，说明新内容尚未同步。

- [ ] **Step 3: Update docs to describe the read-only overlay scaffold**

明确说明：

- overlay 只是解释层，不是写入功能
- 现有写入闭环不变
- auditSummary 是稳定消费入口

- [ ] **Step 4: Re-run docs consistency tests**

Run:

```bash
corepack pnpm test -- tests/unit/docs-consistency.test.ts
```

Expected:
- 通过。

## Task 5: Final Verification and Commit

**Files:**
- All files touched in the previous tasks

- [ ] **Step 1: Run the focused verification set**

Run:

```bash
corepack pnpm test -- tests/unit/public-json-schema.test.ts tests/unit/readonly-summary-sections.test.ts tests/unit/text-renderer.test.ts tests/unit/current-state.service.test.ts tests/unit/validate.service.test.ts tests/unit/preview.service.test.ts tests/integration/readonly-cli-commands.test.ts tests/integration/cli-top-level-contracts.test.ts tests/unit/docs-consistency.test.ts
```

Expected:
- All tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
corepack pnpm typecheck
```

Expected:
- PASS

- [ ] **Step 3: Commit the change**

```bash
git add .
git commit -m "feat: add audit summary and overlay scaffolding"
```

