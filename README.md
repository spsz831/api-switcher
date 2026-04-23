# api-switcher

一个面向 Claude Code、Codex、Gemini CLI 的多平台 API 配置切换工具。

- 支持 `Claude / Codex / Gemini` 三个平台的配置切换与当前状态检测
- 支持 `preview / use / rollback / current / list / validate / export / add / schema`
- 支持 Gemini `project scope` 显式写入、独立快照和严格回滚
- 提供稳定公共 JSON contract，适合脚本、自动化和上层 UI 接入

快速入口：

- [安装](#安装)
- [快速开始](#快速开始)
- [发布状态](#发布状态)
- [文档导航](#文档导航)

## 文档导航

- [`README.md`](README.md)：命令入口、能力概览和可直接复制的 JSON 示例。
- [`docs/public-json-schema.md`](docs/public-json-schema.md)：稳定公共 JSON 字段、字段语义和命令级契约边界。
- [`docs/public-json-output.schema.json`](docs/public-json-output.schema.json)：机器可读的公共 JSON schema。
- [`docs/import-preview-consumer-guide.md`](docs/import-preview-consumer-guide.md)：`import preview` 的 mixed-batch 接入实践、失败处理建议和 explainable 词典。
- [`docs/release-checklist.md`](docs/release-checklist.md)：发布前真实环境验收与 release checklist。
- [`docs/README.md`](docs/README.md)：`docs/` 目录文档索引。

## 安装

要求：

- Node.js `>=20`
- `pnpm` 或可用的 `corepack`

本地开发：

```bash
corepack enable
pnpm install
pnpm build
```

直接运行源码 CLI：

```bash
pnpm dev -- --help
```

构建后运行：

```bash
node dist/src/cli/index.js --help
```

发布前一键验证：

```bash
corepack pnpm smoke:release
```

这条 smoke 会同时检查构建产物的顶层 `--help` 可发现性、`schema --schema-version --json` 成功态 contract、`current/list --json` platformSummary contract、稳定 stderr 失败出口，以及稳定 `--json` 失败 envelope。

如果要作为命令行工具全局使用，可以在仓库内执行：

```bash
pnpm link --global
api-switcher --help
```

## 发布状态

当前版本已经具备可试用的核心闭环，适合本地自用、小范围评审和 Beta 级试用：

- `preview / use / rollback / current / list / validate / export / add / schema` 已接通
- Claude、Codex、Gemini 三个平台都有真实适配链路
- Gemini `project scope` 已支持显式写入、风险提示、独立备份和严格回滚校验
- `import preview` 与 `import apply` 已落地，其中 `import apply` 当前支持 Gemini / Codex / Claude 单条 profile
- `--json` 公共 contract、机器可读 schema 和消费者文档已发布

当前不应误读为“所有平台所有导入写入能力都完全开放”。首版产品边界仍然是：

- `import apply` 当前支持 Gemini / Codex / Claude
- 一次只应用单个 imported profile
- Gemini `project scope` 属于高风险写入，必须显式 `--scope project --force`
- Codex 不使用 `--scope`，会直接写入平台 adapter 的双文件目标
- project scope 的 apply / rollback 以本地实时解析结果为准，不信任导出时的旧 observation

## 快速开始

下面是一条最小安全路径，先加 profile，再预览，再写入，再确认当前状态，最后掌握回滚：

### 1. 添加一个 profile

```bash
api-switcher add --platform gemini --name "Gemini 生产" --key "$GEMINI_API_KEY"
```

如果只想先登记 secret 引用而不把明文 key 写入 profile，可使用 reference-only 输入面：

```bash
api-switcher add --platform codex --name "Codex 生产" --secret-ref "vault://codex/prod" --auth-reference "vault://codex/prod" --url "https://gateway.example.com/openai/v1"
```

当前 `secret_ref/auth_reference` 只作为 profile 契约被保留和导出；`preview/use/import apply` 暂不解析引用，后续真实写入仍需要明文 secret 或运行时环境变量。

也可以先用 `api-switcher list` 看现有 profiles，再决定后续用哪个 selector。

### 2. 先预览，不直接写入

```bash
api-switcher preview gemini
```

如果你想看结构化结果而不是文本摘要：

```bash
api-switcher preview gemini --json
```

### 3. 确认预览无误后再写入

```bash
api-switcher use gemini
```

Gemini 如果显式写到 `project scope`，必须额外确认：

```bash
api-switcher preview gemini --scope project
api-switcher use gemini --scope project --force
```

原因是 `project scope` 会覆盖 `user scope` 中的同名字段，影响当前项目。

### 4. 查看当前生效状态

```bash
api-switcher current
api-switcher list
```

### 5. 需要恢复时执行回滚

```bash
api-switcher rollback <backupId>
```

如果你刚刚写入的是 Gemini `project scope`，回滚时也要带同一 scope：

```bash
api-switcher rollback <backupId> --scope project
```

Gemini 会校验快照记录的 scope 与请求 scope 是否匹配；不匹配会拒绝恢复，而不是“猜测你真正想恢复哪一层”。

## 首次使用建议

第一次接触这个 CLI 时，建议按下面顺序操作：

1. 用 `list` 看已有 profile，或用 `add` 创建一个最小 profile。
2. 先跑一次 `preview`，确认目标路径、风险等级和 effective config 解释。
3. 再执行 `use`，不要跳过预览直接写入。
4. 写入成功后立即跑 `current`，确认当前状态与预期一致。
5. 记下 `backupId`，确保自己知道如何执行 `rollback`。

如果你要接入自动化脚本或上层 UI，不要从 README 里的文本摘要反推契约，应该直接看：

- [`docs/public-json-schema.md`](docs/public-json-schema.md)
- [`docs/public-json-output.schema.json`](docs/public-json-output.schema.json)
- [`docs/import-preview-consumer-guide.md`](docs/import-preview-consumer-guide.md)

## 运行时目录

默认运行时目录：

```text
~/.api-switcher/
  profiles.json
  state.json
  backups/
```

测试或本地调试时可通过环境变量覆盖：

- `API_SWITCHER_RUNTIME_DIR`
- `API_SWITCHER_CLAUDE_SETTINGS_PATH`

## 开发

```bash
pnpm install
pnpm build
pnpm test
```

## 当前可用命令

- `preview <selector> [--scope <scope>]`
- `use <selector> [--scope <scope>]`
- `rollback [backupId] [--scope <scope>]`
- `current`
- `list`
- `validate [selector]`
- `add --platform <platform> --name <name> (--key <key> | --secret-ref <ref> [--auth-reference <reference>]) [--url <url>]`
- `export`
- `import preview <file>`
- `import apply <file> --profile <id> [--scope <scope>] [--force]`
- `schema [--json] [--schema-version]`

当前 `--scope` 支持与 CLI help 均来自平台 `scopePolicy` 能力声明；可写目标是能力矩阵里 `Use/write=yes` 的 scope：

- Claude: `user | project | local`
- Codex: 当前不使用 `--scope`
- Gemini: `user | project`

### Scope 能力矩阵

Claude:

| Scope | Detect/current | Preview/effective | Use/write | Rollback | Risk | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `user` | yes | yes | yes | yes | normal |  |
| `project` | yes | yes | yes | yes | normal |  |
| `local` | yes | yes | yes | yes | normal |  |

Gemini:

| Scope | Detect/current | Preview/effective | Use/write | Rollback | Risk | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `system-defaults` | yes | yes | no | no | normal | 只参与 Gemini effective config 检测与 precedence 推导，不允许写入或回滚。 |
| `user` | yes | yes | yes | yes | normal |  |
| `project` | yes | yes | yes | yes | high, requires `--force` | Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。 |
| `system-overrides` | yes | yes | no | no | normal | 只参与 Gemini effective config 检测与 precedence 推导，不允许写入或回滚。 |

Codex 当前没有 scoped target，`preview/use/rollback` 仍按平台 adapter 的真实目标文件执行。

JSON 输出的稳定公共字段见 [`docs/public-json-schema.md`](docs/public-json-schema.md)，机器可读契约见 [`docs/public-json-output.schema.json`](docs/public-json-output.schema.json)。两者均包含 `scopeCapabilities`、`scopeAvailability`、`scopePolicy`、`defaultWriteScope` 与 `observedAt` 的契约说明。

文档分工：

- `README` 负责命令入口说明和可直接复制的 JSON 示例。
- [`docs/public-json-schema.md`](docs/public-json-schema.md) 负责稳定公共类型、字段语义和命令级 contract 边界。
- [`docs/import-preview-consumer-guide.md`](docs/import-preview-consumer-guide.md) 负责 `import preview` mixed-batch 的接入实践和推荐消费顺序。
- 如果示例与 schema 说明不一致，以机器可读 schema 和 `docs/public-json-schema.md` 为准。

所有 `--json` 命令都返回统一 envelope，顶层固定带 `schemaVersion`：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "preview",
  "data": {},
  "warnings": [],
  "limitations": []
}
```

约定：

- `schemaVersion` 位于顶层 envelope，不在各命令 `data` 内重复展开，只有 `schema --json` / `schema --schema-version --json` 会在 `data` 中再次返回 schema 自身版本信息。
- `warnings` 与 `limitations` 是顶层 explainable 摘要，适合脚本、CLI UI 或上层面板直接展示。
- `scopeCapabilities` 说明平台理论支持哪些 scope。
- `scopeAvailability` 说明当前环境里这些 scope 现在是否真的可解析、可写。
- `defaultWriteScope` 当前用于 `export --json`，表示平台默认写入目标；Gemini 目前为 `user`。
- `observedAt` 当前用于 `export --json`，表示这份 `scopeAvailability` 是在什么时候观测到的；它是环境观察，不是未来 import 时可直接信任的执行真相。
- `import preview <file>` 只做导入对比，不会写入任何平台配置，也不会自动修复 project root。
- `import apply <file> --profile <id>` 当前支持 Gemini / Codex / Claude 且一次只应用单个 profile；apply 相关决策以本地实时 observation 为准。
- 对 Gemini `project scope` 的失败分支，顶层错误码仍可能是通用的 `PREVIEW_FAILED`、`USE_FAILED`、`ROLLBACK_FAILED`；机器消费方应继续读取 `error.details.scopeAvailability`，以 `project.status`、`reasonCode`、`reason`、`remediation` 判断是否为 availability 失败。

也可以通过 CLI 直接查看当前 public JSON schema：

```bash
api-switcher schema --json
```

如果只需要某一类共享消费画像，可以用 `--consumer-profile <id>` 过滤 `commandCatalog.consumerProfiles[]`，例如：

```bash
api-switcher schema --json --consumer-profile readonly-import-batch
```

这不会裁剪 `commandCatalog.actions[]` 或完整 `schema`，只把 `consumerProfiles[]` 缩到目标画像；未知 id 会返回 `SCHEMA_CONSUMER_PROFILE_NOT_FOUND`。

如果只需要某一个命令的能力索引，可以用 `--action <action>` 过滤 `commandCatalog.actions[]`，例如：

```bash
api-switcher schema --json --action import-apply
```

这不会裁剪 `commandCatalog.consumerProfiles[]` 或完整 `schema`，只把 `actions[]` 缩到目标命令；未知 action 会返回 `SCHEMA_ACTION_NOT_FOUND`。

如果只需要某一个稳定动作词条，可以用 `--recommended-action <code>` 过滤 `commandCatalog.recommendedActions[]`，例如：

```bash
api-switcher schema --json --recommended-action continue-to-write
```

这不会裁剪 `commandCatalog.actions[]`、`commandCatalog.consumerProfiles[]` 或完整 `schema`，只把 `recommendedActions[]` 缩到目标动作；未知 code 会返回 `SCHEMA_RECOMMENDED_ACTION_NOT_FOUND`。

如果只是想先拿一份轻量目录索引，而不是完整 schema catalog，可以用 `--catalog-summary`：

```bash
api-switcher schema --json --catalog-summary
```

它会返回 `data.catalogSummary`，只包含 `consumerProfiles / actions / recommendedActions` 的稳定摘要和计数，不再展开完整 `commandCatalog`、`schemaId` 或 `schema`。其中 `consumerProfiles[]` 还会额外暴露 `hasStarterTemplate`、`starterTemplateId` 和 `recommendedEntryMode` 这几个轻量 discoverability 字段，帮助调用方在轻量目录模式下先判断某条画像是更适合直接走最小模板，还是应该切到完整 `consumerProfile` contract。

推荐的最小发现顺序是：先用 `schema --json --catalog-summary` 找到目标 `consumerProfile / action / recommendedAction`，只在需要字段级 contract、机器可读 schema 或完整 capability catalog 时，再按需切到完整 `schema --json`。

`--catalog-summary` 的最小成功样例：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "schema",
  "data": {
    "schemaVersion": "2026-04-15.public-json.v1",
    "catalogSummary": {
      "counts": {
        "consumerProfiles": 3,
        "actions": 11,
        "recommendedActions": 15
      },
      "consumerProfiles": [
        {
          "id": "readonly-state-audit",
          "bestEntryAction": "current",
          "recommendedEntryMode": "starter-template",
          "hasStarterTemplate": true,
          "starterTemplateId": "readonly-state-audit-minimal-reader"
        },
        {
          "id": "single-platform-write",
          "bestEntryAction": "preview",
          "recommendedEntryMode": "full-consumer-profile"
        },
        {
          "id": "readonly-import-batch",
          "bestEntryAction": "import",
          "recommendedEntryMode": "starter-template",
          "hasStarterTemplate": true,
          "starterTemplateId": "readonly-import-batch-minimal-reader"
        }
      ],
      "actions": [
        { "action": "add" },
        { "action": "current" },
        { "action": "export" }
      ],
      "recommendedActions": [
        { "code": "inspect-items", "family": "inspect" },
        { "code": "continue-to-write", "family": "execute" },
        { "code": "migrate-inline-secret", "family": "repair" }
      ]
    }
  }
}
```

非 JSON 模式下，`schema --catalog-summary` 也会输出同一组推荐入口提示，便于人工直接判断下一步是走 `starter-template` 还是完整 consumer profile：

```text
Catalog Summary:
  - consumerProfiles=3, actions=11, recommendedActions=15
  - 推荐画像入口:
    - readonly-state-audit: entry=current, recommended=starter-template, starterTemplate=readonly-state-audit-minimal-reader, next=api-switcher schema --json --consumer-profile readonly-state-audit
    - single-platform-write: entry=preview, recommended=full-consumer-profile, next=api-switcher schema --json --consumer-profile single-platform-write
    - readonly-import-batch: entry=import, recommended=starter-template, starterTemplate=readonly-import-batch-minimal-reader, next=api-switcher schema --json --consumer-profile readonly-import-batch
```

最小稳定返回示例：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "schema",
  "data": {
    "schemaVersion": "2026-04-15.public-json.v1",
    "schemaId": "https://api-switcher.local/schemas/public-json-output.schema.json",
    "commandCatalog": {
      "actions": [
        {
          "action": "current",
          "hasPlatformSummary": true,
          "hasPlatformStats": true,
          "hasScopeCapabilities": true,
          "hasScopeAvailability": true,
          "hasScopePolicy": false,
          "primaryFields": [
            "summary.platformStats",
            "summary.referenceStats",
            "current",
            "detections",
            "scopeCapabilities",
            "scopeAvailability"
          ],
          "primaryErrorFields": [
            "error.code",
            "error.message"
          ],
          "failureCodes": [
            { "code": "ADAPTER_NOT_REGISTERED", "priority": 1, "category": "platform", "recommendedHandling": "check-platform-support" },
            { "code": "CURRENT_FAILED", "priority": 2, "category": "runtime", "recommendedHandling": "inspect-runtime-details" }
          ],
          "fieldPresence": [
            { "path": "summary.platformStats", "channel": "success", "presence": "always" },
            { "path": "summary.referenceStats", "channel": "success", "presence": "always" },
            { "path": "current", "channel": "success", "presence": "always" },
            { "path": "scopeAvailability", "channel": "success", "presence": "conditional", "conditionCode": "WHEN_PLATFORM_EXPOSES_SCOPE_AVAILABILITY" }
          ],
          "fieldSources": [
            { "path": "summary.platformStats", "channel": "success", "source": "command-service" },
            { "path": "summary.referenceStats", "channel": "success", "source": "command-service" },
            { "path": "current", "channel": "success", "source": "command-service" },
            { "path": "scopeAvailability", "channel": "success", "source": "platform-adapter" }
          ],
          "fieldStability": [
            { "path": "summary.platformStats", "channel": "success", "stabilityTier": "stable" },
            { "path": "summary.referenceStats", "channel": "success", "stabilityTier": "stable" },
            { "path": "current", "channel": "success", "stabilityTier": "stable" },
            { "path": "scopeAvailability", "channel": "success", "stabilityTier": "bounded" }
          ],
          "readOrderGroups": {
            "success": [
              { "stage": "summary", "fields": ["summary.platformStats", "summary.referenceStats"] },
              { "stage": "selection", "fields": ["current"] },
              { "stage": "items", "fields": ["detections"] },
              { "stage": "detail", "fields": ["scopeCapabilities", "scopeAvailability"] }
            ],
            "failure": [
              { "stage": "error-core", "fields": ["error.code", "error.message"] }
            ]
          },
          "summarySections": [
            {
              "id": "platform",
              "title": "Platform summary",
              "priority": 1,
              "fields": ["summary.platformStats"],
              "purpose": "先看平台级聚合，快速判断结果覆盖了哪些平台以及各平台状态分布。"
            },
            {
              "id": "reference",
              "title": "Reference summary",
              "priority": 2,
              "fields": ["summary.referenceStats"],
              "purpose": "再看 secret/reference 解析形态。"
            }
          ],
          "primaryFieldSemantics": [
            { "path": "summary.platformStats", "semantic": "platform-aggregate" },
            { "path": "summary.referenceStats", "semantic": "platform-aggregate" },
            { "path": "current", "semantic": "result-core" },
            { "path": "detections", "semantic": "item-collection" },
            { "path": "scopeCapabilities", "semantic": "scope-resolution" },
            { "path": "scopeAvailability", "semantic": "scope-resolution" }
          ],
          "primaryErrorFieldSemantics": [
            { "path": "error.code", "semantic": "error-core" },
            { "path": "error.message", "semantic": "error-core" }
          ]
        },
        {
          "action": "preview",
          "hasPlatformSummary": false,
          "hasPlatformStats": true,
          "hasScopeCapabilities": true,
          "hasScopeAvailability": true,
          "hasScopePolicy": true,
          "primaryFields": [
            "summary.platformStats",
            "risk",
            "preview",
            "scopePolicy",
            "scopeCapabilities",
            "scopeAvailability"
          ],
          "primaryErrorFields": [
            "error.code",
            "error.message",
            "error.details.scopePolicy",
            "error.details.scopeAvailability"
          ],
          "failureCodes": [
            { "code": "PROFILE_NOT_FOUND", "priority": 1, "category": "state", "recommendedHandling": "select-existing-resource" },
            { "code": "INVALID_SCOPE", "priority": 2, "category": "input", "recommendedHandling": "fix-input-and-retry" },
            { "code": "ADAPTER_NOT_REGISTERED", "priority": 3, "category": "platform", "recommendedHandling": "check-platform-support" },
            { "code": "PREVIEW_FAILED", "priority": 4, "category": "runtime", "recommendedHandling": "inspect-runtime-details" }
          ],
          "fieldPresence": [
            { "path": "summary.platformStats", "channel": "success", "presence": "always" },
            { "path": "scopeAvailability", "channel": "success", "presence": "conditional", "conditionCode": "WHEN_SCOPE_AVAILABILITY_IS_RESOLVED" },
            { "path": "error.details.scopeAvailability", "channel": "failure", "presence": "conditional", "conditionCode": "WHEN_SCOPE_FAILURE_PROVIDES_AVAILABILITY_DETAILS" }
          ],
          "fieldSources": [
            { "path": "summary.platformStats", "channel": "success", "source": "command-service" },
            { "path": "preview", "channel": "success", "source": "platform-adapter" },
            { "path": "scopePolicy", "channel": "success", "source": "command-service" },
            { "path": "scopeAvailability", "channel": "success", "source": "platform-adapter" },
            { "path": "error.details.scopeAvailability", "channel": "failure", "source": "platform-adapter" }
          ],
          "fieldStability": [
            { "path": "summary.platformStats", "channel": "success", "stabilityTier": "stable" },
            { "path": "preview", "channel": "success", "stabilityTier": "stable" },
            { "path": "scopePolicy", "channel": "success", "stabilityTier": "stable" },
            { "path": "scopeAvailability", "channel": "success", "stabilityTier": "bounded" },
            { "path": "error.details.scopeAvailability", "channel": "failure", "stabilityTier": "bounded" }
          ],
          "readOrderGroups": {
            "success": [
              { "stage": "summary", "fields": ["summary.platformStats"] },
              { "stage": "detail", "fields": ["risk", "preview", "scopePolicy", "scopeCapabilities", "scopeAvailability"] }
            ],
            "failure": [
              { "stage": "error-core", "fields": ["error.code", "error.message"] },
              { "stage": "error-details", "fields": ["error.details.scopePolicy", "error.details.scopeAvailability"] }
            ]
          },
          "primaryFieldSemantics": [
            { "path": "summary.platformStats", "semantic": "platform-aggregate" },
            { "path": "risk", "semantic": "risk" },
            { "path": "preview", "semantic": "result-core" },
            { "path": "scopePolicy", "semantic": "scope-resolution" },
            { "path": "scopeCapabilities", "semantic": "scope-resolution" },
            { "path": "scopeAvailability", "semantic": "scope-resolution" }
          ],
          "primaryErrorFieldSemantics": [
            { "path": "error.code", "semantic": "error-core" },
            { "path": "error.message", "semantic": "error-core" },
            { "path": "error.details.scopePolicy", "semantic": "error-details" },
            { "path": "error.details.scopeAvailability", "semantic": "error-details" }
          ]
        },
        {
          "action": "schema",
          "hasPlatformSummary": false,
          "hasPlatformStats": false,
          "hasScopeCapabilities": false,
          "hasScopeAvailability": false,
          "hasScopePolicy": false,
          "primaryFields": [
            "commandCatalog",
            "schemaVersion",
            "schemaId",
            "schema"
          ],
          "primaryErrorFields": [
            "error.code",
            "error.message"
          ],
          "failureCodes": [],
          "fieldPresence": [
            { "path": "schemaVersion", "channel": "success", "presence": "always" },
            { "path": "commandCatalog", "channel": "success", "presence": "conditional", "conditionCode": "WHEN_SCHEMA_DOCUMENT_IS_REQUESTED" },
            { "path": "schemaId", "channel": "success", "presence": "conditional", "conditionCode": "WHEN_SCHEMA_DOCUMENT_IS_REQUESTED" },
            { "path": "schema", "channel": "success", "presence": "conditional", "conditionCode": "WHEN_SCHEMA_DOCUMENT_IS_REQUESTED" }
          ],
          "fieldSources": [
            { "path": "schemaVersion", "channel": "success", "source": "schema-service" },
            { "path": "commandCatalog", "channel": "success", "source": "schema-service" },
            { "path": "schemaId", "channel": "success", "source": "schema-service" },
            { "path": "schema", "channel": "success", "source": "schema-service" }
          ],
          "fieldStability": [
            { "path": "schemaVersion", "channel": "success", "stabilityTier": "stable" },
            { "path": "commandCatalog", "channel": "success", "stabilityTier": "stable" },
            { "path": "schemaId", "channel": "success", "stabilityTier": "stable" },
            { "path": "schema", "channel": "success", "stabilityTier": "stable" }
          ],
          "readOrderGroups": {
            "success": [
              { "stage": "selection", "fields": ["commandCatalog"] },
              { "stage": "detail", "fields": ["schemaVersion", "schemaId", "schema"] }
            ],
            "failure": [
              { "stage": "error-core", "fields": ["error.code", "error.message"] }
            ]
          },
          "primaryFieldSemantics": [
            { "path": "commandCatalog", "semantic": "schema-catalog" },
            { "path": "schemaVersion", "semantic": "schema-metadata" },
            { "path": "schemaId", "semantic": "schema-metadata" },
            { "path": "schema", "semantic": "schema-document" }
          ],
          "primaryErrorFieldSemantics": [
            { "path": "error.code", "semantic": "error-core" },
            { "path": "error.message", "semantic": "error-core" }
          ]
        },
        {
          "action": "use",
          "hasPlatformSummary": true,
          "hasPlatformStats": true,
          "hasScopeCapabilities": true,
          "hasScopeAvailability": true,
          "hasScopePolicy": true,
          "primaryFields": [
            "summary.platformStats",
            "platformSummary",
            "preview",
            "scopePolicy",
            "scopeCapabilities",
            "scopeAvailability",
            "changedFiles",
            "backupId"
          ],
          "primaryErrorFields": [
            "error.code",
            "error.message",
            "error.details.referenceGovernance",
            "error.details.risk",
            "error.details.scopePolicy",
            "error.details.scopeCapabilities",
            "error.details.scopeAvailability"
          ],
          "failureCodes": [
            { "code": "PROFILE_NOT_FOUND", "priority": 1, "category": "state", "recommendedHandling": "select-existing-resource" },
            { "code": "INVALID_SCOPE", "priority": 2, "category": "input", "recommendedHandling": "fix-input-and-retry" },
            { "code": "VALIDATION_FAILED", "priority": 3, "category": "runtime", "recommendedHandling": "inspect-runtime-details" },
            { "code": "CONFIRMATION_REQUIRED", "priority": 4, "category": "confirmation", "recommendedHandling": "confirm-before-write" },
            { "code": "ADAPTER_NOT_REGISTERED", "priority": 5, "category": "platform", "recommendedHandling": "check-platform-support" },
            { "code": "APPLY_FAILED", "priority": 6, "category": "runtime", "recommendedHandling": "inspect-runtime-details" },
            { "code": "USE_FAILED", "priority": 7, "category": "runtime", "recommendedHandling": "inspect-runtime-details" }
          ],
          "fieldPresence": [
            { "path": "summary.platformStats", "channel": "success", "presence": "always" },
            { "path": "scopeAvailability", "channel": "success", "presence": "conditional", "conditionCode": "WHEN_SCOPE_AVAILABILITY_IS_RESOLVED" },
            { "path": "backupId", "channel": "success", "presence": "conditional", "conditionCode": "WHEN_BACKUP_IS_CREATED" },
            { "path": "error.details.referenceGovernance", "channel": "failure", "presence": "conditional", "conditionCode": "WHEN_REFERENCE_GOVERNANCE_FAILURE_IS_DETECTED" },
            { "path": "error.details.scopeAvailability", "channel": "failure", "presence": "conditional", "conditionCode": "WHEN_SCOPE_FAILURE_PROVIDES_AVAILABILITY_DETAILS" }
          ],
          "readOrderGroups": {
            "success": [
              { "stage": "summary", "fields": ["summary.platformStats"] },
              { "stage": "detail", "fields": ["platformSummary", "preview", "scopePolicy", "scopeCapabilities", "scopeAvailability"] },
              { "stage": "artifacts", "fields": ["changedFiles", "backupId"] }
            ],
            "failure": [
              { "stage": "error-core", "fields": ["error.code", "error.message"] },
              { "stage": "error-details", "fields": ["error.details.referenceGovernance", "error.details.risk", "error.details.scopePolicy", "error.details.scopeCapabilities", "error.details.scopeAvailability"] },
              { "stage": "error-recovery", "fields": ["error.code"] }
            ]
          },
          "primaryFieldSemantics": [
            { "path": "summary.platformStats", "semantic": "platform-aggregate" },
            { "path": "platformSummary", "semantic": "platform-explainable" },
            { "path": "preview", "semantic": "result-core" },
            { "path": "scopePolicy", "semantic": "scope-resolution" },
            { "path": "scopeCapabilities", "semantic": "scope-resolution" },
            { "path": "scopeAvailability", "semantic": "scope-resolution" },
            { "path": "changedFiles", "semantic": "artifacts" },
            { "path": "backupId", "semantic": "artifacts" }
          ],
          "primaryErrorFieldSemantics": [
            { "path": "error.code", "semantic": "error-core" },
            { "path": "error.message", "semantic": "error-core" },
            { "path": "error.details.referenceGovernance", "semantic": "reference-governance" },
            { "path": "error.details.risk", "semantic": "error-details" },
            { "path": "error.details.scopePolicy", "semantic": "error-details" },
            { "path": "error.details.scopeCapabilities", "semantic": "error-details" },
            { "path": "error.details.scopeAvailability", "semantic": "error-details" }
          ],
          "referenceGovernanceCodes": [
            { "code": "REFERENCE_INPUT_CONFLICT", "priority": 1, "category": "input", "recommendedHandling": "fix-reference-input" },
            { "code": "REFERENCE_MISSING", "priority": 2, "category": "reference", "recommendedHandling": "fix-reference-input" },
            { "code": "REFERENCE_WRITE_UNSUPPORTED", "priority": 3, "category": "reference", "recommendedHandling": "resolve-reference-support" },
            { "code": "INLINE_SECRET_PRESENT", "priority": 4, "category": "inline-secret", "recommendedHandling": "migrate-inline-secret" }
          ]
        }
      ]
    },
    "schema": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "https://api-switcher.local/schemas/public-json-output.schema.json"
    }
  }
}
```

`schema --json` 的 `data.commandCatalog.actions[]` 是命令级能力索引。外部接入方如果只想先判断某个 action 是否会暴露 `platformSummary`、`summary.platformStats`、`summary.referenceStats`、`summary.executabilityStats`、`summary.triageStats`、`scopeCapabilities`、`scopeAvailability`、`scopePolicy`，以及应该优先读取哪些 success / failure 字段，可以先消费这层，再按需展开整份 schema。现在这层索引额外提供 `summarySections`，专门回答“summary 内部有哪些稳定 section，应按什么顺序消费”；同时，`data.commandCatalog.consumerProfiles[]` 又补了一层更高阶的共享消费画像，避免外部调用方继续按 action 名字硬编码共同模式。当前已公开三条共享画像：`readonly-state-audit` 负责 `current / list / validate / export` 这类只读状态审计面，`readonly-import-batch` 负责 `import / import preview` 这类只读批量导入分析面，`single-platform-write` 负责 `add / preview / use / rollback / import-apply` 这类单平台写入命令。现在每条画像还会额外公开 `sharedItemFields` 和 `optionalItemFields`，以及 `sharedFailureFields / optionalFailureFields`，分别回答“item 级先读什么 / 可能补什么”和“失败时先读什么 / 可能补什么”；只读画像还会额外公开 `summarySectionGuidance`，直接回答“同一套 summary section 更适合 overview、governance、gating 还是 routing”；`followUpHints` 则继续回答“summary 看完之后下一步该展开哪些 detail 字段，或者该走哪种处理动作”；`triageBuckets` 则把 summary 和 item explainable 再聚成稳定分流桶，便于直接做 dashboard、告警和后续流程；运行时结果里的 `summary.triageStats` 则会把这些分流桶真正实例化成当前批次的计数结果；现在只读画像还会额外公开 `consumerActions`，把 `summarySections / triageBuckets / followUpHints` 收口成可直接消费的动作目录，减少外部调用方自己拼接下一步动作的成本；`consumerActions[]` 现在还会补一层 `appliesWhen` 和 `triggerFields`，直接回答“什么情况下优先选这个动作”和“先看哪些稳定字段”；`consumerFlow[]` 则再往前走一步，把“命中哪段 summary / 哪个 triage bucket”稳定映射到“该读哪些字段、该选哪个动作卡片、下一步短码是什么”，并额外用 `defaultEntry / defaultOnBucket` 暴露“默认先走哪条 flow”与“命中当前 bucket 时优先走哪条 flow”，用 `selectionReason` 暴露为什么推荐这条默认路径；现在又补了一层 `defaultConsumerFlowId`，让调用方可以不扫描数组，直接拿到该只读画像的默认 flow 入口；只读画像还会额外公开 `starterTemplate`，把 `summary / items / failure / flow` 这四层最小消费骨架直接打包给调用方，目前只对 `readonly-state-audit` 和 `readonly-import-batch` 暴露，例如 `readonly-state-audit-minimal-reader` 与 `readonly-import-batch-minimal-reader`；同时，`commandCatalog.recommendedActions[]` 也公开了一套跨只读引导和失败恢复共用的稳定动作词表，让 `nextStep`、`recommendedNextStep` 和 `recommendedHandling` 可以对齐到同一套短码目录；`failureCodes[]` 与 `referenceGovernanceCodes[]` 也同样补了 `appliesWhen` 和 `triggerFields`，让失败恢复动作不必只靠 `code` 猜测；`exampleActions` 与 `bestEntryAction` 则直接告诉接入方这一类命令应该先参考哪个 action。建议分工固定为：`primaryFields` 回答“先读哪些字段”，`readOrderGroups` 回答“先读哪一层再读哪一层”，`summarySections` 回答“summary 这一层内部再先读哪一段”，`consumerProfiles` 回答“这一整类 action 共享什么消费形状”。

如果你的接入层不想先按 action 名字分支，最小消费顺序可以固定为：先从 `data.commandCatalog.consumerProfiles[]` 里选中目标画像，再读取 `bestEntryAction` 找一条最适合对齐样例的代表命令，然后按 `sharedSummaryFields -> sharedItemFields -> sharedFailureFields` 建立默认读取骨架，最后再按 `optional*Fields` 做增强展示或条件绑定。对只读画像，还可以直接读取 `summarySectionGuidance[]` 判断哪一段 summary 更适合 overview、governance、gating 或 routing，再读取 `followUpHints[]` 判断 summary 看完后下一步该展开哪些字段；如果要做更自动化的分流，还可以直接读取 `triageBuckets[]`；如果想直接拿“动作级”入口而不自己拼接这些 guidance，则直接消费 `consumerActions[]`。比如要接 `import` / `import preview`，可以直接锁定 `readonly-import-batch`，先参考 `bestEntryAction` 指向的样例命令，再把 summary、item、failure 三层公共字段做成同一套读取器，而不是分别为两个 action 写两套解析逻辑。

如果你的接入层只想拿“最小可用模板”，而不想自己再拼 `shared*Fields + defaultConsumerFlowId`，可以优先读取 `starterTemplate`。它把 `starterTemplate?.summary.fields`、`starterTemplate?.items.sharedFields`、`starterTemplate?.failure.fields`、`starterTemplate?.flow.defaultConsumerFlowId` 收口成一份只读画像级最小机器消费模板，适合直接生成 overview 卡片、批量导入看板或失败态提示。

```ts
const profile = schema.data.commandCatalog.consumerProfiles.find(
  (item) => item.id === 'readonly-import-batch',
)

const entryAction = profile?.bestEntryAction
const summaryFields = profile?.sharedSummaryFields ?? []
const itemFields = profile?.sharedItemFields ?? []
const failureFields = profile?.sharedFailureFields ?? []
const optionalFields = [
  ...(profile?.optionalScopeFields ?? []),
  ...(profile?.optionalItemFields ?? []),
  ...(profile?.optionalFailureFields ?? []),
  ...(profile?.optionalArtifactFields ?? []),
]
const summaryGuidance = profile?.summarySectionGuidance ?? []
const followUps = profile?.followUpHints ?? []
const triageBuckets = profile?.triageBuckets ?? []
const consumerActions = profile?.consumerActions ?? []
const defaultConsumerFlowId = profile?.defaultConsumerFlowId
const consumerFlow = profile?.consumerFlow ?? []
const recommendedActions = schema.data.commandCatalog.recommendedActions ?? []
```

```ts
const profile = schema.data.commandCatalog.consumerProfiles.find(
  (item) => item.id === 'readonly-import-batch',
)

const starterTemplate = profile?.starterTemplate

const minimalReader = {
  templateId: starterTemplate?.id ?? 'readonly-import-batch-minimal-reader',
  entryAction: profile?.bestEntryAction,
  summary: starterTemplate?.summary.fields ?? profile?.sharedSummaryFields ?? [],
  items: starterTemplate?.items.sharedFields ?? [],
  failure: starterTemplate?.failure.fields ?? [],
  defaultFlowId:
    starterTemplate?.flow.defaultConsumerFlowId ?? profile?.defaultConsumerFlowId,
}
```

如果你只想拿一层更“成品化”的目录，而不自己把 summary section、triage bucket 和 follow-up hint 重新拼装，可以直接消费 `consumerActions[]`。例如：

```ts
const nextActions = (profile?.consumerActions ?? []).map((action) => ({
  id: action.id,
  appliesWhen: action.appliesWhen,
  triggerFields: action.triggerFields,
  summarySections: action.summarySectionIds,
  triageBuckets: action.triageBucketIds ?? [],
  nextStep: action.nextStep,
  primaryFields: action.primaryFields,
}))
```

如果你想让接入层按“先读什么，再做什么”直接推进，而不是自己把 `summarySections / triageBuckets / consumerActions` 做三次 join，可以直接消费 `consumerFlow[]`。只读画像的最轻量入口是 `defaultConsumerFlowId -> consumerFlow[] -> consumerActions[] -> recommendedActions[]`，这条链路不需要新增字段，也不需要外部调用方自行扫描 `defaultEntry: true`：

```ts
const defaultFlow = (profile?.consumerFlow ?? []).find(
  (step) => step.id === profile?.defaultConsumerFlowId,
)
const defaultAction = (profile?.consumerActions ?? []).find(
  (action) => action.id === defaultFlow?.consumerActionId,
)
const defaultRecommendedAction = schema.data.commandCatalog.recommendedActions.find(
  (action) => action.code === defaultFlow?.nextStep,
)

const defaultReadonlyConsumerPath = {
  flowId: defaultFlow?.id,
  readFields: defaultFlow?.readFields ?? [],
  actionId: defaultAction?.id,
  nextStep: defaultRecommendedAction?.code ?? defaultFlow?.nextStep,
  nextStepFamily: defaultRecommendedAction?.family,
  reason: defaultFlow?.selectionReason,
}

const consumerFlow = (profile?.consumerFlow ?? []).map((step) => ({
  id: step.id,
  defaultEntry: step.defaultEntry,
  defaultOnBucket: step.defaultOnBucket,
  selectionReason: step.selectionReason,
  summarySections: step.summarySectionIds,
  triageBuckets: step.triageBucketIds ?? [],
  readFields: step.readFields,
  consumerActionId: step.consumerActionId,
  nextStep: step.nextStep,
}))
```

当前这条“只读 summary 导航”只覆盖五个只读命令：

| 命令 | 固定 `summarySections` 顺序 | 先回答什么 |
| --- | --- | --- |
| `current` / `list` / `validate` / `export` | `platform -> reference -> executability` | 先看平台分布，再看 secret/reference 形态，最后看后续写入可执行性 |
| `import preview` | `source-executability -> executability -> platform` | 先看导入源能不能继续进入 apply，再看目标侧写入可执行性，最后看 mixed-batch 平台分布 |

这层导航不覆盖 `preview / use / rollback / import apply`。它们仍然通过 `primaryFields` 与 `readOrderGroups` 暴露推荐消费顺序，但不承诺同一套只读 `summarySections` contract。对 `current/list/validate/export` 这四个只读命令，`summary.referenceStats` 适合回答“这一批里有多少 reference / inline / write unsupported profile”，`summary.executabilityStats` 适合回答“这一批 profile 里有多少条后续仍可直接写入、多少条会被 write unsupported 或 source redacted 阻断”；对 `import preview`，`summary.sourceExecutability` 先回答“导入源本身还能不能继续进入 apply”，`summary.executabilityStats` 再回答“目标平台侧从 profile 形态看是否具备继续写入条件”，`summary.platformStats` 最后回答“这批结果分布到了哪些平台”。`referenceSummary` 则适合回答“这一条为什么被归到该类，以及 resolver 当前看到的字段级状态”。失败态不要从 `summary.referenceStats` 推断治理原因，而应先读 `error.code`，再读 `error.details.referenceGovernance.primaryReason/reasonCodes`，最后展开 `risk/scope/validation` 细节。`failureCodes` 会公开该 action 已稳定承诺的 `error.code` 集合，并用 `priority` 表达推荐处理顺序、`category` 表达失败类别、`recommendedHandling` 表达推荐处理动作。`referenceGovernanceCodes` 只在 `use` / `import-apply` 这类可能产生 secret/reference 治理失败的写入 action 上出现，公开稳定 `reasonCodes` 的推荐处理顺序，例如 `REFERENCE_INPUT_CONFLICT`、`REFERENCE_MISSING`、`REFERENCE_WRITE_UNSUPPORTED`、`INLINE_SECRET_PRESENT`。`fieldPresence` 则补了一层字段出现条件索引：`presence` 只有 `always` / `conditional` 两档，`conditionCode` 用稳定短码表达字段为什么只在部分平台、部分模式或部分失败态出现，例如 `WHEN_SCOPE_AVAILABILITY_IS_RESOLVED`、`WHEN_SCOPE_FAILURE_PROVIDES_AVAILABILITY_DETAILS`、`WHEN_REFERENCE_GOVERNANCE_FAILURE_IS_DETECTED`、`WHEN_ITEM_HAS_REFERENCE_OR_INLINE_SECRET_CONTEXT`、`WHEN_SCHEMA_DOCUMENT_IS_REQUESTED`。`fieldSources` 则回答这些字段主要由谁产出，目前稳定来源包括 `command-service`、`platform-adapter`、`schema-service`、`write-pipeline`、`import-analysis`、`error-envelope`。`fieldStability` 则补了一层长期绑定建议：`stable` 表示适合长期强绑定，`bounded` 表示语义稳定但更依赖上下文或条件，`expandable` 表示可展示但不建议外部锁死为强 contract。`readOrderGroups` 则把成功态和失败态分别拆成结构化消费阶段：success 侧固定沿 `summary` -> `selection` -> `items` -> `detail` -> `artifacts` 这条语义轴按需裁剪，failure 侧固定沿 `error-core` -> `error-details` -> `error-recovery` 这条语义轴按需裁剪。当前这层推荐动作使用稳定短码：`fix-input-and-retry`、`select-existing-resource`、`resolve-scope-before-retry`、`confirm-before-write`、`check-platform-support`、`inspect-runtime-details`、`check-import-source`。`primaryFieldSemantics` / `primaryErrorFieldSemantics` 则补了一层字段语义标签，便于把点路径归类到 `platform-aggregate`、`executability-aggregate`、`item-explainable`、`scope-resolution`、`artifacts`、`error-core`、`reference-governance`、`error-details` 等稳定语义桶。

如果只需要脚本化检查当前 public JSON schema 版本，可使用更轻量的版本输出：

```bash
api-switcher schema --schema-version --json
```

最小稳定返回示例：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "schema",
  "data": {
    "schemaVersion": "2026-04-15.public-json.v1"
  }
}
```

### JSON 输出示例

`list --json` 会在每个 profile 条目上带出所属平台的 `platformSummary` 与 `scopeCapabilities`；Gemini 还会带出当前环境里的 `scopeAvailability`。同时，`data.summary.platformStats[]` 会把当前返回批次里每个平台的 profile 数、当前 state 记录、当前检测命中和 explainable 摘要聚合出来；`data.summary.referenceStats` 则补出这一批 profile 里有多少条是 reference profile、多少条仍是 inline secret、多少条当前属于 write unsupported，并用 `resolvedReferenceProfileCount` / `missingReferenceProfileCount` / `unsupportedReferenceProfileCount` 区分 `env://` 可解析、缺失和暂不支持的引用 scheme，方便列表页先做治理分层再决定是否展开单个 profile。`data.summary.executabilityStats` 则把同一批 profile 再按“后续写入可执行性”聚成另一层稳定入口，例如 `inlineReadyProfileCount`、`referenceReadyProfileCount`、`referenceMissingProfileCount`、`writeUnsupportedProfileCount`、`sourceRedactedProfileCount`。进一步下钻时，再读 `profiles[].referenceSummary` 判断单条 profile 是否含 reference 字段、是否仍含 inline secret，以及 resolver 当前看到的是 `resolved / missing / unsupported-scheme / missing-value` 哪一类字段级状态。文本输出也与这条读取顺序对齐：先读“按平台汇总”，再读“referenceStats 摘要”和“executabilityStats 摘要”，最后再看 profile 列表里的 `reference 摘要` 与具体 explainable：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "list",
  "data": {
    "profiles": [
      {
        "profile": {
          "id": "claude-prod",
          "platform": "claude",
          "name": "Claude 生产",
          "source": {
            "apiKey": "sk-ant-123456"
          }
        },
        "current": false,
        "healthStatus": "warning",
        "riskLevel": "medium",
        "platformSummary": {
          "kind": "scope-precedence",
          "precedence": ["user", "project", "local"],
          "currentScope": "local",
          "facts": [
            {
              "code": "CLAUDE_SCOPE_PRECEDENCE",
              "message": "Claude 支持 user < project < local 三层 precedence。"
            },
            {
              "code": "CLAUDE_LOCAL_SCOPE_HIGHEST",
              "message": "如果存在 local，同名字段最终以 local 为准。"
            }
          ]
        },
        "scopeCapabilities": [
          {
            "scope": "user",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          },
          {
            "scope": "project",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          },
          {
            "scope": "local",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          }
        ]
      },
      {
        "profile": {
          "id": "gemini-prod",
          "platform": "gemini",
          "name": "Gemini 生产",
          "source": {
            "apiKey": "gm-live-123456",
            "authType": "gemini-api-key"
          }
        },
        "current": true,
        "healthStatus": "valid",
        "riskLevel": "low",
        "platformSummary": {
          "kind": "scope-precedence",
          "precedence": ["system-defaults", "user", "project", "system-overrides"],
          "currentScope": "user",
          "facts": [
            {
              "code": "GEMINI_SCOPE_PRECEDENCE",
              "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
            },
            {
              "code": "GEMINI_PROJECT_OVERRIDES_USER",
              "message": "project scope 会覆盖 user 中的同名字段。"
            }
          ]
        },
        "scopeCapabilities": [
          {
            "scope": "user",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          },
          {
            "scope": "project",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "high",
            "confirmationRequired": true
          }
        ],
        "scopeAvailability": [
          {
            "scope": "user",
            "status": "available",
            "detected": true,
            "writable": true,
            "path": "C:/Users/test/.gemini/settings.json"
          },
          {
            "scope": "project",
            "status": "available",
            "detected": true,
            "writable": true,
            "path": "C:/work/.gemini/settings.json"
          }
        ]
      },
      {
        "profile": {
          "id": "codex-prod",
          "platform": "codex",
          "name": "Codex 生产"
        },
        "current": false,
        "healthStatus": "unknown",
        "riskLevel": "low",
        "platformSummary": {
          "kind": "multi-file-composition",
          "composedFiles": [],
          "facts": [
            {
              "code": "CODEX_MULTI_FILE_CONFIGURATION",
              "message": "Codex 当前由 config.toml 与 auth.json 共同组成有效配置。"
            },
            {
              "code": "CODEX_LIST_IS_PROFILE_LEVEL",
              "message": "list 仅展示 profile 级状态，不表示单文件可独立切换。"
            }
          ]
        }
      }
    ],
    "summary": {
      "referenceStats": {
        "profileCount": 3,
        "referenceProfileCount": 1,
        "resolvedReferenceProfileCount": 0,
        "missingReferenceProfileCount": 0,
        "unsupportedReferenceProfileCount": 1,
        "inlineProfileCount": 2,
        "writeUnsupportedProfileCount": 1,
        "hasReferenceProfiles": true,
        "hasResolvedReferenceProfiles": false,
        "hasMissingReferenceProfiles": false,
        "hasUnsupportedReferenceProfiles": true,
        "hasInlineProfiles": true,
        "hasWriteUnsupportedProfiles": true
      },
      "platformStats": [
        {
          "platform": "claude",
          "profileCount": 1,
          "managed": false,
          "currentScope": "local",
          "platformSummary": {
            "kind": "scope-precedence",
            "precedence": ["user", "project", "local"],
            "currentScope": "local",
            "facts": [
              {
                "code": "CLAUDE_SCOPE_PRECEDENCE",
                "message": "Claude 支持 user < project < local 三层 precedence。"
              },
              {
                "code": "CLAUDE_LOCAL_SCOPE_HIGHEST",
                "message": "如果存在 local，同名字段最终以 local 为准。"
              }
            ]
          }
        },
        {
          "platform": "gemini",
          "profileCount": 1,
          "currentProfileId": "gemini-prod",
          "detectedProfileId": "gemini-prod",
          "managed": true,
          "currentScope": "user",
          "platformSummary": {
            "kind": "scope-precedence",
            "precedence": ["system-defaults", "user", "project", "system-overrides"],
            "currentScope": "user",
            "facts": [
              {
                "code": "GEMINI_SCOPE_PRECEDENCE",
                "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
              },
              {
                "code": "GEMINI_PROJECT_OVERRIDES_USER",
                "message": "project scope 会覆盖 user 中的同名字段。"
              }
            ]
          }
        },
        {
          "platform": "codex",
          "profileCount": 1,
          "managed": false,
          "platformSummary": {
            "kind": "multi-file-composition",
            "composedFiles": [],
            "facts": [
              {
                "code": "CODEX_MULTI_FILE_CONFIGURATION",
                "message": "Codex 当前由 config.toml 与 auth.json 共同组成有效配置。"
              },
              {
                "code": "CODEX_LIST_IS_PROFILE_LEVEL",
                "message": "list 仅展示 profile 级状态，不表示单文件可独立切换。"
              }
            ]
          }
        }
      ],
      "warnings": [],
      "limitations": []
    }
  }
}
```

`validate --json` 与 `export --json` 也是按条目输出 `platformSummary` 与 `scopeCapabilities`；它们的 `data.summary.platformStats[]` 会把当前返回批次里每个平台的 profile 数、校验通过数、warnings/limitations 总数和平台 explainable 摘要聚合出来，`data.summary.referenceStats` 则补出当前批次的 reference / inline / write unsupported 聚合，并额外区分 `env://` 可解析、缺失和暂不支持 scheme 的 reference profile。`data.summary.executabilityStats` 会把这批 profile 再按“后续写入是否可直接执行”聚合成稳定入口，适合脚本先做写入前分层，再决定是否展开 item。`export` 进一步固定了 secret 导出治理入口：默认不导出 inline secret 明文，而是保留字段位置并写成 `"<redacted:inline-secret>"`；批次级策略看 `summary.secretExportPolicy`，单条 profile 的字段级 explainable 看 `profiles[].secretExportSummary`。如果确实需要导出 inline secret 明文，必须显式传 `api-switcher export --json --include-secrets`。文本输出也按这条 schema catalog 顺序组织：先看“按平台汇总”，再看“referenceStats 摘要”“executabilityStats 摘要”和“secret 导出策略”，最后再展开 item/profile 级明细里的 `reference 摘要` 与 `secret 导出摘要`。`export` 额外输出默认写入目标、观测时间，Gemini 还会携带 `scopeAvailability`：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "validate",
  "data": {
    "items": [
      {
        "profileId": "gemini-prod",
        "platform": "gemini",
        "platformSummary": {
          "kind": "scope-precedence",
          "precedence": ["system-defaults", "user", "project", "system-overrides"],
          "facts": [
            {
              "code": "GEMINI_SCOPE_PRECEDENCE",
              "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
            },
            {
              "code": "GEMINI_PROJECT_OVERRIDES_USER",
              "message": "project scope 会覆盖 user 中的同名字段。"
            }
          ]
        },
        "validation": {
          "ok": true,
          "errors": [],
          "warnings": [],
          "limitations": []
        },
        "scopeCapabilities": [
          {
            "scope": "project",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "high",
            "confirmationRequired": true
          }
        ]
      }
    ],
    "summary": {
      "referenceStats": {
        "profileCount": 1,
        "referenceProfileCount": 0,
        "resolvedReferenceProfileCount": 0,
        "missingReferenceProfileCount": 0,
        "unsupportedReferenceProfileCount": 0,
        "inlineProfileCount": 1,
        "writeUnsupportedProfileCount": 0,
        "hasReferenceProfiles": false,
        "hasResolvedReferenceProfiles": false,
        "hasMissingReferenceProfiles": false,
        "hasUnsupportedReferenceProfiles": false,
        "hasInlineProfiles": true,
        "hasWriteUnsupportedProfiles": false
      },
      "platformStats": [
        {
          "platform": "gemini",
          "profileCount": 1,
          "okCount": 1,
          "warningCount": 0,
          "limitationCount": 0,
          "platformSummary": {
            "kind": "scope-precedence",
            "precedence": ["system-defaults", "user", "project", "system-overrides"],
            "facts": [
              {
                "code": "GEMINI_SCOPE_PRECEDENCE",
                "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
              },
              {
                "code": "GEMINI_PROJECT_OVERRIDES_USER",
                "message": "project scope 会覆盖 user 中的同名字段。"
              }
            ]
          }
        }
      ],
      "warnings": [],
      "limitations": []
    }
  }
}
```

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "export",
  "data": {
    "profiles": [
      {
        "profile": {
          "id": "claude-prod",
          "platform": "claude",
          "name": "Claude 生产",
          "source": {
            "token": "<redacted:inline-secret>",
            "baseURL": "https://gateway.example.com/api"
          },
          "apply": {
            "ANTHROPIC_AUTH_TOKEN": "<redacted:inline-secret>",
            "ANTHROPIC_BASE_URL": "https://gateway.example.com/api"
          }
        },
        "validation": {
          "ok": true,
          "errors": [],
          "warnings": [],
          "limitations": []
        },
        "platformSummary": {
          "kind": "scope-precedence",
          "precedence": ["user", "project", "local"],
          "facts": [
            {
              "code": "CLAUDE_SCOPE_PRECEDENCE",
              "message": "Claude 支持 user < project < local 三层 precedence。"
            },
            {
              "code": "CLAUDE_LOCAL_SCOPE_HIGHEST",
              "message": "如果存在 local，同名字段最终以 local 为准。"
            }
          ]
        },
        "secretExportSummary": {
          "hasInlineSecrets": true,
          "hasRedactedInlineSecrets": true,
          "hasReferenceSecrets": false,
          "redactedFieldCount": 2,
          "preservedReferenceCount": 0,
          "details": [
            {
              "field": "source.token",
              "kind": "inline-secret-redacted"
            },
            {
              "field": "apply.ANTHROPIC_AUTH_TOKEN",
              "kind": "inline-secret-redacted"
            }
          ]
        },
        "scopeCapabilities": [
          {
            "scope": "user",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          },
          {
            "scope": "project",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          },
          {
            "scope": "local",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          }
        ]
      },
      {
        "profile": {
          "id": "codex-prod",
          "platform": "codex",
          "name": "Codex 生产"
        },
        "platformSummary": {
          "kind": "multi-file-composition",
          "composedFiles": [],
          "facts": [
            {
              "code": "CODEX_MULTI_FILE_CONFIGURATION",
              "message": "Codex 当前由 config.toml 与 auth.json 共同组成有效配置。"
            },
            {
              "code": "CODEX_LIST_IS_PROFILE_LEVEL",
              "message": "list 仅展示 profile 级状态，不表示单文件可独立切换。"
            }
          ]
        },
        "validation": {
          "ok": true,
          "errors": [],
          "warnings": [],
          "limitations": []
        }
      },
      {
        "profile": {
          "id": "gemini-prod",
          "platform": "gemini",
          "name": "Gemini 生产"
        },
        "validation": {
          "ok": true,
          "errors": [],
          "warnings": [],
          "limitations": []
        },
        "platformSummary": {
          "kind": "scope-precedence",
          "precedence": ["system-defaults", "user", "project", "system-overrides"],
          "facts": [
            {
              "code": "GEMINI_SCOPE_PRECEDENCE",
              "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
            },
            {
              "code": "GEMINI_PROJECT_OVERRIDES_USER",
              "message": "project scope 会覆盖 user 中的同名字段。"
            }
          ]
        },
        "defaultWriteScope": "user",
        "observedAt": "2026-04-16T06:30:00.000Z",
        "scopeCapabilities": [
          {
            "scope": "user",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          },
          {
            "scope": "project",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "high",
            "confirmationRequired": true
          }
        ],
        "scopeAvailability": [
          {
            "scope": "project",
            "status": "available",
            "detected": true,
            "writable": true,
            "path": "C:/work/.gemini/settings.json"
          }
        ]
      }
    ],
    "summary": {
      "secretExportPolicy": {
        "mode": "redacted-by-default",
        "inlineSecretsExported": 0,
        "inlineSecretsRedacted": 2,
        "referenceSecretsPreserved": 0,
        "profilesWithRedactedSecrets": 1
      },
      "platformStats": [
        {
          "platform": "claude",
          "profileCount": 1,
          "okCount": 1,
          "warningCount": 0,
          "limitationCount": 0,
          "platformSummary": {
            "kind": "scope-precedence",
            "precedence": ["user", "project", "local"],
            "facts": [
              {
                "code": "CLAUDE_SCOPE_PRECEDENCE",
                "message": "Claude 支持 user < project < local 三层 precedence。"
              },
              {
                "code": "CLAUDE_LOCAL_SCOPE_HIGHEST",
                "message": "如果存在 local，同名字段最终以 local 为准。"
              }
            ]
          }
        },
        {
          "platform": "codex",
          "profileCount": 1,
          "okCount": 1,
          "warningCount": 0,
          "limitationCount": 0,
          "platformSummary": {
            "kind": "multi-file-composition",
            "composedFiles": [],
            "facts": [
              {
                "code": "CODEX_MULTI_FILE_CONFIGURATION",
                "message": "Codex 当前由 config.toml 与 auth.json 共同组成有效配置。"
              },
              {
                "code": "CODEX_LIST_IS_PROFILE_LEVEL",
                "message": "list 仅展示 profile 级状态，不表示单文件可独立切换。"
              }
            ]
          }
        }
      ],
      "warnings": [],
      "limitations": []
    }
  }
}
```

