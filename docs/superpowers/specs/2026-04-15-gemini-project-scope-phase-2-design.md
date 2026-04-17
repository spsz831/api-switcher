# Gemini Project Scope Phase 2 Design

## Context

Gemini project-scope write support is already available as an explicit opt-in path:

- `preview --scope project`
- `use --scope project --force`
- `rollback --scope project`

However, the current product surface is still incomplete:

- `project scope` availability is implied rather than modeled directly
- project root discovery failure is not exposed as a first-class product state
- high-risk confirmation and environment-resolution failure are not clearly separated
- `export` preserves platform capability but not enough environment-specific scope availability context

Phase 1 intentionally prioritized safety:

- multi-scope detection and precedence explanation
- explicit target-scope parameterization for `preview/use/rollback`
- scope-precise backup and rollback semantics
- high-risk `project scope` confirmation gate

Phase 2 should keep those safety properties while making Gemini `project scope` a more complete product surface.

## Product Direction

This phase adopts a **semi-open** model:

- default Gemini write target remains `user`
- `project scope` remains explicit opt-in
- `project scope` becomes fully discoverable and explainable in command output
- environment resolution failures become structured product states rather than incidental implementation details

This phase does **not** make Gemini `project scope` a default write target.

## Goals

- Make Gemini `project scope` availability a first-class structured state.
- Distinguish platform capability from environment availability.
- Expose project-root discovery failure with machine-readable reason codes and human remediation.
- Upgrade `current/list/preview/use/rollback/export` to report scope availability consistently.
- Preserve safe semantics:
  - unresolved/blocked project scope must not be confirmable
  - only available project scope may proceed to `--force` confirmation
- Improve export fidelity without making import trust stale environment observations.

## Non-Goals

- Do not change the default Gemini write target from `user` to `project`.
- Do not introduce automatic user-to-project write escalation.
- Do not introduce multi-scope writes in a single operation.
- Do not implement Gemini project-scope import write-back.
- Do not infer or mutate project root automatically from exported observations.

## Core Principle

Two different questions must remain separate:

1. **Can the platform support this scope in theory?**
   Answered by `scopeCapabilities`.
2. **Can this command use this scope in the current environment right now?**
   Answered by `scopeAvailability`.

These must not be collapsed into one field.

## Proposed State Model

### New Types

```ts
type ScopeAvailabilityStatus = 'available' | 'unresolved' | 'blocked'

type ScopeAvailability = {
  scope: string
  status: ScopeAvailabilityStatus
  detected: boolean
  writable: boolean
  path?: string
  reasonCode?: string
  reason?: string
  remediation?: string
}
```

### Field Semantics

- `scope`: scope identifier such as `user`, `project`, `system-defaults`
- `status`:
  - `available`: scope is resolvable and may participate in the current command
  - `unresolved`: scope is theoretically supported but cannot currently be resolved
  - `blocked`: scope is resolved or known, but current policy or request semantics prohibit use
- `detected`: whether this scope participates in current detection/effective-state reasoning
- `writable`: whether this scope corresponds to a writable target in the current environment
- `path`: resolved path when available and safe to show
- `reasonCode`: machine-readable classification for non-available states
- `reason`: human-readable explanation
- `remediation`: concise next action for the user

### Gemini Expectations

For Gemini:

- `system-defaults`
  - typically `available`
  - `writable = false`
- `user`
  - typically `available`
  - `writable = true`
- `project`
  - may be `available`, `unresolved`, or `blocked`
  - `writable = true` only when `status = available`
- `system-overrides`
  - typically `available`
  - `writable = false`

## Reason Codes

Phase 2 should freeze the following Gemini project-scope reason codes:

- `PROJECT_ROOT_UNRESOLVED`
  - no usable project root is available
- `PROJECT_SCOPE_PATH_UNAVAILABLE`
  - project root exists or was requested, but the target settings path cannot be resolved safely
- `PROJECT_SCOPE_NOT_RESTORABLE`
  - rollback cannot restore the requested project scope in the current context

Existing failure codes still apply at the command-error level:

- `CONFIRMATION_REQUIRED`
- `ROLLBACK_SCOPE_MISMATCH`

### Separation of Concerns

- `PROJECT_ROOT_UNRESOLVED` and `PROJECT_SCOPE_PATH_UNAVAILABLE` are **availability failures**
- `CONFIRMATION_REQUIRED` is a **risk confirmation failure**
- `ROLLBACK_SCOPE_MISMATCH` is a **scope integrity failure**

Availability failure must occur before risk confirmation is even considered.

## Decision Model

Gemini `project scope` commands should follow a two-stage gate.

### Stage 1: Availability Gate

If requested scope is `project` and `scopeAvailability(project).status !== 'available'`:

- block the operation
- do not continue to confirmation evaluation
- return structured availability failure context

This applies to:

- `preview --scope project`
- `use --scope project`
- `rollback --scope project`

### Stage 2: Risk Confirmation Gate

If requested scope is `project` and availability is `available`:

- continue risk evaluation
- require explicit confirmation via `--force`
- return `CONFIRMATION_REQUIRED` if confirmation is missing

This keeps environment failure and risk acceptance cleanly separated.

## Command Contract Changes

`scopeCapabilities` remains unchanged and continues to describe platform-level support.

Phase 2 adds `scopeAvailability` to relevant command outputs.

### current --json

Add `scopeAvailability?: ScopeAvailability[]` to each Gemini detection result.

Purpose:

- show whether `project scope` is currently usable
- show whether current effective-state reasoning included a resolved project layer
- expose remediation when project root is missing

