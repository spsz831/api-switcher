# import preview Consumer Guide

本文档面向需要消费 `api-switcher import --json` 输出的调用方，重点说明 mixed-batch 场景下应该如何分层读取 batch-level 与 item-level explainable 字段。

## 核心原则

- `exportedObservation` 只是导出时的历史观察，不是导入机当前环境的执行真相。
- `localObservation` 才是后续 apply 设计应优先信任的本地实时观察。
- batch-level 判断优先使用 `summary` 聚合字段，不要先遍历 `items[]` 自己二次汇总。
- item-level 判断优先使用稳定 code/enum，不要依赖 `message` 或文本摘要做逻辑分支。

## 推荐消费顺序

1. 读取 `sourceCompatibility`。
   用来判断导入源是严格 schema 模式，还是“缺少 schemaVersion 但仍可兼容读取”的降级模式。

2. 读取 `summary.totalItems`、`summary.matchCount`、`summary.mismatchCount`、`summary.partialCount`、`summary.insufficientDataCount`。
   用来建立整批导入结果的第一层总览。

3. 读取 `summary.decisionCodeStats`。
   适合回答“这一批为什么不能继续进入 apply 设计”。

4. 读取 `summary.driftKindStats`。
   适合回答“这一批的主要漂移来自哪里”。

5. 只有在需要下钻到具体 profile 时，再展开 `items[]`。
   此时结合 `fidelity`、`previewDecision`、`exportedObservation`、`localObservation` 查看单条明细。

## Batch-level 字段

### summary.decisionCodeStats

适合：

- 列表页顶部摘要
- 批处理脚本的快速分流
- UI 面板中的阻塞原因聚合

推荐做法：

- 优先查找 `blockingCount > 0` 的 code，作为整批阻塞主因。
- 对 mixed-batch 场景，不要假设只有一个 code；同一批可能同时出现 `BLOCKED_BY_FIDELITY_MISMATCH` 和 `REQUIRES_LOCAL_SCOPE_RESOLUTION`。

当前常见 code：

- `READY_USING_LOCAL_OBSERVATION`
- `LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION`
- `BLOCKED_BY_INSUFFICIENT_OBSERVATION`
- `BLOCKED_BY_FIDELITY_MISMATCH`
- `REQUIRES_LOCAL_SCOPE_RESOLUTION`

### summary.driftKindStats

适合：

- 仪表盘上的 drift 分布概览
- 自动化脚本里的异常分类
- mixed-batch 结果页中的“本批次主要问题类型”

推荐做法：

- 如果 `availability-drift.blockingCount > 0`，优先提示本地环境解析问题，而不是继续讨论 apply 目标。
- 如果只有 `default-scope-drift.warningCount > 0`，通常表示目标 scope 需要重新确认，但不一定意味着本地环境失效。
- 如果 `capability-drift.warningCount > 0`，应优先检查平台契约或版本变化。

## Item-level 字段

### previewDecision

适合：

- 单条 profile 详情页
- 每个 item 的操作按钮状态判断
- 下钻后的 UI 提示与动作建议

推荐消费顺序：

1. `previewDecision.canProceedToApplyDesign`
2. `previewDecision.requiresLocalResolution`
3. `previewDecision.reasonCodes`
4. `previewDecision.reasons[]`

建议：

- 机器判断优先使用 `reasonCodes` 和 `reasons[].code`。
- `reasons[].message` 主要用于展示，不建议直接作为程序逻辑分支条件。

### fidelity

适合：

- 解释导出环境与本地环境为什么一致或不一致
- 在详情面板中展示 drift 证据

推荐消费顺序：

1. `fidelity.status`
2. `fidelity.driftSummary`
3. `fidelity.groupedMismatches`
4. `fidelity.mismatches`
5. `fidelity.highlights`

建议：

- 对机器消费方，`groupedMismatches` 通常比平铺的 `mismatches[]` 更适合作为中间层。
- 对人工排查，`mismatches[]` 里的 `exportedValue` / `localValue` 更适合展示原始证据。

## Explainable 词典

这一节把 `import preview` 里最重要的三层 explainable 字段统一成一份词典，便于产品、前端和自动化脚本共享同一套解释口径。

### fidelity.status