这里的 `observedAt` 和 `scopeAvailability` 只表示导出机当时的环境观察；`import` 相关流程必须重新解析本地 Gemini `project scope` 是否可用，不能把导出文件当成可直接执行的环境真相。`summary.secretExportPolicy.mode = "redacted-by-default"` 表示这份导出文件默认适合共享；如果你显式使用 `--include-secrets`，`mode` 会切到 `"include-secrets"`，同时 `inlineSecretsExported` 会大于 `0`。

`import preview` 用来显式比较“导出时观察”和“当前本地观察”：

```bash
api-switcher import preview exported.json
api-switcher import preview exported.json --json
```

约定：

- `import preview` 不会写回任何配置文件。
- `summary.sourceExecutability` 是 `import preview --json` 的稳定批次级入口，先回答“这批 source 有多少条可以继续进入 apply，多少条只能停留在 preview”。
- `summary.executabilityStats` 是另一层稳定批次级入口，回答“这批 profile 从 secret 形态上看，后续写入链路里有多少条是 inline-ready、reference-ready、reference-missing、write-unsupported 或 source-redacted”；它不替代 `summary.sourceExecutability`，前者偏 profile 形态治理，后者偏导入源是否还能继续进入 apply。
- `import --json` 会在每个 item 上带出所属平台的 `platformSummary`；Gemini / Claude 用它表达 scope precedence，Codex 用它表达双文件组合语义。
- `exportedObservation` 只是历史观察；真正与后续 apply 设计相关的判断，必须以 `localObservation` 为准。
- 即使导出文件里记录了 Gemini `project scope = available`，如果导入机本地现在解析为 `unresolved`，也只会得到 fidelity mismatch，不会进入写入路径。
- 如果导入文件缺少 `schemaVersion`，CLI 会进入兼容模式读取，并在 `sourceCompatibility` / 文本摘要里明确提示。
- 如果导入文件包含 `"<redacted:inline-secret>"`，`import preview` 仍会继续返回 item 级 drift/scope 分析；但 `summary.sourceExecutability.blockedByCodeStats[]` 会把它们标成 `REDACTED_INLINE_SECRET`，提示这些 item 后续不能直接进入 `import apply`。

