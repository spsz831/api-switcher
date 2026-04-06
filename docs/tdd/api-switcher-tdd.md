# api-switcher 技术设计文档（TDD）

## 文档信息

| 版本 | 时间 | 更新人 | 内容 | 位置 |
|:-----|:-----|:-------|:-----|:-----|
| 1.0 | 2026-04-04 | Claude × 用户 | 基于现有 PRD 产出首版 TDD，明确架构、模块边界、数据结构、目录设计、核心链路、适配器、写入策略、备份回滚、测试与发布准备 | - |

## 关联文档

- PRD：`docs/prd/api-switcher-prd.md`
- 原型：`prototype/api-switcher-prd-prototype.html`

---

# 一、设计目标与边界

## 1.1 设计目标

本 TDD 的目标不是描述“产品想做什么”，而是把 PRD 中已经确认的方向落成一套可编码、可测试、可发布的技术方案。

首版实现必须满足：

1. 支持 `Claude Code`、`Codex`、`Gemini CLI` 三类平台适配入口。
2. 以统一配置中心为单一事实来源（Single Source of Truth）。
3. 在 `preview / validate / use / rollback` 上形成完整闭环。
4. 对本地配置写入保持可解释、可恢复、可扩展。
5. 保证后续新增平台时主要新增 adapter，而不是重写命令层。

## 1.2 非目标

本阶段明确不做：

- 远程同步
- 云账户体系
- 图形化界面
- 自动测速与自动切换
- 团队共享配置
- 在线密钥托管

## 1.3 设计原则

- **单一配置源**：用户档案统一存于 `profiles.json`。
- **运行态分离**：当前状态、切换历史、快照索引独立存储。
- **适配器隔离**：平台差异封装在 adapter 内，不向命令层扩散。
- **先预检后写入**：写入前必须完成 validate、preview、必要确认与备份。
- **最小破坏写入**：尽量保留用户原有非托管字段，避免整体覆盖。
- **原子更新**：目标文件写入优先采用临时文件替换，降低半写入风险。
- **失败可恢复**：任一写入阶段失败，都应有明确回滚路径或中止策略。

---

# 二、实现范围与技术基线

## 2.1 实现范围

首版 TDD 覆盖以下实现层：

- CLI 命令层
- 应用服务层
- 平台适配层
- 配置与状态存储层
- 文件写入与快照恢复层
- 输出渲染与退出码层
- 测试、打包与发布准备

## 2.2 技术基线建议

建议采用以下实现基线：

- 语言：TypeScript
- 运行时：Node.js LTS
- 包管理器：pnpm
- CLI 框架：Commander 或同级成熟命令框架
- 校验：Zod 或同级 schema 校验库
- 文件格式支持：JSON 为主，按平台补充 TOML 读写能力
- 测试：Vitest
- 构建：tsup / tsx / tsc 中选择轻量稳定方案

## 2.3 运行目录基线

工具自身运行态统一存放于用户主目录下的应用目录：

```text
~/.api-switcher/
  profiles.json
  state.json
  backups/
  logs/
```

说明：
- Windows、macOS、Linux 统一以 `os.homedir()` 作为根目录解析起点。
- 路径展示层可输出平台原生形式，内部处理统一使用标准路径工具。

---

# 三、总体架构

## 3.1 架构分层

```text
CLI Commands
    ↓
Application Services
    ↓
Adapter Registry
    ↓
Platform Adapters
    ↓
Target File Readers/Writers

Config Store / State Store / Snapshot Store
        ↑
 Shared Types / Risk Engine / Output Renderer
```

## 3.2 分层职责

### 3.2.1 CLI 命令层

负责：
- 参数解析
- 调用服务层
- 控制输出格式（文本 / JSON）
- 退出码映射

不负责：
- 平台字段映射
- 文件读写细节
- 快照文件结构细节

### 3.2.2 应用服务层

负责：
- 组织完整业务流程
- 串联 validate / preview / backup / apply / rollback
- 聚合多模块结果并返回统一响应对象

不负责：
- 具体平台文件格式解析

### 3.2.3 平台适配层

负责：
- 平台目标文件定位
- 当前配置读取与规范化
- source/apply 到平台配置格式的映射
- 平台特定风险检查
- 平台特定写入与回滚

### 3.2.4 存储层

负责：
- 读取与写入 `profiles.json`
- 读取与写入 `state.json`
- 管理 `backups/` 快照目录

### 3.2.5 共享基础层

负责：
- 脱敏
- 差异计算
- 原子写入
- 路径处理
- 时间戳与 ID 生成
- 风险码定义
- 统一错误模型

## 3.3 核心设计判断

### 3.3.1 命令层不直连 adapter

命令层只调用服务层，避免：
- 重复流程编排
- 不同命令之间的校验逻辑漂移
- 交互输出与平台逻辑混杂

### 3.3.2 adapter 不直接修改统一配置源

adapter 只能处理目标平台文件与平台比对，不能直接修改 `profiles.json`。统一配置源的修改必须由配置仓储或配置服务完成。

### 3.3.3 预览与切换共用一条风险管线

`preview`、`validate`、`use` 不各自发明规则，而应复用：
- 统一规范化结果
- 统一风险判断
- 统一差异输出模型

---

# 四、模块边界设计

## 4.1 模块清单

```text
src/
  cli/
  commands/
  services/
  adapters/
  registry/
  stores/
  domain/
  renderers/
  utils/
  types/
  constants/
```

## 4.2 模块职责说明

### 4.2.1 `cli/`

- CLI 入口
- 初始化全局异常处理
- 注册所有命令

### 4.2.2 `commands/`

建议一条命令一个文件：

- `add.command.ts`
- `list.command.ts`
- `use.command.ts`
- `current.command.ts`
- `preview.command.ts`
- `validate.command.ts`
- `rollback.command.ts`
- `export.command.ts`

职责：
- 接收参数
- 调用服务层
- 把服务层结果交给渲染器

### 4.2.3 `services/`

核心服务建议：

- `profile.service.ts`
- `switch.service.ts`
- `preview.service.ts`
- `validate.service.ts`
- `current.service.ts`
- `rollback.service.ts`
- `export.service.ts`
- `snapshot.service.ts`

职责：
- 执行业务编排
- 维护前后置步骤顺序
- 处理跨模块事务感知

### 4.2.4 `adapters/`

建议结构：

```text
adapters/
  base/
    platform-adapter.ts
  claude/
    claude.adapter.ts
    claude.mapper.ts
    claude.target-resolver.ts
    claude.parser.ts
  codex/
    codex.adapter.ts
    codex.mapper.ts
    codex.target-resolver.ts
    codex.parser.ts
  gemini/
    gemini.adapter.ts
    gemini.mapper.ts
    gemini.target-resolver.ts
    gemini.parser.ts
```

职责拆分：
- `adapter`：对外统一入口
- `mapper`：profile -> platform document model
- `target-resolver`：定位目标文件路径
- `parser`：读写平台配置格式

### 4.2.5 `registry/`

- `adapter-registry.ts`

职责：
- 根据 `platform` 获取 adapter
- 做平台是否已注册的统一判断

### 4.2.6 `stores/`

- `profiles.store.ts`
- `state.store.ts`
- `snapshot.store.ts`

职责：
- 存储读写
- 基础一致性校验
- 不承载平台逻辑

### 4.2.7 `domain/`

建议承载纯业务规则：

- `risk-engine.ts`
- `diff-engine.ts`
- `masking.ts`
- `profile-normalizer.ts`
- `exit-code.ts`

### 4.2.8 `renderers/`

- `text-renderer.ts`
- `json-renderer.ts`

职责：
- 将统一响应对象渲染为 CLI 输出
- 不参与业务判断

---

# 五、数据结构设计

## 5.1 统一配置模型

```ts
interface ProfilesFile {
  version: number
  profiles: Profile[]
}

interface Profile {
  id: string
  name: string
  platform: PlatformName
  source: Record<string, unknown>
  apply: Record<string, unknown>
  meta?: ProfileMeta
}

type PlatformName = 'claude' | 'codex' | 'gemini'

interface ProfileMeta {
  tags?: string[]
  riskLevel?: 'low' | 'medium' | 'high'
  healthStatus?: 'unknown' | 'valid' | 'warning' | 'invalid'
  notes?: string
  createdAt?: string
  updatedAt?: string
  lastValidatedAt?: string
}
```

## 5.2 运行态模型

```ts
interface StateFile {
  current: Partial<Record<PlatformName, string>>
  lastSwitch?: LastSwitchRecord
  snapshots?: SnapshotIndexRecord[]
}

interface LastSwitchRecord {
  platform: PlatformName
  profileId: string
  backupId: string
  time: string
  status: 'success' | 'failed'
}

interface SnapshotIndexRecord {
  backupId: string
  platform: PlatformName
  profileId?: string
  createdAt: string
  targetFiles: string[]
  status: 'available' | 'stale' | 'deleted'
}
```

## 5.3 快照模型

每个快照目录建议包含：

```text
backups/
  <platform>/
    <backupId>/
      manifest.json
      files/
        <encoded-target-1>
        <encoded-target-2>
```

对应数据结构：

```ts
interface SnapshotManifest {
  backupId: string
  platform: PlatformName
  profileId?: string
  createdAt: string
  reason: 'use' | 'rollback-before-apply' | 'manual'
  targetFiles: SnapshotTargetFile[]
}

interface SnapshotTargetFile {
  originalPath: string
  existsBeforeBackup: boolean
  checksum?: string
  storedFileName: string
}
```

## 5.4 适配器返回模型

```ts
interface ValidationResult {
  ok: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  normalizedSuggestions?: string[]
}

interface ValidationIssue {
  code: string
  level: 'error' | 'warning'
  message: string
  field?: string
}

interface PreviewResult {
  platform: PlatformName
  profileId: string
  targetFiles: TargetFileInfo[]
  effectiveFields: EffectiveField[]
  storedOnlyFields: StoredOnlyField[]
  diffSummary: DiffSummary[]
  warnings: ValidationIssue[]
  riskLevel: 'low' | 'medium' | 'high'
  requiresConfirmation: boolean
  backupPlanned: boolean
}

interface TargetFileInfo {
  path: string
  format: 'json' | 'toml' | 'env' | 'unknown'
  exists: boolean
  managedScope: 'full-file' | 'partial-fields' | 'multi-file'
}
```

## 5.5 命令统一响应模型

```ts
interface CommandResult<T = unknown> {
  ok: boolean
  action: string
  data?: T
  warnings?: string[]
  error?: {
    code: string
    message: string
    details?: unknown
  }
}
```

这样 CLI 渲染、JSON 输出、测试断言都能复用同一数据结构。

---

# 六、目录设计

## 6.1 仓库目录

```text
api-switcher/
  src/
    cli/
    commands/
    services/
    adapters/
    registry/
    stores/
    domain/
    renderers/
    utils/
    types/
    constants/
  tests/
    unit/
    integration/
    fixtures/
    e2e/
  docs/
    prd/
    tdd/
  prototype/
  scripts/
  package.json
  tsconfig.json
  vitest.config.ts
  README.md
  CHANGELOG.md
```

## 6.2 运行时目录

```text
~/.api-switcher/
  profiles.json
  state.json
  backups/
    claude/
    codex/
    gemini/
  logs/
```

## 6.3 测试夹具目录

```text
tests/fixtures/
  claude/
  codex/
  gemini/
  runtime/
```

用途：
- 模拟真实目标文件
- 验证多平台 path/format 差异
- 做快照恢复回归测试

---

# 七、核心流程设计

## 7.1 `add` 流程

```text
命令参数解析
  → 构造 Profile
  → schema 校验
  → adapter.validate(profile)
  → 写入 profiles.json
  → 输出 validate + preview 摘要
```

关键点：
- `add` 成功不等于立即切换。
- 新增后立即给出可解释结果，帮助用户确认这条配置是否靠谱。

## 7.2 `list` 流程

```text
读取 profiles.json
  → 读取 state.json
  → 合并 current / health / risk
  → 输出列表
```