| 值 | 一句话定义 | 典型触发场景 | 上层建议动作 |
| --- | --- | --- | --- |
| `match` | 导出观察与当前本地观察在可比范围内一致 | 导出和导入机对同一 scope 的 observation 一致 | 允许继续进入 apply 设计评估 |
| `partial` | 导出 observation 不完整，只能做有限对比 | 缺少 `scopeAvailability`、`scopeCapabilities` 或 `observedAt` | 可以继续评估，但应提示“证据不完整” |
| `mismatch` | 导出观察与当前本地观察存在关键漂移 | Gemini `project scope` 导出时可用，但本地解析为 `unresolved` | 先看 `previewDecision.reasonCodes` 和 `driftKind`，通常不要继续 apply 设计 |
| `insufficient-data` | 导出 observation 或本地 observation 缺失，无法建立有效结论 | 导入源没有 observation，或本地没有可用 observation | 直接阻断后续设计，优先补齐输入或环境信息 |

### previewDecision.reasonCodes

| code | 一句话定义 | 典型触发场景 | 上层建议动作 |
| --- | --- | --- | --- |
| `READY_USING_LOCAL_OBSERVATION` | 当前本地 observation 足以支撑后续评估 | `fidelity.status = match` | 可以进入后续 apply 设计或下钻详情 |
| `LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION` | 导出 observation 不完整，但仍可基于本地 observation 做有限评估 | `fidelity.status = partial` | 允许继续，但应明确标记“有限结论” |
| `BLOCKED_BY_INSUFFICIENT_OBSERVATION` | observation 缺口过大，当前不能继续 | `fidelity.status = insufficient-data` | 阻断流程，引导补齐导出源或本地环境信息 |
| `BLOCKED_BY_FIDELITY_MISMATCH` | 导出观察与本地观察存在关键漂移 | `fidelity.status = mismatch` | 阻断继续 apply 设计，优先查看 drift 证据 |
| `REQUIRES_LOCAL_SCOPE_RESOLUTION` | 本地 scope 解析尚未完成 | Gemini `project scope` 解析为 `unresolved` | 优先修复本地解析或项目根目录，再重新执行 preview |

### fidelity.groupedMismatches[].driftKind

| driftKind | 一句话定义 | 典型触发场景 | 上层建议动作 |
| --- | --- | --- | --- |
| `default-scope-drift` | 默认写入作用域发生漂移 | 导出时默认是 `user`，本地当前默认改成了其他 scope | 提醒重新确认目标 scope，不要沿用旧默认值 |
| `availability-drift` | scope 当前可用性与导出观察不一致 | 导出时 `project` 可用，但本地现在不可解析或不可写 | 优先修复本地环境或解析条件 |
| `capability-drift` | 平台契约能力与导出观察不一致 | 当前平台版本对某 scope 的 `use/rollback/writable` 发生变化 | 优先检查平台契约、版本或能力面变化 |

## Mixed-batch 接入建议

如果一批导入结果中同时存在：

- `match`
- `partial`
- `mismatch`
- `insufficient-data`

推荐展示顺序：

1. 顶部显示 `summary` 聚合结果。
2. 优先显示 `decisionCodeStats` 中 `blockingCount > 0` 的 code。
3. 再显示 `driftKindStats` 中 `blockingCount > 0` 或 `warningCount > 0` 的 drift 类型。
4. 默认折叠 `items[]`。
5. 用户展开某个 profile 时，再显示该条 item 的 `previewDecision` 和 `fidelity`。

## 不推荐的做法

- 不要把 `exportedObservation` 与 `localObservation` 合并成一个对象后再展示。
- 不要跳过 `summary`，直接遍历 `items[]` 自己做一层聚合。
- 不要依赖 `message`、`highlights` 或文本输出做程序分支。
- 不要把导出文件里的 `scopeAvailability` 当成导入机的实时环境结论。

## 失败处理建议

`import preview` 失败时，通常不会返回 `data.summary` 或 `items[]`，而是直接返回顶层 `error`。

推荐处理顺序：

1. 先判断 CLI 退出码。
2. 再判断 `error.code`。
3. 最后决定是提示用户修正输入、重试当前环境，还是直接上报为系统异常。

### 退出码建议

- `exitCode = 1`
  表示业务失败。通常是输入有问题、导入源不合法、schema 不受支持，或者当前命令无法在既有业务条件下完成。

- `exitCode = 2`
  表示运行时失败。通常说明出现了未归类的内部错误或异常，适合直接上报日志、告警或进入兜底错误页。

### import preview 常见错误码

#### IMPORT_SOURCE_NOT_FOUND

含义：

- 导入文件路径不存在。

上层建议：

- UI：提示用户重新选择文件或检查路径。
- 脚本：不要重试同一路径，先修正输入参数。
- 不要把它当成系统异常。

#### IMPORT_SOURCE_INVALID