一条 Gemini `import --json` item 的典型结构如下：

```json
{
  "platform": "gemini",
  "platformSummary": {
    "kind": "scope-precedence",
    "precedence": ["system-defaults", "user", "project", "system-overrides"],
    "facts": [
      {
        "code": "GEMINI_SCOPE_PRECEDENCE",
        "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
      },
      {
        "code": "GEMINI_PROJECT_OVERRIDES_USER",
        "message": "project scope 会覆盖 user 中的同名字段。"
      }
    ]
  },
  "exportedObservation": {
    "defaultWriteScope": "user",
    "observedAt": "2026-04-16T00:00:00.000Z"
  },
  "localObservation": {
    "defaultWriteScope": "user",
    "scopeAvailability": [
      {
        "scope": "project",
        "status": "unresolved",
        "detected": false,
        "writable": false,
        "reasonCode": "PROJECT_ROOT_UNRESOLVED"
      }
    ]
  },
  "previewDecision": {
    "canProceedToApplyDesign": false,
    "recommendedScope": "user",
    "requiresLocalResolution": true,
    "reasonCodes": [
      "BLOCKED_BY_FIDELITY_MISMATCH",
      "REQUIRES_LOCAL_SCOPE_RESOLUTION"
    ]
  }
}
```

`import apply` 负责真正写入，当前 contract 边界如下：

