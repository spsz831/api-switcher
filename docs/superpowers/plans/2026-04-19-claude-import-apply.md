# Claude Import Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `import apply` to support Claude `user / project / local` scopes, keep Gemini/Codex behavior stable, and enforce an explicit confirmation gate for Claude `local` imports.

**Architecture:** Reuse the current `ImportApplyService` orchestration and Claude adapter scope model instead of inventing a new Claude-specific execution path. Claude should enter the same load → detect/previewDecision → validate → preview → risk → backup → apply pipeline, but without Gemini-style availability gating and with one Claude-specific policy overlay: `local` requires explicit confirmation even when exported observation is sparse.

**Tech Stack:** TypeScript, Vitest, Commander CLI, existing adapter registry/services, JSON schema/docs, README, changelog.

> Status note (2026-04-29): 该计划对应的 Claude import-apply 能力与验证已并入主线；以下勾选项为合并后的执行回填。

---

## File Structure

- Modify: `src/services/import-apply.service.ts`
  Extend platform support to Claude and add Claude-specific previewDecision / confirmation branching.
- Modify: `src/services/scope-options.ts`
  Reuse current helpers; only touch this file if Claude import-apply support needs tiny helper logic beyond current scope validation.
- Modify: `src/types/command.ts`
  Ensure Claude success/failure output is correctly represented by existing widened contract.
- Modify: `tests/unit/import-apply.service.test.ts`
  Add Claude red/green coverage for `user / project / local`.
- Modify: `tests/integration/cli-commands.test.ts`
  Add real CLI import-apply coverage for Claude scopes and keep Gemini/Codex behavior intact.
- Modify: `tests/unit/public-json-schema.test.ts`
  Add Claude success sample and confirm schema continues to accept scoped-platform import apply results.
- Modify: `README.md`
  Update product surface, command boundary, and Claude-specific scope language.
- Modify: `docs/public-json-schema.md`
  Document Claude import-apply semantics, especially `local` confirmation and lack of availability gate.
- Modify: `CHANGELOG.md`
  Record Claude import-apply support and its first-phase limits.
- Modify: `tests/unit/docs-consistency.test.ts`
  Keep docs boundary assertions aligned with the new Claude-enabled surface.

## Task 1: Lock Service-Level Claude Behavior

**Files:**
- Modify: `tests/unit/import-apply.service.test.ts`
- Modify: `src/services/import-apply.service.ts`

- [x] **Step 1: Write the failing unit test for Claude platform support**

Add a unit test asserting a Claude imported profile no longer returns `IMPORT_PLATFORM_NOT_SUPPORTED`.

Example expectation:

```ts
expect(result.ok).toBe(true)
expect(result.data?.importedProfile.platform).toBe('claude')
expect(result.data?.appliedScope).toBe('project')
```

- [x] **Step 2: Write the failing unit test for Claude sparse observation still proceeding**

Add a test where the Claude import source has no `exportedObservation`, but local detect/validate/preview are sufficient. Assert the service does not return `IMPORT_APPLY_NOT_READY`.

Example expectation:

```ts
expect(result.error?.code).not.toBe('IMPORT_APPLY_NOT_READY')
```

- [x] **Step 3: Write the failing unit test for Claude local requiring confirmation**

Add a test for `scope=local` without `force`, and assert the service returns `CONFIRMATION_REQUIRED`.

Example expectation:

```ts
expect(result.error?.code).toBe('CONFIRMATION_REQUIRED')
expect(result.error?.message).toBe('当前导入应用需要确认或 --force。')
```

- [x] **Step 4: Write the failing unit test for Claude local with `--force` succeeding**

Assert success payload includes:

- `platform = claude`
- `appliedScope = local`
- real `changedFiles`
- `backupId`

- [x] **Step 5: Run the import-apply unit tests to verify red**

Run:

```bash
corepack pnpm vitest run tests/unit/import-apply.service.test.ts
```

Expected: FAIL because Claude is still unsupported and the current previewDecision path is too strict for sparse Claude observation.

- [x] **Step 6: Implement the minimal Claude service changes**

Implement only the minimum needed:

- widen platform support from `gemini | codex` to `gemini | codex | claude`
- keep Gemini availability-first behavior unchanged
- let Claude use local observation even when exported observation is sparse
- overlay a Claude-specific `local` confirmation requirement
- keep Codex behavior unchanged

- [x] **Step 7: Re-run the import-apply unit tests**

Run:

```bash
corepack pnpm vitest run tests/unit/import-apply.service.test.ts
```

Expected: PASS for the new Claude cases and no regression in Gemini/Codex behavior.

- [x] **Step 8: Commit**

```bash
git add tests/unit/import-apply.service.test.ts src/services/import-apply.service.ts
git commit -m "feat: support claude import apply service flow"
```

## Task 2: Freeze Contract Expectations for Claude Scoped Success

**Files:**
- Modify: `tests/unit/public-json-schema.test.ts`
- Modify: `src/types/command.ts`

- [x] **Step 1: Write the failing schema sample for Claude local success**

Add a machine-readable sample with:

- `platform: 'claude'`
- `appliedScope: 'local'`
- `scopePolicy.resolvedScope = 'local'`
- `changedFiles` containing the local settings path

Assert it validates.

- [x] **Step 2: Write the failing type assertion if needed**

If current tests do not already imply Claude compatibility, add a type-level assertion showing `appliedScope?: string` can carry scoped-platform values such as `local`.

