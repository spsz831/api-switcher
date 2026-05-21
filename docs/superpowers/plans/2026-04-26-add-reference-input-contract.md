# Add Reference Input Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `add` 命令补齐 reference-only 输入的稳定 contract、CLI 行为、README / schema 文档和测试闭环，同时明确它只负责录入，不负责本地 resolver 可执行性判断。

**Architecture:** 复用现有 `add` 成功态结构、summary 聚合和统一失败 envelope，不新增执行型 resolver 生命周期对象。先用测试冻结 `add` 的两类输入模式与失败码，再做最小实现与文档同步，最后用 schema/CLI/doc 一致性测试锁住对外行为。

**Tech Stack:** TypeScript、Commander CLI、Vitest、现有 command service / text renderer / public JSON schema / docs consistency 测试体系。

---

## 文件结构

本次改动预计涉及以下文件：

- Modify: `src/cli/index.ts`
  - `add` 命令 help、参数互斥和文案入口。
- Modify: `src/services/add.service.ts`
  - `add` 输入模式归类、失败码、summary 结果。
- Modify: `src/renderers/text-renderer.ts`
  - `add` 非 JSON 文本边界文案与 summary 输出顺序。
- Modify: `src/services/schema.service.ts`
  - `add` action capability、failure code、示例 discoverability。
- Modify: `src/types/command.ts`
  - 仅在测试证明需要时，补最小类型边界。
- Modify: `docs/public-json-output.schema.json`
  - `add` 稳定成功/失败 contract 样例和字段 discoverability。
- Modify: `README.md`
  - `add` 两种输入模式、成功/失败样例、责任边界。
- Modify: `docs/public-json-schema.md`
  - `add` 的 JSON contract、字段语义与失败阅读顺序。
- Test: `tests/unit/*.test.ts`
  - `add` service、text renderer、public JSON schema、docs consistency。
- Test: `tests/integration/cli-add.test.ts`
  - `add --json` / help / 文本输出集成验证。
- Test: `tests/integration/cli-top-level-contracts.test.ts`
  - 顶层 schema catalog 和 `add` action capability 断言。

说明：

- 如果现有 `add` 逻辑散落在其他 service/helper 中，优先沿现有路径修改，不额外拆新文件。
- 不把 reference resolver 执行逻辑塞进 `add`；最多只做格式和互斥校验。

### Task 1: 冻结 `add` 输入模式与失败码单测

**Files:**
- Modify: `tests/unit/add.service.test.ts` 或现有承载 `add` 行为的 unit test 文件
- Modify: `tests/unit/public-json-schema.test.ts`

- [ ] **Step 1: 写 reference-only 成功与输入失败的 failing tests**

补以下断言：

```ts
it('add 支持 reference-only 输入并保留原始引用字符串', async () => {
  // 期望 summary.referenceStats 标记为 reference profile
})

it('缺失明文与 reference 输入时返回 ADD_INPUT_REQUIRED', async () => {
  // 期望 error.code === 'ADD_INPUT_REQUIRED'
})

it('明文与 reference 同时出现时返回 ADD_INPUT_CONFLICT', async () => {
  // 期望 error.code === 'ADD_INPUT_CONFLICT'
})
```

- [ ] **Step 2: 运行单测，确认先失败**

Run: `corepack pnpm vitest run tests/unit/add.service.test.ts tests/unit/public-json-schema.test.ts --reporter=basic`

Expected:
- `add` 相关新用例先失败。
- 失败原因应是 contract 尚未实现或 schema 尚未声明，而不是测试拼写错误。

- [ ] **Step 3: 最小实现 `add` 输入模式归类与失败码**

在 `src/services/add.service.ts` 中：

1. 明确区分明文模式与 reference-only 模式。
2. 缺失输入返回 `ADD_INPUT_REQUIRED`。
3. 冲突输入返回 `ADD_INPUT_CONFLICT`。
4. reference-only 成功时保留原始 reference 字符串，不做本地解析。

- [ ] **Step 4: 补齐 `summary.referenceStats` / `summary.executabilityStats` 语义**

确保 reference-only 成功时：

1. `summary.referenceStats` 能反映 reference profile。
2. `summary.executabilityStats` 只表达 profile 形态，不伪装成已通过 resolver 校验。

- [ ] **Step 5: 运行单测，确认通过**