- 命令语法：`api-switcher import apply <file> --profile <id> [--scope <scope>] [--force] [--json]`
- 当前支持 Gemini / Codex / Claude 导入应用。
- 单 profile 边界：必须显式传 `--profile`，每次仅处理一个 profile。
- `import apply --json` 成功态也会返回 `platformSummary`，用于把平台 precedence / 多文件组合语义与本次 apply 结果一起交给机器消费方。
- `import apply --json` 成功态会把 `data.summary.platformStats[]`、`data.summary.referenceStats`、`data.summary.executabilityStats` 一起暴露成稳定 summary 入口。推荐先读 `summary.platformStats[0]` 拿平台、scope、warning/limitation、变更文件计数，再读 `summary.referenceStats` 和 `summary.executabilityStats` 做 secret 形态与写入可执行性判断，最后再展开 `platformSummary` 与 `preview`。
- `import apply --json` 失败态如果涉及 secret/reference 治理，会在 `error.details.referenceGovernance` 给出机器可读原因；失败态不要读取 `summary.referenceStats`，推荐顺序是 `error.code` -> `error.details.referenceGovernance.primaryReason/reasonCodes` -> `error.details.referenceGovernance.referenceDetails[]` -> `risk/scope/validation` 细节。`referenceDetails[]` 会进一步暴露字段级 resolver explainable，例如 `REFERENCE_ENV_UNRESOLVED`、`REFERENCE_SCHEME_UNSUPPORTED`、`REFERENCE_ENV_RESOLVED`。
- local-first apply rule：是否允许 apply 以本地实时 observation 为准，不以导出观察直接决策。
- gate 顺序固定为 availability-before-confirmation：Gemini `project` 先判断 `scopeAvailability`，再判断是否需要 `--force`。
- Gemini 继续支持 `--scope user|project`，其中 `project` 属于高风险显式目标。
- Claude 支持 `--scope user|project|local`；其中 `local` 会额外提高确认门槛，未 `--force` 时返回 `CONFIRMATION_REQUIRED`。
- Codex 不支持 `--scope`；成功时会按真实双文件目标写入，`appliedScope` 可缺省。
- 对显式 `--scope project` 的 Gemini 命令，如果当前 project root 无法解析，JSON 顶层通常仍是该 action 的通用失败码；但 `error.details.scopeAvailability` 会稳定给出 `project.status = "unresolved"` 与 `reasonCode = "PROJECT_ROOT_UNRESOLVED"`。
- rollback provenance：成功 apply 的快照会记录 `origin=import-apply`、`sourceFile`、`importedProfileId`，回滚绑定这组来源信息。
- machine-readable schema 仅对 `import-apply` 做 action-specific envelope 校验：成功态约束 `data`，失败态只约束稳定 `error.details` 联合，避免过度冻结 adapter 私有字段。

