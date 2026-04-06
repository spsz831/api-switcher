# api-switcher

一个面向 Claude Code、Codex、Gemini CLI 的多平台 API 配置切换工具。

## 当前阶段

当前仓库已完成首轮工程骨架与核心主链路：

- 统一类型与运行时目录
- `profiles.json` / `state.json` / `backups/` store
- adapter registry
- `preview / use / rollback` 服务编排
- Claude 首条真实单文件链路
- Codex / Gemini adapter skeleton
- 基础单元测试与集成测试

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

- `preview <selector>`
- `use <selector>`
- `rollback [backupId]`
- `current`
- `list`
- `validate [selector]`
- `add --platform <platform> --name <name> --key <key> [--url <url>]`
- `export`

## 说明

首轮实现重点是把可扩展骨架和 `preview -> use -> rollback` 闭环先跑通，后续会继续补齐：

- Claude 真实契约细化
- Codex 多文件写入
- Gemini 真实配置契约
- 更完整的导入导出与交互式体验