## 7.3 `current` 流程

```text
读取 state.json
  → 根据平台调用 adapter.detectCurrent()
  → 与 state.current 做比对
  → 输出“当前档案 / 非托管状态 / 最近快照”
```

## 7.4 `preview` 流程

```text
解析 profile
  → 获取 adapter
  → adapter.validate(profile)
  → adapter.preview(profile)
  → risk-engine 聚合风险
  → 输出目标文件、差异、风险、备份计划
```

## 7.5 `use` 核心执行链路

```text
解析 profile
  → 读取 profiles.json
  → 获取 adapter
  → validate
  → preview
  → 风险判定
  → 必要确认
  → backup
  → apply
  → update state.json
  → 输出结果与 rollback 点
```

### 7.5.1 服务层伪流程

```ts
async function useProfile(input: UseProfileInput): Promise<CommandResult<UseProfileOutput>> {
  const profile = await profileService.resolve(input.selector)
  const adapter = adapterRegistry.get(profile.platform)

  const validation = await adapter.validate(profile)
  if (!validation.ok) return fail('VALIDATION_FAILED', validation)

  const preview = await adapter.preview(profile)
  const decision = riskEngine.evaluate(preview, validation, input)
  if (!decision.allowed) return fail('CONFIRMATION_REQUIRED', decision)

  const backup = await snapshotService.createBeforeApply(adapter, profile)
  const applyResult = await adapter.apply(profile, { backupId: backup.backupId })
  if (!applyResult.ok) return fail('APPLY_FAILED', applyResult)

  await stateStore.markCurrent(profile.platform, profile.id, backup.backupId)
  return ok({ profile, backup, preview, applyResult })
}
```

### 7.5.2 失败中断点

`use` 流程中的任何一步出现以下情况都应中断：

- profile 不存在
- adapter 未注册
- validate 返回 error
- preview 判定 high 风险且未显式确认
- backup 创建失败
- apply 写入失败
- state 更新失败

其中：
- `apply` 前失败：不应改动目标文件。
- `apply` 后但 `state` 更新失败：应提示“写入成功但状态未更新”，并给出恢复/修复建议。

## 7.6 `rollback` 流程

```text
解析 backupId
  → 读取 snapshot manifest
  → 获取 adapter
  → 预览将恢复的文件
  → 必要确认
  → 写回备份文件
  → 更新 state.json
  → 输出恢复结果
```

### 7.6.1 rollback 原则

- 回滚前也允许再创建一次“回滚前快照”。
- 默认优先支持“最近一次成功切换回滚”。
- 指定快照恢复需要明确显示来源配置和目标文件。

---

# 八、平台适配器设计

## 8.1 通用接口

建议在 PRD 契约基础上扩展为更可落地的接口：

```ts
interface PlatformAdapter {
  readonly platform: PlatformName
  readonly capabilities: PlatformCapabilities

  validate(profile: Profile): Promise<ValidationResult>
  preview(profile: Profile): Promise<PreviewResult>
  detectCurrent(): Promise<CurrentProfileResult | null>
  listTargets(): Promise<TargetFileInfo[]>
  backup(context?: BackupContext): Promise<BackupResult>
  apply(profile: Profile, context: ApplyContext): Promise<ApplyResult>
  rollback(snapshotId: string, context?: RollbackContext): Promise<RollbackResult>
}
```

## 8.2 通用适配器职责边界

adapter 必须负责：
- 找到真实目标文件
- 解析真实文件内容
- 生成目标写入内容
- 识别非托管字段
- 输出平台特定 warning
- 执行实际写入

adapter 不负责：
- 统一配置源存储
- 交互确认
- CLI 文案排版

## 8.3 ClaudeAdapter

### 8.3.1 目标

- 面向 Claude Code 的配置文件写入
- 将 `ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_BASE_URL` 等有效字段映射到实际活动配置
- 保留非本工具托管字段

### 8.3.2 关注点

- 目标文件可能是单文件 JSON 配置
- 需要识别用户额外自定义字段
- URL 可能存在 `/api` 尾缀风险提示
- `detectCurrent()` 需要通过有效字段比对，而不是简单文件全量相等

### 8.3.3 写入策略

- 解析当前文件为对象
- 仅更新受托管字段
- 保留未托管字段
- 输出受影响字段列表

## 8.4 CodexAdapter

### 8.4.1 目标

- 支持 `config.toml` 与 `auth.json` 等多文件场景
- 把统一配置拆分写入多个目标文件

### 8.4.2 关注点

- 多文件写入需统一视为一次切换事务
- preview 需要明确“将修改 2 个文件”
- rollback 必须能恢复多文件一致状态
- URL 需提示 `/v1` 或 `/openai/v1` 风险

### 8.4.3 写入策略

- 先生成所有目标文件的目标内容
- 先备份全部目标文件
- 再按统一写入事务依次落盘
- 任一失败都给出明确恢复路径

## 8.5 GeminiAdapter

### 8.5.1 目标

- 提供与 Claude/Codex 同级的平台接入能力
- 把 Gemini CLI 的真实文件契约不确定性隔离在 adapter 内部

### 8.5.2 设计原则

- adapter 接口先稳定，目标文件契约后续调研补齐
- 若某些能力暂时不能完全实现，需通过 `capabilities` 明确暴露
- preview 必须告诉用户当前是否具备回滚与 current 检测能力

### 8.5.3 降级策略

若 Gemini 首版存在官方配置规范不稳定的情况：
- 允许 `detectCurrent()` 返回 `unmanaged` 状态
- 允许标记 `rollback` 为受限能力
- 但不能跳过 validate / preview / backup 的统一入口

## 8.6 平台能力声明模型

```ts
interface PlatformCapabilities {
  supportsMultiFileWrite: boolean
  supportsRollback: boolean
  supportsCurrentDetection: boolean
  supportsPartialMerge: boolean
}
```

其价值在于：
- 命令层可统一输出限制说明
- 测试层可按能力矩阵编写断言
- 后续新增平台不必修改主流程

---

# 九、文件写入策略

## 9.1 总原则

文件写入必须满足四个要求：

1. 尽量保留用户原有非托管字段。
2. 不做无变化写入。
3. 优先原子替换，避免中间态损坏。
4. 写入前必须已完成备份。

## 9.2 写入步骤

```text
读取当前文件
  → 解析为结构化对象
  → 生成目标对象
  → 计算差异
  → 若无变化则直接返回 no-op
  → 写入临时文件
  → fsync / rename 替换
  → 校验替换结果
```

## 9.3 托管字段策略

建议引入“受托管字段集合”概念：

- 仅覆盖 adapter 明确声明托管的字段
- 未托管字段原样保留
- 如果当前文件中存在与托管字段冲突但来源未知的值，在 preview 中给出 `unmanaged-current-file` 或冲突警告

## 9.4 多文件写入策略

对于 Codex 这类多文件平台：

- 先构造全部目标文件内容
- 统一生成单个 `backupId`
- 所有文件都备份成功后再写入
- 写入顺序固定，避免调试困难
- 任一文件写入失败时，中止剩余写入，并提示使用同一 `backupId` 回滚

## 9.5 原子写入策略

建议使用：
- 同目录临时文件
- 写入完成后 rename 替换
- 保留原文件换行符风格
- 保留 UTF-8 文本格式

说明：
- 跨磁盘 rename 不作为常规路径。
- temp 文件应位于目标文件同目录，保证替换尽量原子。

## 9.6 无变化跳过策略

如果目标内容与当前内容一致：

- 不创建新快照
- 不更新时间戳型状态字段
- 输出 `no-op` 结果
- `current` 可继续保持不变

## 9.7 文件锁与并发策略

首版不引入复杂跨进程锁系统，但应至少支持：

- 运行时在 `~/.api-switcher/` 下创建轻量锁文件
- 同一时刻只允许一个 `use` / `rollback` 进程执行
- 异常退出时锁文件可按超时机制清理

---

# 十、备份与回滚设计

## 10.1 备份触发时机

以下操作默认触发备份：

- `use`
- `rollback`（可选，建议默认开启）
- 未来的高风险写入型命令

## 10.2 快照命名规则

建议：

```text
snapshot-<platform>-<yyyyMMddHHmmss>-<shortId>
```

示例：

```text
snapshot-codex-20260404153022-a1b2c3
```

优点：
- 按平台可读
- 时间排序直观
- 冲突概率低

## 10.3 快照内容

每次快照至少包含：

- 快照元信息 `manifest.json`
- 每个目标文件的原始副本
- 目标文件是否原本存在
- 对应 profileId
- 来源命令与时间

## 10.4 回滚行为

回滚执行时：

1. 读取快照 manifest
2. 校验目标路径可恢复
3. 按 manifest 逐个恢复文件
4. 更新 `state.json`
5. 输出恢复摘要

## 10.5 state 更新规则

### use 成功后

更新：
- `current[platform]`
- `lastSwitch`
- `snapshots[]` 索引

### rollback 成功后

更新：
- `lastSwitch` 为 rollback 记录
- `current[platform]` 尽量恢复到 manifest 关联 profileId；若无法确认则标记为 `unknown`

## 10.6 快照清理策略

结合 PRD 中的保留规则，建议实现：

- 默认按平台保留最近 `N=20`
- 永远保留最近一次成功切换前的快照
- 若快照被 `lastSwitch` 引用则不可删
- 提供 `cleanup --dry-run` 或内部清理预览能力

---

# 十一、错误处理与退出码

## 11.1 错误分类

建议统一分为三层：

### 11.1.1 用户输入错误

例如：
- profile 不存在
- 参数缺失
- 平台名非法

### 11.1.2 业务校验错误

例如：
- 缺少必要字段
- 平台不支持
- high 风险未确认

### 11.1.3 系统执行错误

例如：
- 文件读写失败
- 配置解析失败
- 快照创建失败

## 11.2 退出码映射

| 退出码 | 含义 |
|:--|:--|
| 0 | 成功 |
| 1 | 业务失败 |
| 2 | 运行异常 |

## 11.3 错误输出原则

- 默认脱敏
- 文本模式要说清“为什么失败”与“下一步建议”
- JSON 模式输出稳定字段：`code`、`message`、`details`

---

# 十二、测试设计

## 12.1 测试分层

### 12.1.1 单元测试

覆盖：
- schema 校验
- masking
- risk-engine
- diff-engine
- profile selector 解析
- exit code 映射

### 12.1.2 适配器测试

覆盖：
- validate
- preview
- detectCurrent
- apply 内容生成
- rollback 恢复

### 12.1.3 集成测试

基于 fixtures 模拟：
- 单文件写入
- 多文件写入
- no-op 切换
- 非托管字段保留
- backup + rollback 闭环

### 12.1.4 CLI 端到端测试

覆盖：
- `add`
- `list`
- `preview`
- `use`
- `current`
- `rollback`
- `--json`
- 非交互模式下 `--force` 行为

## 12.2 首发优先级

如果测试资源有限，优先覆盖：

1. `use` 主链路
2. `rollback` 主链路
3. 多文件平台回滚
4. 脱敏输出
5. no-op 检测

## 12.3 夹具策略

- 每个平台准备最小可运行夹具
- fixture 中既包含纯净配置，也包含“用户手工改过”的非托管样本
- 快照测试需断言恢复后的最终文件内容，而不仅是返回码

---

# 十三、发布准备

## 13.1 工程准备

首发前至少完成：

- `bin` 入口可执行
- README 快速开始可跑通
- Windows/macOS/Linux 基础 smoke test
- `pnpm build`、`pnpm test`、`pnpm lint` 可执行
- 产物目录清晰

## 13.2 文档准备

至少包括：

- README
- 平台支持矩阵
- 配置示例
- 风险与确认机制说明
- 回滚说明
- 常见问题
- 首次上手示例

## 13.3 发布检查清单

- 三个平台适配入口都已接通
- `preview / use / rollback` 有稳定输出示例
- 默认文本输出已脱敏
- JSON 输出字段已固定
- 快照目录与 state 文件结构已稳定
- 至少一组端到端回归测试通过
- package 名称、bin 名称、版本号、license 已确认

