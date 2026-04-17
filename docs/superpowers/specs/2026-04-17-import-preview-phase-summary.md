# import preview Phase Summary

## Scope

本文档用于收拢 `import preview` 当前阶段已经完成的产品面、公共 contract、消费者文档入口和验证范围。

它不是新的设计 spec，也不是实施计划；它的作用是给后续迭代提供一个“当前已完成到哪里”的稳定快照。

## 当前结论

`import preview` 当前已经形成一套可读、可测、可消费的 read-only contract：

- 命令层：
  - 已提供 `import <file>` preview-only 入口
  - 当前不会写回任何平台配置

- item-level explainable：
  - `exportedObservation`
  - `localObservation`
  - `fidelity`
  - `previewDecision`

- batch-level explainable：
  - `summary.platformStats`
  - `summary.decisionCodeStats`
  - `summary.driftKindStats`

- 文档层：
  - `README` 负责入口和 JSON 示例
  - `public-json-schema.md` 负责稳定公共 contract
  - `import-preview-consumer-guide.md` 负责 mixed-batch 接入实践、失败处理和 explainable 词典

## 已完成能力

### 1. 导入源与兼容模式

- 支持读取 `export --json` 结果作为导入源
- 支持 `schemaVersion` 严格模式
- 支持“缺少 `schemaVersion` 但兼容读取”的降级模式
- 已区分：
  - `IMPORT_SOURCE_NOT_FOUND`
  - `IMPORT_SOURCE_INVALID`
  - `IMPORT_UNSUPPORTED_SCHEMA`

### 2. item-level fidelity

- 已显式区分：
  - 导出时观察
  - 当前本地观察

- `fidelity.status` 已覆盖：
  - `match`
  - `partial`
  - `mismatch`
  - `insufficient-data`

- `fidelity` 已提供：
  - `mismatches[]`
  - `driftSummary`
  - `groupedMismatches`
  - `highlights`

- 当前 drift 类型已覆盖：
  - `default-scope-drift`
  - `availability-drift`
  - `capability-drift`

### 3. item-level decision

- `previewDecision` 已提供：
  - `canProceedToApplyDesign`
  - `recommendedScope`
  - `requiresLocalResolution`
  - `reasonCodes`
  - `reasons[]`

- 当前 decision reason code 已覆盖：
  - `READY_USING_LOCAL_OBSERVATION`
  - `LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION`
  - `BLOCKED_BY_INSUFFICIENT_OBSERVATION`
  - `BLOCKED_BY_FIDELITY_MISMATCH`
  - `REQUIRES_LOCAL_SCOPE_RESOLUTION`

### 4. batch-level mixed-batch 聚合

- `summary` 已提供：
  - `totalItems`
  - `matchCount`
  - `mismatchCount`
  - `partialCount`
  - `insufficientDataCount`
  - `platformStats`
  - `decisionCodeStats`
  - `driftKindStats`
  - `warnings`
  - `limitations`

- 当前已验证同一批次中同时出现：
  - `match`
  - `partial`
  - `mismatch`
  - `insufficient-data`

- 当前已验证：
  - service 层 mixed-batch 聚合正确
  - CLI `--json` mixed-batch 聚合正确
  - 文本输出 mixed-batch 汇总正确

## 文档入口

- [`docs/README.md`](../../README.md)
  如果你是第一次进入 `docs/`，建议先从这里看整体文档分层和推荐阅读顺序。

- [`README.md`](../../../README.md)
  命令入口、能力概览、mixed-batch JSON 示例。

- [`docs/public-json-schema.md`](../../public-json-schema.md)
  稳定公共字段、字段语义和命令级 contract 边界。

- [`docs/public-json-output.schema.json`](../../public-json-output.schema.json)
  机器可读 schema。

- [`docs/import-preview-consumer-guide.md`](../../import-preview-consumer-guide.md)
  mixed-batch 接入实践、失败处理建议、前端对照表和 explainable 词典。

## 当前边界

- `import preview` 仍然是 read-only。
- 当前没有 `import apply`。
- 当前所有真正与未来写入相关的判断，仍应以 `localObservation` 为准。
- 导出文件里的 `scopeAvailability` / `observedAt` 只用于 fidelity 展示，不应被视为导入机当前环境真相。

## 验证范围

当前已经覆盖的验证层次：

- unit
  - source parsing
  - fidelity grouping
  - decision reasons
  - summary mixed-batch aggregation
  - text renderer
  - public JSON schema

- integration
  - `import --json` 单条 contract
  - `import --json` mixed-batch contract
  - `import` 文本输出单条 contract
  - `import` 文本输出 mixed-batch 汇总

- build/type
  - `pnpm typecheck`
  - `pnpm build`

## 后续建议

下一阶段如果继续推进，优先级建议如下：

1. 只有在明确需要写入时，再进入 `import apply` 设计。
2. 如果进入写入阶段，应继续坚持：
   - exported observation 只做展示
   - local re-resolved reality 才能驱动执行
3. 如果继续增强消费者侧体验，优先补：
   - UI 文案映射
   - 错误码可视化分流
   - mixed-batch 仪表盘字段消费示例
