# Reference Resolver Preview Use Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `preview / use` 落地第一阶段 reference resolver 消费闭环，只支持 `env://VAR_NAME`，并把 Claude 原生引用写入、Codex/Gemini 明文 fallback 写入、以及 unresolved/unsupported 阻断这三类结果稳定暴露出来。

**Architecture:** 继续复用现有 `preview.service` / `switch.service` 编排和平台 adapter 写入路径，不另起第二套 command pipeline。新增一层共享的 reference write governance helper，把“resolver 结果”和“平台写入策略”组合成单一决策对象，再由 `preview` 与 `use` 分别消费；其中 `preview` 只暴露 explainable 与风险，不回显 secret 明文，`use` 则在进入 snapshot/apply 前统一执行阻断和 `--force` 门槛。

**Tech Stack:** TypeScript、Vitest、Commander CLI、现有 platform adapters、README、`docs/public-json-schema.md`。

---

## File Structure

- Create: `src/domain/reference-write-governance.ts`
  负责把 resolver 状态、platform write strategy、force gate、文案 reason 统一收口成 `preview/use` 可共享的稳定决策。
- Modify: `src/domain/secret-reference-resolver.ts`
  统一 resolver 稳定状态名，第一阶段只支持 `env://`，并输出 `resolved / unresolved / unsupported-scheme`。
- Modify: `src/domain/secret-inspection.ts`
  把现有 `referenceSummary / referenceGovernance` 从“write unsupported”旧语义迁到“可解析但写入策略不同”的新语义，保留字段级 explainable。
- Modify: `src/types/command.ts`
  为 `preview/use` 扩展最小稳定 contract，暴露 reference 决策结果与 failure details 可消费入口。
- Modify: `src/types/adapter.ts`
  如有必要，为 adapter 或 preview payload 增加最小 metadata 挂点，避免把治理逻辑硬塞进文本 renderer。
- Modify: `src/services/preview.service.ts`
  接入共享 reference governance helper，输出 `native-reference-write / inline-fallback-write / reference-blocked`。
- Modify: `src/services/switch.service.ts`
  在 validation/preview 后、snapshot/apply 前执行统一 reference gate；fallback-only 必须显式 `--force`，unresolved/unsupported 直接失败。
- Modify: `src/domain/risk-engine.ts`
  若现有 risk reason 不足，最小化补充 reference fallback 的风险语义，但不新造一套独立风险模型。
- Modify: `src/adapters/claude/claude.adapter.ts`
  支持 Claude 第一阶段 `native-reference-supported` 写入路径。
- Modify: `src/adapters/codex/codex.adapter.ts`
  支持 Codex 第一阶段 `inline-fallback-only` 写入路径，并保持双文件事务语义。
- Modify: `src/adapters/gemini/gemini.adapter.ts`
  支持 Gemini 第一阶段 `inline-fallback-only` 写入路径，并保持现有 scope gate 不回退。
- Modify: `src/renderers/text-renderer.ts`
  文本输出直接消费共享 reference 决策，不再继续输出“preview/use 暂不消费 reference”的旧提示。
- Modify: `tests/unit/preview.service.test.ts`
  覆盖 preview 层三类 reference 结论。
- Modify: `tests/unit/switch.service.test.ts`
  覆盖 use 层成功、force gate、unresolved、unsupported-scheme。
- Create: `tests/unit/reference-write-governance.test.ts`
  冻结共享 governance helper 的核心 contract，防止后续平台扩展把第一阶段决策搞乱。
- Modify: `tests/integration/cli-commands.test.ts`
  覆盖真实 CLI `preview/use --json` 的 reference mixed cases。
- Modify: `tests/unit/public-json-schema.test.ts`
  冻结 `preview/use --json` 的 success/failure schema 契约。
- Modify: `README.md`
  更新产品面、风险文案、使用示例与旧限制说明。
- Modify: `docs/public-json-schema.md`
  补 `preview/use` 成功和失败样例，说明 `referenceGovernance`、force gate、fallback 风险。
- Modify: `tests/unit/docs-consistency.test.ts`
  保证 README / schema 文档和公开 contract 对齐。
- Modify: `CHANGELOG.md`
  记录第一阶段 reference resolver capability。

## Task 1: Freeze Shared Reference Governance Contract

**Files:**
- Create: `tests/unit/reference-write-governance.test.ts`
- Modify: `src/domain/secret-reference-resolver.ts`
- Create: `src/domain/reference-write-governance.ts`
- Modify: `src/domain/secret-inspection.ts`

- [ ] **Step 1: Write the failing unit test for `env://` resolver states**

新增针对 resolver 的最小红测，锁定三种稳定状态：

```ts
expect(resolver.resolve('env://OPENAI_API_KEY').status).toBe('resolved')
expect(resolver.resolve('env://MISSING_KEY').status).toBe('unresolved')
expect(resolver.resolve('vault://prod/openai').status).toBe('unsupported-scheme')
```

