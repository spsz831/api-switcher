# Gemini Import Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `import preview` command that reads exported JSON, compares Gemini exported observations with local re-resolved observations, and reports fidelity without performing any writes.

**Architecture:** Build `import preview` as a read-only pipeline: parse an exported JSON file, normalize exported profile observations, collect local platform observations through existing adapters/services, then produce a fidelity report and apply-readiness hint per item. Keep exported observations and local observations separate in output so future `import apply` can build on the same contract.

**Tech Stack:** TypeScript, Commander, Vitest, JSON/text renderers

---

### Task 1: Define Import Preview Types And Public Contract

**Files:**
- Modify: `src/types/command.ts`
- Modify: `docs/public-json-output.schema.json`
- Modify: `docs/public-json-schema.md`
- Test: `tests/unit/public-json-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Add schema assertions for:

- `ImportPreviewCommandOutput`
- `ImportPreviewItem`
- `ImportFidelityReport`
- command-level `items`, `exportedObservation`, `localObservation`, `previewDecision`

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/public-json-schema.test.ts`
Expected: FAIL because import preview contract is not declared yet.

- [ ] **Step 3: Write minimal implementation**

Add TypeScript types for:

- `ImportPreviewCommandOutput`
- `ImportPreviewItem`
- `ImportFidelityReport`
- `ImportPreviewDecision`

Then extend the machine-readable schema and human docs with additive optional definitions.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/public-json-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/command.ts docs/public-json-output.schema.json docs/public-json-schema.md tests/unit/public-json-schema.test.ts
git commit -m "feat: define import preview public contract"
```

### Task 2: Add Import Source Loader

**Files:**
- Create: `src/services/import-source.service.ts`
- Test: `tests/unit/import-source.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests for:

- missing file -> `IMPORT_SOURCE_NOT_FOUND`
- invalid JSON -> `IMPORT_SOURCE_INVALID`
- valid export envelope -> normalized source data

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/import-source.service.test.ts`
Expected: FAIL because the loader service does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement a read-only loader that:

- accepts a file path
- reads JSON
- validates minimal envelope shape
- returns exported profiles plus source metadata

Do not over-validate adapter-specific internal fields in v1.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/import-source.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/import-source.service.ts tests/unit/import-source.service.test.ts
git commit -m "feat: add import source loader"
```

### Task 3: Build Gemini Fidelity Evaluator

**Files:**
- Create: `src/services/import-fidelity.service.ts`
- Test: `tests/unit/import-fidelity.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add fidelity tests covering:

- exported project available + local project available -> `match`
- exported project available + local project unresolved -> `mismatch`
- missing exported scopeAvailability -> `partial`
- missing Gemini observation entirely -> `insufficient-data`

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/import-fidelity.service.test.ts`
Expected: FAIL because evaluator does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement a focused evaluator that:

- compares exported/local `defaultWriteScope`
- compares exported/local Gemini `scopeAvailability`
- produces `status`, `mismatches[]`
- computes:
  - `canProceedToApplyDesign`
  - `requiresLocalResolution`
  - `recommendedScope`

Keep exported and local observations separate; never merge them.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/import-fidelity.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/import-fidelity.service.ts tests/unit/import-fidelity.service.test.ts
git commit -m "feat: add gemini import fidelity evaluator"
```

### Task 4: Add Import Preview Service

**Files:**
- Create: `src/services/import-preview.service.ts`
- Modify: `src/services/current-state.service.ts` (only if a reusable observation helper is needed)
- Test: `tests/unit/import-preview.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add service-level tests for:

- export file with Gemini profile -> item contains exported/local observations
- local project unresolved -> mismatch and `requiresLocalResolution = true`
- non-Gemini profiles still return sane read-only preview items

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/import-preview.service.test.ts`
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement a read-only orchestrator that:

- loads the import source
- resolves local observations through existing adapters
- calls fidelity evaluator
- builds a preview summary

Do not write any files or mutate state.

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/import-preview.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/import-preview.service.ts tests/unit/import-preview.service.test.ts
git commit -m "feat: add import preview service"
```

### Task 5: Add CLI Command And JSON/Text Rendering

**Files:**
- Create: `src/commands/import.command.ts`
- Modify: `src/cli/index.ts`
- Modify: `src/renderers/text-renderer.ts`
- Test: `tests/unit/text-renderer.test.ts`
- Test: `tests/integration/cli-commands.test.ts`

- [ ] **Step 1: Write the failing test**

Add CLI coverage for:

- `import <file> --json`
- Gemini mismatch text output
- missing file failure

Add text-renderer expectations for:

- 导出时观察
- 当前本地观察
- fidelity 结论
- 建议

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/text-renderer.test.ts tests/integration/cli-commands.test.ts -t "import"`
Expected: FAIL because import command and renderer support do not exist.

- [ ] **Step 3: Write minimal implementation**

Add a read-only CLI command:

```bash
api-switcher import <file>
api-switcher import <file> --json
```

Wire it to `ImportPreviewService`.

Text output should clearly separate:

- 导出时观察
- 当前本地观察
- fidelity 结果
- 下一步建议

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/text-renderer.test.ts tests/integration/cli-commands.test.ts -t "import"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/import.command.ts src/cli/index.ts src/renderers/text-renderer.ts tests/unit/text-renderer.test.ts tests/integration/cli-commands.test.ts
git commit -m "feat: add import preview command"
```

### Task 6: Document Import Preview Boundary

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-16-gemini-project-scope-stage-2-product-surface-design.md`
- Test: none

- [ ] **Step 1: Update docs**

Document:

- `import` currently means preview only
- no write-back in v1
- exported observation vs local reality
- why project availability must be re-resolved locally

- [ ] **Step 2: Manual review**

Confirm docs do not imply `import apply` exists.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/specs/2026-04-16-gemini-project-scope-stage-2-product-surface-design.md
git commit -m "docs: document import preview boundary"
```

### Task 7: Full Verification

**Files:**
- Modify: none

- [ ] **Step 1: Run targeted suites**

Run: `corepack pnpm vitest run tests/unit/import-source.service.test.ts tests/unit/import-fidelity.service.test.ts tests/unit/import-preview.service.test.ts tests/unit/text-renderer.test.ts tests/unit/public-json-schema.test.ts tests/integration/cli-commands.test.ts -t "import"`
Expected: PASS

- [ ] **Step 2: Run full suite**

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
git commit -m "feat: add import preview for exported scope fidelity"
```
