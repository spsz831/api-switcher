# Changelog

## 0.1.1

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