## 13.4 版本策略建议

- 首发使用 `0.x` 版本管理快速演进
- 当 schema 与命令输出稳定后再考虑 `1.0.0`
- schema 变更必须伴随 migration 说明

---

# 十四、分阶段落地建议

## 14.1 Phase A：基础骨架

完成：
- 工程初始化
- 基础类型
- store 层
- adapter registry
- 命令骨架

## 14.2 Phase B：配置中心与预览闭环

完成：
- `profiles.json` / `state.json`
- `add / list / validate / preview`
- risk-engine
- text/json 渲染器

## 14.3 Phase C：切换与恢复闭环

完成：
- `use`
- snapshot service
- rollback service
- no-op 检测
- state 更新

## 14.4 Phase D：多平台收口与首发准备

完成：
- Claude / Codex / Gemini 三适配器对齐
- fixture 完善
- README 与示例
- 发布脚本与 smoke test

---

# 十五、当前待确认项

以下问题不阻塞 TDD 定稿，但会影响具体编码阶段：

1. Claude Code 首发要写入的真实目标文件路径与字段契约需在编码前最终确认。
2. Gemini CLI 的真实配置文件契约需继续调研，并补齐到 `gemini.target-resolver.ts` 设计中。
3. 是否在首发就提供交互式确认 UI，还是先以标准 CLI prompt 为主。
4. 是否在首发版引入锁文件机制，还是先保留单进程约束与文档提示。

这些项不改变总体架构，只影响具体 adapter 与工程细节实现。

---

# 十六、结论

api-switcher 的首版技术方案已经可以明确为：

- 以 `profiles.json` 为统一配置源
- 以 `state.json + backups/` 为运行态与恢复层
- 以 `commands -> services -> adapters -> stores` 为主架构
- 以 `validate / preview / backup / apply / rollback` 为核心链路
- 以“最小破坏写入 + 原子替换 + 快照恢复”作为安全底座

按这份 TDD 进入实现阶段后，后续编码重点将不再是“要不要这样设计”，而是逐模块把接口和真实平台契约落地。

---

# 十七、平台配置写入策略深化

本章用于在现有 TDD 的通用写入原则之上，进一步细化 Claude Code、Codex、Gemini CLI 三个平台的真实配置写入策略。其重点不是继续扩大“支持多少配置项”，而是纠正旧式“整文件重建/覆盖”的错误模型，把平台切换收敛为可解释、可恢复、可扩展的字段级写入体系。

## 17.1 设计目标与非目标

### 17.1.1 设计目标

本章新增设计必须满足以下目标：

1. **从整文件覆盖转向字段级 patch**
   平台活动配置文件不再被视为可由工具完全重建的产物。`api-switcher` 只应修改明确归属的托管字段，而不是以整文件重写的方式进行切换。

2. **优先修正写入策略，而不是盲目扩大字段支持面**
   首要问题不是“支持多少平台字段”，而是“写入时是否破坏用户已有配置”。在写入策略未稳定前，新增字段支持不应扩大破坏面。

3. **坚持最小托管原则**
   工具只托管与 API 切换直接相关的配置字段，例如 provider、model、base URL、auth-reference、secret_ref 等。与切换无直接关系的设置应默认视为用户字段并原样保留。

4. **统一 `preview / validate / use / rollback` 的底层写入契约**
   预览、校验、正式应用、回滚不能各自维护不同规则，而必须围绕同一套托管字段边界、差异计算模型和恢复语义工作，确保行为一致。

5. **显式区分文件改动与最终 effective config**
   对 Claude Code 与 Gemini CLI 等存在多层配置、环境变量或命令行覆盖的平台，文件写入成功不等于最终生效。系统必须把“文件级 diff”与“最终生效配置”作为两个不同维度展示和校验。

6. **将 secret 安全提升纳入正式设计目标**
   平台切换过程中涉及的 API key、token、auth material 不应继续以明文方式持久化在用户配置文件或统一配置源中。后续实现应将 secret 与普通配置分离，并支持安全引用与脱敏输出。

7. **保持跨平台命令体验一致，但允许平台实现差异**
   三个平台在格式、作用域、覆盖优先级、多文件事务等方面存在显著差异；本设计允许 adapter 内部差异化实现，但要求 `preview / validate / use / rollback` 在命令层保持一致的认知模型。

8. **以 MVP 可落地为优先**
   本章设计应优先服务首版稳定落地，先完成字段级安全写入、备份回滚、差异预览与平台边界保护，再逐步补强 overlay、schema/version 适配、审计增强等能力。

### 17.1.2 非目标

本章明确以下内容不属于首版必须达成的目标：

1. **不尝试完整托管平台全部配置域**
   `api-switcher` 首版不以接管平台完整配置为目标。像 MCP、hooks、permissions、sandbox、tools、telemetry、privacy、context、UI 偏好等领域，默认不纳入工具托管范围。

2. **不默认写入 system / enterprise / managed 级配置**
   首版默认只处理用户级、项目级或本地级配置文件，不以系统级、企业级或 managed policy 级文件为主要写入目标。

3. **不承诺一次性覆盖未来所有平台字段变化**
   各平台配置结构可能持续演进。首版目标不是预先声明并支持所有未来字段，而是在未知字段出现时保持透传保留，避免误删和破坏。

4. **不要求首版完成完整 overlay 管理体系**
   overlay、profile 化环境扩展、能力矩阵自动适配、完整审计增强等能力可以分阶段推进，不应阻塞核心写入闭环落地。

5. **不覆盖团队共享、云同步或远程配置仓库场景**
   本章聚焦本机配置切换、安全写入与恢复路径，不处理团队共享配置、远程同步、配置市场或集中托管等更高阶分发问题。

### 17.1.3 本章与既有 TDD 的关系

本章不是对既有架构的推翻，而是对以下现有设计的继续深化：

- 延续第八章 adapter 职责边界：由 adapter 负责识别托管字段、生成目标写入内容、保留非托管字段并执行平台特定写入。
- 延续第九章通用写入原则：最小破坏、原子替换、备份优先、no-op 跳过。
- 延续第十章备份与回滚设计：任何高风险写入都必须存在恢复路径。
- 延续第十六章总体结论：以“最小破坏写入 + 原子替换 + 快照恢复”作为安全底座。

本章的价值在于把这套原则从“通用层”推进到“平台具体契约层”，使 Claude Code、Codex、Gemini CLI 三个平台都具备可直接实现的写入边界与行为规范。

## 17.2 统一配置写入原则

为确保 Claude Code、Codex、Gemini CLI 三个平台在实现层存在差异的前提下，仍能共享一致的安全底座，本节定义平台配置写入的统一原则。各 adapter 的具体实现必须在这些原则约束下展开；若平台特性与原则发生冲突，应优先保证安全性、可恢复性与可解释性。

### 17.2.1 最小托管原则

`api-switcher` 只应托管与“切换当前 API 配置”直接相关的字段，不得把平台活动配置文件视为工具的完全所有物。

这意味着：

- 平台配置中的字段应被划分为：
  - **托管字段**：由 `api-switcher` 负责写入与更新
  - **非托管字段**：默认保留，工具不应主动重写
- adapter 必须显式声明本平台的托管字段范围
- 若某字段是否应托管尚不明确，应默认归入非托管字段，而不是贸然接管

### 17.2.2 字段级 patch 原则

所有写入必须以字段级 patch 为基本模型，而不是整文件覆盖或整对象重建。

统一语义建议至少包括：

- `set`：设置或覆盖明确托管的标量字段
- `merge-object`：对托管对象进行按键合并
- `delete-owned`：仅删除工具明确拥有且本次切换已不再需要的字段
- `passthrough`：对非托管字段保持原样透传

说明：

- `delete-owned` 只能用于工具已声明拥有的字段，禁止删除未知键
- 即使在托管子树内部，也不得因 schema 未覆盖某字段而将其默认删除
- adapter 输出的 diff 应能明确区分“新增 / 更新 / 删除 / 保留”

### 17.2.3 未知键保留原则

系统必须把“未知键保留”视为兼容性底线，而不是可选优化。

其要求包括：

1. 顶层未知字段默认保留
2. 托管对象内部的未知字段默认保留
3. 平台升级后引入的新字段，在工具未声明接管前不得被删除
4. 仅当字段明确属于工具托管范围且本次切换语义要求移除时，才允许删除

### 17.2.4 文件变更与 effective config 分离原则

系统必须明确区分：

- **文件变更结果**：本次切换将如何修改目标文件
- **最终生效结果（effective config）**：在 scope、环境变量、CLI 参数、managed policy 等共同作用下，最终实际生效的配置

统一要求如下：

- `preview` 不得只展示文件 diff
- `validate` 不得只校验静态文件结构
- 对存在多层配置叠加的平台，必须补充 effective config 解释
- 当文件改动会被更高优先级配置遮蔽时，必须明确提示，而不是默认视为切换成功

### 17.2.5 无变化跳过原则

若目标写入结果与当前活动配置在托管字段层面无差异，本次操作应被视为 `no-op`。

其要求包括：

- 不写盘
- 不创建新快照
- 不刷新仅用于追踪切换的时间戳
- 不制造虚假的“已切换成功”记录
- 结果输出应明确标记为“无变化”

### 17.2.6 原子写入原则

所有实际写盘都必须尽量采用原子替换模型，避免产生中间态损坏。

统一建议流程如下：

1. 读取当前文件
2. 解析并构造目标结构
3. 计算 diff
4. 如无变化则直接返回 `no-op`
5. 写入同目录临时文件
6. fsync
7. rename 替换目标文件
8. 校验替换结果

补充要求：

- 临时文件应与目标文件位于同目录，尽量保证 rename 原子性
- 尽量保留原文件编码、换行风格与可保留的结构特征
- 多文件平台需定义统一写入顺序，便于调试和恢复

### 17.2.7 先备份后写入原则

任何会修改本地真实活动配置的操作，都必须在写入前具备恢复路径。

统一要求如下：

- `use` 默认先生成快照
- 多文件平台必须在全部目标文件备份完成后，才进入写入阶段
- 若平台存在独立 auth 文件、辅助配置文件或 scope 分层文件，快照必须覆盖本次会被修改的全部文件
- 若备份未完成，则不得进入正式写入

### 17.2.8 Secret 分离原则

secret 不应继续作为普通配置字段参与平台文件 patch。

统一要求如下：

- 平台活动配置中仅保留必要的 secret 引用信息或认证方式信息
- 真实 secret 应存储于更安全的介质，如系统密钥库
- `profiles.json`、平台目标文件、命令输出、快照元信息都必须默认脱敏
- `export` 等能力若需要导出 secret，必须显式选择并进行二次确认

### 17.2.9 平台差异受控原则

虽然三平台在格式、层级、文件数和覆盖顺序上存在差异，但这种差异应由 adapter 吸收，而不应泄漏到主流程中形成多套命令语义。

统一要求：

- `preview / validate / use / rollback` 入口保持一致
- 差异化能力通过：
  - 平台 warning
  - capabilities
  - effective config 提示
  - rollback 限制说明
  暴露给用户
- 主流程不应因为新增平台而重新发明一套切换协议

### 17.2.10 MVP 优先原则

首版设计应优先保证“写得安全、能看明白、出错能回来”，而不是一次性覆盖所有高级能力。

因此，首版的优先级应当是：

1. 最小托管 + 字段级 patch
2. `preview / validate / rollback` 闭环
3. 备份与原子写入
4. 非托管字段保留
5. effective config 基础解释
6. secret 分离与迁移准备

### 17.2.11 与现有章节的衔接

本节是对既有 TDD 中以下内容的进一步约束与补强：

- 对第八章 adapter 职责边界的补强：要求 adapter 不仅“能写”，还必须“按托管边界安全写”
- 对第九章写入步骤的补强：明确字段级 patch、未知键保留、effective config、secret 分离
- 对第十章备份回滚的补强：把恢复路径前置为写入前提，而非失败后的补救措施