Run: `corepack pnpm vitest run tests/unit/add.service.test.ts tests/unit/public-json-schema.test.ts --reporter=basic`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/add.service.ts tests/unit/add.service.test.ts tests/unit/public-json-schema.test.ts
git commit -m "feat: define add reference input contract"
```

### Task 2: 冻结 `add` 的 CLI help、文本边界文案与集成行为

**Files:**
- Modify: `src/cli/index.ts`
- Modify: `src/renderers/text-renderer.ts`
- Test: `tests/integration/cli-add.test.ts`
- Test: `tests/unit/text-renderer.test.ts`

- [ ] **Step 1: 写 CLI 集成测试，先冻结 help / json / 文本文案**

在 `tests/integration/cli-add.test.ts` 中补场景：

1. `add --help` 明确说明明文模式与 reference-only 模式互斥。
2. `add --json` reference-only 成功。
3. `add --json` 缺失输入失败。
4. `add --json` 冲突输入失败。
5. 非 JSON 模式输出边界文案：
   - `add 只记录 reference 输入；真正的本地解析、治理判断和写入可执行性检查在 preview/use/import apply 阶段完成。`

- [ ] **Step 2: 运行 CLI 集成测试，确认先失败**

Run: `corepack pnpm vitest run tests/integration/cli-add.test.ts tests/unit/text-renderer.test.ts --reporter=basic`

Expected:
- 新增的 help/文本/reference-only 场景失败。

- [ ] **Step 3: 最小实现 CLI help 与参数说明**

在 `src/cli/index.ts` 中：

1. 明确 `--key` 与 `--secret-ref` / `--auth-reference` 的互斥说明。
2. 在 help 中明确 `add` 只录入 reference，不验证当前环境可执行性。

- [ ] **Step 4: 最小实现文本输出边界文案**

在 `src/renderers/text-renderer.ts` 中：

1. `add` 文本输出按 `summary.platformStats -> summary.referenceStats -> summary.executabilityStats -> preview/risk` 顺序展示。
2. 追加稳定边界文案，明确真正的解析与治理阶段在 `preview/use/import apply`。

- [ ] **Step 5: 运行 CLI/renderer 测试，确认通过**

Run: `corepack pnpm vitest run tests/integration/cli-add.test.ts tests/unit/text-renderer.test.ts --reporter=basic`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/index.ts src/renderers/text-renderer.ts tests/integration/cli-add.test.ts tests/unit/text-renderer.test.ts
git commit -m "feat: clarify add reference input cli behavior"
```

### Task 3: 同步 schema catalog、README 与公共 schema 文档

**Files:**
- Modify: `src/services/schema.service.ts`
- Modify: `docs/public-json-output.schema.json`
- Modify: `README.md`
- Modify: `docs/public-json-schema.md`
- Test: `tests/unit/docs-consistency.test.ts`
- Test: `tests/integration/cli-top-level-contracts.test.ts`

- [ ] **Step 1: 写 failing tests，冻结 `add` 的 catalog / 文档口径**

补以下断言：

1. `cli-top-level-contracts.test.ts` 中 `add` action capability 覆盖：
   - 输入失败码
   - success/failure 主字段
   - 责任边界不含 resolver 可执行性承诺
2. `docs-consistency.test.ts` 中 README / schema 文档口径一致：
   - 两种输入模式
   - `ADD_INPUT_REQUIRED / ADD_INPUT_CONFLICT`
   - “只录入、不解析”的边界说明

- [ ] **Step 2: 运行文档与顶层 contract 测试，确认先失败**

Run: `corepack pnpm vitest run tests/unit/docs-consistency.test.ts tests/integration/cli-top-level-contracts.test.ts --reporter=basic`

Expected:
- `add` contract 断言先失败。

- [ ] **Step 3: 最小更新 schema service 与 machine-readable schema**

在 `src/services/schema.service.ts` 与 `docs/public-json-output.schema.json` 中：

1. 同步 `add` action capability。
2. 只补这次真正需要的稳定字段和失败码。
3. 不扩新的 resolver 运行时字段。

- [ ] **Step 4: 更新 README 与 `docs/public-json-schema.md`**

补以下内容：

1. `add` 两种输入模式说明。
2. reference-only 成功样例。
3. 缺失输入失败样例。
4. 冲突输入失败样例。
5. 明确责任边界：
   - `add` 负责录入
   - `preview/use/import apply` 负责解析与治理

- [ ] **Step 5: 运行 contract / 文档测试，确认通过**

Run: `corepack pnpm vitest run tests/unit/docs-consistency.test.ts tests/unit/public-json-schema.test.ts tests/integration/cli-top-level-contracts.test.ts --reporter=basic`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/schema.service.ts docs/public-json-output.schema.json README.md docs/public-json-schema.md tests/unit/docs-consistency.test.ts tests/integration/cli-top-level-contracts.test.ts
git commit -m "docs: align add reference input public contract"
```

### Task 4: 端到端回归验证

**Files:**
- No new files

- [ ] **Step 1: 运行 `add` 相关完整测试批次**

Run: `corepack pnpm vitest run tests/unit/add.service.test.ts tests/unit/text-renderer.test.ts tests/unit/public-json-schema.test.ts tests/unit/docs-consistency.test.ts tests/integration/cli-add.test.ts tests/integration/cli-top-level-contracts.test.ts tests/integration/schema-cli-commands.test.ts --reporter=basic`

Expected:
- 全部通过。
- 没有因为 `add` 轻量 contract 收口而破坏现有 schema / top-level contract。

- [ ] **Step 2: 人工检查边界是否被破坏**

检查点：

1. `add` 成功态没有新增“已解析 env / 当前环境可执行”之类承诺。
2. `add` 失败态没有长出新的治理 detail payload。
3. 文档反复强调 `add` 只录入，不解析。

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "test: freeze add reference input contract"
```

## 计划外禁止项

执行时不要顺手做这些事：

1. 不把 `add` 接进本地 resolver 真实解析。
2. 不扩 `preview/use/import apply` 的运行时行为。
3. 不在本次里继续扩写 schema catalog 的其他 discoverability 字段。
4. 不做无关测试拆分或大规模重构。

## 完成定义

以下条件全部满足才算完成：

1. `add` 的两种输入模式被稳定文档化。
2. `ADD_INPUT_REQUIRED / ADD_INPUT_CONFLICT` 被 schema、CLI 和 README 同时冻结。
3. reference-only 成功样例能解释“录入了什么，不保证什么”。
4. 全部相关测试通过。