下面是一份 Gemini `import apply --json` 成功样例，展示显式写入 `project scope` 的完整返回：

```bash
api-switcher import apply E:/tmp/exported-gemini.json --profile gemini-prod --scope project --force --json
```

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "import-apply",
  "data": {
    "sourceFile": "E:/tmp/exported-gemini.json",
    "importedProfile": {
      "id": "gemini-prod",
      "name": "gemini-prod",
      "platform": "gemini",
      "source": {
        "apiKey": "gm-l***56",
        "authType": "gemini-api-key"
      },
      "apply": {
        "GEMINI_API_KEY": "gm-l***56",
        "enforcedAuthType": "gemini-api-key"
      }
    },
    "appliedScope": "project",
    "platformSummary": {
      "kind": "scope-precedence",
      "precedence": ["system-defaults", "user", "project", "system-overrides"],
      "facts": [
        {
          "code": "GEMINI_SCOPE_PRECEDENCE",
          "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
        },
        {
          "code": "GEMINI_PROJECT_OVERRIDES_USER",
          "message": "project scope 会覆盖 user 中的同名字段。"
        }
      ]
    },
    "scopePolicy": {
      "requestedScope": "project",
      "resolvedScope": "project",
      "defaultScope": "user",
      "explicitScope": true,
      "highRisk": true,
      "riskWarning": "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。",
      "rollbackScopeMatchRequired": true
    },
    "scopeCapabilities": [
      {
        "scope": "user",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true
      },
      {
        "scope": "project",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true,
        "risk": "high",
        "confirmationRequired": true
      }
    ],
    "scopeAvailability": [
      {
        "scope": "user",
        "status": "available",
        "detected": true,
        "writable": true,
        "path": "C:/Users/test/.gemini/settings.json"
      },
      {
        "scope": "project",
        "status": "available",
        "detected": true,
        "writable": true,
        "path": "E:/repo/.gemini/settings.json"
      }
    ],
    "validation": {
      "ok": true,
      "errors": [],
      "warnings": [],
      "limitations": [
        {
          "code": "GEMINI_API_KEY_ENV_REQUIRED",
          "message": "GEMINI_API_KEY 仍需通过环境变量生效。"
        }
      ],
      "managedBoundaries": [
        {
          "type": "scope-aware",
          "target": "E:/repo/.gemini/settings.json",
          "managedKeys": [
            "enforcedAuthType"
          ],
          "notes": [
            "Gemini 当前仅稳定托管 settings.json 中的已确认字段，API key 仍由环境变量主导。"
          ]
        }
      ],
      "secretReferences": [
        {
          "key": "GEMINI_API_KEY",
          "source": "env",
          "present": true,
          "maskedValue": "gm-l***56"
        }
      ]
    },
    "preview": {
      "platform": "gemini",
      "profileId": "gemini-prod",
      "targetFiles": [
        {
          "path": "E:/repo/.gemini/settings.json",
          "format": "json",
          "exists": true,
          "managedScope": "partial-fields",
          "scope": "project",
          "role": "settings",
          "managedKeys": [
            "enforcedAuthType"
          ]
        }
      ],
      "effectiveFields": [],
      "storedOnlyFields": [],
      "diffSummary": [
        {
          "path": "E:/repo/.gemini/settings.json",
          "changedKeys": [
            "enforcedAuthType"
          ],
          "hasChanges": true
        }
      ],
      "warnings": [
        {
          "code": "GEMINI_API_KEY_ENV_REQUIRED",
          "message": "Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。"
        }
      ],
      "limitations": [],
      "riskLevel": "high",
      "requiresConfirmation": true,
      "backupPlanned": true,
      "noChanges": false
    },
    "risk": {
      "allowed": true,
      "riskLevel": "high",
      "reasons": [
        "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。"
      ],
      "limitations": [
        "GEMINI_API_KEY 仍需通过环境变量生效。"
      ]
    },
    "backupId": "snapshot-gemini-20260419120000-abcdef",
    "changedFiles": [
      "E:/repo/.gemini/settings.json"
    ],
    "noChanges": false,
    "summary": {
      "platformStats": [
        {
          "platform": "gemini",
          "profileCount": 1,
          "profileId": "gemini-prod",
          "targetScope": "project",
          "warningCount": 1,
          "limitationCount": 1,
          "changedFileCount": 1,
          "backupCreated": true,
          "noChanges": false
        }
      ],
      "warnings": [
        "Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。"
      ],
      "limitations": [
        "GEMINI_API_KEY 仍需通过环境变量生效。"
      ]
    }
  },
  "warnings": [
    "Gemini API key 仍需通过环境变量 GEMINI_API_KEY 生效。"
  ],
  "limitations": [
    "GEMINI_API_KEY 仍需通过环境变量生效。"
  ]
}
```

这个样例对应的是 Gemini `project scope` 的标准成功路径。它和 `user scope` 的差异有两点：一是 `appliedScope` 会显式返回 `project`；二是 `scopePolicy.rollbackScopeMatchRequired = true`，后续回滚时必须带同一 scope，不能按 `user` 去恢复 `project` 快照。

下面是一份 Codex `import apply --json` 成功样例，展示无 scope 平台的双文件写入返回：

```bash
api-switcher import apply E:/tmp/exported-codex.json --profile codex-prod --force --json
```

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "import-apply",
  "data": {
    "sourceFile": "E:/tmp/exported-codex.json",
    "importedProfile": {
      "id": "codex-prod",
      "name": "codex-prod",
      "platform": "codex",
      "source": {
        "apiKey": "sk-c***56",
        "baseURL": "https://gateway.example.com/openai/v1"
      },
      "apply": {
        "OPENAI_API_KEY": "sk-c***56",
        "base_url": "https://gateway.example.com/openai/v1"
      }
    },
    "platformSummary": {
      "kind": "multi-file-composition",
      "composedFiles": [
        "C:/Users/test/.codex/config.toml",
        "C:/Users/test/.codex/auth.json"
      ],
      "facts": [
        {
          "code": "CODEX_MULTI_FILE_CONFIGURATION",
          "message": "Codex 当前由 config.toml 与 auth.json 共同组成有效配置。"
        },
        {
          "code": "CODEX_LIST_IS_PROFILE_LEVEL",
          "message": "list 仅展示 profile 级状态，不表示单文件可独立切换。"
        }
      ]
    },
    "scopePolicy": {
      "explicitScope": false,
      "highRisk": false,
      "rollbackScopeMatchRequired": false
    },
    "scopeCapabilities": [],
    "validation": {
      "ok": true,
      "errors": [],
      "warnings": [],
      "limitations": [
        {
          "code": "CODEX_MULTI_FILE_MANAGED",
          "message": "当前会同时托管 Codex 的 config.toml 与 auth.json。"
        }
      ],
      "managedBoundaries": [
        {
          "type": "managed-fields",
          "target": "C:/Users/test/.codex/config.toml",
          "managedKeys": [
            "base_url"
          ]
        },
        {
          "type": "managed-fields",
          "target": "C:/Users/test/.codex/auth.json",
          "managedKeys": [
            "OPENAI_API_KEY"
          ]
        },
        {
          "type": "multi-file-transaction",
          "targets": [
            "C:/Users/test/.codex/config.toml",
            "C:/Users/test/.codex/auth.json"
          ],
          "notes": [
            "Codex 导入应用会同时更新 config.toml 与 auth.json。"
          ]
        }
      ],
      "secretReferences": [
        {
          "key": "OPENAI_API_KEY",
          "source": "config",
          "present": true,
          "maskedValue": "sk-c***56"
        }
      ]
    },
    "preview": {
      "platform": "codex",
      "profileId": "codex-prod",
      "targetFiles": [
        {
          "path": "C:/Users/test/.codex/config.toml",
          "format": "toml",
          "exists": true,
          "managedScope": "multi-file",
          "role": "config",
          "managedKeys": [
            "base_url"
          ]
        },
        {
          "path": "C:/Users/test/.codex/auth.json",
          "format": "json",
          "exists": true,
          "managedScope": "multi-file",
          "role": "auth",
          "managedKeys": [
            "OPENAI_API_KEY"
          ]
        }
      ],
      "effectiveFields": [],
      "storedOnlyFields": [],
      "diffSummary": [
        {
          "path": "C:/Users/test/.codex/config.toml",
          "changedKeys": [
            "base_url"
          ],
          "hasChanges": true
        },
        {
          "path": "C:/Users/test/.codex/auth.json",
          "changedKeys": [
            "OPENAI_API_KEY"
          ],
          "hasChanges": true
        }
      ],
      "warnings": [],
      "limitations": [],
      "riskLevel": "low",
      "requiresConfirmation": false,
      "backupPlanned": true,
      "noChanges": false
    },
    "risk": {
      "allowed": true,
      "riskLevel": "low",
      "reasons": [],
      "limitations": []
    },
    "backupId": "snapshot-codex-20260419120000-abcdef",
    "changedFiles": [
      "C:/Users/test/.codex/config.toml",
      "C:/Users/test/.codex/auth.json"
    ],
    "noChanges": false,
    "summary": {
      "platformStats": [
        {
          "platform": "codex",
          "profileCount": 1,
          "profileId": "codex-prod",
          "warningCount": 0,
          "limitationCount": 1,
          "changedFileCount": 2,
          "backupCreated": true,
          "noChanges": false
        }
      ],
      "warnings": [],
      "limitations": [
        "当前会同时托管 Codex 的 config.toml 与 auth.json。"
      ]
    }
  },
  "warnings": [],
  "limitations": [
    "当前会同时托管 Codex 的 config.toml 与 auth.json。"
  ]
}
```

这个样例对应的是 Codex 的标准成功路径。因为 Codex 当前没有 scoped target，返回里可以没有 `appliedScope`；外部调用方不应把这个缺省误解为失败。

下面是一份 Claude `import apply --json` 成功样例，展示显式写入 `local scope` 的完整返回：

```bash
api-switcher import apply E:/tmp/exported-claude.json --profile claude-prod --scope local --force --json
```

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "import-apply",
  "data": {
    "sourceFile": "E:/tmp/exported-claude.json",
    "importedProfile": {
      "id": "claude-prod",
      "name": "claude-prod",
      "platform": "claude",
      "source": {
        "token": "sk-l***56",
        "baseURL": "https://gateway.example.com/api"
      },
      "apply": {
        "ANTHROPIC_AUTH_TOKEN": "sk-l***56",
        "ANTHROPIC_BASE_URL": "https://gateway.example.com/api"
      }
    },
    "appliedScope": "local",
    "platformSummary": {
      "kind": "scope-precedence",
      "precedence": ["user", "project", "local"],
      "facts": [
        {
          "code": "CLAUDE_SCOPE_PRECEDENCE",
          "message": "Claude 支持 user < project < local 三层 precedence。"
        },
        {
          "code": "CLAUDE_LOCAL_SCOPE_HIGHEST",
          "message": "如果存在 local，同名字段最终以 local 为准。"
        }
      ]
    },
    "scopePolicy": {
      "requestedScope": "local",
      "resolvedScope": "local",
      "defaultScope": "project",
      "explicitScope": true,
      "highRisk": true,
      "rollbackScopeMatchRequired": false
    },
    "scopeCapabilities": [
      {
        "scope": "user",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true
      },
      {
        "scope": "project",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true
      },
      {
        "scope": "local",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true,
        "risk": "high",
        "confirmationRequired": true
      }
    ],
    "validation": {
      "ok": true,
      "errors": [],
      "warnings": [],
      "limitations": [
        {
          "code": "CLAUDE_MANAGED_FIELDS_ONLY",
          "message": "当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。"
        }
      ],
      "effectiveConfig": {
        "stored": [
          {
            "key": "ANTHROPIC_AUTH_TOKEN",
            "maskedValue": "sk-l***56",
            "source": "stored",
            "scope": "local",
            "secret": true
          },
          {
            "key": "ANTHROPIC_BASE_URL",
            "maskedValue": "https://gateway.example.com/api",
            "source": "stored",
            "scope": "local",
            "secret": false
          }
        ],
        "effective": [
          {
            "key": "ANTHROPIC_AUTH_TOKEN",
            "maskedValue": "sk-l***56",
            "source": "effective",
            "scope": "local",
            "secret": true
          },
          {
            "key": "ANTHROPIC_BASE_URL",
            "maskedValue": "https://gateway.example.com/api",
            "source": "effective",
            "scope": "local",
            "secret": false
          }
        ],
        "overrides": []
      },
      "managedBoundaries": [
        {
          "type": "scope-aware",
          "target": "E:/repo/.claude/settings.local.json",
          "managedKeys": [
            "ANTHROPIC_AUTH_TOKEN",
            "ANTHROPIC_BASE_URL"
          ],
          "notes": [
            "当前写入目标为 Claude 本地级配置文件。"
          ]
        }
      ],
      "secretReferences": [
        {
          "key": "ANTHROPIC_AUTH_TOKEN",
          "source": "config",
          "present": true,
          "maskedValue": "sk-l***56"
        }
      ]
    },
    "preview": {
      "platform": "claude",
      "profileId": "claude-prod",
      "targetFiles": [
        {
          "path": "E:/repo/.claude/settings.local.json",
          "format": "json",
          "exists": true,
          "managedScope": "partial-fields",
          "scope": "local",
          "role": "settings",
          "managedKeys": [
            "ANTHROPIC_AUTH_TOKEN",
            "ANTHROPIC_BASE_URL"
          ]
        }
      ],
      "effectiveFields": [
        {
          "key": "ANTHROPIC_AUTH_TOKEN",
          "maskedValue": "sk-l***56",
          "source": "effective",
          "scope": "local",
          "secret": true
        },
        {
          "key": "ANTHROPIC_BASE_URL",
          "maskedValue": "https://gateway.example.com/api",
          "source": "effective",
          "scope": "local",
          "secret": false
        }
      ],
      "storedOnlyFields": [],
      "diffSummary": [
        {
          "path": "E:/repo/.claude/settings.local.json",
          "changedKeys": [
            "ANTHROPIC_AUTH_TOKEN",
            "ANTHROPIC_BASE_URL"
          ],
          "hasChanges": true
        }
      ],
      "warnings": [],
      "limitations": [],
      "riskLevel": "high",
      "requiresConfirmation": true,
      "backupPlanned": true,
      "noChanges": false
    },
    "risk": {
      "allowed": true,
      "riskLevel": "high",
      "reasons": [],
      "limitations": []
    },
    "backupId": "snapshot-claude-20260419120000-abcdef",
    "changedFiles": [
      "E:/repo/.claude/settings.local.json"
    ],
    "noChanges": false,
    "summary": {
      "platformStats": [
        {
          "platform": "claude",
          "profileCount": 1,
          "profileId": "claude-prod",
          "targetScope": "local",
          "warningCount": 0,
          "limitationCount": 1,
          "changedFileCount": 1,
          "backupCreated": true,
          "noChanges": false
        }
      ],
      "warnings": [],
      "limitations": [
        "当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。"
      ]
    }
  },
  "warnings": [],
  "limitations": [
    "当前按目标作用域托管 Claude 配置中的 ANTHROPIC_AUTH_TOKEN 与 ANTHROPIC_BASE_URL。"
  ]
}
```

这个样例对应的是“显式指定 `--scope local` 且带 `--force`”的成功路径。如果去掉 `--force`，Claude 会先返回 `CONFIRMATION_REQUIRED`，并在 `error.details.risk.reasons` / `limitations` 里解释为什么 `local scope` 需要更高确认门槛。

对应的高风险失败样例如下：

```bash
api-switcher import apply E:/tmp/exported-claude.json --profile claude-prod --scope local --json
```

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": false,
  "action": "import-apply",
  "error": {
    "code": "CONFIRMATION_REQUIRED",
    "message": "当前操作风险较高，需要显式确认。请重新执行并附加 --force。",
    "details": {
      "referenceGovernance": {
        "hasReferenceProfiles": false,
        "hasInlineProfiles": true,
        "hasWriteUnsupportedProfiles": false,
        "primaryReason": "INLINE_SECRET_PRESENT",
        "reasonCodes": [
          "INLINE_SECRET_PRESENT"
        ],
        "referenceDetails": [
          {
            "code": "REFERENCE_ENV_UNRESOLVED",
            "field": "apiKey",
            "status": "missing",
            "reference": "env://CLAUDE_API_KEY",
            "scheme": "env",
            "message": "引用 env://CLAUDE_API_KEY 当前未解析，导入写入不会注入真实 secret。"
          },
          {
            "code": "REFERENCE_SCHEME_UNSUPPORTED",
            "field": "sessionToken",
            "status": "unsupported-scheme",
            "reference": "keychain://claude/session-token",
            "scheme": "keychain",
            "message": "当前写入链路不支持 keychain:// 引用。"
          }
        ]
      },
      "risk": {
        "allowed": false,
        "riskLevel": "high",
        "reasons": [
          "Claude local scope 高于 project 与 user；同名字段写入后会直接成为当前项目的最终生效值。"
        ],
        "limitations": [
          "如果你只是想共享项目级配置，优先使用 project scope，而不是 local scope。"
        ]
      },
      "scopePolicy": {
        "requestedScope": "local",
        "resolvedScope": "local",
        "defaultScope": "project",
        "explicitScope": true,
        "highRisk": true,
        "rollbackScopeMatchRequired": false
      },
      "scopeCapabilities": [
        {
          "scope": "user",
          "detect": true,
          "preview": true,
          "use": true,
          "rollback": true,
          "writable": true
        },
        {
          "scope": "project",
          "detect": true,
          "preview": true,
          "use": true,
          "rollback": true,
          "writable": true
        },
        {
          "scope": "local",
          "detect": true,
          "preview": true,
          "use": true,
          "rollback": true,
          "writable": true,
          "risk": "high",
          "confirmationRequired": true
        }
      ]
    }
  },
  "warnings": [],
  "limitations": []
}
```

