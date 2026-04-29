# Gemini Project Scope Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured Gemini `scopeAvailability` state so project-scope availability, failure reasons, confirmation gates, export fidelity, and text/JSON output all behave consistently without changing the default write target from `user`.

**Architecture:** Extend Gemini scope resolution to return environment-specific availability state separately from platform-level `scopeCapabilities`. Thread that new state through command contracts, Gemini preview/use/rollback/current/list/export outputs, public JSON schema/docs, and text rendering, while keeping the existing `project` high-risk confirmation model intact behind a new availability gate.

**Tech Stack:** TypeScript, Commander, Vitest, JSON Schema docs

> **Status note (2026-04-29):** This phase has been implemented in mainline. The checklist below is backfilled from landed code and verification artifacts; later import work builds on this contract rather than replacing it.

---

### Task 1: Add Shared Scope Availability Types

**Files:**
- Modify: `src/types/capabilities.ts`
- Modify: `src/types/adapter.ts`
- Modify: `src/types/command.ts`
- Test: `tests/unit/public-json-schema.test.ts`

- [x] **Step 1: Write the failing test**

Add schema assertions that the public JSON schema exposes a reusable `ScopeAvailability` definition and that command outputs/details intended to carry the new field actually declare it.

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/public-json-schema.test.ts`
Expected: FAIL because no `ScopeAvailability` definition or command-level properties exist yet.

- [x] **Step 3: Write minimal implementation**

Add shared TypeScript types for:

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

Then thread optional `scopeAvailability` fields into the command/adapter result types that will use them:

- Gemini-capable `CurrentProfileResult`
- `PreviewCommandOutput`
- `UseCommandOutput`
- `RollbackCommandOutput`
- `RollbackErrorDetails`
- `ConfirmationRequiredDetails`
- `ListCommandItem`
- `ExportedProfileItem`

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/public-json-schema.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/types/capabilities.ts src/types/adapter.ts src/types/command.ts tests/unit/public-json-schema.test.ts
git commit -m "feat: add shared scope availability contract"
```

### Task 2: Extend Gemini Scope Resolver With Availability States

**Files:**
- Modify: `src/adapters/gemini/gemini.scope-resolver.ts`
- Modify: `src/adapters/gemini/gemini.scope-loader.ts`
- Test: `tests/unit/gemini.adapter.test.ts`

- [x] **Step 1: Write the failing test**

Add resolver-focused unit coverage for Gemini scope targets that asserts:

- `user` is `available`
- `project` becomes `unresolved` when no usable project root is available
- `project` returns `PROJECT_ROOT_UNRESOLVED` with remediation
- resolved project scope includes `path` and `writable = true`

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/gemini.adapter.test.ts -t "scope availability"`
Expected: FAIL because the resolver currently returns only `path/exists/writable/role`.

- [x] **Step 3: Write minimal implementation**

Update the Gemini scope resolver so each scope target carries availability state. Keep the existing target list behavior, but add:

- per-scope availability status
- `PROJECT_ROOT_UNRESOLVED`
- `PROJECT_SCOPE_PATH_UNAVAILABLE`
- remediation strings

Ensure `loadGeminiScopeState()` preserves enough scope metadata for downstream command rendering without duplicating root-resolution logic.

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/gemini.adapter.test.ts -t "scope availability"`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/adapters/gemini/gemini.scope-resolver.ts src/adapters/gemini/gemini.scope-loader.ts tests/unit/gemini.adapter.test.ts
git commit -m "feat: add gemini scope availability resolver"
```

### Task 3: Thread Scope Availability Into Current, List, And Export

**Files:**
- Modify: `src/services/current-state.service.ts`
- Modify: `src/services/export.service.ts`
- Modify: `src/adapters/gemini/gemini.adapter.ts`
- Test: `tests/unit/current-state.service.test.ts`
- Test: `tests/unit/export.service.test.ts`
- Test: `tests/integration/cli-commands.test.ts`

- [x] **Step 1: Write the failing test**

Add coverage that Gemini `current`, `list`, and `export` now include:

- `scopeAvailability`
- `project` status as `available` or `unresolved`
- `defaultWriteScope = "user"` in export

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/current-state.service.test.ts tests/unit/export.service.test.ts tests/integration/cli-commands.test.ts -t "scopeAvailability|export --json"`
Expected: FAIL because those outputs currently expose only `scopeCapabilities`.

