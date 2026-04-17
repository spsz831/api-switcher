# Gemini Project Scope Stage 2 Product Surface Design

## Context

截至当前仓库状态，Gemini `project scope` 已具备以下能力：

- `preview --scope project`
- `use --scope project --force`
- `rollback --scope project`
- `scopeCapabilities` / `scopeAvailability` / `scopePolicy` 已进入 JSON 与文本输出
- `project scope` availability failure、confirmation failure、rollback mismatch 已被区分

这意味着“安全执行链路”已经成立，但“更完整产品面”还没有完全定义。现在缺的不是底层写入能力，而是下面三类产品边界：

1. project root discovery failure 应该如何稳定呈现
2. user -> project 写入切换是否应该被当作更高阶、可发现但受控的能力
3. export 现在已经携带 scope fidelity；未来 import 应如何保真、但又不信任旧环境观察

## Decision Summary

本阶段继续采用 **方案 2：半开放、强解释、强确认**。

结论：

- 默认写入目标仍保持 `user`
- `project scope` 继续作为显式 opt-in 能力
- 但它不再只是“高级开关”，而是一个完整、可发现、可解释的产品面
- 任何与当前环境解析失败相关的问题，都优先呈现为 availability failure，而不是确认失败
- `export` 允许保留 scope fidelity
- 未来 `import` 必须重新解析本地 scope availability，不能信任导出环境的 project 可用性

本阶段仍然 **不** 做：

- 默认自动切到 `project`
- 自动从 user 升级到 project
- 自动推断/修正 project root
- 基于导出结果直接执行 project-scope import write-back

## Product Goals

- 让用户清楚区分“平台支持 project scope”和“当前环境现在能不能用 project scope”
- 让 `project root` 发现失败成为一等产品状态，而不是隐藏的路径异常
- 让 `--force` 只承担风险确认，不承担环境修复
- 让 `export` 可以表达 scope fidelity，但不把环境观察误包装成可迁移真相
- 为未来 `import` 留出稳定 contract，而不提前开放危险写入

## Non-Goals

- 不改变 Gemini 默认写入目标
- 不引入交互式 prompt
- 不增加 project-scope 批量写入
- 不实现导入时自动创建或迁移 project root
- 不让 `--force` 越过 availability gate

## Core Product Model

Gemini `project scope` 的完整产品面分成四层：

1. **Capability**
   - 平台理论上支持 `project`
   - 由 `scopeCapabilities` 表达
2. **Availability**
   - 当前环境里 `project` 现在是否可解析、可写
   - 由 `scopeAvailability` 表达
3. **Risk**
   - 即使可写，切到 `project` 是否属于高风险
   - 由 `scopePolicy.highRisk` 和 `riskWarning` 表达
4. **Integrity**
   - rollback/import 等操作是否与原 scope 保持一致
   - 由 `scopePolicy.rollbackScopeMatchRequired` 和后续 import fidelity 约束表达

只有前两层都通过，第三层才有意义；第四层用于恢复和迁移语义，不参与“是否能写”的首轮决策。

## Stage-2 UX Rules

### Rule 1: Availability Before Confirmation

Gemini `project scope` 统一采用两段闸门：

1. availability gate
2. confirmation gate

具体规则：

- `status !== available` 时，直接失败
- 此时输出 remediation，不输出“加 --force 即可”
- 只有 `status = available` 时，`--force` 才有意义

### Rule 2: Discovery Failure Is Product State, Not IO Noise

对用户来说，`PROJECT_ROOT_UNRESOLVED` 和 `PROJECT_SCOPE_PATH_UNAVAILABLE` 都属于“当前项目上下文还没准备好”，不是异常堆栈。

因此文本和 JSON 应稳定表达：

- 当前失败属于 availability failure
- 原因是什么
- 下一步怎么修
- 当前不要继续做 risk confirmation

### Rule 3: Export Preserves Fidelity, Import Re-resolves Reality

`export` 可以保留：

- `scopeCapabilities`
- `scopeAvailability`
- `defaultWriteScope`
- 未来可选的 `observedAt`

但这些字段只代表导出时观察到的环境，不代表导入机的真实环境。

因此未来 `import` 的产品规则必须是：

- 可展示导出时 scope fidelity
- 真正落盘前必须重新解析本地 availability
- 如果本地 project scope 不可用，则只能停在 preview/validation，不能靠导出文件强行写入

## Project Root Discovery UX

### Stable Reason Codes

继续冻结并复用以下 code：

- `PROJECT_ROOT_UNRESOLVED`
- `PROJECT_SCOPE_PATH_UNAVAILABLE`
- `PROJECT_SCOPE_NOT_RESTORABLE`

### Stable Human Messages

#### `PROJECT_ROOT_UNRESOLVED`

- `reason`: `当前无法解析 Gemini project scope 的 project root。`
- `remediation`: `请在项目目录中运行，或显式提供 API_SWITCHER_GEMINI_PROJECT_ROOT。`

#### `PROJECT_SCOPE_PATH_UNAVAILABLE`

- `reason`: `Gemini project scope 的 settings.json 路径当前不可用。`
- `remediation`: `请检查 project root 是否有效，以及 .gemini/settings.json 目标路径是否可解析。`

#### `PROJECT_SCOPE_NOT_RESTORABLE`