- [ ] **Step 2: Write the failing unit test for platform write strategy mapping**

在新测试文件里直接冻结第一阶段平台策略：

```ts
expect(planReferenceWrite({ platform: 'claude', resolution: 'resolved' }).decisionCode).toBe('native-reference-write')
expect(planReferenceWrite({ platform: 'codex', resolution: 'resolved' }).decisionCode).toBe('inline-fallback-write')
expect(planReferenceWrite({ platform: 'gemini', resolution: 'unsupported-scheme' }).decisionCode).toBe('reference-blocked')
```

- [ ] **Step 3: Write the failing unit test for force requirement and blocking reasons**

锁定共享治理对象至少包含：

- `decisionCode`
- `writeStrategy`
- `requiresForce`
- `blocking`
- `reasonCodes`

示例断言：

```ts
expect(planReferenceWrite({ platform: 'codex', resolution: 'resolved' }).requiresForce).toBe(true)
expect(planReferenceWrite({ platform: 'claude', resolution: 'resolved' }).blocking).toBe(false)
expect(planReferenceWrite({ platform: 'claude', resolution: 'unresolved' }).blocking).toBe(true)
```

- [ ] **Step 4: Run the governance unit tests to verify red**

Run:

```bash
corepack pnpm vitest run tests/unit/reference-write-governance.test.ts
```

Expected: FAIL because the shared governance module does not exist and resolver still returns `missing` instead of `unresolved`.

- [ ] **Step 5: Implement the minimal governance module and resolver rename**

最小实现要求：

- `secret-reference-resolver` 改成 `resolved / unresolved / unsupported-scheme`
- 新增共享 helper，输入只关心 `platform + resolver result`
- 第一阶段固定映射：
  - Claude -> `native-reference-supported`
  - Codex -> `inline-fallback-only`
  - Gemini -> `inline-fallback-only`
- 不在治理对象中暴露解析后的 secret 明文

- [ ] **Step 6: Refactor `secret-inspection` to consume the new resolver semantics**

只做最小迁移：

- 把旧的 `writeUnsupported` 语义从“一律不支持写入”改成“当前平台消费后仍需要 fallback 或阻断”
- 保留 `referenceDetails[]` 字段级 explainable
- 为后续 `preview/use` 暴露共享 summary 输入，避免 service 层重复遍历 profile

- [ ] **Step 7: Re-run the governance unit tests**

Run:

```bash
corepack pnpm vitest run tests/unit/reference-write-governance.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tests/unit/reference-write-governance.test.ts src/domain/secret-reference-resolver.ts src/domain/reference-write-governance.ts src/domain/secret-inspection.ts
git commit -m "feat: add shared reference write governance"
```

## Task 2: Make `preview` Emit Scope-Aware Reference Decisions

**Files:**
- Modify: `tests/unit/preview.service.test.ts`
- Modify: `src/services/preview.service.ts`
- Modify: `src/types/command.ts`
- Modify: `src/domain/risk-engine.ts`

- [ ] **Step 1: Write the failing preview unit test for Claude native reference write**

添加一个 `ANTHROPIC_AUTH_TOKEN: "env://ANTHROPIC_AUTH_TOKEN"` 的 profile，断言：

```ts
expect(result.ok).toBe(true)
expect(result.data?.referenceSummary?.writeDecision).toBe('native-reference-write')
expect(result.data?.risk.allowed).toBe(true)
```

- [ ] **Step 2: Write the failing preview unit test for Codex inline fallback write**

断言 preview 不失败，但会明确标出 fallback 风险：

```ts
expect(result.data?.referenceSummary?.writeDecision).toBe('inline-fallback-write')
expect(result.data?.referenceSummary?.requiresForce).toBe(true)
expect(result.limitations).toContain('如继续执行，将以明文写入目标配置文件。')
```

- [ ] **Step 3: Write the failing preview unit test for unresolved and unsupported references**

断言：

```ts
expect(result.ok).toBe(false)
expect(result.error?.code).toBe('PREVIEW_FAILED')
expect(result.error?.details.referenceGovernance.primaryReason).toBe('REFERENCE_MISSING')
```

再补一个 unsupported-scheme case，确认 reason code 区分清楚。

- [ ] **Step 4: Run the preview service tests to verify red**

Run:

```bash
corepack pnpm vitest run tests/unit/preview.service.test.ts
```

Expected: FAIL because `preview.service` 目前只会套旧的 `withProfileSecretReferenceContract`，既不会输出新决策，也不会在 unresolved/unsupported 时主动阻断。

- [ ] **Step 5: Implement preview-side governance wiring**

实现要点：