## 17.3 三平台托管边界表

为避免 `api-switcher` 在不同平台上出现“托管范围不清、边界不断扩张、误伤用户配置”的问题，本节正式定义 Claude Code、Codex、Gemini CLI 三个平台的托管边界。后续实现、测试、预览与回滚行为都必须以本节为准。

### 17.3.1 边界定义方法

每个平台的真实活动配置应被划分为四类：

1. **托管字段**
   与 API 切换直接相关，由 `api-switcher` 负责读写、比较、预览和回滚。

2. **默认保留字段**
   与切换无直接关系，或虽可能影响 CLI 行为但不属于 API 切换职责，默认由用户自行维护，工具仅透传保留。

3. **禁止覆盖区**
   即使技术上可解析，也不应被 `api-switcher` 主动写入的区域。这些区域通常涉及安全策略、工作流自动化、扩展能力或系统级控制。

4. **生效层级注意事项**
   与配置 scope、环境变量、CLI 参数、系统策略等有关的特殊规则，用于解释“文件写入成功后是否一定生效”。

### 17.3.2 总表

| 平台 | 主要目标文件 | 应托管字段 | 默认保留字段 | 禁止覆盖区 | 生效层级注意事项 |
|:--|:--|:--|:--|:--|:--|
| Claude Code | `~/.claude/settings.json`、`.claude/settings.json`、`.claude/settings.local.json` | 与 API 切换直接相关的 provider、base URL、auth-reference、secret_ref 等字段 | hooks、permissions、sandbox、statusLine、MCP、plugin/skill 相关配置、未知键 | `PreToolUse/PostToolUse/Stop/SessionStart`、`permissions`、`sandbox`、MCP、managed settings | 存在 user/project/local 以及更高层 managed 覆盖关系；文件改动不等于最终生效 |
| Codex | `~/.codex/config.toml`、`auth.json` | `model_provider`、`model`、`preferred_auth_method`、`[model_providers.<active>]` 中归属字段、auth 引用字段 | MCP、features、network、profiles、logging、audit、未知键 | 整文件重建、整表覆盖、删除未知 provider 子树字段 | 多文件共同构成一次切换事务；`config.toml` 与 `auth.json` 必须统一解释 |
| Gemini CLI | user/project `settings.json` | `model.*` 中与 API 切换直接相关字段、endpoint/provider 归属字段、auth-reference、secret_ref | `general`、`ui`、`tools`、`mcpServers`、`telemetry`、`privacy`、`context`、`advanced`、未知键 | `mcpServers`、`tools`、system-defaults/system settings 级文件 | environment variables 与 CLI args 优先级高于 settings 文件；文件改动不一定成为最终有效值 |

### 17.3.3 Claude Code 平台边界

#### 17.3.3.1 托管范围

Claude Code 平台首版仅允许托管与 API 切换直接相关的字段，例如：

- 当前 provider 选择字段
- base URL / endpoint 相关字段
- 认证方式引用字段
- `secret_ref` 等安全引用字段

原则上，只有当某字段满足以下条件时，才允许进入 Claude 平台托管范围：

1. 该字段直接决定当前 API 接入位置或认证方式
2. 该字段在切换 profile 时需要稳定切换
3. 修改该字段不会改变用户的工作流、安全策略或扩展能力边界

#### 17.3.3.2 默认保留字段

以下内容默认视为用户领域配置，不纳入 `api-switcher` 托管：

- hooks
- permissions
- sandbox
- statusLine
- MCP server 配置
- plugin / skill 相关配置
- 其他未知字段

#### 17.3.3.3 禁止覆盖区

Claude 平台必须将以下内容视为禁止覆盖区：

- `PreToolUse`
- `PostToolUse`
- `Stop`
- `SessionStart`
- `permissions`
- `sandbox`
- enterprise / managed settings
- MCP 相关配置

#### 17.3.3.4 层级注意事项

Claude Code 平台配置天然存在层级叠加关系，因此必须同时考虑：

- user scope
- project scope
- local scope
- 更高层 managed policy

因此，Claude 平台的 `preview` 与 `validate` 必须不仅展示“将写入哪个文件”，还要解释：

- 本次写入位于哪个 scope
- 该写入是否会被更高层覆盖
- 某字段是否受 managed policy 限制而无法真正生效

### 17.3.4 Codex 平台边界

#### 17.3.4.1 托管范围

Codex 平台的托管范围应收敛为：

- `model_provider`
- `model`
- `preferred_auth_method`
- `[model_providers.<activeProvider>]` 中明确属于当前 provider 切换的字段
- `auth.json` 中与认证引用直接相关的字段

#### 17.3.4.2 默认保留字段

以下区域默认保留：

- MCP 相关配置
- `features`
- `network`
- `profiles`
- logging / audit 类字段
- 其他未知顶层键
- 托管子树中的未知键

#### 17.3.4.3 禁止覆盖区

Codex 平台必须明确禁止：

- 把 `config.toml` 当成模板整体重建
- 对 `[model_providers.<active>]` 做整表覆盖
- 删除未知 provider 子树中的字段
- 仅更新 `config.toml` 而忽略 `auth.json` 的一致性语义

#### 17.3.4.4 层级与事务注意事项

Codex 的主要复杂度不在 scope，而在多文件事务：

- `config.toml`
- `auth.json`

这两个文件共同描述最终可用状态，因此任何切换都必须把它们视为**单次事务的一部分**。
`preview`、`backup`、`apply`、`rollback` 都必须围绕“多文件一致状态”组织，而不能只对其中一个文件单独成立。

### 17.3.5 Gemini CLI 平台边界

#### 17.3.5.1 托管范围

Gemini 平台首版建议只托管：

- `model.*` 中与当前 API 切换直接相关的字段
- endpoint / provider 归属字段
- auth-reference
- `secret_ref`

#### 17.3.5.2 默认保留字段

以下字段默认视为用户域，不纳入托管：

- `general`
- `ui`
- `tools`
- `mcpServers`
- `telemetry`
- `privacy`
- `context`
- `advanced`
- 其他未知键

#### 17.3.5.3 禁止覆盖区

Gemini 平台必须明确禁止：

- 修改 `mcpServers`
- 修改 `tools`
- 默认写入 system-defaults / system settings 级文件
- 以整文件重建方式覆盖 user/project settings

#### 17.3.5.4 层级注意事项

Gemini CLI 的关键特点是：

- settings 文件并非唯一配置来源
- environment variables 可覆盖 settings 文件
- CLI arguments 的优先级更高

因此，Gemini 平台的 `preview` 与 `validate` 必须特别说明：

- 本次要 patch 的是哪个 settings scope
- 当前 env 是否会覆盖本次写入
- CLI args 是否可能导致最终 effective config 与文件内容不一致

### 17.3.6 托管边界的实现要求

为保证本节不止停留在文档层，后续实现必须满足以下要求：

1. 每个平台 adapter 都必须显式声明托管字段集合
2. `preview` 必须依据托管边界输出 diff，而不是对全文件做笼统比较
3. `validate` 必须能识别“托管字段缺失”和“禁止覆盖区被误触及”
4. `rollback` 只恢复本次改动涉及的托管文件，不扩散到无关用户配置
5. 测试夹具必须覆盖“带大量非托管字段的真实样本”，验证边界不会被破坏

### 17.3.7 边界变更规则

托管边界不是完全不可变，但必须被视为“平台契约级变更”，不能在实现中随意扩张。

新增托管字段时应遵循：

1. 先确认该字段确实属于 API 切换职责
2. 先确认不会侵入 hooks / MCP / tools / security / workflow 域
3. 先为 `preview / validate / rollback / migrate` 补齐语义
4. 先补测试，再扩大托管范围

## 17.4 Codex 写入契约

Codex 平台是三平台中最需要严格约束写入行为的对象。其核心问题不在于“支持多少字段”，而在于当前活动配置往往由多个文件共同表达，而其中至少 `config.toml` 具备注释、顺序与结构上下文，不能被简单 parse / stringify 或整文件重建。本节定义 Codex 平台在 `api-switcher` 中的正式写入契约。

### 17.4.1 设计目标

Codex 平台写入契约必须实现以下目标：

1. **切换 API 时仅修改归属字段，不破坏其余配置**
2. **将 `config.toml` 与 `auth.json` 视为同一次切换事务**
3. **在 patch 过程中保留用户自定义字段、未知字段、注释与结构稳定性**
4. **支持 preview / backup / apply / rollback 的统一闭环**
5. **为未来字段扩展保留未知键兼容能力，而不是依赖硬编码字段全集**

### 17.4.2 目标文件与事务边界

Codex 平台首版至少应将以下文件纳入统一切换事务：

- `config.toml`
- `auth.json`

统一要求：

- `preview` 必须明确列出将受影响的全部目标文件
- `backup` 必须覆盖事务中的全部目标文件
- `apply` 失败时必须把剩余文件视为未完成事务
- `rollback` 必须能够恢复到同一 `backupId` 所代表的一致状态

### 17.4.3 托管字段边界

Codex 平台允许托管的字段包括：

- `model_provider`
- `model`
- `preferred_auth_method`
- `[model_providers.<activeProvider>]` 中与当前 provider 切换直接相关的归属字段
- `auth.json` 中与当前 profile 的认证引用直接相关的字段

这里的关键点不是列出所有字段名称，而是定义“托管边界”：

- 若字段直接决定当前 provider/model/认证引用，则可纳入托管
- 若字段属于 features、network、profiles、logging、audit、MCP 或未知扩展域，则默认保留
- 若字段位于托管子树内但当前工具尚未声明拥有，也必须保留

### 17.4.4 配置读写模型

Codex 平台的配置读写必须采用“结构保留优先”的模型。

#### 对 `config.toml` 的要求
- 必须采用能够支持 round-trip 的 TOML 处理策略
- 不得把 TOML 简化为“普通对象 → stringify”后整体写回
- 应尽量保留：
  - 注释
  - 表顺序
  - 非托管字段位置稳定性
  - 与原文件接近的格式结构

#### 对 `auth.json` 的要求
- 也必须采用字段级 patch
- 不得因本次切换而重建整份 `auth.json`
- 若存在未知键、状态字段或其他平台演进字段，应默认保留

统一要求：
- parser 负责读取真实文件结构
- mapper 负责根据 profile 生成托管字段目标值
- patch engine 负责把托管变更合并到真实文件结构中
- writer 负责原子落盘与校验

### 17.4.5 Patch 语义

Codex 平台必须支持以下 patch 语义：

#### 1. `set`
用于设置或覆盖托管标量字段，例如：
- `model_provider`
- `model`
- `preferred_auth_method`

#### 2. `merge-object`
用于对托管对象子树做按键合并，例如：
- `[model_providers.<activeProvider>]`

要求：
- 只更新工具拥有的字段
- 不删除未知键
- 不重排非必要结构

#### 3. `delete-owned`
用于删除工具明确拥有、且在新 profile 下已不应继续保留的字段

限制：
- 仅允许删除工具已声明拥有的字段
- 不允许删除未知键
- 不允许因“当前 schema 没列出来”而删除原配置字段

#### 4. `passthrough`
对所有非托管字段原样保留，不参与值比较、不参与改写，仅在 diff 输出中体现为“未改动保留”。

### 17.4.6 Preview 契约

Codex 平台的 `preview` 必须至少输出：

1. **将受影响的目标文件列表**
2. **字段级 diff 摘要**
3. **风险与限制说明**
4. **回滚预期**

Codex 的 `preview` 不应只告诉用户“会改两个文件”，还必须让用户知道“为什么改、改哪些托管字段、其余哪些部分会保留”。

### 17.4.7 Backup 契约

Codex 平台在进入 `apply` 前必须完成事务级备份。

要求：

- 为本次切换生成单个 `backupId`
- `backupId` 关联到事务内全部目标文件
- 每个文件都必须记录：
  - 原始内容
  - 原文件是否存在
  - 文件路径
  - 文件角色（config / auth / 其他）
