# Add Reference Input Contract Design

日期：2026-04-26

## 背景

当前项目已经在 `preview / use / import apply` 这条产品线上形成了较完整的 reference resolver、governance explainable 和稳定 JSON contract，但 `add` 仍然停留在“可以录入 profile”的基础能力层。这样会产生两个问题：

1. `add` 的输入面和外部调用方认知并不完全对齐。
2. reference 输入在 `add` 阶段的语义边界不够清楚，调用方容易误以为 `add` 已经完成本地解析或可执行性验证。

这次设计的目标不是把 `add` 升级成一个执行型 resolver 命令，而是先把输入 contract、CLI 行为、README 和测试收口，形成一条边界清晰的轻量产品线。

## 目标

本次 `add` 线只解决“输入 contract 和外部认知闭环”，不提前冻结 resolver 执行语义。

完成后，外部调用方应能稳定知道：

1. `add` 支持哪几种输入模式。
2. 成功态和失败态该读哪些稳定字段。
3. reference-only 输入在 `add` 阶段只表示“录入引用”，不表示“已经验证当前环境可执行”。
4. 下一步应该去 `preview / use / import apply` 的哪类 contract 看真正的解析与治理结果。

## 非目标

本次明确不做：

1. 不在 `add` 阶段解析 `env://` 是否在当前机器可用。
2. 不把 `add` 变成 `preview / use / import apply` 的前置执行器。
3. 不新增一套并行的 resolver 生命周期字段，除非测试证明现有 contract 无法表达。
4. 不改变现有写入链路的 reference resolver 责任边界。

## 用户面设计

### 输入模式

`add` 的输入稳定收成两类：

1. 明文模式
   - 用户提供明文 secret 输入，例如 `--key`。
   - 输出结果创建 inline-secret profile。

2. reference-only 模式
   - 用户提供 `--secret-ref` / `--auth-reference` 这类 reference 输入，例如 `env://GEMINI_API_KEY`。
   - `add` 只记录原始引用字符串，不承诺当前可执行。

### 失败语义

`add` 本次冻结以下失败分类：

1. `ADD_INPUT_REQUIRED`
   - 既没有明文 key，也没有 reference 输入。

2. `ADD_INPUT_CONFLICT`
   - 明文 secret 和 reference 输入同时出现。
   - 或 reference-only 组合本身不合法。

3. `UNSUPPORTED_PLATFORM`
   - 当前平台不支持该输入组合。

4. 现有 platform/runtime 失败
   - 继续复用 `ADAPTER_NOT_REGISTERED`、`ADD_FAILED` 等已有稳定 failure code。

## Contract 设计

### 成功态

`add --json` 继续沿用现有顶层形状：

1. `summary.platformStats`
2. `summary.referenceStats`
3. `summary.executabilityStats`
4. `risk`
5. `preview`
6. `scopeCapabilities`

关键设计约束：

1. reference-only 成功时，`summary.referenceStats` 必须能稳定反映“这是 reference profile”。
2. `summary.executabilityStats` 只表达“当前 profile 形态属于哪类”，不能把它包装成已经完成本地 resolver 校验。
3. 成功态不新增“当前 env 是否可解析”的专用字段；这类语义继续留在 `preview / use / import apply`。

### 失败态

失败态继续沿用统一 envelope：

1. `error.code`
2. `error.message`
3. `warnings`
4. `limitations`

本次原则是不把 `add` 失败态扩成新的治理细节 payload。原因是：

1. `add` 阶段不做本地解析。
2. 真正的 reference 治理细节应继续集中在 `preview / use / import apply`。

## CLI 与文本输出

### Help 与命令说明

`add --help` 需要明确表达：

1. 明文输入和 reference-only 输入是两种互斥模式。
2. `add` 只记录 reference 输入，不验证当前环境能否解析。
3. reference 的可执行性与治理判断要在 `preview / use / import apply` 阶段查看。

### 文本输出

非 JSON 模式下要补一条稳定边界文案：

`add` 只记录 reference 输入；真正的本地解析、治理判断和写入可执行性检查在 `preview/use/import apply` 阶段完成。

同时，文本 summary 要继续与 JSON 聚合对齐：

1. 先看 `summary.platformStats`
2. 再看 `summary.referenceStats`
3. 再看 `summary.executabilityStats`
4. 最后再展开 `preview` / `risk`

## 文档设计

需要同步更新：

1. `README.md`
2. `docs/public-json-schema.md`
3. `docs/public-json-output.schema.json`

文档需要覆盖：

1. `add` 的两种输入模式。
2. `ADD_INPUT_REQUIRED / ADD_INPUT_CONFLICT` 的语义。
3. reference-only 成功样例。
4. 输入缺失与输入冲突失败样例。
5. 明确的责任边界说明：
   - `add` 负责录入
   - `preview / use / import apply` 负责解析与治理

## 测试策略

### 单测

补齐以下场景：

1. 明文模式成功。
2. reference-only 模式成功。
3. 缺失输入触发 `ADD_INPUT_REQUIRED`。
4. 冲突输入触发 `ADD_INPUT_CONFLICT`。
5. `summary.referenceStats` / `summary.executabilityStats` 对 reference-only profile 的聚合语义。

### CLI 集成测试

补齐以下场景：

1. `add --json` 明文成功。
2. `add --json` reference-only 成功。
3. `add --json` 输入缺失失败。
4. `add --json` 输入冲突失败。
5. help / 非 JSON 文本边界文案。

### 文档一致性测试

冻结以下内容：

1. README 与 schema 文档对 `add` 输入模式的同一口径。
2. README 与 schema 文档对 `ADD_INPUT_REQUIRED / ADD_INPUT_CONFLICT` 的同一口径。
3. README、schema 文档和 machine-readable schema 对成功/失败样例的同一口径。

## 实现边界

本次是“轻量 contract 收口”，不是 resolver 执行增强。

因此实现上应遵守：

1. 尽量复用现有 `summary.referenceStats` / `summary.executabilityStats` / `preview` / `risk` 结构。
2. 不新增新的运行时治理对象，除非测试证明现有结构无法表达。
3. 文档与测试优先级高于新增行为复杂度。

## 验收标准

满足以下条件即可视为完成：

1. `add` 的成功/失败 contract 能被 schema 与顶层 CLI contract 测试覆盖。
2. README 和 `docs/public-json-schema.md` 能直接回答“`add` 录入了什么，不保证什么，下一步去哪看”。
3. 不引入新的未定型 resolver 运行时语义。
4. 外部调用方不需要再从测试反推 `add` 的 reference 输入边界。

## 第二阶段建议

这次收口后，再评估是否推进 `add` 的 resolver 预检增强。

建议第二阶段只做最小增强：

1. `add` 阶段只校验引用格式和明显冲突。
2. 不在 `add` 阶段承诺真实可执行性。
3. 真正的本地解析与治理判断继续留在 `preview / use / import apply`。
