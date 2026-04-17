# api-switcher

一个面向 Claude Code、Codex、Gemini CLI 的多平台 API 配置切换工具。

## 文档导航

- [`README.md`](README.md)：命令入口、能力概览和可直接复制的 JSON 示例。
- [`docs/public-json-schema.md`](docs/public-json-schema.md)：稳定公共 JSON 字段、字段语义和命令级契约边界。
- [`docs/public-json-output.schema.json`](docs/public-json-output.schema.json)：机器可读的公共 JSON schema。
- [`docs/import-preview-consumer-guide.md`](docs/import-preview-consumer-guide.md)：`import preview` 的 mixed-batch 接入实践、失败处理建议和 explainable 词典。
- [`docs/README.md`](docs/README.md)：`docs/` 目录文档索引。

## 当前阶段

当前仓库已完成首轮工程骨架与核心主链路：

- 统一类型与运行时目录
- `profiles.json` / `state.json` / `backups/` store
- adapter registry
- `preview / use / rollback` 服务编排
- Claude 真实单文件链路
- Codex 真实双文件链路
- Gemini 官方稳定契约链路（`settings.json` + env auth）
- Gemini 实验性代理扩展语义（显式标注，不默认宣称稳定托管）
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

- `preview <selector> [--scope <scope>]`
- `use <selector> [--scope <scope>]`
- `rollback [backupId] [--scope <scope>]`
- `current`
- `list`
- `validate [selector]`
- `add --platform <platform> --name <name> --key <key> [--url <url>]`
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
- `import apply <file> --profile <id>` 当前仅支持 Gemini 且一次只应用单个 profile；apply 相关决策以本地实时 observation 为准。

也可以通过 CLI 直接查看当前 public JSON schema：

```bash
api-switcher schema --json
```

如果只需要脚本化检查当前 public JSON schema 版本，可使用更轻量的版本输出：

```bash
api-switcher schema --schema-version --json
```

### JSON 输出示例

`list --json` 会在每个 profile 条目上带出所属平台的 `scopeCapabilities`；Gemini 还会带出当前环境里的 `scopeAvailability`：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "list",
  "data": {
    "profiles": [
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
      }
    ],
    "summary": {
      "warnings": [],
      "limitations": []
    }
  }
}
```

`validate --json` 与 `export --json` 也是按条目输出 `scopeCapabilities`；其中 `export` 额外输出默认写入目标、观测时间，Gemini 还会携带 `scopeAvailability`：

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
      "warnings": [],
      "limitations": []
    }
  }
}
```

这里的 `observedAt` 和 `scopeAvailability` 只表示导出机当时的环境观察；`import` 相关流程必须重新解析本地 Gemini `project scope` 是否可用，不能把导出文件当成可直接执行的环境真相。

`import preview` 用来显式比较“导出时观察”和“当前本地观察”：

```bash
api-switcher import preview exported.json
api-switcher import preview exported.json --json
```

约定：

- `import preview` 不会写回任何配置文件。
- `exportedObservation` 只是历史观察；真正与后续 apply 设计相关的判断，必须以 `localObservation` 为准。
- 即使导出文件里记录了 Gemini `project scope = available`，如果导入机本地现在解析为 `unresolved`，也只会得到 fidelity mismatch，不会进入写入路径。
- 如果导入文件缺少 `schemaVersion`，CLI 会进入兼容模式读取，并在 `sourceCompatibility` / 文本摘要里明确提示。

`import apply` 负责真正写入，当前 contract 边界如下：

- 命令语法：`api-switcher import apply <file> --profile <id> [--scope <scope>] [--force] [--json]`
- Gemini-only：只支持 Gemini 导入应用。
- 单 profile 边界：必须显式传 `--profile`，每次仅处理一个 profile。
- local-first apply rule：是否允许 apply 以本地实时 observation 为准，不以导出观察直接决策。
- gate 顺序固定为 availability-before-confirmation：先判断 `scopeAvailability`，再判断是否需要 `--force`。
- rollback provenance：成功 apply 的快照会记录 `origin=import-apply`、`sourceFile`、`importedProfileId`，回滚绑定这组来源信息。
- machine-readable schema 仅对 `import-apply` 做 action-specific envelope 校验：成功态约束 `data`，失败态只约束稳定 `error.details` 联合，避免过度冻结 adapter 私有字段。

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

其中：

- `driftKind` 用来标明漂移类型，目前会区分默认写入作用域漂移、scope availability 漂移、scope capability 漂移。
- `severity` 表示该漂移对后续 apply 设计的影响等级；例如 Gemini `project scope` 的 availability 漂移会被标为 `blocking`。
- `exportedValue` / `localValue` 提供 item 级原始对比证据；`groupedMismatches`、`previewDecision.reasonCodes`、`summary.decisionCodeStats`、`summary.driftKindStats` 则分别承担单条分组、单条决策、整批决策聚合、整批 drift 聚合。
- mixed-batch 接入时，推荐先看 `summary.decisionCodeStats` 与 `summary.driftKindStats`，再按需展开 `items[]`。
- 更完整的字段词典、推荐消费顺序和失败处理建议见 [`docs/import-preview-consumer-guide.md`](docs/import-preview-consumer-guide.md)；稳定字段定义见 [`docs/public-json-schema.md`](docs/public-json-schema.md)。

`add --json` 的 `scopeCapabilities` 在成功摘要顶层 `data`，不是挂在 `preview` 或 `validation` 子对象里：

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

`current --json` 会在 `detections[]` 里同时返回当前生效来源 `currentScope`、平台 `scopeCapabilities` 与当前环境里的 `scopeAvailability`；对 Gemini 来说，这表示 current/effective 是先按四层 precedence 推导，再判断当前命中的 profile：

```json
{
  "schemaVersion": "2026-04-15.public-json.v1",
  "ok": true,
  "action": "current",
  "data": {
    "current": {
      "gemini": "gemini-prod"
    },
    "detections": [
      {
        "platform": "gemini",
        "managed": true,
        "matchedProfileId": "gemini-prod",
        "currentScope": "user",
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
      }
    ],
    "summary": {
      "warnings": [],
      "limitations": []
    }
  }
}
```

`preview --json` 的语义是“先按平台 precedence 推导 effective config，再评估本次写入目标”。当显式请求 Gemini `project scope` 时，返回里会同时给出 `scopeCapabilities` 与当前的 `scopeAvailability`：

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
      "warnings": [
        "高风险操作需要确认"
      ],
      "limitations": [
        "Gemini 最终认证结果仍受环境变量影响。"
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

`use --json` 需要区分成功态和确认门槛失败态。成功时，`data.scopeCapabilities` 与 `data.scopeAvailability` 共同说明“平台支持什么”和“当前环境里能不能真写”；失败时，`error.details` 里会带结构化的 `risk`、`scopePolicy`、`scopeCapabilities`、`scopeAvailability`：

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

`rollback --json` 也分成功和失败两类。成功时会带快照里的 `scopePolicy`、当前平台 `scopeCapabilities` 和当前环境里的 `scopeAvailability`；如果 Gemini 请求 scope 与快照 scope 不匹配，或 project scope 当前不可解析，则返回结构化失败对象：

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

当前实现重点仍然是把可扩展骨架和 `preview -> use -> rollback` 闭环做扎实，后续会继续补齐：

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
