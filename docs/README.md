# docs Index

`docs/` 目录当前按“入口说明 / 稳定契约 / 接入实践 / 设计沉淀”分层。

## 推荐阅读顺序

1. [`../README.md`](../README.md)
   先看命令入口、平台能力概览和可直接复制的 JSON 示例。

2. [`public-json-schema.md`](./public-json-schema.md)
   再看稳定公共 JSON 字段、字段语义和命令级契约边界。

3. [`import-preview-consumer-guide.md`](./import-preview-consumer-guide.md)
   如果你要接入 `import preview`，重点看 mixed-batch 消费顺序、失败处理建议和 explainable 词典。

4. [`public-json-output.schema.json`](./public-json-output.schema.json)
   如果你需要机器校验或代码生成，使用这份 schema。

## 目录说明

- [`public-json-schema.md`](./public-json-schema.md)
  面向人阅读的稳定公共 JSON 契约说明。

- [`public-json-output.schema.json`](./public-json-output.schema.json)
  面向机器消费的公共 JSON schema。

- [`import-preview-consumer-guide.md`](./import-preview-consumer-guide.md)
  面向上层接入方的 `import preview` 消费指南。

- [`prd/`](./prd/)
  产品需求相关文档。

- [`tdd/`](./tdd/)
  技术设计/开发说明文档。

- [`superpowers/specs/`](./superpowers/specs/)
  设计规格与阶段性方案沉淀。

- [`superpowers/plans/`](./superpowers/plans/)
  分阶段实施计划与推进记录。

- [`superpowers/specs/2026-04-17-import-preview-phase-summary.md`](./superpowers/specs/2026-04-17-import-preview-phase-summary.md)
  `import preview` 当前阶段总结，适合回看“已经做完了什么”。

## 快速定位

- 想知道命令怎么用：看 [`../README.md`](../README.md)
- 想知道 JSON 字段是什么意思：看 [`public-json-schema.md`](./public-json-schema.md)
- 想知道 mixed-batch 怎么接：看 [`import-preview-consumer-guide.md`](./import-preview-consumer-guide.md)
- 想知道 schema 怎么校验：看 [`public-json-output.schema.json`](./public-json-output.schema.json)
- 想快速回看 `import preview` 当前完成面：看 [`superpowers/specs/2026-04-17-import-preview-phase-summary.md`](./superpowers/specs/2026-04-17-import-preview-phase-summary.md)