- `preview.service` 在调用 adapter.validate / adapter.preview 后统一生成 reference decision
- resolved + native -> success with `native-reference-write`
- resolved + fallback -> success with `inline-fallback-write`
- unresolved / unsupported -> 返回结构化 `PREVIEW_FAILED`
- 将 machine-readable detail 放到 success payload 和 failure details，而不是只靠文本 warning

- [ ] **Step 6: Make the smallest type updates for public contract**

只补最小稳定字段，例如：

- `PreviewCommandOutput.referenceSummary` 或等价公共字段
- failure details 中的 `referenceGovernance`
- 如需要，补 `summary.referenceStats` / `summary.executabilityStats` 的单 profile 对齐说明

- [ ] **Step 7: Re-run preview tests**

Run:

```bash
corepack pnpm vitest run tests/unit/preview.service.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tests/unit/preview.service.test.ts src/services/preview.service.ts src/types/command.ts src/domain/risk-engine.ts
git commit -m "feat: add reference-aware preview decisions"
```

## Task 3: Enforce `use` Gate Before Snapshot/Apply

**Files:**
- Modify: `tests/unit/switch.service.test.ts`
- Modify: `src/services/switch.service.ts`
- Modify: `src/types/command.ts`
- Modify: `src/services/snapshot.service.ts`

- [ ] **Step 1: Write the failing unit test for Codex fallback without `--force`**

断言：

```ts
expect(result.ok).toBe(false)
expect(result.error?.code).toBe('CONFIRMATION_REQUIRED')
expect(result.error?.details.referenceGovernance.primaryReason).toBe('REFERENCE_WRITE_UNSUPPORTED')
```

- [ ] **Step 2: Write the failing unit test for Codex fallback with `--force`**

断言：

```ts
expect(result.ok).toBe(true)
expect(result.data?.changedFiles.length).toBeGreaterThan(0)
expect(result.data?.referenceSummary?.writeDecision).toBe('inline-fallback-write')
```

- [ ] **Step 3: Write the failing unit test for unresolved references not entering snapshot/apply**

用 spy 或 fake adapter 断言：

```ts
expect(snapshotSpy).not.toHaveBeenCalled()
expect(applySpy).not.toHaveBeenCalled()
expect(result.error?.code).toBe('USE_FAILED')
```

- [ ] **Step 4: Write the failing unit test for Claude native reference write succeeding without force**

断言：

```ts
expect(result.ok).toBe(true)
expect(result.error).toBeUndefined()
expect(result.data?.backupId).toBeDefined()
```

- [ ] **Step 5: Run the switch service tests to verify red**

Run:

```bash
corepack pnpm vitest run tests/unit/switch.service.test.ts
```

Expected: FAIL because `switch.service` 目前不会基于 reference 决策主动阻断，也不会把 fallback-only 提升成显式确认门槛。

- [ ] **Step 6: Implement use-side reference gate**

最小实现原则：

- reference gate 发生在 `preview` 之后、`snapshot/apply` 之前
- `resolved + native-reference-supported` 允许继续
- `resolved + inline-fallback-only` 无 `--force` 返回 `CONFIRMATION_REQUIRED`
- `resolved + inline-fallback-only + --force` 允许继续
- `unresolved / unsupported-scheme` 返回失败，不进入 snapshot/apply

- [ ] **Step 7: Patch snapshot metadata only if tests reveal a contract gap**

只有在现有 snapshot manifest 无法准确表达 fallback/native 写入事实时，才最小化补一层 metadata；不要顺手扩大 snapshot schema。

- [ ] **Step 8: Re-run switch service tests**

Run:

```bash
corepack pnpm vitest run tests/unit/switch.service.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add tests/unit/switch.service.test.ts src/services/switch.service.ts src/types/command.ts src/services/snapshot.service.ts
git commit -m "feat: gate use with reference write governance"
```

## Task 4: Land Platform Write Behavior In Adapters

**Files:**
- Modify: `src/adapters/claude/claude.adapter.ts`
- Modify: `src/adapters/codex/codex.adapter.ts`
- Modify: `src/adapters/gemini/gemini.adapter.ts`
- Modify: `tests/unit/switch.service.test.ts`
- Modify: `tests/integration/cli-commands.test.ts`

- [ ] **Step 1: Write the failing adapter-facing test for Claude native reference persistence**

补一个真实 CLI 或 service 级 case，确认 Claude 最终写入保留引用值而不是解析后的明文：

```ts
expect(writtenSettings.ANTHROPIC_AUTH_TOKEN).toBe('env://ANTHROPIC_AUTH_TOKEN')
```

- [ ] **Step 2: Write the failing adapter-facing test for Codex inline fallback persistence**

断言 Codex 写入的是解析后的真实值，并且同时覆盖 `config.toml` / `auth.json`：

```ts
expect(writtenAuth.OPENAI_API_KEY).toBe('sk-live-123')
expect(changedFiles).toEqual(expect.arrayContaining([configPath, authPath]))
```