- 若任一目标文件备份失败，则不得继续写入

### 17.4.8 Apply 契约

Codex 平台的 `apply` 过程必须满足以下顺序：

1. 读取全部目标文件当前状态
2. 生成全部目标文件的目标内容
3. 计算全部 diff
4. 若整体无变化，则返回 `no-op`
5. 完成全部备份
6. 按固定顺序依次原子写入
7. 写入后执行结果校验
8. 更新统一的 apply 结果摘要

补充要求：

- 固定顺序应稳定，不因字段变化而随机变化
- 若其中一个文件写入失败，应立即中止剩余写入
- 返回结果必须清楚标记：
  - 哪些文件已写成功
  - 哪些文件未开始写入
  - 用户应如何使用同一 `backupId` 回滚

### 17.4.9 Rollback 契约

Codex 平台的 `rollback` 必须恢复整个事务，而不是恢复单个文件的局部状态。

要求：

- 按 `backupId` 读取完整 manifest
- 恢复 manifest 中的全部目标文件
- 对“原本不存在”的文件执行删除或恢复为空缺语义
- rollback 成功后更新 `state.json`
- 输出恢复摘要，明确：
  - 恢复了哪些文件
  - 是否恢复到可识别的 profile
  - 若无法确定当前 profile，则标记为 `unknown`

### 17.4.10 Current 检测契约

Codex 平台的 `detectCurrent()` 不得依赖整文件全文匹配，而应依赖托管字段比对。

建议行为：

- 从 `config.toml` 与 `auth.json` 中提取托管字段视图
- 与统一配置源中的 profile 做归属字段比较
- 若匹配到完整托管字段集合，则可判定为受管 profile
- 若仅部分匹配或存在未知冲突，应返回 warning、limitation 或 `matchedProfileId` 为空

### 17.4.11 风险与告警模型

Codex 平台应至少支持以下告警类型：

- `multi-file-transaction`
- `unmanaged-current-file`
- `auth-reference-changed`
- `provider-subtree-conflict`
- `unknown-provider-fields-preserved`
- `rollback-required-on-failure`

### 17.4.12 实现限制与降级策略

若在实现阶段暂时无法稳定获取“完美 round-trip TOML AST”，则允许在 Codex 平台采用受控降级策略，但必须满足以下约束：

1. 仍然坚持字段级 patch 语义
2. 仍然禁止整文件重建
3. 必须在 preview 中明确提示格式保留能力的限制
4. 必须通过夹具与快照测试验证非托管字段不会丢失
5. 在未证明安全前，不得以“先可用”为理由回退到整文件覆盖

## 17.5 Claude Code 写入契约

Claude Code 平台的核心复杂度不在于单个字段本身，而在于其配置天然同时承载 API 接入、权限控制、hooks 自动化、sandbox、安全策略、状态栏与 MCP 扩展能力。对于 `api-switcher` 而言，Claude 平台的首要目标不是“更全面地改 settings”，而是**在不破坏用户工作流与安全策略的前提下，最小范围地完成 API 切换**。

### 17.5.1 设计目标

Claude Code 平台写入契约必须实现以下目标：

1. **只修改与 API 切换直接相关的托管字段**
2. **保留 hooks、permissions、sandbox、MCP、statusLine 等用户域配置**
3. **显式处理 user / project / local scope 的层级关系**
4. **区分文件级 diff 与最终 effective config**
5. **识别被更高层配置遮蔽的写入结果**
6. **禁止触碰 managed settings 与组织级策略配置**

### 17.5.2 目标文件与作用域模型

Claude Code 平台首版应支持以下配置作用域：

- user：`~/.claude/settings.json`
- project：`<project>/.claude/settings.json`
- local：`<project>/.claude/settings.local.json`

统一要求：

- `api-switcher` 在一次写入中**只允许修改一个明确 scope**
- `preview` 与 `validate` 必须显式说明当前目标 scope
- `rollback` 也必须按 scope 执行，不允许混合回滚不同层级文件

### 17.5.3 托管字段边界

Claude 平台首版允许托管的字段应收敛为：

- provider 归属字段
- base URL / endpoint 相关字段
- auth-reference
- `secret_ref`
- 其他经明确设计确认、且仅服务于 API 切换的字段

判断标准如下：

1. 字段直接影响当前 API 提供方、接入入口或认证引用
2. 字段切换应随 profile 一起变化
3. 字段不属于用户工作流、安全控制或扩展系统的一部分

### 17.5.4 默认保留字段

以下内容必须视为用户域配置，默认透传保留：

- `PreToolUse`
- `PostToolUse`
- `Stop`
- `SessionStart`
- `permissions`
- `sandbox`
- `statusLine`
- MCP 相关配置
- plugin / skill 相关配置
- 未知字段

### 17.5.5 禁止覆盖区

Claude 平台必须将以下区域定义为禁止覆盖区：

1. hooks 顶层事件配置
   - `PreToolUse`
   - `PostToolUse`
   - `Stop`
   - `SessionStart`

2. 权限与安全边界
   - `permissions`
   - `sandbox`
   - `allowManagedPermissionRulesOnly`
   - `allowManagedHooksOnly`
   - 其他 managed security 相关项

3. 扩展与工作流配置
   - MCP server 配置
   - status line
   - plugin / skill 相关配置

4. enterprise / managed settings
   - 任何由组织或更高层托管的配置来源

### 17.5.6 配置读写模型

Claude 平台应采用 **scope-aware JSON field patch** 模型。

统一要求：

- 只读取并 patch 指定 scope 的目标文件
- patch 基于托管字段集合执行
- 非托管字段原样保留
- 未知字段原样保留
- 不做整对象重建
- 不因 schema 未覆盖某些键而清空整份 settings 文件

实现层建议分工：

- target-resolver：解析当前要写入的 scope 与真实文件路径
- parser：读取当前 scope 的 settings 结构
- mapper：根据 profile 生成托管字段目标值
- patch engine：把托管字段 merge 到当前 scope 对象
- effective-config evaluator：评估写入后在多层叠加下的最终生效结果

### 17.5.7 Preview 契约

Claude 平台的 `preview` 必须同时输出以下两个层次的信息：

#### 1. 文件级 diff
说明指定 scope 的目标文件将发生哪些托管字段变化，例如：
- 新增
- 覆盖
- 删除
- `no-op`

#### 2. 最终 effective config 变化
说明在 scope 叠加后，最终实际生效值将是什么，并明确指出：

- 本次写入是否会被更高层 scope 覆盖
- 某字段是否被 managed settings 限制
- 某字段写入后是否仍不会成为当前有效值

### 17.5.8 Shadowed / Managed Policy 检测

Claude 平台必须显式支持以下两类检测：

#### 1. `shadowed`
指本次写入虽然会落盘，但对应字段会被更高优先级 scope 覆盖。

#### 2. `managed-policy`
指字段处于组织或更高层策略控制下，本地写入不应被视为有效切换。

统一要求：

- 这两类情况必须在 `preview` 中给出 warning
- `validate` 也应提示最终 effective config 风险
- 必要时 `use` 应要求确认，或直接以受限能力返回

### 17.5.9 Apply 契约

Claude 平台的 `apply` 必须遵循以下顺序：

1. 解析目标 scope
2. 读取该 scope 当前文件
3. 生成托管字段目标值
4. 计算文件级 diff
5. 计算 effective config 变化
6. 若为 `no-op`，直接返回
7. 备份目标 scope 文件
8. 执行原子写入
9. 校验写入结果
10. 输出变更摘要与生效提示

补充要求：

- `apply` 不应试图同步修改其他 scope
- `apply` 成功不应自动推断“最终一定已生效”，而应结合 effective config 结果给出说明
- 若写入受 managed policy 阻断，应在结果中明确说明限制来源

### 17.5.10 Rollback 契约

Claude 平台的 rollback 必须是 **scope 精确回滚**。

要求：

- 仅恢复本次切换所改动的 scope 文件
- 不影响其他 scope 的用户配置
- rollback 后重新计算当前 effective config
- 若回滚后字段仍被其他 scope 覆盖，也应在结果中说明

### 17.5.11 Current 检测契约

Claude 平台的 `detectCurrent()` 应基于托管字段的**最终有效值**进行判断，而不应只根据某一个 settings 文件全文匹配。

建议行为：

1. 收集各 scope 的相关托管字段
2. 计算 effective config
3. 与统一配置源中的 profile 做托管字段级比较
4. 若能稳定匹配，则返回受管 profile
5. 若存在高层覆盖、未知冲突、managed 限制、仅部分字段命中等情况，则返回 warning、limitation 或 `matchedProfileId` 为空

### 17.5.12 风险与告警模型

Claude 平台应至少支持以下 warning 类型：

- `scope-shadowed`
- `managed-policy-applies`
- `non-managed-settings-preserved`
- `hooks-preserved`
- `permissions-preserved`
- `sandbox-preserved`
- `mcp-preserved`
- `effective-config-differs-from-file`

### 17.5.13 实现限制与降级策略

若首版暂时无法完整实现所有 scope 组合下的精确 effective config 求值，则允许采用受控降级策略，但必须满足：

1. 仍坚持最小托管与禁止覆盖区不变
2. 仍能准确展示文件级 diff
3. 对无法完全解析的 effective config，必须显式标记为“部分可解释”
4. 不得因为 effective config 分析尚不完整，就退回整文件覆盖或扩大托管边界

## 17.6 Gemini CLI 写入契约

Gemini CLI 平台的复杂度与 Codex、Claude Code 不同。其关键问题不在于单一配置文件格式，而在于：`settings.json` 只是配置来源之一，environment variables 与 CLI arguments 具有更高优先级，且 settings 结构本身存在版本演进与迁移可能。因此，Gemini 平台在 `api-switcher` 中的正确策略应当是 **env-first、最小 patch、强解释性、弱侵入**，而不是试图完整接管 `settings.json`。

### 17.6.1 设计目标

Gemini 平台写入契约必须实现以下目标：

1. **将 environment variables 视为高优先级配置来源**
2. **只对 user/project 级 `settings.json` 做小范围字段 patch**
3. **将 `settings.json` 中与 API 切换无关的大部分区域视为用户域并默认保留**
4. **显式解释 env / CLI args 对最终 effective config 的覆盖关系**
5. **兼容 settings 结构版本演进与迁移，不因格式变化破坏用户配置**
6. **避免将 Gemini 平台误实现成“整份 JSON 配置接管器”**

### 17.6.2 配置来源与层级模型

Gemini CLI 至少存在以下配置来源：

- defaults
- system defaults file
- user settings file
- project settings file
- system settings file
- environment variables
- CLI arguments

这意味着：

- `settings.json` 不是唯一真相
- 文件 patch 成功不代表最终有效值一定改变
- env 与 CLI args 可能完全覆盖本次写入结果

因此，Gemini 平台的统一模型应为：

- **base**：`api-switcher` 托管的最小平台字段
- **overlay**：用户在 settings 中自定义的行为配置
- **runtime**：环境变量与 CLI 参数形成的最终运行时覆盖层

### 17.6.3 目标文件与允许 scope

Gemini 平台首版建议只支持以下 settings scope：

- user settings
- project settings

明确不作为默认写入目标的 scope：

- system defaults file
- system settings file

统一要求：

- 一次切换只允许 patch 一个明确 scope
- `preview` 必须显示目标 scope 与目标文件路径
- `rollback` 必须按 scope 回滚，不跨层恢复

### 17.6.4 托管字段边界

Gemini 平台首版允许托管的字段应收敛为：

- `model.*` 中与当前 API 切换直接相关的字段
- endpoint / provider 归属字段
- auth-reference
- `secret_ref`

### 17.6.5 默认保留字段

以下设置区域应被明确视为用户域配置，默认透传保留：

- `general`
- `ui`
- `tools`
- `mcpServers`
- `telemetry`
- `privacy`
- `context`
- `advanced`
- 其他未知键

### 17.6.6 禁止覆盖区

