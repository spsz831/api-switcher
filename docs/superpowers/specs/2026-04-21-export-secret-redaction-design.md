# Export Secret Redaction Design

## What

为 `export` 命令增加默认的 secret 明文治理：

- `export` / `export --json` 默认不导出 inline secret 明文
- inline secret 字段保留原字段位置，但值导出为稳定 redacted 占位值
- `secret_ref` / `auth_reference` 继续原样保留
- 只有显式传入 `--include-secrets` 时，才允许导出 inline secret 明文
- JSON / 文本 / schema / README / 消费文档需要一起反映这条稳定 contract

## Why

当前 `export` 已经能识别 reference profile、inline secret 和 write unsupported 状态，但导出默认仍可能包含 inline secret 明文。这对自动化、迁移和共享导出文件不安全，也和当前项目“稳定 contract + explainable + 默认安全”的产品方向不一致。

目标不是立刻打通 reference 写入，而是先把只读与导出面收紧成一致的产品语义：

- 成功只读命令回答“现在是什么状态”
- 导出命令回答“可以安全分享什么状态”
- 写入命令继续单独回答“哪些 secret/reference 目前仍不能直接消费”

## Recommendation

采用“redacted + explainable metadata”方案，而不是“删除字段”或“只替换字符串不补元数据”：

- 保留字段位置，避免把“安全导出”误解成“配置缺失”
- 在 JSON 成功态中补稳定 explainable，避免外部调用方靠比较 `"<redacted>"` 字符串猜语义
- 文本输出同步显示 redacted 摘要，让非 JSON 用户也能看懂发生了什么

## Scope

本阶段覆盖：

- `export` 默认 redacted inline secret
- `export --include-secrets` 显式导出明文
- JSON success payload 增加稳定的 secret export policy / item summary
- 文本输出增加 secret export 摘要
- public JSON schema、schema catalog、README、`docs/public-json-schema.md` 同步
- `import preview` 至少识别默认导出的 redacted 占位，不把它误判成真实 inline secret

本阶段不覆盖：

- `profiles.json` 本地存储语义调整
- `use` / `import apply` 开始真实消费 `env://` reference
- 接系统密钥库或 secret manager
- 引入新的高风险交互门槛，如 `export --include-secrets --force`

## CLI Surface

保留现有命令形态，只新增显式开关：

- `api-switcher export`
- `api-switcher export --json`
- `api-switcher export --include-secrets`
- `api-switcher export --json --include-secrets`

默认行为：

- 不带 `--include-secrets` 时，inline secret 一律 redacted
- 带 `--include-secrets` 时，允许导出明文 inline secret
- `secret_ref` / `auth_reference` 在两种模式下都原样保留

## Contract Design

### Redacted placeholder

默认 redacted 占位值使用稳定字符串：

`<redacted:inline-secret>`

原因：

- 比 `<redacted>` 更少歧义
- 便于测试和外部调用方识别
- 仍然适合作为人工可读的占位文本

### JSON success summary

在 `ExportCommandOutput.summary` 下新增稳定入口：

```ts
type SecretExportPolicySummary = {
  mode: 'redacted-by-default' | 'include-secrets'
  inlineSecretsExported: number
  inlineSecretsRedacted: number
  referenceSecretsPreserved: number
  profilesWithRedactedSecrets: number
}
```

语义：

- `mode` 回答这次导出采用的 secret 导出策略
- `inlineSecretsExported` 只在 `--include-secrets` 时大于 `0`
- `inlineSecretsRedacted` 回答默认安全导出实际 redacted 了多少个字段
- `referenceSecretsPreserved` 回答保留了多少个 reference 字段
- `profilesWithRedactedSecrets` 回答有多少条 profile 命中了 redacted

### Item-level summary

在 `ExportedProfileItem` 下新增稳定入口：

```ts
type SecretExportItemSummary = {
  hasInlineSecrets: boolean
  hasRedactedInlineSecrets: boolean
  hasReferenceSecrets: boolean
  redactedFieldCount: number
  preservedReferenceCount: number
  details?: Array<{
    field: string
    kind: 'inline-secret-redacted' | 'inline-secret-exported' | 'reference-preserved'
  }>
}
```

语义：

- `hasInlineSecrets` 表示 profile 原始形态里存在 inline secret
- `hasRedactedInlineSecrets` 表示当前导出结果里有 redacted 行为
- `hasReferenceSecrets` 表示当前 profile 含 `secret_ref` / `auth_reference`
- `details[]` 只做字段级 explainable，不承载明文

### Read order

对外推荐读取顺序：

1. 先读 `summary.platformStats`
2. 再读 `summary.referenceStats`
3. 再读 `summary.secretExportPolicy`
4. 最后按需展开 `profiles[].secretExportSummary`

`summary.referenceStats` 继续回答 profile 治理形态。
`summary.secretExportPolicy` 回答本次导出策略。
`profiles[].secretExportSummary` 回答单条 profile 在当前导出模式下发生了什么。

## Text Output

在 `export` 文本输出中新增两层摘要：

### Command-level

- `secret 导出策略: redacted-by-default`
- `inline secrets: redacted=N, exported=M`
- `reference secrets: preserved=K`

### Item-level

当某条 profile 命中 secret 导出治理时，显示：

- `secret 导出摘要:`
- `inline secrets 已脱敏导出`
- `reference 已保留`
- 被 redacted 的字段名列表

不显示任何明文 secret。

## Import Preview Compatibility

`import preview` 需要最小兼容：

- 遇到 `<redacted:inline-secret>` 时，不应把它当成真实 secret 值
- 也不应把它当成“字段不存在”
- 建议在 fidelity / preview decision 中把它识别为“redacted export input”

本阶段不要求因此开放 `import apply` 写入，只要求不要误判。

## Risks

### Risk 1: redacted placeholder 被误当真实值

需要在 import/source normalization 层显式识别占位值，避免 drift 或 validate 误判。

### Risk 2: default export 与 include-secrets export contract 分叉

需要通过稳定 summary 字段和 item summary 让调用方明确知道本次导出模式，而不是靠猜。

### Risk 3: docs / schema / renderer 不一致

这条能力必须同时修改：

- TypeScript types
- public JSON schema
- schema catalog
- JSON renderer / text renderer
- README
- `docs/public-json-schema.md`

## Acceptance Criteria

1. `export --json` 默认不返回 inline secret 明文。
2. `export --json --include-secrets` 返回 inline secret 明文。
3. `secret_ref` / `auth_reference` 在两种模式下都原样保留。
4. `ExportCommandOutput.summary` 暴露稳定 `secretExportPolicy`。
5. `ExportedProfileItem` 暴露稳定 `secretExportSummary`。
6. `schema --json` 能发现 `summary.secretExportPolicy` 与 `profiles.secretExportSummary` 的读取顺序。
7. 文本输出显示 command-level 与 item-level secret 导出摘要。
8. `import preview` 能识别 redacted placeholder，不把它误判成真实 secret 或字段缺失。
9. README、`docs/public-json-schema.md`、machine-readable schema 保持一致。
10. 定向测试至少覆盖 unit / integration / docs consistency / typecheck。

## Implementation Order

1. 先补 failing tests 与类型/schema contract
2. 实现 export service 的 redaction policy 与 include-secrets 开关
3. 打通 JSON / text renderer
4. 最小补 import preview 对 redacted placeholder 的识别
5. 更新 README 与 schema docs
6. 跑定向测试与 typecheck