- [ ] **Step 3: Write the failing adapter-facing test for Gemini inline fallback persistence**

断言 Gemini 在 `env://GEMINI_API_KEY` resolved + `--force` 时，会把值写入当前 target scope settings，而不是继续保持 env-only 旧路径。

- [ ] **Step 4: Run the targeted unit/integration tests to verify red**

Run:

```bash
corepack pnpm vitest run tests/unit/switch.service.test.ts tests/integration/cli-commands.test.ts
```

Expected: FAIL because当前 adapters 仍按旧假设处理 secret 字段，Claude 不能原生保留引用，Codex/Gemini 也没有 fallback 写入。

- [ ] **Step 5: Implement the smallest adapter changes per platform**

平台要求：

- Claude：保留 `env://...` 原值写入托管字段
- Codex：apply 前将 resolved value 内联到双文件写入 payload
- Gemini：apply 前将 resolved value 内联到目标 scope settings payload
- unresolved / unsupported 不在 adapter 里兜底；应由 service 层提前拦截

- [ ] **Step 6: Re-run the targeted tests**

Run:

```bash
corepack pnpm vitest run tests/unit/switch.service.test.ts tests/integration/cli-commands.test.ts
```

Expected: PASS for the new reference cases and no regression in existing non-reference writes.

- [ ] **Step 7: Commit**

```bash
git add src/adapters/claude/claude.adapter.ts src/adapters/codex/codex.adapter.ts src/adapters/gemini/gemini.adapter.ts tests/unit/switch.service.test.ts tests/integration/cli-commands.test.ts
git commit -m "feat: support reference writes across preview and use adapters"
```

## Task 5: Align Text, JSON Contract, And Docs

**Files:**
- Modify: `src/renderers/text-renderer.ts`
- Modify: `tests/unit/public-json-schema.test.ts`
- Modify: `README.md`
- Modify: `docs/public-json-schema.md`
- Modify: `tests/unit/docs-consistency.test.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write the failing schema test for preview/use success payloads**

新增样例至少覆盖：

- `preview` Claude native reference write success
- `preview` Codex inline fallback success
- `use` Codex fallback without force -> `CONFIRMATION_REQUIRED`
- `use` unsupported scheme -> structured failure with `referenceGovernance`

- [ ] **Step 2: Write the failing docs consistency assertion**

锁定 README 不再出现旧文案：

```ts
expect(readme).not.toContain('preview/use/import apply 暂不解析引用')
```

同时要求文档明确出现：

- `native-reference-write`
- `inline-fallback-write`
- `reference-blocked`

- [ ] **Step 3: Run schema/docs tests to verify red**

Run:

```bash
corepack pnpm vitest run tests/unit/public-json-schema.test.ts tests/unit/docs-consistency.test.ts
```

Expected: FAIL because schema 样例和 README 仍停在旧限制说明。

- [ ] **Step 4: Update text renderer to consume the shared governance object**

文本目标：

- preview 明确说“保留引用写入”或“将以明文写入目标配置文件”
- use 失败时直接显示 unresolved/unsupported/fallback gate 原因
- 不回显 secret 明文

- [ ] **Step 5: Update README and `docs/public-json-schema.md`**

最小文档范围：

- README 产品说明与 CLI JSON 示例
- schema 文档的 `preview --json` / `use --json` 成功样例与失败样例
- force gate 风险说明

- [ ] **Step 6: Re-run schema/docs tests**

Run:

```bash
corepack pnpm vitest run tests/unit/public-json-schema.test.ts tests/unit/docs-consistency.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the focused end-to-end verification set**

Run:

```bash
corepack pnpm vitest run tests/unit/reference-write-governance.test.ts tests/unit/preview.service.test.ts tests/unit/switch.service.test.ts tests/integration/cli-commands.test.ts tests/unit/public-json-schema.test.ts tests/unit/docs-consistency.test.ts
corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderers/text-renderer.ts tests/unit/public-json-schema.test.ts README.md docs/public-json-schema.md tests/unit/docs-consistency.test.ts CHANGELOG.md
git commit -m "feat: document reference resolver preview use contract"
```

## Task 6: Final Regression Sweep

**Files:**
- Modify: none unless regression fix is required

- [ ] **Step 1: Run the full test suite**

Run:

```bash
corepack pnpm test
```

Expected: PASS.

- [ ] **Step 2: Run build validation**

Run:

```bash
corepack pnpm build
```

Expected: PASS.

- [ ] **Step 3: Run release smoke if schema/docs or CLI packaging changed materially**

Run:

```bash
corepack pnpm smoke:release
```

Expected: PASS.

- [ ] **Step 4: Commit regression fixes only if needed**

```bash
git add <files>
git commit -m "fix: resolve reference preview use regressions"
```