对应的非 JSON 文本输出会把这层 resolver explainable 直接折叠成摘要，便于人工快速判断“是 env 没解析，还是虽然能解析但当前仍不会写入真实 secret”：

```text
[import-apply] 失败
当前操作风险较高，需要显式确认。请重新执行并附加 --force。
reference 解析摘要:
  - 未解析 env 引用:
    - apiKey -> env://CLAUDE_API_KEY
      引用 env://CLAUDE_API_KEY 当前未解析，导入写入不会注入真实 secret。
  - 不支持的引用 scheme:
    - sessionToken -> keychain://claude/session-token
      当前写入链路不支持 keychain:// 引用。
```

如果导入源来自默认 `export --json`，其中 inline secret 会被写成 `"<redacted:inline-secret>"`。这类导出仍然可以进入 `import preview` 做 drift / scope / fidelity 分析，但不能直接进入 `import apply`，因为当前 contract 明确禁止从 redacted placeholder 反推真实 secret。对应失败样例如下：

```bash
api-switcher import apply E:/tmp/exported-redacted.json --profile gemini-prod --json
```

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": false,
  "action": "import-apply",
  "warnings": [
    "导入文件包含 2 个 redacted inline secret 占位值；import preview 会保留字段位置，但不会把它当作真实 secret 明文。"
  ],
  "error": {
    "code": "IMPORT_SOURCE_REDACTED_INLINE_SECRETS",
    "message": "导入文件中的 inline secret 已被 redacted；当前不能直接进入 import apply。",
    "details": {
      "sourceFile": "E:/tmp/exported-redacted.json",
      "profileId": "gemini-prod",
      "redactedInlineSecretFields": [
        "source.apiKey",
        "apply.GEMINI_API_KEY"
      ]
    }
  }
}
```

非 JSON 模式会直接给出阻断原因和字段列表，提示当前问题不在本地 scope 解析，而在导入源本身不具备可执行 secret 明文：

```text
[import-apply] 失败
导入文件中的 inline secret 已被 redacted；当前不能直接进入 import apply。
导入文件: E:/tmp/exported-redacted.json
导入配置: gemini-prod
阻断原因:
  - 导入源中的 inline secret 只有 redacted placeholder，没有可执行明文。
  - 当前 import apply 不会从 redacted export 反推真实 secret。
redacted 字段:
  - source.apiKey
  - apply.GEMINI_API_KEY
```

`import preview --json` 当前会同时给出导入源兼容性、整批汇总和按平台汇总。下面示例展示的是一个 mixed-batch 导入结果，同一批里同时包含 `match / partial / mismatch / insufficient-data` 四类 item：

接入建议：

- 如果你是第一次接入 `import preview --json`，先看 [`docs/import-preview-consumer-guide.md`](docs/import-preview-consumer-guide.md)。
- 如果你要做 mixed-batch 面板或批处理脚本，重点看该文档里的“推荐消费顺序”和 “Explainable 词典”。
- 如果你要处理失败出口，重点看该文档里的“失败处理建议”和“前端对照表”。

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "import",
  "data": {
    "sourceFile": "E:/tmp/exported-mixed.json",
    "sourceCompatibility": {
      "mode": "strict",
      "schemaVersion": "2026-04-15.public-json.v1",
      "warnings": []
    },
    "items": [
      {
        "profile": {
          "id": "gemini-match",
          "name": "gemini-match",
          "platform": "gemini",
          "source": {
            "apiKey": "gm-live-123456",
            "authType": "gemini-api-key"
          },
          "apply": {
            "GEMINI_API_KEY": "gm-live-123456",
            "enforcedAuthType": "gemini-api-key"
          }
        },
        "platform": "gemini",
        "exportedObservation": {
          "defaultWriteScope": "user",
          "observedAt": "2026-04-16T00:00:00.000Z",
          "scopeCapabilities": [
            {
              "scope": "user",
              "detect": true,
              "preview": true,
              "use": true,
              "rollback": true,
              "writable": true
            }
          ],
          "scopeAvailability": [
            {
              "scope": "user",
              "status": "available",
              "detected": true,
              "writable": true,
              "path": "C:/Users/test/.gemini/settings.json"
            }
          ]
        },
        "localObservation": {
          "defaultWriteScope": "user",
          "scopeCapabilities": [
            {
              "scope": "system-defaults",
              "detect": true,
              "preview": true,
              "use": false,
              "rollback": false,
              "writable": false
            },
            {
              "scope": "user",
              "detect": true,
              "preview": true,
              "use": true,
              "rollback": true,
              "writable": true
            },
            {
              "scope": "project",
              "detect": true,
              "preview": true,
              "use": true,
              "rollback": true,
              "writable": true,
              "risk": "high",
              "confirmationRequired": true
            },
            {
              "scope": "system-overrides",
              "detect": true,
              "preview": true,
              "use": false,
              "rollback": false,
              "writable": false
            }
          ],
          "scopeAvailability": [
            {
              "scope": "user",
              "status": "available",
              "detected": true,
              "writable": true,
              "path": "C:/Users/test/.gemini/settings.json"
            }
          ]
        },
        "fidelity": {
          "status": "match",
          "mismatches": [],
          "driftSummary": {
            "blocking": 0,
            "warning": 0,
            "info": 0
          },
          "groupedMismatches": [
            {
              "driftKind": "default-scope-drift",
              "totalCount": 0,
              "blockingCount": 0,
              "warningCount": 0,
              "infoCount": 0,
              "mismatches": []
            },
            {
              "driftKind": "availability-drift",
              "totalCount": 0,
              "blockingCount": 0,
              "warningCount": 0,
              "infoCount": 0,
              "mismatches": []
            },
            {
              "driftKind": "capability-drift",
              "totalCount": 0,
              "blockingCount": 0,
              "warningCount": 0,
              "infoCount": 0,
              "mismatches": []
            }
          ],
          "highlights": []
        },
        "previewDecision": {
          "canProceedToApplyDesign": true,
          "recommendedScope": "user",
          "requiresLocalResolution": false,
          "reasonCodes": [
            "READY_USING_LOCAL_OBSERVATION"
          ],
          "reasons": [
            {
              "code": "READY_USING_LOCAL_OBSERVATION",
              "blocking": false,
              "message": "当前本地 observation 与导出观察一致，可继续基于本地 observation 评估 apply 设计。"
            }
          ]
        }
      },
      {
        "profile": {
          "id": "gemini-partial",
          "name": "gemini-partial",
          "platform": "gemini",
          "source": {
            "apiKey": "gm-live-123456",
            "authType": "gemini-api-key"
          },
          "apply": {
            "GEMINI_API_KEY": "gm-live-123456",
            "enforcedAuthType": "gemini-api-key"
          }
        },
        "platform": "gemini",
        "exportedObservation": {
          "defaultWriteScope": "user",
          "observedAt": "2026-04-16T00:00:00.000Z",
          "scopeCapabilities": [
            {
              "scope": "user",
              "detect": true,
              "preview": true,
              "use": true,
              "rollback": true,
              "writable": true
            }
          ]
        },
        "localObservation": {
          "defaultWriteScope": "user"
        },
        "fidelity": {
          "status": "partial",
          "mismatches": [],
          "driftSummary": {
            "blocking": 0,
            "warning": 0,
            "info": 0
          },
          "groupedMismatches": [
            {
              "driftKind": "default-scope-drift",
              "totalCount": 0,
              "blockingCount": 0,
              "warningCount": 0,
              "infoCount": 0,
              "mismatches": []
            },
            {
              "driftKind": "availability-drift",
              "totalCount": 0,
              "blockingCount": 0,
              "warningCount": 0,
              "infoCount": 0,
              "mismatches": []
            },
            {
              "driftKind": "capability-drift",
              "totalCount": 0,
              "blockingCount": 0,
              "warningCount": 0,
              "infoCount": 0,
              "mismatches": []
            }
          ],
          "highlights": [
            "导出文件缺少部分 observation 字段，当前只做有限对比。"
          ]
        },
        "previewDecision": {
          "canProceedToApplyDesign": true,
          "recommendedScope": "user",
          "requiresLocalResolution": false,
          "reasonCodes": [
            "LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION"
          ],
          "reasons": [
            {
              "code": "LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION",
              "blocking": false,
              "message": "导出 observation 不完整，当前只适合基于本地 observation 做有限 apply 设计评估。"
            }
          ]
        }
      },
      {
        "profile": {
          "id": "gemini-mismatch",
          "name": "gemini-mismatch",
          "platform": "gemini",
          "source": {
            "apiKey": "gm-live-123456",
            "authType": "gemini-api-key"
          },
          "apply": {
            "GEMINI_API_KEY": "gm-live-123456",
            "enforcedAuthType": "gemini-api-key"
          }
        },
        "platform": "gemini",
        "exportedObservation": {
          "defaultWriteScope": "user",
          "observedAt": "2026-04-16T00:00:00.000Z",
          "scopeCapabilities": [
            {
              "scope": "project",
              "detect": true,
              "preview": true,
              "use": true,
              "rollback": true,
              "writable": true,
              "risk": "high",
              "confirmationRequired": true
            }
          ],
          "scopeAvailability": [
            {
              "scope": "project",
              "status": "available",
              "detected": true,
              "writable": true,
              "path": "E:/exported/.gemini/settings.json"
            }
          ]
        },
        "localObservation": {
          "defaultWriteScope": "user",
          "scopeAvailability": [
            {
              "scope": "project",
              "status": "unresolved",
              "detected": false,
              "writable": false,
              "reasonCode": "PROJECT_ROOT_UNRESOLVED",
              "reason": "无法定位 Gemini project scope 所需的项目根目录。",
              "remediation": "在 Gemini 项目根目录下运行，或显式提供可解析的目标路径。"
            }
          ]
        },
        "fidelity": {
          "status": "mismatch",
          "mismatches": [
            {
              "field": "scopeAvailability",
              "driftKind": "availability-drift",
              "severity": "blocking",
              "scope": "project",
              "exportedValue": {
                "status": "available",
                "detected": true,
                "writable": true
              },
              "localValue": {
                "status": "unresolved",
                "detected": false,
                "writable": false
              },
              "message": "project 作用域的可用性与当前本地环境不一致。",
              "recommendedAction": "先修复本地 project scope 解析，再重新执行 import preview。"
            }
          ],
          "driftSummary": {
            "blocking": 1,
            "warning": 0,
            "info": 0
          },
          "groupedMismatches": [
            {
              "driftKind": "default-scope-drift",
              "totalCount": 0,
              "blockingCount": 0,
              "warningCount": 0,
              "infoCount": 0,
              "mismatches": []
            },
            {
              "driftKind": "availability-drift",
              "totalCount": 1,
              "blockingCount": 1,
              "warningCount": 0,
              "infoCount": 0,
              "mismatches": [
                {
                  "field": "scopeAvailability",
                  "driftKind": "availability-drift",
                  "severity": "blocking",
                  "scope": "project"
                }
              ]
            },
            {
              "driftKind": "capability-drift",
              "totalCount": 0,
              "blockingCount": 0,
              "warningCount": 0,
              "infoCount": 0,
              "mismatches": []
            }
          ],
          "highlights": [
            "当前本地 scope availability 与导出观察不一致，应以本地实时环境为准。"
          ]
        },
        "previewDecision": {
          "canProceedToApplyDesign": false,
          "recommendedScope": "user",
          "requiresLocalResolution": true,
          "reasonCodes": [
            "BLOCKED_BY_FIDELITY_MISMATCH",
            "REQUIRES_LOCAL_SCOPE_RESOLUTION"
          ],
          "reasons": [
            {
              "code": "BLOCKED_BY_FIDELITY_MISMATCH",
              "blocking": true,
              "message": "导出观察与当前本地观察存在关键漂移，当前不应继续进入 apply 设计。"
            },
            {
              "code": "REQUIRES_LOCAL_SCOPE_RESOLUTION",
              "blocking": true,
              "message": "当前本地 scope 解析未完成，需先修复本地解析结果。"
            }
          ]
        }
      },
      {
        "profile": {
          "id": "gemini-insufficient",
          "name": "gemini-insufficient",
          "platform": "gemini",
          "source": {
            "apiKey": "gm-live-123456",
            "authType": "gemini-api-key"
          },
          "apply": {
            "GEMINI_API_KEY": "gm-live-123456",
            "enforcedAuthType": "gemini-api-key"
          }
        },
        "platform": "gemini",
        "localObservation": {
          "defaultWriteScope": "user"
        },
        "fidelity": {
          "status": "insufficient-data",
          "mismatches": [],
          "driftSummary": {
            "blocking": 0,
            "warning": 0,
            "info": 0
          },
          "groupedMismatches": [
            {
              "driftKind": "default-scope-drift",
              "totalCount": 0,
              "blockingCount": 0,
              "warningCount": 0,
              "infoCount": 0,
              "mismatches": []
            },
            {
              "driftKind": "availability-drift",
              "totalCount": 0,
              "blockingCount": 0,
              "warningCount": 0,
              "infoCount": 0,
              "mismatches": []
            },
            {
              "driftKind": "capability-drift",
              "totalCount": 0,
              "blockingCount": 0,
              "warningCount": 0,
              "infoCount": 0,
              "mismatches": []
            }
          ],
          "highlights": [
            "导出 observation 或本地 observation 缺失，无法建立有效 fidelity 结论。"
          ]
        },
        "previewDecision": {
          "canProceedToApplyDesign": false,
          "recommendedScope": "user",
          "requiresLocalResolution": false,
          "reasonCodes": [
            "BLOCKED_BY_INSUFFICIENT_OBSERVATION"
          ],
          "reasons": [
            {
              "code": "BLOCKED_BY_INSUFFICIENT_OBSERVATION",
              "blocking": true,
              "message": "导出 observation 或本地 observation 缺失，当前不能进入 apply 设计。"
            }
          ]
        }
      }
    ],
    "summary": {
      "totalItems": 4,
      "matchCount": 1,
      "mismatchCount": 1,
      "partialCount": 1,
      "insufficientDataCount": 1,
      "sourceExecutability": {
        "totalItems": 4,
        "applyReadyCount": 4,
        "previewOnlyCount": 0,
        "blockedCount": 0,
        "blockedByCodeStats": [
          {
            "code": "REDACTED_INLINE_SECRET",
            "totalCount": 0
          }
        ]
      },
      "platformStats": [
        {
          "platform": "gemini",
          "totalItems": 4,
          "matchCount": 1,
          "mismatchCount": 1,
          "partialCount": 1,
          "insufficientDataCount": 1
        }
      ],
      "decisionCodeStats": [
        {
          "code": "READY_USING_LOCAL_OBSERVATION",
          "totalCount": 1,
          "blockingCount": 0,
          "nonBlockingCount": 1
        },
        {
          "code": "LIMITED_BY_PARTIAL_EXPORTED_OBSERVATION",
          "totalCount": 1,
          "blockingCount": 0,
          "nonBlockingCount": 1
        },
        {
          "code": "BLOCKED_BY_INSUFFICIENT_OBSERVATION",
          "totalCount": 1,
          "blockingCount": 1,
          "nonBlockingCount": 0
        },
        {
          "code": "BLOCKED_BY_FIDELITY_MISMATCH",
          "totalCount": 1,
          "blockingCount": 1,
          "nonBlockingCount": 0
        },
        {
          "code": "REQUIRES_LOCAL_SCOPE_RESOLUTION",
          "totalCount": 1,
          "blockingCount": 1,
          "nonBlockingCount": 0
        }
      ],
      "driftKindStats": [
        {
          "driftKind": "default-scope-drift",
          "totalCount": 0,
          "blockingCount": 0,
          "warningCount": 0,
          "infoCount": 0
        },
        {
          "driftKind": "availability-drift",
          "totalCount": 1,
          "blockingCount": 1,
          "warningCount": 0,
          "infoCount": 0
        },
        {
          "driftKind": "capability-drift",
          "totalCount": 0,
          "blockingCount": 0,
          "warningCount": 0,
          "infoCount": 0
        }
      ],
      "warnings": [
        "project 作用域的可用性与当前本地环境不一致。"
      ],
      "limitations": [
        "导出文件的 scope observation 不完整，当前仅能做部分 fidelity 对比。",
        "导出文件缺少足够 observation，当前无法建立完整 fidelity 结论。"
      ]
    }
  }
}
```