Interpretation:

- `currentScope` remains the effective contributing scope after precedence merge
- `scopeAvailability` explains whether `project` could be targeted, not whether it currently wins precedence

### list --json

Add `scopeAvailability?: ScopeAvailability[]` to each profile row.

Purpose:

- allow CLI/UI to decide whether project-scope actions should be offered
- avoid making callers infer availability from path heuristics

### preview --json

Add `scopeAvailability?: ScopeAvailability[]` to `PreviewCommandOutput`.

Behavior:

- if `--scope project` is requested and project scope is unavailable, preview should fail structurally
- preview should not succeed with a hidden guarantee that `use` would later fail on resolution

Recommendation:

- reuse existing failure envelope
- include `scopeAvailability` in `error.details`

### use --json

Add `scopeAvailability?: ScopeAvailability[]` to `UseCommandOutput`.

Failure behavior:

- if availability gate fails, return a non-confirmation failure result
- if availability succeeds but confirmation is missing, keep returning `CONFIRMATION_REQUIRED`
- include `scopeAvailability` in `error.details` for both cases

### rollback --json

Add `scopeAvailability?: ScopeAvailability[]` to `RollbackCommandOutput`.

Failure behavior:

- unresolved project scope should fail before scope-mismatch restoration is attempted
- scope mismatch should continue returning `ROLLBACK_SCOPE_MISMATCH`
- `error.details` should include both `scopePolicy` and `scopeAvailability`

### export --json

Add environment-observation metadata without promoting it to portable truth.

Recommended shape:

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

Interpretation:

- `scopeCapabilities`: portable platform contract
- `scopeAvailability`: observation from the exporting environment only
- `defaultWriteScope`: stable product policy, for Gemini currently `user`
- `observedAt`: timestamp for debugging and traceability

## Text Output Behavior

Text output should mirror the same conceptual split:

- `作用域能力` answers what the platform supports
- `作用域可用性` answers what the current environment can resolve and execute

For Gemini `project scope`, the user should be able to read:

- whether it is available
- why it is unavailable if not
- how to fix it
- whether `--force` is relevant yet

If the issue is availability, the output must not suggest that adding `--force` would help.

## Project Root Discovery UX

### Required Behavior

Project-root discovery failure must become a first-class user-facing state.

It must not be:

- silently omitted
- implied only by missing target paths
- confused with confirmation-required risk

### Recommended Human Messages

For `PROJECT_ROOT_UNRESOLVED`:

- `reason`: `当前无法解析 Gemini project scope 的 project root。`
- `remediation`: `请在项目目录中运行，或显式提供 API_SWITCHER_GEMINI_PROJECT_ROOT。`

For `PROJECT_SCOPE_PATH_UNAVAILABLE`:

- `reason`: `Gemini project scope 的 settings.json 路径当前不可用。`
- `remediation`: `请检查 project root 是否有效，以及 .gemini/settings.json 目标路径是否可解析。`

For `PROJECT_SCOPE_NOT_RESTORABLE`:

- `reason`: `当前上下文无法按 Gemini project scope 恢复该快照。`
- `remediation`: `请在原 project root 下执行回滚，或改为匹配快照 scope 的恢复方式。`

## Export and Import Boundary

Phase 2 improves export fidelity but intentionally stops short of import write-back.

### Export Should Preserve

- profile data
- platform scope capabilities
- observed scope availability
- default write policy

### Import Should Not Assume

- that exported `project` availability still holds in the new environment
- that exported project root is valid on the importing machine
- that project-scope writes may proceed automatically

Therefore:

- export may carry observed environment context
- import must still re-resolve local Gemini scope availability before any write

## Backward Compatibility

This phase should be additive:

- existing `scopeCapabilities` remains valid
- existing `scopePolicy` remains valid
- existing error codes remain valid
- new `scopeAvailability` is added as optional public contract

Older clients that do not understand `scopeAvailability` should continue functioning.

## Testing Requirements

Phase 2 should add or update tests covering:

1. `current/list` expose Gemini `scopeAvailability`
2. `preview --scope project` fails structurally when project root is unresolved
3. `use --scope project` distinguishes:
   - availability failure
   - confirmation failure
4. `rollback --scope project` distinguishes:
   - availability failure
   - scope mismatch failure
5. `export` includes `scopeAvailability` and `defaultWriteScope`
6. public JSON schema and documentation include the new field
7. text renderer prints `作用域可用性` with remediation

## Recommended Implementation Order

1. Add shared `ScopeAvailability` types
2. Extend Gemini scope resolver to produce availability states
3. Attach `scopeAvailability` to Gemini command results
4. Update failure details for preview/use/rollback
5. Extend export contract
6. Update text renderer and README/public schema docs
7. Add unit and integration coverage

## Open Questions

These questions should be answered before implementation planning is finalized:

1. Should preview availability failure use a dedicated error code, or reuse a generic invalid-target/runtime-resolution failure?
2. Should `current/list/export` include `scopeAvailability` for all platforms or only when the platform has meaningful dynamic resolution?
3. Should `observedProjectRoot` be exported explicitly, or is `path` inside `scopeAvailability` sufficient?

## Recommendation

Proceed with Phase 2 as an additive contract and UX enhancement:

- keep Gemini `project scope` opt-in
- make availability explicit
- block unavailable project scope before confirmation logic
- preserve availability observations in export without trusting them during import

This gives Gemini `project scope` a complete product surface without weakening the safety model established in Phase 1.
