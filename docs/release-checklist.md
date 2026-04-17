# Release Checklist

这份清单用于 `api-switcher` 在公开发布或打 tag 前做最后确认。

目标不是替代自动化测试，而是把“真实环境验收”和“发布动作前的人工确认”固定下来。

## 使用方式

建议按下面顺序执行：

1. 先完成 `CI / typecheck / build / test` 自动化验证。
2. 再执行本清单中的真实环境验收。
3. 最后执行发布前确认与仓库操作。

如果某一项无法完成，应该在 release note 中明确记录缺口，而不是默认跳过。

## A. 自动化基线

发布前必须先确认以下命令最近一次执行结果为成功：

```bash
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test
```

还应确认 GitHub Actions `CI` workflow 在目标分支为绿色。

## B. 真实环境验收

这里的“真实环境”指真实的 Claude / Codex / Gemini 配置路径与真实本地文件，不是测试夹具目录。

### Claude

- [ ] Claude `user scope` 可以被 `current` / `preview` 正确探测。
- [ ] Claude `project scope` 可以被 `current` / `preview --scope project` 正确探测。
- [ ] Claude `local scope` 可以被 `current` / `preview --scope local` 正确探测。
- [ ] `use` 写入 Claude 目标 scope 后，目标文件只修改托管字段，不误伤非托管字段。
- [ ] `rollback` 可以恢复刚才写入的 Claude 快照。
- [ ] `rollback --scope <scope>` 在 Claude 上输出与实际恢复目标一致。

### Codex

- [ ] Codex `current` / `preview` 能正确解释双文件目标。
- [ ] Codex `use` 能同时完成真实目标文件写入与快照记录。
- [ ] Codex `rollback` 能恢复真实双文件内容。
- [ ] Codex 预览、写入、回滚过程中没有泄露完整密钥。

### Gemini

- [ ] Gemini `user scope` 可以被 `current` / `preview` 正确探测。
- [ ] Gemini `project scope` 在可解析项目中显示为 `available`。
- [ ] Gemini `preview --scope project` 会明确提示高风险和覆盖关系。
- [ ] Gemini `use --scope project` 在缺少 `--force` 时被确认门槛阻止。
- [ ] Gemini `use --scope project --force` 只写入 project settings，不误写 user settings。
- [ ] Gemini `rollback --scope project` 只恢复 project scope 快照。
- [ ] Gemini `rollback --scope project` 在 scope mismatch 时会拒绝恢复，而不是降级恢复其他 scope。
- [ ] Gemini `project scope` 不可解析时，`preview/use/rollback --scope project` 会先返回 availability 失败。

## C. 导入导出验收

- [ ] `export --json` 输出包含当前平台的 `scopeCapabilities`；Gemini 还带 `scopeAvailability`、`defaultWriteScope`、`observedAt`。
- [ ] `import preview <file>` 在真实导出文件上可运行，且 mixed-batch 聚合字段可读。
- [ ] `import preview --json` 的 `summary.decisionCodeStats` 与 `summary.driftKindStats` 能覆盖当前样例。
- [ ] `import apply <file> --profile <id>` 在 Gemini 上可完成一条真实 user-scope 写入链路。
- [ ] 如果当前版本要对外宣称 Gemini project-scope apply，可再补一条 `--scope project --force` 真实链路。
- [ ] `import apply` 成功后产出的快照 provenance 可被后续 `rollback` 正确消费。

## D. 文档与契约一致性

- [ ] [`README.md`](../README.md) 中的安装、快速开始、风险说明仍与当前 CLI 行为一致。
- [ ] [`docs/public-json-schema.md`](./public-json-schema.md) 与 [`docs/public-json-output.schema.json`](./public-json-output.schema.json) 没有语义漂移。
- [ ] `README` 中引用的 `preview/use/rollback/import preview/import apply` 示例仍能代表当前输出。
- [ ] 如果新增或修改了 error code、scope policy、JSON 稳定字段，相关文档已同步更新。
- [ ] 对外文档没有把“当前仅支持 Gemini 的 import apply”误写成“所有平台都支持 import apply”。

## E. 安全与恢复确认

- [ ] 文本输出与 JSON 输出不会直接泄露完整密钥。
- [ ] 新写入前会生成可回滚快照。
- [ ] `rollback` 对最近一次真实写入可恢复。
- [ ] Gemini 高风险 scope 的确认门槛仍然存在，没有被绕过。
- [ ] `--force` 只用于确认高风险写入，不会跨越 availability gate。

## F. 仓库与发布动作

- [ ] `git status --short` 为空。
- [ ] 需要发布的提交已经整理成清晰边界。
- [ ] release note / changelog 已说明本次新增能力、风险边界和已知限制。
- [ ] 确认发布目标分支与 tag 名称无误。
- [ ] 确认公开仓库中没有误提交本地凭证、状态文件或备份目录。

## 最低发布标准

如果要把当前版本作为公开可试用版本发布，至少应满足：

- 自动化基线全绿
- Claude / Codex / Gemini 三个平台各至少完成一条真实写入与回滚链路
- Gemini `project scope` 的高风险门槛与恢复语义经真实环境确认
- `import preview` 已做真实文件验收
- `import apply` 已做至少一条 Gemini 真实链路验收
- README、public schema、JSON schema 三者口径一致
