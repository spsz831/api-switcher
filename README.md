# api-switcher

多平台 API 配置切换 CLI，支持 Claude Code、Codex、Gemini CLI 的配置管理。

- `preview / use / rollback / current / list / validate / export / add / schema / import`
- 所有命令支持 `--json` 输出，提供稳定公共 JSON contract
- 支持 Gemini `project scope` 显式写入、独立快照和严格回滚

## 安装

要求 Node.js `>=22`，`pnpm` 或 `corepack`。

```bash
corepack enable
pnpm install
pnpm build
```

开发源码 CLI：

```bash
pnpm dev -- --help
```

构建后运行：

```bash
node dist/src/cli/index.js --help
```

全局安装：

```bash
pnpm link --global
api-switcher --help
```

发布前一键验证：

```bash
corepack pnpm smoke:release
```

## 快速开始

### 1. 添加 profile

```bash
api-switcher add --platform gemini --name "Gemini 生产" --key "$GEMINI_API_KEY"
```

Reference-only 模式（不存明文）：

```bash
api-switcher add --platform codex --name "Codex 生产" --secret-ref "env://CODEX_API_KEY" --auth-reference "env://CODEX_API_KEY" --url "https://gateway.example.com/openai/v1"
```

### 2. 先预览，不直接写入

```bash
api-switcher preview gemini
api-switcher preview gemini --json
```

### 3. 确认后写入

```bash
api-switcher use gemini
```

Gemini project scope 需要显式确认：

```bash
api-switcher preview gemini --scope project
api-switcher use gemini --scope project --force
```

### 4. 查看当前状态

```bash
api-switcher current
api-switcher list
```

### 5. 回滚

```bash
api-switcher rollback <backupId>
api-switcher rollback <backupId> --scope project
```

## 首次使用建议

1. `list` 看已有 profile，或 `add` 创建
2. 先跑 `preview`，确认目标路径、风险等级
3. 再执行 `use`，不要跳过预览
4. 写入后立即跑 `current` 确认
5. 记下 `backupId`，确保知道如何 `rollback`

接入自动化脚本或上层 UI 时，直接看 [docs/public-json-schema.md](docs/public-json-schema.md) 和 [docs/public-json-output.schema.json](docs/public-json-output.schema.json)，不要从 README 文本摘要反推契约。

## 命令概览

| 命令 | 说明 |
| --- | --- |
| `preview <selector>` | 预览写入效果，不修改文件 |
| `use <selector>` | 执行写入，支持 `--dry-run` |
| `rollback [backupId]` | 从备份恢复 |
| `current` | 查看当前生效配置 |
| `list` | 列出所有 profile |
| `validate [selector]` | 校验 profile 配置有效性 |
| `add --platform <p> --name <n>` | 添加 profile（支持 `--key` 或 `--secret-ref`） |
| `export` | 导出所有 profile（默认脱敏） |
| `import preview <file>` | 导入预览，不做写入 |
| `import apply <file> --profile <id>` | 导入并写入，支持 `--dry-run`、`--profiles` 批量 |
| `schema` | 输出 schema catalog，支持 `--json`、`--consumer-profile`、`--action`、`--catalog-summary` |

`--scope` 支持：

| 平台 | 可写 scope | 说明 |
| --- | --- | --- |
| Claude | `user`, `project`, `local` | 三层独立读写 |
| Gemini | `user`, `project` | project 为高风险，需 `--force` |
| Codex | 无 | 直接写入双文件目标 |

## JSON 输出

所有 `--json` 命令返回统一 envelope：

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

失败态：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": false,
  "action": "use",
  "error": {
    "code": "CONFIRMATION_REQUIRED",
    "message": "需要确认后才能继续。",
    "details": {}
  }
}
```

完整字段说明、error code 词典、consumer profiles 系统和 machine-readable schema 见 [docs/public-json-schema.md](docs/public-json-schema.md)。

## 运行时目录

```text
~/.api-switcher/
  profiles.json
  state.json
  backups/
```

环境变量覆盖：

- `API_SWITCHER_RUNTIME_DIR` — 运行时目录
- `API_SWITCHER_CLAUDE_SETTINGS_PATH` — Claude 配置路径

开发态设置 `API_SWITCHER_RUNTIME_DIR` 后，默认将平台目标文件重定向到沙箱，防止误写真实用户目录。要写真实目录需显式设置 `API_SWITCHER_ALLOW_REAL_USER_TARGETS=1` 或 `API_SWITCHER_DISABLE_DEVELOPMENT_SANDBOX=1`。

## 开发

```bash
pnpm install
pnpm build
pnpm test
pnpm dev -- <command>   # 自动注入沙箱运行时目录
```

## 平台说明

### Gemini

四层 precedence：`system-defaults < user < project < system-overrides`

- `user` scope 为默认写入目标
- `project` scope 为高风险 opt-in，必须 `--scope project --force`
- `system-defaults` / `system-overrides` 只参与检测，不可写入
- `rollback` 严格校验 scope 匹配，不匹配会拒绝恢复

### Claude

三层 scope：`user < project < local`

- CLI `--scope` 优先，其次 `API_SWITCHER_CLAUDE_TARGET_SCOPE` 环境变量，最后默认 `user`
- `local` scope 为更高敏感度写入目标，会额外触发确认门槛

### Codex

无 scope 概念，直接写入 `config.toml` 与 `auth.json`。

## 当前版本

**v0.1.3** — 已具备可试用的核心闭环：

- 三大平台真实适配链路
- `import preview` / `import apply`（单条 + 同平台批量）
- Schema catalog consumer profiles 系统（3 条共享画像 + starter templates + starter recipes）
- Reference governance（`env://` 方案解析 + `--secret-ref` 输入）
- `--dry-run` 覆盖 `use` / `import apply`
- 稳定公共 JSON contract + machine-readable schema

后续方向：扩展 reference resolver scheme 支持、跨平台导入导出增强、交互式体验。

## 文档导航

| 文档 | 用途 |
| --- | --- |
| [docs/public-json-schema.md](docs/public-json-schema.md) | JSON 字段语义与契约边界 |
| [docs/public-json-output.schema.json](docs/public-json-output.schema.json) | 机器可读 JSON Schema |
| [docs/import-preview-consumer-guide.md](docs/import-preview-consumer-guide.md) | `import preview` 消费指南 |
| [docs/release-checklist.md](docs/release-checklist.md) | 发布前验收清单 |
| [CHANGELOG.md](CHANGELOG.md) | 版本变更记录 |