含义：

- 文件不是有效 JSON，或者不是有效的 `export --json` 输出，或者内部 profile 结构不合法。

上层建议：

- UI：提示“导入文件格式不正确”，并建议重新导出或检查文件内容。
- 脚本：中断当前批次，不建议自动重试。
- 如果调用链里有“导出端”，优先回溯导出源是否被人为修改或截断。

#### IMPORT_UNSUPPORTED_SCHEMA

含义：

- 导入文件声明了 `schemaVersion`，但当前 CLI 不支持该版本。

上层建议：

- UI：提示用户升级/切换 CLI 版本，或重新导出兼容版本文件。
- 脚本：不要继续解析旧逻辑，也不要降级假设字段兼容。
- 这是契约版本不兼容问题，不是本地环境漂移问题。

#### IMPORT_PREVIEW_FAILED

含义：

- `import preview` 内部执行阶段出现了未归类失败。

上层建议：

- UI：显示通用失败提示，并保留原始 `message` 供排查。
- 脚本：可以做有限次数重试，但更合理的是直接记录日志并中断。
- 如果同批次多次稳定复现，应视为产品缺陷或环境异常，而不是用户输入问题。

#### ADAPTER_NOT_REGISTERED

含义：

- 导入文件里的某个平台 profile 无法在当前运行时找到对应 adapter。

上层建议：

- UI：提示当前 CLI/运行时不支持该平台。
- 脚本：不要自动重试；应先补齐平台支持或切换运行环境。
- 这通常意味着当前能力面与导入源不一致。

## 失败分流建议

可以按下面三类做上层路由：

- 输入/文件问题：
  `IMPORT_SOURCE_NOT_FOUND`、`IMPORT_SOURCE_INVALID`

- 契约/能力不兼容：
  `IMPORT_UNSUPPORTED_SCHEMA`、`ADAPTER_NOT_REGISTERED`

- 运行时异常：
  `IMPORT_PREVIEW_FAILED` 或任何 `exitCode = 2`

推荐动作：

1. 输入/文件问题：引导用户修正输入，不自动重试。
2. 契约/能力不兼容：提示升级 CLI、切换环境或补齐能力，不继续当前流程。
3. 运行时异常：记录日志、保留原始错误信息，必要时进入兜底错误页或人工排查流程。

## 前端对照表

下面这张表适合前端、控制台面板或上层服务直接使用，用来把 `error.code` 映射成统一的 UI 语气、重试策略和用户动作。

| error.code | 分类 | 推荐 UI 语气 | 建议重试 | 推荐用户动作 |
| --- | --- | --- | --- | --- |
| `IMPORT_SOURCE_NOT_FOUND` | 输入/文件问题 | 直接提示用户修正路径或重新选择文件 | 否 | 重新选择文件，或检查路径是否存在 |
| `IMPORT_SOURCE_INVALID` | 输入/文件问题 | 明确提示“文件格式不正确” | 否 | 重新导出文件，或检查 JSON / export 结构 |
| `IMPORT_UNSUPPORTED_SCHEMA` | 契约不兼容 | 提示版本不兼容，避免暗示当前文件可继续使用 | 否 | 升级 CLI，或重新导出兼容 schemaVersion 的文件 |
| `ADAPTER_NOT_REGISTERED` | 能力不兼容 | 提示当前运行时不支持该平台 | 否 | 切换到支持该平台的运行环境，或补齐平台支持 |
| `IMPORT_PREVIEW_FAILED` | 运行时异常 | 通用失败提示，同时暴露原始 message 供排查 | 谨慎 | 先重试一次；若仍失败，记录日志并中断流程 |
| `exitCode = 2` 且无稳定业务错误码 | 运行时异常 | 进入兜底错误态，不做业务语义承诺 | 谨慎 | 展示错误详情，建议稍后重试或联系维护者 |

推荐实现：

- 对 `建议重试 = 否` 的错误，不要在 UI 上默认放“重试”主按钮。
- 对 `IMPORT_PREVIEW_FAILED` 或 `exitCode = 2`，可以提供“重试”次按钮，但不应默认自动无限重试。
- 对输入/文件问题，主按钮应是“重新选择文件”或“修正输入”，而不是“重试”。
- 对契约/能力不兼容问题，主按钮应是“查看版本/环境要求”或“切换环境”，而不是继续当前流程。

## 参考

- [`README.md`](../README.md)
- [`docs/public-json-schema.md`](./public-json-schema.md)
- [`docs/public-json-output.schema.json`](./public-json-output.schema.json)
