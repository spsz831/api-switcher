# Gemini Dual-Track Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Gemini adapter from a warning-driven partial implementation to an explicit dual-track contract with stable official support and opt-in experimental gateway support.

**Architecture:** Keep Gemini under one platform adapter, but split its behavior into stable managed settings, runtime auth, and experimental extensions. Preserve backward compatibility for legacy Gemini profiles while making validation, preview, apply, current-state, rollback, renderer output, and docs reflect the stricter contract.

**Tech Stack:** TypeScript, Commander, Vitest

> **Status note (2026-04-29):** This plan was implemented and later absorbed into a broader mainline contract surface. The checked steps below are backfilled from the landed code, tests, and docs rather than preserved as a commit-by-commit execution log.

---

### Task 1: Define Gemini dual-track data helpers

**Files:**
- Create: `src/adapters/gemini/gemini.contract.ts`
- Modify: `src/adapters/gemini/gemini.mapper.ts`
- Test: `tests/unit/gemini.adapter.test.ts`

- [x] **Step 1: Write the failing test**

Add unit expectations that a Gemini profile with legacy `apply.GEMINI_BASE_URL` is normalized into experimental config instead of being treated as a stable managed setting.

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/unit/gemini.adapter.test.ts`
Expected: FAIL because the contract helper does not exist yet.

- [x] **Step 3: Write minimal implementation**

Create helpers that:
- pick stable Gemini managed fields
- extract runtime auth fields
- extract experimental fields
- normalize legacy `apply.GEMINI_BASE_URL` into an experimental structure

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test -- tests/unit/gemini.adapter.test.ts`
Expected: PASS for the new normalization case.

- [x] **Step 5: Commit**

```bash
git add src/adapters/gemini/gemini.contract.ts src/adapters/gemini/gemini.mapper.ts tests/unit/gemini.adapter.test.ts
git commit -m "feat: define gemini dual-track contract helpers"
```

### Task 2: Tighten Gemini adapter validation and preview semantics

**Files:**
- Modify: `src/adapters/gemini/gemini.adapter.ts`
- Test: `tests/unit/gemini.adapter.test.ts`

- [x] **Step 1: Write the failing test**

Add test cases that assert:
- `GEMINI_API_KEY` is rendered as runtime/env-based
- experimental base URL is labeled as experimental
- preview does not imply file-managed writes for unsupported experimental config

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/unit/gemini.adapter.test.ts`
Expected: FAIL because the adapter still flattens stable/runtime/experimental semantics.

- [x] **Step 3: Write minimal implementation**

Update `GeminiAdapter` so that:
- validation distinguishes stable, runtime, and experimental concerns
- preview surfaces experimental fields explicitly
- `backupPlanned` reflects only actual file writes
- unsupported experimental apply intent is explainable and not silently accepted

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test -- tests/unit/gemini.adapter.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/adapters/gemini/gemini.adapter.ts tests/unit/gemini.adapter.test.ts
git commit -m "feat: tighten gemini validation and preview contract"
```

### Task 3: Make apply/current/rollback behavior honest about runtime and experimental state

**Files:**
- Modify: `src/adapters/gemini/gemini.adapter.ts`
- Test: `tests/integration/gemini-preview-use-rollback.test.ts`

- [x] **Step 1: Write the failing test**

Add integration coverage for:
- stable settings write still succeeds
- experimental base URL without write target is not reported as applied
- rollback only restores actual file-managed changes

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/integration/gemini-preview-use-rollback.test.ts`
Expected: FAIL because apply/rollback still use the old partial model.

- [x] **Step 3: Write minimal implementation**

Update apply/current/rollback so that:
- stable and experimental results are reported separately
- current-state does not pretend runtime env is confirmed current state
- rollback explicitly states env auth is not restored
- experimental writes are refused or downgraded explicitly when no reliable target exists

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test -- tests/integration/gemini-preview-use-rollback.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/adapters/gemini/gemini.adapter.ts tests/integration/gemini-preview-use-rollback.test.ts
git commit -m "fix: align gemini apply and rollback with dual-track contract"
```

### Task 4: Update shared profile and command-facing semantics

**Files:**
- Modify: `src/types/profile.ts`
- Modify: `src/services/add.service.ts`
- Modify: `src/services/export.service.ts`
- Test: `tests/integration/cli-commands.test.ts`

- [x] **Step 1: Write the failing test**

Add CLI-level assertions that:
- export shows Gemini experimental data explicitly
- legacy Gemini base URL input is described as experimental
- add remains strict for Gemini URL input until an explicit experimental authoring mode exists

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/integration/cli-commands.test.ts`
Expected: FAIL because command-facing structures do not yet reflect the new contract.

- [x] **Step 3: Write minimal implementation**

Add optional structured metadata for Gemini experimental config in profile metadata, and ensure services/export preserve it without pretending it is stable managed config.

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test -- tests/integration/cli-commands.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/types/profile.ts src/services/add.service.ts src/services/export.service.ts tests/integration/cli-commands.test.ts
git commit -m "feat: expose gemini experimental contract in command outputs"
```

### Task 5: Update renderer and docs

**Files:**
- Modify: `src/renderers/text-renderer.ts`
- Modify: `README.md`
- Test: `tests/unit/text-renderer.test.ts`

- [x] **Step 1: Write the failing test**

Add renderer assertions that Gemini output distinguishes:
- stable managed settings
- runtime auth
- experimental proxy config

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/unit/text-renderer.test.ts`
Expected: FAIL because the current renderer does not print the new contract clearly.

- [x] **Step 3: Write minimal implementation**

Update text rendering and README examples so Gemini support is documented as:
- stable official support by default
- experimental proxy support when explicitly configured

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test -- tests/unit/text-renderer.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/renderers/text-renderer.ts README.md tests/unit/text-renderer.test.ts
git commit -m "docs: clarify gemini stable and experimental support"
```

### Task 6: Run full verification

**Files:**
- Modify: none
- Test: full project

- [x] **Step 1: Run targeted Gemini and CLI tests**

Run: `corepack pnpm test -- tests/unit/gemini.adapter.test.ts tests/integration/gemini-preview-use-rollback.test.ts tests/integration/cli-commands.test.ts tests/unit/text-renderer.test.ts`
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
git commit -m "feat: upgrade gemini adapter to dual-track contract"
```