- [x] **Step 3: Write minimal implementation**

Update Gemini-backed output assembly so:

- detection results carry `scopeAvailability`
- list rows carry `scopeAvailability`
- export rows carry `scopeAvailability`
- export rows also include `defaultWriteScope: 'user'`
- optional `observedAt` timestamp is added only if needed by the implementation

Do not add misleading availability data for non-Gemini platforms unless the command/service can provide something meaningful without guessing.

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/current-state.service.test.ts tests/unit/export.service.test.ts tests/integration/cli-commands.test.ts -t "scopeAvailability|export --json"`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/services/current-state.service.ts src/services/export.service.ts src/adapters/gemini/gemini.adapter.ts tests/unit/current-state.service.test.ts tests/unit/export.service.test.ts tests/integration/cli-commands.test.ts
git commit -m "feat: expose gemini scope availability in current list and export"
```

### Task 4: Add Availability Gate To Preview And Use

**Files:**
- Modify: `src/adapters/gemini/gemini.adapter.ts`
- Modify: `src/services/preview.service.ts`
- Modify: `src/services/switch.service.ts`
- Test: `tests/integration/gemini-preview-use-rollback.test.ts`
- Test: `tests/unit/switch.service.test.ts`
- Test: `tests/integration/cli-commands.test.ts`

- [x] **Step 1: Write the failing test**

Add tests for two distinct Gemini project-scope failure paths:

- `preview --scope project` fails structurally when project scope is unresolved
- `use --scope project` fails structurally on availability before `CONFIRMATION_REQUIRED`
- `use --scope project` still returns `CONFIRMATION_REQUIRED` when project scope is available but `--force` is missing

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/integration/gemini-preview-use-rollback.test.ts tests/unit/switch.service.test.ts tests/integration/cli-commands.test.ts -t "preview --scope project|CONFIRMATION_REQUIRED|availability"`
Expected: FAIL because availability and confirmation are not yet separated.

- [x] **Step 3: Write minimal implementation**

Implement the two-stage gate:

1. Availability gate:
   - if requested scope is `project` and status is not `available`, block immediately
2. Risk confirmation gate:
   - if availability passes and scope is `project`, preserve `--force` requirement

Include `scopeAvailability` in:

- successful preview/use data
- preview/use error details

Do not change default Gemini target scope from `user`.

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/integration/gemini-preview-use-rollback.test.ts tests/unit/switch.service.test.ts tests/integration/cli-commands.test.ts -t "preview --scope project|CONFIRMATION_REQUIRED|availability"`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/adapters/gemini/gemini.adapter.ts src/services/preview.service.ts src/services/switch.service.ts tests/integration/gemini-preview-use-rollback.test.ts tests/unit/switch.service.test.ts tests/integration/cli-commands.test.ts
git commit -m "feat: gate gemini project scope by availability before confirmation"
```

### Task 5: Add Availability Gate To Rollback

**Files:**
- Modify: `src/adapters/gemini/gemini.adapter.ts`
- Modify: `src/services/rollback.service.ts`
- Test: `tests/unit/rollback.service.test.ts`
- Test: `tests/integration/gemini-preview-use-rollback.test.ts`
- Test: `tests/integration/cli-commands.test.ts`

- [x] **Step 1: Write the failing test**

Add rollback coverage for:

- unresolved Gemini project scope blocks rollback before mismatch logic
- `ROLLBACK_SCOPE_MISMATCH` still occurs when project scope is available but manifest scope differs
- error details include both `scopePolicy` and `scopeAvailability`

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/rollback.service.test.ts tests/integration/gemini-preview-use-rollback.test.ts tests/integration/cli-commands.test.ts -t "ROLLBACK_SCOPE_MISMATCH|scopeAvailability|project"`
Expected: FAIL because rollback only carries `scopePolicy` and current mismatch handling.