推荐消费顺序：

- 先读 `summary.sourceExecutability`，判断这批导入源是否存在只能停留在 preview 的 item。
- 再读 `summary.platformStats`、`summary.decisionCodeStats`、`summary.driftKindStats` 做整批分流。
- 最后按需展开 `items[].previewDecision`、`items[].fidelity`、`exportedObservation`、`localObservation`。

其中：

- `driftKind` 用来标明漂移类型，目前会区分默认写入作用域漂移、scope availability 漂移、scope capability 漂移。
- `severity` 表示该漂移对后续 apply 设计的影响等级；例如 Gemini `project scope` 的 availability 漂移会被标为 `blocking`。
- `exportedValue` / `localValue` 提供 item 级原始对比证据；`groupedMismatches`、`previewDecision.reasonCodes`、`summary.decisionCodeStats`、`summary.driftKindStats` 则分别承担单条分组、单条决策、整批决策聚合、整批 drift 聚合。
- mixed-batch 接入时，推荐先看 `summary.decisionCodeStats` 与 `summary.driftKindStats`，再按需展开 `items[]`。
- 更完整的字段词典、推荐消费顺序和失败处理建议见 [`docs/import-preview-consumer-guide.md`](docs/import-preview-consumer-guide.md)；稳定字段定义见 [`docs/public-json-schema.md`](docs/public-json-schema.md)。

`add --json` 的 `scopeCapabilities` 在成功摘要顶层 `data`，不是挂在 `preview` 或 `validation` 子对象里；同时，成功态也会把 `data.summary.platformStats[]`、`data.summary.referenceStats`、`data.summary.executabilityStats` 一起暴露成稳定 summary 入口，方便 UI 或自动化脚本先读平台级 warning/limitation/变更文件计数，再做 secret/reference 治理与写入可执行性判断，而不必先扫描完整 `preview`。文本输出也按这个顺序组织：先看“按平台汇总”，再看“referenceStats 摘要”和“executabilityStats 摘要”，最后进入 add 细节：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "add",
  "data": {
    "profile": {
      "id": "claude-prod",
      "platform": "claude",
      "name": "Claude 生产",
      "source": {
        "token": "sk-live-123456",
        "baseURL": "https://gateway.example.com/api"
      }
    },
    "validation": {
      "ok": true,
      "errors": [],
      "warnings": [],
      "limitations": []
    },
    "preview": {
      "requiresConfirmation": false,
      "backupPlanned": true,
      "noChanges": false,
      "targetFiles": []
    },
    "risk": {
      "allowed": true,
      "riskLevel": "low",
      "reasons": [],
      "limitations": []
    },
    "summary": {
      "platformStats": [
        {
          "platform": "claude",
          "profileCount": 1,
          "profileId": "claude-prod",
          "warningCount": 0,
          "limitationCount": 0,
          "changedFileCount": 0,
          "backupCreated": true,
          "noChanges": false,
          "platformSummary": {
            "kind": "scope-precedence",
            "precedence": ["user", "project", "local"],
            "facts": [
              {
                "code": "CLAUDE_SCOPE_PRECEDENCE",
                "message": "Claude 支持 user < project < local 三层 precedence。"
              },
              {
                "code": "CLAUDE_LOCAL_SCOPE_HIGHEST",
                "message": "如果存在 local，同名字段最终以 local 为准。"
              }
            ]
          }
        }
      ],
      "warnings": [],
      "limitations": []
    },
    "scopeCapabilities": [
      {
        "scope": "user",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true,
        "risk": "normal"
      },
      {
        "scope": "project",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true,
        "risk": "normal"
      },
      {
        "scope": "local",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true,
        "risk": "normal"
      }
    ]
  }
}
```

`current --json` 会在 `detections[]` 里同时返回当前生效来源 `currentScope`、机器可消费的 `platformSummary`、平台 `scopeCapabilities` 与当前环境里的 `scopeAvailability`；`data.summary.platformStats[]` 则把每个平台的 profile 数、当前 state 记录、当前检测命中和 explainable 摘要做了一层聚合，`data.summary.referenceStats` 则补出 reference / inline / write unsupported 的治理摘要，便于 UI 或自动化脚本不扫描完整 `detections[]` 也能先拿到平台级摘要。`data.summary.executabilityStats` 则补一层“后续写入可执行性”聚合，回答当前批次里哪些 profile 仍是 inline-ready，哪些已经落入 write-unsupported 或 source-redacted。需要定位单条 current detection 时，再读 `detections[].referenceSummary` 看该命中项是否含 reference 字段、是否仍有 inline secret，以及 resolver 当前看到的字段级状态。文本输出现在也按同一顺序组织：先看“按平台汇总”，再看“referenceStats 摘要”和“executabilityStats 摘要”，最后再展开具体 detection 里的 `reference 摘要`。对 Gemini 来说，这表示 current/effective 是先按四层 precedence 推导，再判断当前命中的 profile：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "current",
  "data": {
    "current": {
      "claude": "claude-prod",
      "gemini": "gemini-prod"
    },
    "detections": [
      {
        "platform": "claude",
        "managed": true,
        "matchedProfileId": "claude-prod",
        "currentScope": "local",
        "platformSummary": {
          "kind": "scope-precedence",
          "precedence": ["user", "project", "local"],
          "currentScope": "local",
          "facts": [
            {
              "code": "CLAUDE_SCOPE_PRECEDENCE",
              "message": "Claude 支持 user < project < local 三层 precedence。"
            },
            {
              "code": "CLAUDE_LOCAL_SCOPE_HIGHEST",
              "message": "如果存在 local，同名字段最终以 local 为准。"
            }
          ]
        },
        "targetFiles": [
          {
            "path": "C:/work/.claude/settings.local.json",
            "scope": "local"
          }
        ],
        "scopeCapabilities": [
          {
            "scope": "user",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          },
          {
            "scope": "project",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          },
          {
            "scope": "local",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          }
        ]
      },
      {
        "platform": "gemini",
        "managed": true,
        "matchedProfileId": "gemini-prod",
        "currentScope": "user",
        "platformSummary": {
          "kind": "scope-precedence",
          "precedence": ["system-defaults", "user", "project", "system-overrides"],
          "currentScope": "user",
          "facts": [
            {
              "code": "GEMINI_SCOPE_PRECEDENCE",
              "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
            },
            {
              "code": "GEMINI_PROJECT_OVERRIDES_USER",
              "message": "project scope 会覆盖 user 中的同名字段。"
            }
          ]
        },
        "targetFiles": [
          {
            "path": "C:/Users/test/.gemini/settings.json",
            "scope": "user"
          }
        ],
        "scopeCapabilities": [
          {
            "scope": "system-defaults",
            "detect": true,
            "preview": true,
            "use": false,
            "rollback": false,
            "writable": false,
            "risk": "normal"
          },
          {
            "scope": "user",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "normal"
          },
          {
            "scope": "project",
            "detect": true,
            "preview": true,
            "use": true,
            "rollback": true,
            "writable": true,
            "risk": "high",
            "confirmationRequired": true
          },
          {
            "scope": "system-overrides",
            "detect": true,
            "preview": true,
            "use": false,
            "rollback": false,
            "writable": false,
            "risk": "normal"
          }
        ],
        "scopeAvailability": [
          {
            "scope": "user",
            "status": "available",
            "detected": true,
            "writable": true,
            "path": "C:/Users/test/.gemini/settings.json"
          },
          {
            "scope": "project",
            "status": "available",
            "detected": true,
            "writable": true,
            "path": "C:/work/.gemini/settings.json"
          }
        ]
      },
      {
        "platform": "codex",
        "managed": true,
        "matchedProfileId": "codex-prod",
        "platformSummary": {
          "kind": "multi-file-composition",
          "composedFiles": [
            "C:/Users/test/.codex/config.toml",
            "C:/Users/test/.codex/auth.json"
          ],
          "facts": [
            {
              "code": "CODEX_MULTI_FILE_CONFIGURATION",
              "message": "Codex 当前由 config.toml 与 auth.json 共同组成有效配置。"
            },
            {
              "code": "CODEX_CURRENT_REQUIRES_BOTH_FILES",
              "message": "current 检测不能把单个文件视为完整状态。"
            }
          ]
        },
        "targetFiles": [
          {
            "path": "C:/Users/test/.codex/config.toml",
            "role": "config"
          },
          {
            "path": "C:/Users/test/.codex/auth.json",
            "role": "auth"
          }
        ]
      }
    ],
    "summary": {
      "platformStats": [
        {
          "platform": "claude",
          "profileCount": 1,
          "currentProfileId": "claude-prod",
          "detectedProfileId": "claude-prod",
          "managed": true,
          "currentScope": "local",
          "platformSummary": {
            "kind": "scope-precedence",
            "precedence": ["user", "project", "local"],
            "currentScope": "local",
            "facts": [
              {
                "code": "CLAUDE_SCOPE_PRECEDENCE",
                "message": "Claude 支持 user < project < local 三层 precedence。"
              },
              {
                "code": "CLAUDE_LOCAL_SCOPE_HIGHEST",
                "message": "如果存在 local，同名字段最终以 local 为准。"
              }
            ]
          }
        },
        {
          "platform": "gemini",
          "profileCount": 1,
          "currentProfileId": "gemini-prod",
          "detectedProfileId": "gemini-prod",
          "managed": true,
          "currentScope": "user",
          "platformSummary": {
            "kind": "scope-precedence",
            "precedence": ["system-defaults", "user", "project", "system-overrides"],
            "currentScope": "user",
            "facts": [
              {
                "code": "GEMINI_SCOPE_PRECEDENCE",
                "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
              },
              {
                "code": "GEMINI_PROJECT_OVERRIDES_USER",
                "message": "project scope 会覆盖 user 中的同名字段。"
              }
            ]
          }
        },
        {
          "platform": "codex",
          "profileCount": 1,
          "currentProfileId": "codex-prod",
          "detectedProfileId": "codex-prod",
          "managed": true,
          "platformSummary": {
            "kind": "multi-file-composition",
            "composedFiles": [
              "C:/Users/test/.codex/config.toml",
              "C:/Users/test/.codex/auth.json"
            ],
            "facts": [
              {
                "code": "CODEX_MULTI_FILE_CONFIGURATION",
                "message": "Codex 当前由 config.toml 与 auth.json 共同组成有效配置。"
              },
              {
                "code": "CODEX_CURRENT_REQUIRES_BOTH_FILES",
                "message": "current 检测不能把单个文件视为完整状态。"
              }
            ]
          }
        }
      ],
      "warnings": [],
      "limitations": []
    }
  }
}
```

