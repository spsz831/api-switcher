# Changelog

## 0.1.3

### Schema Catalog

- `schema --json` 新增 consumer profiles 系统，提供 `readonly-state-audit`、`readonly-import-consumer` 等多种消费画像
- 每个 consumer profile 暴露稳定的 `summarySections`、`summarySectionGuidance`、`followUpHints`、`triageBuckets` 与 `consumerActions`
- 新增 `schema --json --consumer-profile <id>` 按画像过滤
- 新增 `schema --json --action <id>` 按动作能力过滤
- 新增 `schema --json --recommended-action <code>` 按推荐动作码过滤
- 新增 `schema --json --catalog-summary` 轻量 catalog 索引模式
- 新增 `schema --schema-version --json` 只输出版本号
- 为只读 consumer profiles 暴露默认 consumer flow、starter recipes 与机器消费模板

### Reference Governance

- `add` 现在支持 `--secret-ref` / `--auth-reference` reference-only 输入模式，与 `--key` 明文模式互斥
- `preview` / `use` / `import apply` 对 reference profile 执行解析阶段检查，区分 resolved / unresolved / blocking 三种决策状态
- `preview` 成功态暴露 blocking reference 决策，`use` / `import apply` 失败态暴露 `referenceDecision`
- reference-only 输入增加格式校验：空白输入返回 `ADD_INPUT_REQUIRED`，不一致输入返回 `ADD_INPUT_CONFLICT`
- reference profile 在 `list` / `current` / `validate` / `export` 中聚合写入未启用的 limitation 提示

### Dry-Run

- `use --dry-run` 执行写入前全量检查但不写入文件、不创建备份
- `import apply --dry-run` 执行 apply 前检查但不写入目标文件
- `preview` / `use` / `import apply` 文本输出明确区分 dry-run 与实际写入

### Import Apply Batch

- `import apply --profiles <ids>` 支持顺序应用同平台多条 profile 并返回批量结果
- 部分失败时返回轻量 failure explainable

### Security

- 开发态在设置 `API_SWITCHER_RUNTIME_DIR` 时，默认把 Claude / Codex / Gemini 目标文件重定向到运行时沙箱
- `use` / `import apply` 在命中真实用户目录时增加二次保护：低风险也强制要求确认门槛

### Behavior

- 修复真实用户目录二次确认 guard 的阻断缺陷：显式 `--force` 时真实目标写入可以继续执行
- Gemini `project scope` 的 gate 顺序固定为 availability-before-confirmation
- `rollback` 对 scope 严格匹配；scope mismatch 返回 `ROLLBACK_SCOPE_MISMATCH`
- Codex 不支持 `--scope`，传入时返回 `INVALID_SCOPE`

### Build

- CI Node.js 版本升级至 22（pnpm 11.x 要求）
- `engine` 字段更新为 `>=22`
- `smoke:release` 扩展覆盖 schema catalog summary、consumer flow linkage、starter templates 等新入口

## 0.1.2

### Testing

- 补全 `list`、`use`、`rollback`、`import` 命令的 `--json` 结构化错误码集成断言，覆盖 UNSUPPORTED_PLATFORM、INVALID_SCOPE、IMPORT_SOURCE_INVALID、IMPORT_UNSUPPORTED_SCHEMA、ADAPTER_NOT_REGISTERED 等错误码。

### Security

- 开发态在设置 `API_SWITCHER_RUNTIME_DIR` 时，默认把 Claude / Codex / Gemini 的目标文件重定向到运行时沙箱，避免源码 CLI、联调脚本或手工开发流程误写真实用户目录。
- `use` / `import apply` 在命中真实用户目录时增加二次保护：即使平台风险级别较低，也会先进入明确确认门槛，而不是直接写入真实配置。

### Behavior

- 修复真实用户目录二次确认 guard 的阻断缺陷：显式放行并带 `--force` 时，真实目标写入现在可以继续执行；未确认时仍保持 `CONFIRMATION_REQUIRED`。
- 继续收口主线实现记录，把已落地的 Codex / Claude / Gemini / reference / import 计划文档回填为已完成状态，并把 Gemini Stage-2 gate 文档保留为历史阶段记录，避免把过期 gate 误读成当前未完成工作。

### Documentation

- README、release checklist、public schema 文档与计划历史已重新对齐，当前主线不再保留误导性的“Gemini 计划未完成”勾选项。

## 0.1.1

### Behavior