Gemini 平台必须将以下区域视为禁止覆盖区：

1. `mcpServers`
2. `tools`
3. `telemetry`
4. `privacy`
5. system-defaults / system settings 级文件
6. 任意未知大区块的整块替换

### 17.6.7 配置读写模型

Gemini 平台应采用 **env-first + JSON field patch** 模型。

其原则如下：

1. **优先依赖 env 管理 secret**
2. **settings.json 只 patch 非 secret 的最小托管字段**
3. **不因 profile 切换而重建 settings.json**
4. **未知字段与保留区完整透传**
5. **若字段当前由 env / CLI args 主导，也仍可 patch 文件，但必须明确其效果受限**

实现层建议分工：

- target-resolver：确定 user/project scope 的真实 settings 文件路径
- parser：读取当前 settings 结构
- mapper：根据 profile 生成托管字段目标值
- patch engine：对当前 JSON 结构执行字段级 merge
- effective-config evaluator：评估 env / CLI 覆盖后的最终有效结果

### 17.6.8 Preview 契约

Gemini 平台的 `preview` 必须同时输出以下两层结果：

#### 1. 文件级 diff
展示当前目标 settings 文件中将发生的托管字段变更，例如：
- model 相关字段变化
- endpoint/provider 变化
- auth-reference 变化
- `no-op`

#### 2. 最终 effective config 解释
说明在 env 与 CLI args 参与后，最终可能生效的配置是什么，并明确指出：

- 当前是否存在 env 覆盖
- 当前是否存在 CLI 参数覆盖
- 本次写入后哪些字段可能仍不会成为最终有效值

### 17.6.9 Env / CLI 覆盖检测

Gemini 平台必须支持对 runtime 覆盖关系的解释，至少包括：

#### 1. `env-overrides-settings`
表示某托管字段虽然会写入 settings.json，但当前环境变量将覆盖该值。

#### 2. `cli-arg-overrides-settings`
表示某托管字段在实际调用 Gemini CLI 时可能被 CLI 参数覆盖。

#### 3. `runtime-effective-value-differs`
表示文件 patch 后的值与最终 effective config 不一致。

统一要求：

- 这些情况必须在 `preview` 中提示
- `validate` 也应展示 runtime 覆盖风险
- `use` 成功后若 effective config 未如预期变化，应明确说明原因，而不是笼统返回成功

### 17.6.10 Settings 结构迁移与兼容策略

Gemini CLI 的 `settings.json` 结构可能发生版本演进，因此 Gemini 平台必须支持受控兼容策略。

要求如下：

1. 允许识别旧版 / 新版 settings 结构
2. 在 patch 前先判断当前文件结构版本或能力形态
3. 若需要迁移，必须先备份再处理
4. 未知字段一律保留
5. 在无法完全确定结构语义时，应退回最小 patch，而不是重建目标 JSON

### 17.6.11 Apply 契约

Gemini 平台的 `apply` 必须按以下顺序进行：

1. 确定目标 scope
2. 读取当前 settings 文件
3. 解析并识别结构版本
4. 生成托管字段目标值
5. 计算文件级 diff
6. 计算 runtime 覆盖后的 effective config
7. 若 `no-op`，直接返回
8. 备份目标 settings 文件
9. 原子写入 patch 结果
10. 校验写入成功并输出变更摘要

补充要求：

- `apply` 不应自动修改 env 或 CLI 参数
- 若用户当前运行环境使本次写入无法成为最终有效值，结果中必须提示这一限制
- `apply` 成功不应被简单等价为“Gemini 当前运行状态已经切换完成”

### 17.6.12 Rollback 契约

Gemini 平台的 rollback 应为 **scope 精确回滚**。

要求：

- 只恢复本次被修改的 settings 文件
- 不影响其他 scope
- rollback 后重新计算 effective config 说明
- 若 runtime 覆盖仍存在，应明确提示回滚后的文件状态与最终有效值之间可能不一致

### 17.6.13 Current 检测契约

Gemini 平台的 `detectCurrent()` 不应仅以文件内容全文匹配为基础，而应结合：

- 当前 settings 中托管字段值
- env 覆盖
- CLI args 影响（若可感知）
- profile 中的托管字段视图

建议行为：

1. 提取目标 scope 中的托管字段
2. 结合可观察到的 env/runtime 信息推导 effective config
3. 与统一配置源中的 profile 进行字段级比对
4. 若命中完整托管字段集合，则识别为 managed current
5. 若 runtime 覆盖导致结果不确定，则允许返回 limitation、warning、`managed: false` 或 `matchedProfileId` 为空

### 17.6.14 风险与告警模型

Gemini 平台至少应支持以下 warning 类型：

- `env-overrides-settings`
- `cli-arg-overrides-settings`
- `runtime-effective-value-differs`
- `settings-structure-migrated`
- `settings-structure-unknown-fields-preserved`
- `mcp-preserved`
- `tools-preserved`
- `privacy-telemetry-preserved`

### 17.6.15 实现限制与降级策略

若首版暂时无法完整识别全部 Gemini CLI runtime 覆盖来源，则允许采用受控降级策略，但必须满足：

1. 仍坚持 env-first 与最小托管
2. 仍然只对 user/project settings 做字段级 patch
3. 仍然保留 `mcpServers / tools / telemetry / privacy / context / ui / general` 等保留区
4. 对无法完全解释的 runtime 覆盖显式标注为“部分可解释”
5. 不得因结构兼容压力而退回整文件重建

## 17.7 配置分层与 effective config 模型

前述三个平台虽然在文件格式、层级、事务边界和覆盖来源上存在明显差异，但它们都共享同一个本质问题：**“文件写入结果”并不总是等于“最终生效结果”。**
因此，`api-switcher` 不能只围绕“改文件”设计，还必须围绕“解释最终有效配置”建立统一模型。本节定义跨平台共用的分层抽象与 effective config 语义，为 preview、validate、detectCurrent、rollback 与后续 overlay 能力提供统一基础。

### 17.7.1 设计目标

本节的目标是：

1. 为三平台建立统一的配置分层语言
2. 把“托管字段写入”与“用户扩展配置”清晰分离
3. 把 runtime 覆盖纳入正式解释范围
4. 为 preview / validate 输出提供统一结构
5. 为未来 overlay、schema/version 适配和 capability 计算预留扩展点

### 17.7.2 三层抽象模型

建议将平台最终配置统一抽象为三层：

#### 1. Base 层
由 `api-switcher` 托管，表示与 profile 切换直接相关的最小配置集合。

其特点是：
- 来源于统一配置源 `profiles.json`
- 仅包含托管字段
- 由 adapter 映射到平台真实目标文件
- 是 preview / use / rollback 的核心变更来源

典型内容包括：
- provider
- model
- endpoint / base URL
- auth-reference
- `secret_ref`

#### 2. Overlay 层
表示用户主动维护、但不属于工具托管范围的配置扩展层。

其特点是：
- 默认不由 `api-switcher` 自动生成
- 主要承载用户偏好、MCP、hooks、tools、UI、telemetry、privacy、context 等内容
- 当前阶段可先视为“现有真实配置文件中的保留区”
- 后续如实现 overlay 管理，可提升为显式结构层

#### 3. Runtime 层
表示在运行时覆盖文件配置的即时来源。

其特点是：
- 不一定被写回文件
- 可能高于 file scope 的优先级
- 常见来源包括：
  - environment variables
  - CLI arguments
  - managed policy
  - 更高层 scope 覆盖

### 17.7.3 统一合并顺序

建议以如下顺序解释最终配置：

```text
base -> overlay -> runtime
```

其含义如下：

1. `base` 提供工具托管的切换目标
2. `overlay` 在不破坏 base 的前提下叠加用户保留配置
3. `runtime` 作为最终优先级最高的即时覆盖层，决定最终 effective config

### 17.7.4 File Patch Result 与 Effective Config Result

为避免实现中继续混淆两个层次，建议统一引入两个结果视图：

#### 1. File Patch Result
用于描述本次操作对目标文件本身的影响。

至少应包含：
- 目标文件列表
- 每个文件的托管字段 diff
- `no-op` 判定
- 保留区状态
- 是否需要备份
- 是否涉及多文件事务
- 是否需要确认

#### 2. Effective Config Result
用于描述在层级合并后，最终会对 CLI 行为产生影响的结果。

至少应包含：
- 最终有效 provider
- 最终有效 model
- 最终有效 endpoint / auth-reference
- 覆盖来源
- 无法确定的字段
- shadowed / overridden / managed-policy / runtime override 等 warning

### 17.7.5 覆盖来源模型

为统一表达“为什么某个字段的最终值不是文件里看到的值”，建议引入覆盖来源概念。

统一来源类型建议至少包括：

- `base`
- `overlay`
- `scope-user`
- `scope-project`
- `scope-local`
- `managed-policy`
- `env`
- `cli-arg`
- `unknown-runtime`

对于每个关键托管字段，effective config 解释层应尽量给出：

- 当前最终值
- 当前值来自哪里
- 是否覆盖了本次写入结果
- 是否影响 `detectCurrent()` 与 `use` 的成功语义

### 17.7.6 预览模型

在本抽象下，`preview` 的统一职责应定义为：

1. 解释 **base 层** 将怎样变更
2. 说明 **overlay 层** 哪些内容会被保留
3. 说明 **runtime 层** 是否会覆盖最终结果
4. 输出风险、限制与确认要求

### 17.7.7 Validate 模型

在本抽象下，`validate` 的职责应覆盖三层：

#### Base 层校验
- 托管字段是否完整
- URL / provider / model / auth-reference 是否格式合理
- 是否存在明显风险值

#### Overlay 层校验
- 保留区结构是否仍可解析
- 是否存在与托管字段冲突但来源未知的现值
- 是否存在用户配置与 profile 目标明显冲突的情况

#### Runtime 层校验
- 是否存在 env / CLI / managed 覆盖
- 是否会导致最终 effective config 与 profile 目标不一致
- 是否应给出 limitation 或 warning

### 17.7.8 Current 检测模型

统一的 `detectCurrent()` 也应基于本三层模型来理解。

建议原则：

- 不以整文件全文匹配判断 current
- 优先基于托管字段集合做匹配
- 若 runtime 覆盖存在，则以 effective config 为主
- 若只能部分判断，则允许返回 limitation / warning / `managed: false`

### 17.7.9 Rollback 模型

rollback 的统一抽象也需要考虑三层差异：

- rollback 主要恢复的是 **base 层落盘内容**
- overlay 层应因“未被本次写入触碰”而保持原状
- runtime 层通常不由 rollback 主动重置，只能重新解释其覆盖结果

因此 rollback 结果应明确区分：

1. 文件已恢复
2. 托管字段已恢复
3. 但最终 effective config 是否仍受 runtime 覆盖影响

### 17.7.10 与 overlay 能力的关系

虽然首版不要求完整实现 overlay 管理，但本节模型已经为 overlay 提前预留了位置。

后续若引入 `overlay add/list/remove/apply` 等能力，可直接建立在现有抽象之上：

- base：profile 的固定切换字段
- overlay：可选环境/网络/MCP/功能包
- runtime：本次命令行临时开关

### 17.7.11 与命令语义的关系

本节模型对命令层的直接影响如下：

- `preview`：必须展示 file patch + effective config
- `validate`：必须覆盖 base / overlay / runtime 三层解释
- `use`：成功语义应区分“写入成功”与“最终生效符合预期”
- `current`：应优先展示最终受管状态，而不是某个单文件内容
- `rollback`：应同时说明文件恢复结果与 effective config 状态

## 17.8 Secret 与迁移策略

API 切换工具如果继续把 secret 当作普通字段处理，即使解决了“整文件覆盖”问题，也仍然会在安全层留下明显短板。因此，本节将 secret 管理从“输出脱敏”提升为“存储、写入、导出、迁移全链路安全设计”的正式组成部分。

### 17.8.1 设计目标

本节设计必须实现以下目标：

