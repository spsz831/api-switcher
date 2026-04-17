# Gemini Multi-Scope Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Gemini target resolution and current-state detection to understand all official file scopes, compute effective merged config by precedence, and keep writes restricted to a single managed scope.

**Architecture:** Introduce scope-aware Gemini target resolution and layered settings loading for `system-defaults`, `user`, `project`, and `system-overrides`. Use the merged result for preview/current/list/validate explanations while leaving apply and rollback limited to the user-scope managed target.

**Tech Stack:** TypeScript, Commander, Vitest

---

### Task 1: Add Gemini scope resolver

**Files:**
- Create: `src/adapters/gemini/gemini.scope-resolver.ts`
- Modify: `src/adapters/gemini/gemini.target-resolver.ts`
- Test: `tests/unit/gemini.adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Add unit assertions that Gemini target resolution returns all four official scopes with stable scope names and preserves compatibility with `API_SWITCHER_GEMINI_SETTINGS_PATH` as the user-scope path.

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/unit/gemini.adapter.test.ts`
Expected: FAIL because the resolver still returns only one path.

- [ ] **Step 3: Write minimal implementation**

Implement a Gemini scope resolver that returns:
- `system-defaults`
- `user`
- `project`
- `system-overrides`

with env override support and compatibility fallback.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test -- tests/unit/gemini.adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/adapters/gemini/gemini.scope-resolver.ts src/adapters/gemini/gemini.target-resolver.ts tests/unit/gemini.adapter.test.ts
git commit -m "feat: add gemini multi-scope target resolver"
```

### Task 2: Add Gemini scope loader and precedence merge

**Files:**
- Create: `src/adapters/gemini/gemini.scope-loader.ts`
- Modify: `src/adapters/gemini/gemini.adapter.ts`
- Test: `tests/unit/gemini.adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests that build multiple Gemini scope files and assert the effective merged config uses official precedence.

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/unit/gemini.adapter.test.ts`
Expected: FAIL because the adapter only reads one settings file.

- [ ] **Step 3: Write minimal implementation**

Implement a scope loader that:
- reads each scope file when present
- parses settings safely
- extracts stable managed fields
- computes merged effective config
- preserves per-scope provenance for override explanations

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test -- tests/unit/gemini.adapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/adapters/gemini/gemini.scope-loader.ts src/adapters/gemini/gemini.adapter.ts tests/unit/gemini.adapter.test.ts
git commit -m "feat: add gemini scope-aware effective config merge"
```

### Task 3: Make preview and current-state scope-aware

**Files:**
- Modify: `src/adapters/gemini/gemini.adapter.ts`
- Test: `tests/integration/gemini-preview-use-rollback.test.ts`
- Test: `tests/integration/cli-commands.test.ts`

- [ ] **Step 1: Write the failing test**

Add integration coverage for:
- preview using merged effective config from higher-precedence scope files
- current-state matching based on merged Gemini config
- target lists exposing multiple scopes

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/integration/gemini-preview-use-rollback.test.ts tests/integration/cli-commands.test.ts`
Expected: FAIL because current preview/current output assumes one file only.

- [ ] **Step 3: Write minimal implementation**

Update Gemini adapter so that:
- `listTargets()` returns all scope targets
- `preview()` reports multi-scope effective config
- `detectCurrent()` uses merged config rather than a single user file
- scope-aware managed boundaries and overrides are included

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test -- tests/integration/gemini-preview-use-rollback.test.ts tests/integration/cli-commands.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/adapters/gemini/gemini.adapter.ts tests/integration/gemini-preview-use-rollback.test.ts tests/integration/cli-commands.test.ts
git commit -m "feat: make gemini preview and current state scope-aware"
```

### Task 4: Keep apply and rollback single-scope but explain multi-scope limits

**Files:**
- Modify: `src/adapters/gemini/gemini.adapter.ts`
- Test: `tests/integration/gemini-preview-use-rollback.test.ts`

- [ ] **Step 1: Write the failing test**

Add integration assertions that:
- apply still writes only the user scope
- output warns when higher-precedence scopes can override the final result
- rollback restores only the user-scope file that was written

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/integration/gemini-preview-use-rollback.test.ts`
Expected: FAIL because current apply/rollback do not explain multi-scope precedence.

- [ ] **Step 3: Write minimal implementation**

Keep Gemini writes limited to the user scope and add explicit warnings/limitations about higher-precedence scope overrides when relevant.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test -- tests/integration/gemini-preview-use-rollback.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/adapters/gemini/gemini.adapter.ts tests/integration/gemini-preview-use-rollback.test.ts
git commit -m "fix: explain gemini single-scope writes under multi-scope detection"
```

### Task 5: Update docs and human-readable output

**Files:**
- Modify: `README.md`
- Modify: `src/renderers/text-renderer.ts`
- Test: `tests/unit/text-renderer.test.ts`

- [ ] **Step 1: Write the failing test**

Add renderer expectations for Gemini scope-aware target and precedence output.

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/unit/text-renderer.test.ts`
Expected: FAIL because the renderer does not yet present multi-scope Gemini context clearly.

- [ ] **Step 3: Write minimal implementation**

Update README and text rendering so Gemini output explains:
- four-scope detection
- single-scope writes
- precedence-aware effective config

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test -- tests/unit/text-renderer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add README.md src/renderers/text-renderer.ts tests/unit/text-renderer.test.ts
git commit -m "docs: clarify gemini multi-scope detection behavior"
```

### Task 6: Run full verification

**Files:**
- Modify: none
- Test: full project

- [ ] **Step 1: Run targeted Gemini suites**

Run: `corepack pnpm test -- tests/unit/gemini.adapter.test.ts tests/integration/gemini-preview-use-rollback.test.ts tests/integration/cli-commands.test.ts tests/unit/text-renderer.test.ts`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `corepack pnpm test`
Expected: PASS

- [ ] **Step 3: Run typecheck and build**

Run: `corepack pnpm typecheck`
Expected: PASS

Run: `corepack pnpm build`
Expected: PASS

- [ ] **Step 4: Commit final integrated change**

```bash
git add .
git commit -m "feat: add gemini multi-scope detection and target resolution"
```