- [x] **Step 3: Run the schema contract tests to verify red or confirm green**

Run:

```bash
corepack pnpm vitest run tests/unit/public-json-schema.test.ts
```

Expected:

- either FAIL because the schema sample is not yet accepted
- or PASS immediately, in which case no code change is required and only the new coverage is kept

- [x] **Step 4: Make the smallest contract adjustment only if the test actually fails**

Only patch type/schema code if the new Claude sample reveals a real contract gap.

- [x] **Step 5: Re-run the schema contract tests**

Run:

```bash
corepack pnpm vitest run tests/unit/public-json-schema.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add tests/unit/public-json-schema.test.ts src/types/command.ts
git commit -m "test: freeze claude import apply public contract"
```

## Task 3: Prove CLI Integration Across Claude Scopes

**Files:**
- Modify: `tests/integration/cli-commands.test.ts`
- Modify: `src/services/import-apply.service.ts`

- [x] **Step 1: Write the failing CLI integration test for Claude default/project success**

Add an import source file for `claude-prod` and run:

```bash
api-switcher import apply <file> --profile claude-prod --json
```

Assert:

- `ok=true`
- `action='import-apply'`
- `importedProfile.platform='claude'`
- `appliedScope='project'` under the current integration env default
- `changedFiles` targets the Claude project settings path

- [x] **Step 2: Write the failing CLI integration test for Claude local without `--force`**

Run:

```bash
api-switcher import apply <file> --profile claude-prod --scope local --json
```

Assert:

- `ok=false`
- `error.code='CONFIRMATION_REQUIRED'`
- `error.details.scopePolicy.resolvedScope='local'`

- [x] **Step 3: Write the failing CLI integration test for Claude local with `--force`**

Run:

```bash
api-switcher import apply <file> --profile claude-prod --scope local --force --json
```

Assert:

- `ok=true`
- `appliedScope='local'`
- `changedFiles` contains the local Claude settings path
- resulting file contents reflect managed Claude fields

- [x] **Step 4: Write the failing CLI integration test for Claude project/local rollback compatibility if needed**

Only if current rollback coverage does not already implicitly cover the expected post-import snapshot behavior, add one focused import-apply-driven rollback case.

- [x] **Step 5: Run the CLI integration tests to verify red**

Run:

```bash
corepack pnpm vitest run tests/integration/cli-commands.test.ts
```

Expected: FAIL because Claude import apply is not yet wired through the real CLI path.

- [x] **Step 6: Make the smallest implementation adjustments needed for CLI green**

Only patch what the integration tests expose, such as:

- Claude sparse observation handling
- Claude `local` confirmation rule
- any output/doc details coupled to the CLI path

- [x] **Step 7: Re-run the CLI integration tests**

Run:

```bash
corepack pnpm vitest run tests/integration/cli-commands.test.ts
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add tests/integration/cli-commands.test.ts src/services/import-apply.service.ts
git commit -m "test: cover claude import apply cli integration"
```

## Task 4: Update Public Docs and Product Surface

**Files:**
- Modify: `README.md`
- Modify: `docs/public-json-schema.md`
- Modify: `CHANGELOG.md`
- Modify: `tests/unit/docs-consistency.test.ts`

- [x] **Step 1: Update README product boundary wording**

Change wording to reflect:

- `import apply` now supports Gemini / Codex / Claude
- Claude supports `user / project / local`
- Claude `local` requires explicit confirmation
- Claude does not use Gemini’s availability-first failure path

- [x] **Step 2: Update public schema doc wording**

Document:

- Claude import-apply support
- `appliedScope='local'` as valid scoped-platform output
- `scopeAvailability` remaining optional for Claude
- Claude `local` confirmation semantics

- [x] **Step 3: Update changelog**

Add one concise entry recording Claude import-apply support and first-phase `local` confirmation behavior.

- [x] **Step 4: Update docs consistency assertions**

Replace the current platform-boundary assertions so they expect Gemini / Codex / Claude support and mention Claude `local` confirmation.

- [x] **Step 5: Run doc-adjacent validation**

Run:

```bash
corepack pnpm vitest run tests/unit/docs-consistency.test.ts tests/unit/public-json-schema.test.ts tests/integration/cli-commands.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add README.md docs/public-json-schema.md CHANGELOG.md tests/unit/docs-consistency.test.ts
git commit -m "docs: document claude import apply support"
```

## Task 5: Final Verification Pass

**Files:**
- Verify only, unless a discovered regression requires a tiny fixup.

- [x] **Step 1: Run the focused test suite**

Run:

```bash
corepack pnpm vitest run tests/unit/import-apply.service.test.ts tests/unit/public-json-schema.test.ts tests/unit/docs-consistency.test.ts tests/integration/cli-commands.test.ts
```

Expected: PASS.

- [x] **Step 2: Run the full project test suite**

Run:

```bash
corepack pnpm test
```

Expected: PASS.

- [x] **Step 3: Run a build**

Run:

```bash
corepack pnpm build
```

Expected: PASS.

- [x] **Step 4: Review git diff for scope creep**

Run:

```bash
git status --short
git log --oneline -6
```

Expected: only the planned service, tests, and docs are touched.

- [x] **Step 5: Commit any final fixups only if verification exposed a real issue**

If needed:

```bash
git add <files>
git commit -m "fix: address claude import apply verification issues"
```
