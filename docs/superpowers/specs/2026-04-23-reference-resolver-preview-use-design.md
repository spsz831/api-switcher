# Reference Resolver Preview Use Design

## What

为 `preview` / `use` 增加第一阶段的 reference resolver 与写入消费能力：

- 仅支持解析 `env://VAR_NAME`
- `preview` 和 `use` 共享同一套 resolver 结果
- resolver 先回答 `resolved / unresolved / unsupported-scheme`
- 平台 adapter 再决定“保留原生引用写入”还是“回退为明文写入”
- `import apply` 不纳入本阶段

## Why

当前项目已经能在只读与失败 contract 里表达 `secret_ref / auth_reference`、`referenceSummary`、`referenceGovernance` 和字段级 resolver explainable，但真正的写入链路仍停在“识别到引用就视为未启用”。

这带来两个问题：

- 用户能看到 reference contract，却不能在 `preview/use` 里真正消费它
- 外部调用方已经能读到大量 reference explainable，但最终写入能力仍是空洞的

第一阶段的目标不是一次性打通所有 secret manager，而是先把最小闭环做对：

- `preview` 能明确告诉用户引用是否可解析、最终会如何写入
- `use` 能在安全边界明确的前提下真正消费最小 reference 能力

## Recommendation

采用“两阶段决策”方案，而不是把“能解析”直接等同于“能保留引用写入”：

1. reference resolver 先回答引用状态
2. platform adapter 再回答写入策略

推荐原因：

- 不会把 `resolved` 错误解释成“平台支持原生引用写入”
- 可以先拿到共享 resolver contract，再按平台逐步扩展 native reference write
- 后续把 `import apply` 接进来时，可以复用同一套 resolver / governance contract，而不是重做一套

## Scope

本阶段覆盖：

- `preview` 支持 `env://` 解析与引用消费 explainable
- `use` 支持 `env://` 解析后的真实消费
- 平台级写入策略区分 `native-reference-supported` 与 `inline-fallback-only`
- JSON / 文本输出明确区分“保留引用写入”“回退明文写入”“引用阻断”
- 现有 `referenceSummary / referenceGovernance` contract 做最小扩展，不重起一套并行 payload

本阶段不覆盖：

- `import apply` 消费 reference
- `vault://`、`op://`、`1password://` 或其他 scheme
- 跨进程 secret manager 集成
- 自动发现平台原生引用语法
- 对现有 profile 存储模型做大规模迁移

## Resolver Model

第一阶段只支持：

`env://VAR_NAME`

resolver 输出只关心三类稳定状态：

- `resolved`
- `unresolved`
- `unsupported-scheme`

其中：

- `resolved` 表示当前进程环境变量可取到值
- `unresolved` 表示 scheme 正确，但环境变量不存在或为空
- `unsupported-scheme` 表示不是当前阶段支持的 resolver 类型

resolver 不直接决定写入格式，也不在 `preview` 中回显明文值。

## Platform Write Strategy

平台 adapter 再把 resolver 结果映射到写入策略：

- `native-reference-supported`
  - 平台可以保留引用语义写入目标配置
- `inline-fallback-only`
  - 平台不支持原生引用写入，只能在解析成功后回退为明文写入

第一阶段的平台建议：

- Claude：优先尝试 `native-reference-supported`
- Codex：先按 `inline-fallback-only`
- Gemini：先按 `inline-fallback-only`

原因：

- Claude 当前托管边界已显式包含 `auth_reference / secret_ref`
- Codex / Gemini 当前的主要复杂度不在原生引用写入，先把 resolver 与 fallback gate 做稳更重要

## Preview Contract

`preview` 需要把“引用解析状态”和“最终写入形态”明确区分。

推荐稳定结论只有三类：

- `native-reference-write`
  - 引用可解析，且平台支持原生引用写入
- `inline-fallback-write`
  - 引用可解析，但平台仅支持回退明文写入
- `reference-blocked`
  - 引用未解析或 scheme 不支持，无法继续进入 `use`

设计要求：

- 不在 `preview` 里直接暴露解析后的明文 secret
- JSON 需要让机器消费方能稳定知道是 `native`、`fallback` 还是 `blocked`
- 文本输出必须明确说明“这次会保留引用写入”还是“这次会回退成明文写入”

风险策略：

- `native-reference-write`：按现有风险模型处理
- `inline-fallback-write`：必须显式进入 risk reasons / limitations
- `reference-blocked`：直接进入 `allowed = false` 或结构化失败

## Use Contract

`use` 的执行规则建议比 `preview` 更严格：

- `resolved + native-reference-supported`
  - 允许直接进入正常写入路径
- `resolved + inline-fallback-only`
  - 不允许静默写入
  - 必须显式 `--force`
  - 原因要明确表达为“reference 将降级成明文落盘”
- `unresolved`
  - 直接失败
  - 不进入 snapshot / apply
- `unsupported-scheme`
  - 直接失败
  - 不做兜底写入

## Failure Model

第一阶段不建议新增大量顶层 error code，优先复用现有失败面：

- 顶层失败继续沿用现有治理 / 确认失败出口
- 细粒度原因继续落在 `error.details.referenceGovernance`

建议收口为两类：

- 治理阻断类
  - 例如继续使用 `REFERENCE_MISSING`
  - 或 `REFERENCE_WRITE_UNSUPPORTED`
- 确认门槛类
  - 顶层仍可走 `CONFIRMATION_REQUIRED`
  - 但 `referenceGovernance` 必须明确“已解析但只能明文回退”

也就是说，第一阶段重点是把明文回退表达成清晰风险，而不是发明一批新的顶层错误名。

## UX Rules

文本输出需要明确以下语义：

- 已解析 env 引用，但当前平台支持保留引用写入
- 已解析 env 引用，但当前平台仅支持明文写入
- 当前 env 引用未解析，无法继续执行
- 当前引用 scheme 暂不支持

对于 `inline-fallback-write`，文案必须直说：

- “如继续执行，将以明文写入目标配置文件”

不要把它包装成普通 warning 或普通覆盖提示。

## Testing Focus

本阶段实现与测试至少需要覆盖：

- `preview`：
  - `env://` resolved + native reference write
  - `env://` resolved + inline fallback write
  - `env://` unresolved
  - `unsupported-scheme`
- `use`：
  - resolved + native reference write 成功
  - resolved + inline fallback 在无 `--force` 时触发确认门槛
  - resolved + inline fallback 在 `--force` 时成功并明确记为明文回退
  - unresolved 失败且不进入 snapshot/apply
  - unsupported-scheme 失败且不进入 snapshot/apply

## Outcome

本设计完成后，应满足：

- `secret_ref / auth_reference` 不再只是只读 contract
- `preview/use` 首次具备最小可执行的 reference 消费闭环
- 原生引用写入与明文回退写入被明确区分
- `import apply` 后续接入时，可复用同一套 resolver / governance / risk contract