- [x] **Step 3: Write minimal implementation**

Update Gemini rollback so:

- unresolved project scope returns an availability failure result
- mismatch handling remains intact after availability passes
- success and failure results both expose `scopeAvailability`

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/rollback.service.test.ts tests/integration/gemini-preview-use-rollback.test.ts tests/integration/cli-commands.test.ts -t "ROLLBACK_SCOPE_MISMATCH|scopeAvailability|project"`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/adapters/gemini/gemini.adapter.ts src/services/rollback.service.ts tests/unit/rollback.service.test.ts tests/integration/gemini-preview-use-rollback.test.ts tests/integration/cli-commands.test.ts
git commit -m "feat: add gemini project scope availability checks to rollback"
```

### Task 6: Update Public JSON Schema And Documentation

**Files:**
- Modify: `docs/public-json-output.schema.json`
- Modify: `docs/public-json-schema.md`
- Modify: `README.md`
- Test: `tests/unit/public-json-schema.test.ts`

- [x] **Step 1: Write the failing test**

Add schema assertions that:

- `ScopeAvailability` exists in `$defs`
- all intended command output shapes include `scopeAvailability`
- export item includes `defaultWriteScope`

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/public-json-schema.test.ts`
Expected: FAIL because the schema/docs do not yet describe the new contract.

- [x] **Step 3: Write minimal implementation**

Update the machine-readable schema and human-readable docs so they explain:

- `scopeCapabilities` vs `scopeAvailability`
- Gemini availability reason codes
- success/failure examples for unresolved project scope
- export’s environment-observation boundary

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/public-json-schema.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add docs/public-json-output.schema.json docs/public-json-schema.md README.md tests/unit/public-json-schema.test.ts
git commit -m "docs: document gemini scope availability contract"
```

### Task 7: Add Text Renderer Support

**Files:**
- Modify: `src/renderers/text-renderer.ts`
- Test: `tests/unit/text-renderer.test.ts`

- [x] **Step 1: Write the failing test**

Add renderer expectations for:

- `作用域可用性`
- unresolved Gemini project scope reason/remediation
- separation between availability failure and confirmation-required failure

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/text-renderer.test.ts`
Expected: FAIL because text output currently renders only `作用域能力`.

- [x] **Step 3: Write minimal implementation**

Render `scopeAvailability` alongside `scopeCapabilities` using clear labels:

- available/unresolved/blocked
- reason
- remediation

Make sure availability failures do not imply `--force` would help.

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/text-renderer.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/renderers/text-renderer.ts tests/unit/text-renderer.test.ts
git commit -m "feat: render gemini scope availability in text output"
```

### Task 8: Run Full Verification

**Files:**
- Modify: none
- Test: full project

- [x] **Step 1: Run targeted phase-2 suites**

Run: `corepack pnpm vitest run tests/unit/gemini.adapter.test.ts tests/unit/current-state.service.test.ts tests/unit/export.service.test.ts tests/unit/public-json-schema.test.ts tests/unit/switch.service.test.ts tests/unit/rollback.service.test.ts tests/unit/text-renderer.test.ts tests/integration/gemini-preview-use-rollback.test.ts tests/integration/cli-commands.test.ts`
Expected: PASS

- [x] **Step 2: Run full test suite**

Run: `corepack pnpm test`
Expected: PASS

- [x] **Step 3: Run typecheck and build**

Run: `corepack pnpm typecheck`
Expected: PASS

Run: `corepack pnpm build`
Expected: PASS

- [x] **Step 4: Commit final integrated change**

```bash
git add .
git commit -m "feat: add gemini scope availability product surface"
```