- `import apply` 现在会把已解析的 `env://VAR_NAME` reference-only profile 计入 reference-ready / inline-fallback 写入链路，不再在成功态 summary 中继续归类为 write unsupported。
- `add` 现在会对 reference-only 输入做第二阶段最小预检：空白 reference 输入会返回 `ADD_INPUT_REQUIRED`，同时传入 `--secret-ref` 与 `--auth-reference` 时若两者不一致或格式明显无效，会返回 `ADD_INPUT_CONFLICT`。

### Build

- `smoke:release` 现在会校验 `dist` 构建产物的顶层 `--help` 关键命令面，避免安装后 CLI 可发现性漂移。
- `smoke:release` 现在会校验 `dist` 构建产物的 `schema --json` 共享 `consumerProfiles` 目录与 `bestEntryAction` 提示。
- `smoke:release` 现在会校验 `dist` 构建产物的 `schema --schema-version --json` 成功态 contract。
- `smoke:release` 现在会校验 `dist` 构建产物上的稳定失败出口：未知命令保持 Commander `stderr` 失败行为。
- `smoke:release` 现在会校验 `dist` 构建产物上的稳定 JSON 失败 envelope：`import <missing-file> --json` 返回 `schemaVersion / ok=false / action / error.code`。

## 0.1.0

首个可公开试用版本。当前已达到本地自用、小范围评审和 Beta 级试用的发布标准。

### Added

- 接通 `add / list / current / validate / preview / use / rollback / export / schema` 主命令。
- 发布稳定公共 JSON contract，并提供 [`docs/public-json-schema.md`](docs/public-json-schema.md) 与 [`docs/public-json-output.schema.json`](docs/public-json-output.schema.json)。
- 新增 `import preview` mixed-batch 导入预览，包含 `summary.decisionCodeStats`、`summary.driftKindStats` 和 explainable 聚合字段。
- 新增 `import apply <file> --profile <id>`，当前支持 Gemini / Codex / Claude 单条 profile 导入应用。
- 发布 [`docs/import-preview-consumer-guide.md`](docs/import-preview-consumer-guide.md)，明确 mixed-batch 机器消费方式。
- 新增 GitHub Actions CI。

### Platform Support

- Claude：支持 `user / project / local` 三层 scope 的 `preview / use / rollback / import apply`。
- Codex：支持双文件目标的 `preview / use / rollback`。
- Gemini：支持四层 precedence 的 `current / preview` 检测，开放 `user / project` 两层可写 scope。
- Gemini `project scope` 已支持显式 `--scope project --force` 写入、独立快照与严格 `rollback --scope project` 恢复。

### Behavior

- `preview / use` 第一阶段已消费 `env://VAR_NAME` secret reference：Claude 保留原始引用写入，Codex / Gemini 以解析后的明文 fallback 写入，unresolved / unsupported 会直接阻断。
- `validate` 现在按真实目标 scope 执行，不再只按平台默认 scope 生成 validation 结果。
- `preview / use / import apply` 在显式 `--scope` 下已对齐同一个目标 scope，避免“预览目标”和“真实写入目标”漂移。
- Gemini `project scope` 的 gate 顺序固定为 availability-before-confirmation：先判定 `scopeAvailability`，再进入高风险确认门槛。
- Gemini `rollback` 对 scope 严格匹配；`user` 快照不能按 `project` 恢复，反之亦然。
- Gemini `project scope` 不可解析时，JSON 失败结果会稳定给出 `details.scopeAvailability.project.status = "unresolved"` 和 `reasonCode = "PROJECT_ROOT_UNRESOLVED"`。

### Real Acceptance

- Claude、Codex、Gemini 三个平台都已完成至少一条真实写入与回滚链路验收。
- Gemini `user scope` 与 `project scope` 都已完成真实 `preview -> use/import apply -> current -> rollback` 闭环。
- `import preview --json` 已在真实导出文件上完成验收，mixed-batch 聚合字段已复核。
- JSON 输出中的敏感字段在真实验收过程中持续保持脱敏。

### Known Limits

- `import apply` 当前支持 Gemini / Codex / Claude。
- 一次仅支持应用单个 imported profile，必须显式传 `--profile`。
- Gemini `project scope` 属于高风险显式 opt-in 写入，不会默认升级为 project。
- Claude `local scope` 属于更高敏感度写入目标，未 `--force` 时会额外触发确认门槛。
- Codex 不支持 `--scope`，导入应用时会直接写入 `config.toml` 与 `auth.json`。
- `system-defaults` 与 `system-overrides` 当前只参与 Gemini effective config 检测，不允许写入或回滚。