`preview --json` 的语义是“先按平台 precedence 推导 effective config，再评估本次写入目标”。成功时也会返回 `scopePolicy`，把“请求了哪一层、最终解析到哪一层、是否高风险、回滚是否要求同 scope”稳定暴露给机器消费方。单平台命令也统一提供 `data.summary.platformStats[]`；对 `preview` 来说，成功态同样会补齐 `data.summary.referenceStats` 与 `data.summary.executabilityStats`，让脚本先做平台级聚合、secret/reference 治理聚合和写入可执行性聚合，再决定是否展开 `preview/scopePolicy/scopeCapabilities/scopeAvailability`。文本输出也按这个顺序组织：先看“按平台汇总”，再看“referenceStats 摘要”和“executabilityStats 摘要”，最后进入 preview 细节。当显式请求 Gemini `project scope` 时，返回里会同时给出 `scopePolicy`、`scopeCapabilities` 与当前的 `scopeAvailability`：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "preview",
  "data": {
    "profile": {
      "id": "gemini-prod",
      "platform": "gemini",
      "name": "Gemini 生产"
    },
    "preview": {
      "requiresConfirmation": true,
      "backupPlanned": true,
      "noChanges": false,
      "targetFiles": [
        {
          "path": "C:/Users/test/.gemini/settings.json",
          "scope": "project"
        }
      ]
    },
    "risk": {
      "allowed": false,
      "riskLevel": "high",
      "reasons": [
        "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。"
      ],
      "limitations": [
        "GEMINI_API_KEY 仍需通过环境变量生效。"
      ]
    },
    "summary": {
      "platformStats": [
        {
          "platform": "gemini",
          "profileCount": 1,
          "profileId": "gemini-prod",
          "targetScope": "project",
          "warningCount": 1,
          "limitationCount": 1,
          "changedFileCount": 1,
          "backupCreated": true,
          "noChanges": false
        }
      ],
      "warnings": [
        "高风险操作需要确认"
      ],
      "limitations": [
        "Gemini 最终认证结果仍受环境变量影响。"
      ]
    },
    "scopePolicy": {
      "requestedScope": "project",
      "resolvedScope": "project",
      "defaultScope": "user",
      "explicitScope": true,
      "highRisk": true,
      "riskWarning": "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。",
      "rollbackScopeMatchRequired": true
    },
    "scopeAvailability": [
      {
        "scope": "project",
        "status": "available",
        "detected": true,
        "writable": true,
        "path": "C:/work/.gemini/settings.json"
      }
    ],
    "scopeCapabilities": [
      {
        "scope": "project",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true,
        "risk": "high",
        "confirmationRequired": true
      }
    ],
    "summary": {
      "platformStats": [
        {
          "platform": "gemini",
          "profileCount": 1,
          "profileId": "gemini-prod",
          "targetScope": "project",
          "warningCount": 1,
          "limitationCount": 1,
          "changedFileCount": 1,
          "backupCreated": true,
          "noChanges": false
        }
      ],
      "warnings": [
        "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。"
      ],
      "limitations": [
        "GEMINI_API_KEY 仍需通过环境变量生效。"
      ]
    }
  }
}
```

`use --json` 成功时除了 `scopeCapabilities` 与 `scopeAvailability`，还会返回 `platformSummary`。同时，`data.summary.platformStats[]`、`data.summary.referenceStats`、`data.summary.executabilityStats` 也会一起给出稳定 summary 入口。推荐机器消费方先读 `summary.platformStats[0]`，再读 `summary.referenceStats` 和 `summary.executabilityStats` 做 secret 形态与写入可执行性判断，最后再展开 `platformSummary` 与 `preview` 细节。文本输出也按这个顺序组织：先看“按平台汇总”，再看“referenceStats 摘要”和“executabilityStats 摘要”，最后再进入写入细节。

`use --json` 需要区分成功态和确认门槛失败态。成功时会把平台 precedence / 多文件组合语义和本次写入结果一起交给机器消费方；失败时，`error.details` 里会带结构化的 `risk`、`scopePolicy`、`scopeCapabilities`、`scopeAvailability`。如果失败同时涉及 secret/reference 治理，机器消费方应读取 `error.details.referenceGovernance`，不要从失败 envelope 里寻找 `summary.referenceStats`。推荐失败读取顺序是 `error.code` -> `error.details.referenceGovernance.primaryReason/reasonCodes` -> `error.details.referenceGovernance.referenceDetails[]` -> `risk/scope/validation` 细节：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "use",
  "data": {
    "profile": {
      "id": "gemini-prod",
      "platform": "gemini",
      "name": "Gemini 生产"
    },
    "backupId": "snapshot-gemini-001",
    "changedFiles": [
      "C:/work/.gemini/settings.json"
    ],
    "noChanges": false,
    "platformSummary": {
      "kind": "scope-precedence",
      "precedence": [
        "system-defaults",
        "user",
        "project",
        "system-overrides"
      ],
      "currentScope": "project",
      "facts": [
        {
          "code": "GEMINI_SCOPE_PRECEDENCE",
          "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
        },
        {
          "code": "GEMINI_PROJECT_OVERRIDES_USER",
          "message": "project scope 会覆盖 user 中的同名字段。"
        }
      ]
    },
    "scopeAvailability": [
      {
        "scope": "project",
        "status": "available",
        "detected": true,
        "writable": true,
        "path": "C:/work/.gemini/settings.json"
      }
    ],
    "scopeCapabilities": [
      {
        "scope": "user",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true,
        "risk": "normal"
      },
      {
        "scope": "project",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true,
        "risk": "high",
        "confirmationRequired": true
      }
    ]
  }
}
```

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": false,
  "action": "use",
  "warnings": [
    "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。"
  ],
  "limitations": [
    "GEMINI_API_KEY 仍需通过环境变量生效。"
  ],
  "error": {
    "code": "CONFIRMATION_REQUIRED",
    "message": "当前切换需要确认或 --force。",
    "details": {
      "referenceGovernance": {
        "hasReferenceProfiles": false,
        "hasInlineProfiles": true,
        "hasWriteUnsupportedProfiles": false,
        "primaryReason": "INLINE_SECRET_PRESENT",
        "reasonCodes": [
          "INLINE_SECRET_PRESENT"
        ],
        "referenceDetails": [
          {
            "code": "REFERENCE_ENV_UNRESOLVED",
            "field": "apiKey",
            "status": "missing",
            "reference": "env://GEMINI_API_KEY",
            "scheme": "env",
            "message": "引用 env://GEMINI_API_KEY 当前未解析，写入前仍需要人工确认。"
          },
          {
            "code": "REFERENCE_ENV_RESOLVED",
            "field": "secondaryApiKey",
            "status": "resolved",
            "reference": "env://GEMINI_SECONDARY_API_KEY",
            "scheme": "env",
            "message": "引用 env://GEMINI_SECONDARY_API_KEY 可在当前环境解析，但写入链路不会直接写入真实 secret。"
          }
        ]
      },
      "risk": {
        "allowed": false,
        "riskLevel": "high",
        "reasons": [
          "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。"
        ],
        "limitations": [
          "GEMINI_API_KEY 仍需通过环境变量生效。"
        ]
      },
      "scopePolicy": {
        "requestedScope": "project",
        "resolvedScope": "project",
        "defaultScope": "user",
        "explicitScope": true,
        "highRisk": true,
        "riskWarning": "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。",
        "rollbackScopeMatchRequired": true
      },
      "scopeCapabilities": [
        {
          "scope": "project",
          "detect": true,
          "preview": true,
          "use": true,
          "rollback": true,
          "writable": true,
          "risk": "high",
          "confirmationRequired": true
        }
      ],
      "scopeAvailability": [
        {
          "scope": "project",
          "status": "available",
          "detected": true,
          "writable": true,
          "path": "C:/work/.gemini/settings.json"
        }
      ]
    }
  }
}
```

对应的非 JSON 文本输出也会直接展示 `referenceDetails[]` 聚合后的失败摘要：

```text
[use] 失败
当前切换需要确认或 --force。
reference 解析摘要:
  - 未解析 env 引用:
    - apiKey -> env://GEMINI_API_KEY
      引用 env://GEMINI_API_KEY 当前未解析，写入前仍需要人工确认。
  - 已解析但当前不会写入:
    - secondaryApiKey -> env://GEMINI_SECONDARY_API_KEY
      引用 env://GEMINI_SECONDARY_API_KEY 可在当前环境解析，但写入链路不会直接写入真实 secret。
```

`rollback --json` 成功时也会返回 `platformSummary`。同时，`data.summary.platformStats[]`、`data.summary.referenceStats`、`data.summary.executabilityStats` 也会一起给出稳定 summary 入口。推荐先读 `summary.platformStats[0]` 理解本次恢复涉及的平台、scope 与 warning/limitation 计数，再读 `summary.referenceStats` 与 `summary.executabilityStats` 理解快照上一版 profile 的 secret 形态与写入可执行性，再决定是否展开 `rollback` 明细。文本输出也按这个顺序组织：先看“按平台汇总”，再看“referenceStats 摘要”和“executabilityStats 摘要”，最后再进入恢复细节。

`rollback --json` 也分成功和失败两类。成功时会同时带上快照里的 `scopePolicy`、当前平台 `scopeCapabilities` 和当前环境里的 `scopeAvailability`；如果 Gemini 请求 scope 与快照 scope 不匹配，或 project scope 当前不可解析，则返回结构化失败对象：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "rollback",
  "data": {
    "backupId": "snapshot-gemini-001",
    "restoredFiles": [
      "C:/work/.gemini/settings.json"
    ],
    "platformSummary": {
      "kind": "scope-precedence",
      "precedence": [
        "system-defaults",
        "user",
        "project",
        "system-overrides"
      ],
      "currentScope": "project",
      "facts": [
        {
          "code": "GEMINI_SCOPE_PRECEDENCE",
          "message": "Gemini 按 system-defaults < user < project < system-overrides 推导最终生效值。"
        },
        {
          "code": "GEMINI_PROJECT_OVERRIDES_USER",
          "message": "project scope 会覆盖 user 中的同名字段。"
        }
      ]
    },
    "scopePolicy": {
      "requestedScope": "project",
      "resolvedScope": "project",
      "defaultScope": "user",
      "explicitScope": true,
      "highRisk": true,
      "riskWarning": "Gemini 写入目标从默认 user scope 切换到 project scope；project 会覆盖 user，同名字段将影响当前项目。",
      "rollbackScopeMatchRequired": true
    },
    "scopeCapabilities": [
      {
        "scope": "project",
        "detect": true,
        "preview": true,
        "use": true,
        "rollback": true,
        "writable": true,
        "risk": "high",
        "confirmationRequired": true
      }
    ],
    "scopeAvailability": [
      {
        "scope": "project",
        "status": "available",
        "detected": true,
        "writable": true,
        "path": "C:/work/.gemini/settings.json"
      }
    ],
    "summary": {
      "platformStats": [
        {
          "platform": "gemini",
          "profileCount": 1,
          "targetScope": "project",
          "warningCount": 1,
          "limitationCount": 1,
          "restoredFileCount": 1,
          "noChanges": false
        }
      ],
      "warnings": [
        "已恢复快照中的托管文件"
      ],
      "limitations": [
        "回滚仅恢复快照覆盖的托管文件。"
      ]
    }
  }
}
```

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": false,
  "action": "rollback",
  "error": {
    "code": "ROLLBACK_SCOPE_MISMATCH",
    "message": "快照属于 user scope，不能按 project scope 回滚。",
    "details": {
      "scopePolicy": {
        "requestedScope": "project",
        "resolvedScope": "user",
        "defaultScope": "user",
        "explicitScope": true,
        "highRisk": true,
        "rollbackScopeMatchRequired": true
      },
      "scopeCapabilities": [
        {
          "scope": "project",
          "detect": true,
          "preview": true,
          "use": true,
          "rollback": true,
          "writable": true,
          "risk": "high",
          "confirmationRequired": true
        }
      ],
      "scopeAvailability": [
        {
          "scope": "project",
          "status": "available",
          "detected": true,
          "writable": true,
          "path": "C:/work/.gemini/settings.json"
        }
      ]
    }
  }
}
```

## 说明

当前版本已经把首发所需的核心闭环落地，后续迭代重点主要是增强能力，而不是补回缺失的基础命令：

- Claude 真实契约细化
- Gemini 多作用域真实契约
- 更完整的导入导出与交互式体验

## Gemini 说明

Gemini 当前采用双轨语义：

- 稳定支持：官方确认的 `settings.json` 字段与运行时环境变量认证。
- 实验性支持：自定义网关 / `base URL` 仅做显式实验性表达，不会默认伪装成稳定托管字段。

当前还支持 scope-aware 检测，但写入策略仍然保守，并严格区分“参与检测/预览推导”和“可作为写入目标”：

- 检测范围：`system-defaults`、`user`、`project`、`system-overrides`
- 生效优先级：`system-defaults < user < project < system-overrides`
- `current` 会按这四层合并后判断当前生效配置，并告诉你当前是哪一层在生效。
- `preview` 会先基于四层 precedence 推导 effective config，再展示“如果这次写入目标 scope，会发生什么”；`system-defaults` / `system-overrides` 只参与 effective config，不可作为写入目标。
- `use` / `rollback` 默认只操作 `user scope` 对应的 `settings.json`。
- `project scope` 写入已开放，但必须显式指定；`system-defaults` 和 `system-overrides` 仍然只检测、不写入。

这意味着：

- `GEMINI_API_KEY` 会被解释为运行时生效的 env auth，而不是普通文件字段。
- `GEMINI_BASE_URL` 如果存在，会被标记为 experimental。
- `rollback` 只恢复实际写入并备份过的文件内容，不恢复环境变量。
- 即使 `user scope` 被成功写入，如果更高优先级的 `project` 或 `system-overrides` 中存在同名字段，最终生效值仍可能不是 user 写入的结果。

### Gemini scope 写入

默认写入仍然是 `user scope`：

```bash
api-switcher preview gemini-prod
api-switcher use gemini-prod --force
api-switcher rollback <backupId>
```

如果需要写入当前项目的 Gemini 配置，可以显式指定 `project scope`：

```bash
api-switcher preview gemini-prod --scope project
api-switcher use gemini-prod --scope project --force
api-switcher rollback <backupId> --scope project
```

`project scope` 写入是显式 opt-in：

- `preview --scope project` 会把风险升级为 `high`，因为 `project` 会覆盖 `user`，同名字段会影响当前项目。
- `use --scope project` 没有 `--force` 时会被确认门槛拦截。
- `use --scope project --force` 只备份并写入 project scope 对应的 `.gemini/settings.json`，不会改 user scope。
- `rollback <backupId> --scope project` 会按快照中的 project 文件恢复；如果快照 scope 和指定 scope 不一致，会拒绝回滚。
- 如果当前 project root 不可解析，`preview/use/rollback --scope project --json` 会先暴露 `scopeAvailability.project.status = "unresolved"`；即使顶层错误码是通用失败码，也不应再把它解释成确认门槛失败。

## Claude 说明

Claude 当前支持三层 scope：

- `user`
- `project`
- `local`

Claude 的规则是：

- CLI 显式传入的 `--scope` 优先级最高。
- 如果没有传 `--scope`，才会回落到 `API_SWITCHER_CLAUDE_TARGET_SCOPE` 作为默认值。
- 如果 CLI 和环境变量都没有提供，则默认使用 `user scope`。

这意味着环境变量现在只负责“默认值”，不再是唯一入口。

### Claude scope 写入

默认情况下，如果环境变量里设置了：

```bash
API_SWITCHER_CLAUDE_TARGET_SCOPE=project
```

那么：

```bash
api-switcher preview claude-prod
api-switcher use claude-prod --force
api-switcher rollback <backupId>
```

会按 `project scope` 执行。

如果你想在某次操作里显式覆盖这个默认值，可以直接传 CLI 参数：

```bash
api-switcher preview claude-prod --scope user
api-switcher use claude-prod --scope local --force
api-switcher rollback <backupId> --scope local
```

对应语义：

- `--scope user` 只操作用户级 Claude 配置文件。
- `--scope project` 只操作项目级 Claude 配置文件。
- `--scope local` 只操作 `settings.local.json`。
- `rollback --scope <scope>` 会按快照记录的 scope 恢复对应文件；当前 Claude 不强制 scope mismatch 拒绝，Gemini 会强制校验。