1. **停止把 secret 作为普通平台配置字段直接持久化**
2. **将 secret 与 profile 的普通配置元信息分离**
3. **为 Claude Code、Codex、Gemini CLI 提供统一的 secret 引用模型**
4. **在 preview / validate / export / rollback 中默认执行脱敏**
5. **为已存在的明文配置提供可恢复、可审计的迁移路径**
6. **在不破坏现有使用链路的前提下逐步完成升级**

### 17.8.2 统一原则

Secret 管理统一遵循以下原则：

1. **最小暴露**
   - secret 不应出现在普通结果输出中
   - secret 不应进入统一配置源的明文字段
   - secret 不应无必要地复制进多个平台文件

2. **引用替代明文**
   - profile 中应优先保存 secret 的引用信息，而不是值本身
   - 平台目标文件应尽量只保留认证方式或引用标识，而不直接保存可复用 secret

3. **默认脱敏**
   - 文本输出、JSON 输出、日志、manifest、export 均默认脱敏

4. **先兼容再收口**
   - 对旧明文数据必须提供迁移兼容，而不是直接假设所有用户都在新模型中

### 17.8.3 统一数据模型

建议在统一配置中心中引入 secret 引用模型，而不是把 token / key 直接挂在 profile 的普通字段里。

示意语义如下：

- `secret_ref`：指向密钥库中的引用键
- `auth_reference`：平台层可理解的认证引用
- `auth_method`：说明使用哪类认证机制
- `secret_source`：可选，说明该 secret 来自 keytar、环境变量或其他安全来源

统一要求：

- `profiles.json` 应保存 profile 元信息与 secret 引用，不保存 secret 明文
- 平台 adapter 接收的是“可解析 secret 的上下文”，而不是默认拿到明文
- 后续如果平台需要文件级认证引用，也应由 adapter 负责安全映射

### 17.8.4 Secret 存储后端

在本地环境下，首选的 secret 存储后端应为系统级安全存储设施，例如：

- Windows Credential Manager
- keytar（作为统一跨平台抽象）
- 其他操作系统原生密钥存储设施

### 17.8.5 平台层 secret 处理要求

#### Claude Code
- 平台配置应优先保存 auth-reference / `secret_ref`
- 不应把 API token 当作普通 settings 字段长期持久化
- preview / validate 只解释认证方式，不显示 secret 值

#### Codex
- `auth.json` 中若存在与认证相关的引用结构，应优先映射为引用而非明文
- 若平台契约暂时要求文件中存在敏感内容，必须在迁移设计中明确这是临时兼容状态，而非长期目标
- `config.toml` 中不得为了方便切换而新增明文 secret 字段

#### Gemini CLI
- 采用 **env-first** 模型
- secret 应尽量通过 env + 密钥库解析注入，而不是写入 `settings.json`
- `settings.json` 应只承载 auth-reference 或非 secret 认证元信息

### 17.8.6 Preview / Validate / Use 中的 secret 处理

#### Preview
- 不显示 secret 明文
- 只显示：
  - 认证方式是否变更
  - secret 引用是否变更
  - 是否存在缺失 secret / 不可解析 secret
  - 是否需要用户确认

#### Validate
- 校验 `secret_ref` 是否可解析
- 校验认证方式与平台能力是否匹配
- 校验 profile 中是否出现明文 secret 遗留
- 若当前平台仍处于兼容明文阶段，应明确给出 warning

#### Use
- 在正式 apply 前解析 secret
- 解析失败时不得继续写入
- 日志与结果中不得回显 secret 值
- 若平台需要临时明文参与落盘，必须在结果中标注风险等级和兼容限制

### 17.8.7 Export 脱敏策略

`export` 必须默认脱敏。

统一要求：

- 默认导出：
  - profile 元信息
  - 平台字段
  - `secret_ref`
  - 风险提示与限制说明
- 默认不导出 secret 明文
- 若未来支持 `--with-secrets`：
  - 必须显式选择
  - 必须二次确认
  - 必须在文本与 JSON 输出中清晰标记“包含敏感信息”
  - 不得在无交互情况下默默放开

### 17.8.8 日志、状态与快照中的脱敏要求

以下对象默认都必须脱敏：

- 文本输出
- JSON 输出
- 错误日志
- `state.json`
- `manifest.json`
- snapshot 索引信息
- 审计记录

需要特别说明的是：

- snapshot 本体若因平台兼容原因不可避免地包含敏感文件副本，仍不应在索引、日志、命令输出中暴露 secret
- snapshot 目录本身应在文档中被视为敏感存储区
- 对外说明时必须明确：回滚快照可能包含历史敏感内容，应谨慎备份、迁移与清理

### 17.8.9 旧明文迁移策略

考虑到现有工具链和历史使用方式中，secret 很可能已经出现在：

- `profiles.json`
- 平台目标文件
- `apiConfigs.json`
- `auth.json`
- 历史导出文件
- 历史备份 / snapshots

因此必须定义受控迁移策略。

统一迁移流程建议如下：

1. 启动时检测旧明文模式
2. 给出“发现明文 secret”的显式提示
3. 先生成迁移前备份
4. 将明文 secret 导入系统密钥库
5. 将统一配置源中的明文字段替换为 `secret_ref`
6. 对平台目标文件按平台规则收敛为引用或运行时注入模型
7. 输出迁移报告与后续处理建议

### 17.8.10 历史风险提示

迁移完成并不意味着历史风险自动消失，因此系统必须向用户明确说明：

- 旧配置文件可能仍包含明文
- 旧导出文件可能仍包含明文
- 旧 snapshot / backup 可能仍包含明文
- 迁移只保证“后续新链路不再继续扩散明文”，不保证历史痕迹被完全清除

### 17.8.11 兼容期策略

考虑首版落地现实，允许存在兼容期，但必须满足以下要求：

1. 兼容期内仍默认优先使用 `secret_ref` 模型
2. 若平台暂时必须接受明文输入，应通过 warning 显式告知
3. 不得因为兼容旧链路，就继续把明文存储设计为首选方案
4. 兼容期结束后，应能平滑切换到“引用优先、明文退场”的正式模型

### 17.8.12 与配置分层模型的关系

Secret 策略与前文分层模型的关系如下：

- Base 层：保存认证方式与 `secret_ref`
- Overlay 层：不应承载 secret 明文
- Runtime 层：必要时由 env 或安全存储解析结果参与最终运行

### 17.8.13 对测试与实现的直接要求

后续实现与测试必须覆盖以下场景：

1. `profiles.json` 中已存在明文 secret 的迁移
2. `secret_ref` 可解析 / 不可解析 / 部分缺失
3. preview / validate / use / export 的默认脱敏
4. snapshot / manifest / state 不泄露敏感值
5. 兼容模式下的 warning 行为
6. 迁移失败后的恢复路径

## 17.9 Preview / Validate / Rollback 补充规范

在前述平台写入契约、配置分层模型与 secret 策略基础上，本节将 `preview`、`validate`、`rollback` 三个核心命令的行为进一步统一为跨平台可执行规范。

### 17.9.1 设计目标

本节补充规范必须实现以下目标：

1. **让 `preview`、`validate`、`rollback` 围绕同一套写入契约工作**
2. **保证三平台命令体验一致，但允许平台能力差异通过限制说明暴露**
3. **将“文件级结果”和“effective config 结果”统一纳入输出模型**
4. **在安全默认前提下给出充分解释，而不是只返回成功/失败**
5. **为后续 renderer、JSON 输出、集成测试与 CLI 自动化提供稳定契约**

### 17.9.2 `preview` 的统一职责

`preview` 的职责不应被理解为“提前打印 diff”，而应被定义为：

> 在正式写盘前，完整解释本次切换将如何影响目标文件、最终有效配置、风险边界与恢复路径。

因此，`preview` 必须同时回答以下四个问题：

1. **会改哪些文件？**
2. **会改哪些托管字段？**
3. **哪些用户字段/保留区不会被碰？**
4. **改完以后最终是否真的会生效？**

### 17.9.3 `preview` 的统一输出结构

无论平台差异如何，`preview` 的结果模型都应至少包含以下几类信息：

#### 1. 目标对象
- `platform`
- `profileId`
- profile 基本信息

#### 2. 文件级视图
- 目标文件列表
- 每个目标文件的格式与存在状态
- 每个目标文件的托管范围摘要
- 每个目标文件的 diff 摘要
- 是否为 `no-op`

#### 3. Effective config 视图
- 最终有效 provider
- 最终有效 model
- 最终有效 endpoint / auth-reference
- 覆盖来源说明
- 是否存在 shadowed / env override / managed policy / unknown runtime

#### 4. 风险与限制
- 风险等级
- 是否需要确认
- 是否计划创建备份
- 是否存在受限能力
- 平台 warning / limitation 列表

#### 5. 保留区说明
- 哪些非托管字段被保留
- 是否检测到未知键透传
- 是否存在当前文件中的 unmanaged 冲突值

### 17.9.4 `preview` 的平台特定补充要求

#### Codex
`preview` 必须明确：
- 本次是否涉及多文件事务
- `config.toml` 与 `auth.json` 分别会改什么
- 是否存在 provider 子树冲突
- 同一 `backupId` 将覆盖哪些文件

#### Claude Code
`preview` 必须明确：
- 写入的是哪个 scope
- 文件级变化是否会被更高层 scope 覆盖
- 是否存在 managed settings 约束
- hooks / permissions / sandbox / MCP / statusLine 已被保留

#### Gemini CLI
`preview` 必须明确：
- patch 的是哪个 settings scope
- env / CLI args 是否覆盖最终值
- settings 结构是否发生兼容迁移
- `mcpServers / tools / privacy / telemetry / context / ui / general` 已被保留

### 17.9.5 `validate` 的统一职责

`validate` 的职责不应仅被理解为“字段格式校验”，而应被定义为：

> 在不写盘的前提下，判断某个 profile 是否具备可信切换条件，并明确指出阻塞问题、风险问题与限制问题。

统一来说，`validate` 应覆盖三类问题：

1. **这个 profile 本身是否合法？**
2. **这个 profile 写入当前平台是否安全？**
3. **即使写入成功，最终是否真的可能按预期生效？**

### 17.9.6 `validate` 的统一校验分层

#### 1. Base 层校验
- 托管字段是否完整
- provider / model / endpoint / auth-reference 是否格式正确
- 是否缺少必须 secret 或 `secret_ref`
- 是否存在高风险 URL / endpoint 形式

#### 2. Overlay 层校验
- 目标文件中非托管结构是否仍可解析
- 是否存在与托管字段冲突但来源未知的值
- 是否存在平台保留区被误改风险

#### 3. Runtime 层校验
- 是否存在 scope 覆盖
- 是否存在 env / CLI 覆盖
- 是否存在 managed policy 限制
- 是否导致最终 effective config 难以确定或与 profile 目标不一致

### 17.9.7 `validate` 的结果语义

`validate` 的结果不应只有二元成功/失败，而应至少支持以下层次：

#### 1. error
表示必须阻止 `use` 的问题，例如：
- profile 不完整
- secret 缺失
- 必要字段非法
- 平台目标文件不可解析
- 写入契约无法安全成立

#### 2. warning
表示允许继续，但必须向用户解释的风险，例如：
- env 会覆盖 settings
- 当前文件存在 unmanaged 冲突值
- 存在未知字段但已保留
- 当前能力受限但仍可执行

#### 3. limitation
表示平台或当前环境存在能力边界，例如：
- Gemini 当前无法稳定 detectCurrent
- Claude 当前 effective config 仅部分可解释
- Codex 当前某类格式保留能力有限

### 17.9.8 `rollback` 的统一职责

`rollback` 的职责不应被理解为“把文件写回去”，而应被定义为：

> 将本次切换影响的托管文件恢复到同一快照状态，并重新解释恢复后的当前有效配置。

因此，`rollback` 至少要回答：

1. **恢复了哪些文件？**
2. **这些文件是否都恢复成功？**
3. **恢复后当前平台状态如何解释？**
4. **是否仍存在 runtime / scope / managed 覆盖影响？**