- `reason`: `当前上下文无法按 Gemini project scope 恢复该快照。`
- `remediation`: `请在原 project root 下执行回滚，或改为匹配快照 scope 的恢复方式。`

### Text Output Requirements

当 discovery 失败时，文本输出至少要出现：

- `作用域策略`
- `作用域可用性`
- `原因代码`
- `建议`

且不得出现误导性措辞，例如：

- “请加 `--force`”
- “高风险操作需要确认”

除非 availability 已经通过。

## Confirmation Strategy

Gemini `project scope` 的确认门槛继续维持高标准，但要更精确。

### Trigger

仅在下列条件同时满足时触发确认：

- 请求或解析后的目标 scope 为 `project`
- `scopeAvailability(project).status === 'available'`

### Required Detail

确认失败时的结构化结果应继续包含：

- `risk`
- `scopePolicy`
- `scopeCapabilities`
- `scopeAvailability`

其中 `scopeAvailability` 的作用不是重复解释风险，而是明确告诉调用方：

- 这不是环境失败
- 这是“环境已就绪，但用户还没有确认”

### Messaging Requirement

针对 `user -> project` 切换，风险文案必须始终强调：

- `project` 会覆盖 `user`
- 影响范围是当前项目，不是全局用户目录
- 即便 project 写入成功，更高 precedence 的 `system-overrides` 仍可能覆盖最终生效值

## Discoverability Policy

本阶段对 discoverability 的定义是：

- `current/list/export` 可以稳定展示 `project scope` 的 capability 与 availability
- CLI help 和文档明确列出 Gemini 支持 `user/project`
- 失败文案清楚解释为什么当前项目不能用 `project`

但 discoverability 不等于默认执行：

- `use gemini-prod` 仍写 `user`
- `use gemini-prod --scope project --force` 才写 `project`

这保持了“用户先看到能力，再主动进入高风险路径”的产品节奏。

## Export Fidelity

### What Export Means

对 Gemini 来说，导出结果现在表达两类信息：

1. 平台级真相
   - `scopeCapabilities`
   - `defaultWriteScope`
2. 导出时环境观察
   - `scopeAvailability`
   - 未来可选 `observedAt`

### Recommended Future Extension

如后续需要更强调“环境观察而非平台真相”，推荐引入：

```ts
type ExportedProfileItem = {
  profile: Profile
  validation?: ValidationResult
  scopeCapabilities?: ScopeCapability[]
  scopeAvailability?: ScopeAvailability[]
  defaultWriteScope?: string
  observedAt?: string
}
```

`observedAt` 不参与执行，只用于：

- 调试
- UI 标注“这是导出时观察值”
- 未来 import preview 的 traceability

## Import Boundary

Stage 2 设计时仓库尚未实现 `import`。当前已进入 Phase 3，并已补上 `import preview`；因此这里保留的边界声明，应该解释为：

- 本设计只冻结 Stage 2 的 import contract 原则
- 当前已实现的是 read-only `import preview`
- 仍然没有 `import apply`
- 任何导入写回语义仍需单独设计

### Future Import Should Support

- 读取导出的 `defaultWriteScope`
- 保留原始导出的 `scopeCapabilities`
- 保留原始导出的 `scopeAvailability` 作为“历史观察”
- 在 import preview 中对比：
  - exported observation
  - local re-resolved availability

### Future Import Must Not Support

- 直接相信导出环境的 `project` 可用性
- 因为导出里有 `path` 就在导入机直接写
- 自动创建、迁移或替换 project root
- 通过 `--force` 越过本地 availability failure

### Future Import Decision Table

#### Case A: exported project available, local project available

- 允许 preview project-targeted import
- 真正写入仍需显式确认

#### Case B: exported project available, local project unresolved

- 只允许显示 fidelity mismatch
- 不允许 project write-back
- 提示用户修复本地 project root 或改用 user scope 重新建档

#### Case C: exported project unavailable, local project available

- 默认仍不自动升级到 project
- 可在 preview 中提示“本地可用，但导出时未启用”

## Recommended Implementation Scope

第二阶段的代码工作建议控制在“产品面补完”，不要提前跳到 import 实现。

### Should Do Now

- 统一 project root failure 的中英文文案与测试
- 为 discovery failure 增加更明确的 CLI 文本覆盖
- 在 `export` 中增加 `observedAt` 时戳
- README / schema 文档补上“export observation is not import truth”

### Should Defer

- `import apply`
- project-scope 导入回写
- interactive confirmation prompt
- 任何默认从 user 升级到 project 的逻辑

## Acceptance Criteria

本阶段设计落地后，应满足：

1. 用户可以从 `current/list/export` 直接看见 Gemini `project scope` 当前是否可用
2. 用户在 `preview/use/rollback --scope project` 失败时，能分清是 availability 问题还是 confirmation 问题
3. project root 失败文案统一、稳定、可修复
4. `--force` 不再被误解为环境修复开关
5. `export` 可以保留 scope fidelity，但文档明确说明其仅为环境观察
6. 后续实现 `import` 时，不需要推翻现有 contract

## Recommendation

建议把本设计作为当前阶段的产品冻结基线：

- 代码层继续只做小范围收口
- 不提前做 `import apply`
- 下一轮如果继续开发，应优先实现：
  1. `export.observedAt`
  2. README / public schema 对 import boundary 的明确声明
  3. 如需进入 Phase 3，再单独开 `import preview` 设计和实现计划