### 17.9.9 `rollback` 的统一行为规范

统一要求如下：

1. 只能基于有效 `backupId` 执行
2. 必须按快照 manifest 恢复本次切换改动涉及的全部文件
3. 若原文件不存在，则按 manifest 恢复“缺失”语义
4. 回滚成功后必须更新 `state.json`
5. 回滚结果必须说明恢复范围、限制与后续状态解释
6. 不允许把 rollback 变成“重置整个平台全部配置”的危险操作

### 17.9.10 `rollback` 的平台特定补充要求

#### Codex
- 必须恢复 `config.toml + auth.json` 的事务一致状态
- 不能只恢复其中一个文件并仍宣称 rollback 成功
- 必须输出多文件恢复摘要

#### Claude Code
- 必须按 scope 回滚
- 不能把 user/project/local 的恢复混为一次全局重置
- 回滚后仍需解释 effective config 是否受更高层覆盖

#### Gemini CLI
- 必须按 settings scope 回滚
- 回滚后要重新解释 env / CLI args 是否仍覆盖该文件状态
- 不能把 runtime 层误当成 rollback 的恢复对象

### 17.9.11 `preview`、`validate`、`rollback` 与 `use` 的关系

为保证主链路一致，建议明确以下关系：

#### `preview`
- 是 `use` 的前置解释模型
- 输出应足以支撑用户做确认决策
- `use --dry-run` 应直接复用 `preview`

#### `validate`
- 是 `preview` 与 `use` 的前置约束模型
- 若 `validate` 返回 error，则不得进入写入
- 若返回 warning / limitation，则应在 `preview` 与 `use` 中继续暴露

#### `rollback`
- 是 `use` 的恢复镜像
- 使用与 `use` 同一批快照与托管文件语义
- 不应发明独立于 `use` 的恢复规则

### 17.9.12 JSON 输出与文本输出的一致性要求

为了保证脚本调用和人工阅读都稳定，本节建议：

#### JSON 输出
必须提供稳定结构，至少包含：
- `action`
- `ok`
- `data`
- `warnings`
- `limitations`
- `error`

对于 `preview / validate / rollback`，还应进一步稳定：
- `targetFiles`
- `diffSummary`
- `effectiveConfig`
- `riskLevel`
- `requiresConfirmation`
- `backupPlanned`
- `noChanges`

#### 文本输出
必须保证用户能直接读懂：
- 改了什么
- 没改什么
- 是否真的生效
- 风险在哪
- 下一步怎么做

### 17.9.13 失败与部分成功的表达规范

#### `preview`
一般不应存在“部分成功”概念；要么成功生成解释结果，要么失败并说明为什么无法安全预览。

#### `validate`
允许出现：
- 校验失败（error）
- 校验通过但有 warning
- 校验通过但存在 limitation

#### `rollback`
在多文件平台上可能出现“部分恢复失败”风险，但结果表达必须非常清楚：
- 已恢复文件
- 未恢复文件
- 建议下一步
- 当前状态是否可信

### 17.9.14 与审计和状态记录的关系

虽然首版不要求完整审计系统，但本节命令结果已经天然构成审计基础。

因此建议：

- `preview` 结果可作为“计划变更记录”
- `validate` 结果可作为“变更前风险快照”
- `rollback` 结果可作为“恢复动作记录”
- `state.json` 中至少保存：
  - 最近一次成功 use / rollback
  - 相关 `backupId`
  - platform
  - profileId
  - 状态
  - 时间

## 17.10 测试策略与分阶段实施

本章前述内容已经定义了三平台托管边界、平台写入契约、分层模型与命令行为规范；要让这些设计真正可落地，必须把验证方式与实施顺序一并明确。否则，平台写入策略很容易停留在“文档上合理”，而在实现中退化为局部 patch、临时判断和不可回归的隐性分支。

### 17.10.1 设计目标

本节的目标是：

1. 将平台写入策略转化为可执行、可回归的测试要求
2. 明确首版实施优先级，避免一次性铺开导致实现失控
3. 确保“写得安全”优先于“支持得全面”
4. 为后续 overlay、schema/version 适配、审计增强预留平滑演进路径

### 17.10.2 测试总原则

平台写入策略相关测试应遵循以下原则：

1. **边界优先于功能面**
   - 优先验证“不会误伤用户配置”
   - 再验证“能不能支持更多字段”

2. **真实样本优先于纯理想样本**
   - 夹具不应只包含干净模板文件
   - 还应包含真实用户手改、未知键、额外注释、扩展段等样本

3. **结果解释优先于返回码**
   - 不只看命令成功/失败
   - 还要验证 diff、warning、effective config、rollback 摘要是否正确

4. **跨平台统一断言，平台特性单独加测**
   - `preview / validate / use / rollback` 的通用契约应统一验证
   - Codex / Claude / Gemini 的特有能力和限制再分别验证

### 17.10.3 测试分层补充

在现有第十二章测试设计基础上，本章新增策略建议重点补充以下维度。

#### 1. 写入边界单元测试
覆盖：

- 仅托管字段被更新
- 非托管字段保持不变
- 未知顶层键保留
- 托管子树中的未知键保留
- `delete-owned` 只删除工具明确拥有的字段
- `no-op` 情况不写盘

#### 2. 格式稳定性测试
覆盖：

- Codex TOML 注释尽量保留
- TOML 表顺序尽量稳定
- JSON 保留区结构不丢失
- 原文件换行风格与编码不被无谓改变
- 相同 profile 连续切换不产生额外噪音 diff

#### 3. Effective config 解释测试
覆盖：

- Claude 多 scope 覆盖关系
- Claude managed/shadowed 提示
- Gemini env 覆盖 settings
- Gemini CLI args 覆盖 settings
- 文件变化与最终 effective config 不一致时的 warning

#### 4. Secret 与脱敏测试
覆盖：

- `secret_ref` 可解析 / 不可解析
- 文本输出默认脱敏
- JSON 输出默认脱敏
- export 默认不导出 secret 明文
- snapshot 索引与 state 不泄露 secret
- 旧明文迁移流程与错误恢复

#### 5. 回滚一致性测试
覆盖：

- 单文件平台恢复正确
- Codex 多文件事务恢复正确
- Claude 按 scope 回滚
- Gemini 按 settings scope 回滚
- rollback 后 effective config 解释正确
- 部分恢复失败时的结果表达清晰

### 17.10.4 平台专项回归要求

#### Codex 专项
至少覆盖：

- `config.toml + auth.json` 同时预览
- 多文件统一备份
- 多文件统一 apply
- 任一文件写入失败时的中止与回滚路径
- provider 子树未知字段保留
- `detectCurrent()` 基于托管字段而不是全文匹配

#### Claude Code 专项
至少覆盖：

- user / project / local 三种 scope
- 指定 scope patch 后其他 scope 不受影响
- hooks / permissions / sandbox / statusLine / MCP 保留
- shadowed 检测
- managed policy 提示
- rollback 按 scope 恢复

#### Gemini CLI 专项
至少覆盖：

- user/project settings patch
- env 覆盖提示
- CLI 覆盖提示
- settings 旧/新结构兼容
- `mcpServers / tools / telemetry / privacy / context / ui / general` 保留
- `detectCurrent()` 在 runtime 覆盖下的 limitation 表达

### 17.10.5 推荐夹具设计

建议为三平台分别建立以下夹具类型：

#### 1. 最小干净样本
用于验证基本写入链路。

#### 2. 用户扩展样本
包含大量非托管字段，例如：
- Codex：features/network/profiles/audit
- Claude：hooks/permissions/sandbox/statusLine/MCP
- Gemini：mcpServers/tools/context/telemetry/privacy/ui

用于验证保留区不会被破坏。

#### 3. 未知键样本
刻意加入当前 schema 未定义字段，用于验证透传保留。

#### 4. 冲突样本
包含当前文件中与托管字段冲突但来源未知的值，用于验证 warning 与 limitation 行为。

#### 5. 迁移样本
包括：
- Gemini 旧/新 settings 结构
- 历史明文 secret 配置
- 旧式整文件覆盖遗留样本

#### 6. 幂等样本
同一 profile 连续切换多次，用于验证：
- 不产生无关 diff
- 不重复创建快照
- 不反复污染文件结构

### 17.10.6 命令级验收要求

为确保命令层行为稳定，以下验收断言建议成为平台写入策略相关的最低标准：

#### `preview`
- 能正确列出目标文件
- 能正确列出 diff 摘要
- 能显示保留区说明
- 能显示 effective config 解释
- 能显示 warning / limitation / riskLevel
- `no-op` 情况输出明确

#### `validate`
- 能区分 error / warning / limitation
- 能校验 secret 引用
- 能提示 runtime 覆盖
- 能识别禁止覆盖区未被触碰
- 能对受限平台能力给出说明

#### `use`
- 先 validate 再 preview 再 backup 再 apply
- `no-op` 不写盘
- 写入结果与 preview 保持一致语义
- 成功后 state 更新正确
- 失败时恢复路径清晰

#### `rollback`
- 能恢复目标文件
- 能正确输出恢复摘要
- 能重新解释当前 effective config
- 多文件/多 scope 情况行为一致

### 17.10.7 分阶段实施建议

为了保证实现风险可控，建议按以下顺序推进。

#### Phase 1：写入边界收口
目标：先消除“整文件覆盖”和“误伤用户字段”的核心风险。

完成内容：
- Codex：字段级 TOML patch 基础能力
- Claude：scope-aware JSON patch 基础能力
- Gemini：env-first + 小范围 JSON patch
- 托管边界声明
- 保留区透传
- `no-op` 检测
- 原子写入
- 基础 backup / rollback

这一阶段的完成标准是：
- 三平台都不再依赖整文件重写
- 能安全完成最小托管字段切换

#### Phase 2：解释能力补齐
目标：让系统不只会改文件，还能解释结果。

完成内容：
- effective config 结果模型
- Claude shadowed / managed-policy 检测
- Gemini env / CLI override 检测
- preview 补充保留区与覆盖来源说明
- validate 分层结果（error / warning / limitation）

这一阶段的完成标准是：
- 用户能看懂“改了什么”和“最终会不会生效”之间的关系

#### Phase 3：Secret 收口与迁移
目标：停止继续扩散明文 secret 风险。

完成内容：
- `secret_ref` 模型
- keytar / Credential Manager 接入
- export 默认脱敏
- 旧明文迁移流程
- 历史风险提示
- 相关校验与回归测试

这一阶段的完成标准是：
- 新链路默认不再以明文方式管理 secret
- 旧链路存在清晰迁移路径

#### Phase 4：增强与演进能力
目标：在核心写入闭环稳定后补足高级能力。

完成内容：
- overlay 管理
- schema/version/capability 适配
- 审计增强
- 更细粒度冲突解释
- 更完善的跨平台导入导出与报告能力

这一阶段的完成标准是：
- 平台策略从“安全可用”升级为“可演进、可扩展、可审计”

### 17.10.8 MVP 完成标准

若以本章为准，首版 MVP 至少应满足以下条件：

1. Codex / Claude / Gemini 三平台都已停止整文件覆盖
2. 三平台都具备明确的托管边界
3. `preview / validate / use / rollback` 已共享统一语义
4. 非托管字段与未知键在真实样本中稳定保留
5. Codex 多文件、Claude 多 scope、Gemini runtime 覆盖三类关键差异都已有测试兜底
6. secret 管理已经具备明确升级路径，且默认输出不泄露敏感信息

### 17.10.9 与现有章节的衔接

本节将本章前述策略转化为落地顺序与验证要求：

- 承接 17.3～17.6：把平台边界与平台契约转成测试清单
- 承接 17.7：把 effective config 模型转成解释性测试
- 承接 17.8：把 secret 设计转成迁移与脱敏测试
- 承接 17.9：把命令行为规范转成命令级验收标准

其最终目标是：确保“平台配置写入策略深化”不是一组抽象原则，而是一套能够指导实现优先级、评估完成度并支撑长期回归的工程化落地方案。
