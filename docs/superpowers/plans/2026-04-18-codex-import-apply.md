# Codex Import Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `import apply` from Gemini-only to Gemini + Codex, while keeping Gemini scope gating unchanged and letting Codex apply a single imported profile through its existing two-file adapter path.

**Architecture:** Reuse the current `ImportApplyService` orchestration and widen only the truly platform-coupled parts: platform support gating, scope-availability gating, and success/error contract typing. Codex should flow through the same load → detect/previewDecision → validate → preview → backup → apply path, but without scoped-target semantics or fake scope availability checks.

**Tech Stack:** TypeScript, Vitest, Commander CLI, existing adapter registry/services, JSON schema docs, README.

> Status note (2026-04-29): 该计划对应的 Codex import-apply 能力、文档与验证已进入主线；以下勾选项为合并后的执行回填。

---

## File Structure

- Modify: `src/services/import-apply.service.ts`
  Make platform support and scope gating platform-aware instead of Gemini-only.
- Modify: `src/types/command.ts`
  Widen `import apply` output/detail types so Codex can succeed without `user | project` scope assumptions.
- Modify: `src/services/scope-options.ts`
  Reuse existing helpers and, if needed, add very small helper(s) for import-apply support / scope-availability branching.
- Modify: `tests/unit/import-apply.service.test.ts`
  Add Codex red/green coverage and tighten Claude-not-supported coverage.
- Modify: `tests/integration/cli-commands.test.ts`
  Add CLI integration coverage for Codex `import apply --json` and invalid Codex scope input.
- Modify: `tests/unit/public-json-schema.test.ts`
  Freeze the widened type/schema contract and add a Codex success sample.
- Modify: `docs/public-json-output.schema.json`
  Widen `ImportApplyCommandOutput` schema for non-scoped platforms.
- Modify: `docs/public-json-schema.md`
  Update command contract wording from Gemini-only to Gemini/Codex.
- Modify: `README.md`
  Update product surface, command examples, and platform boundary wording.
- Modify: `CHANGELOG.md`
  Record the new platform support in the unreleased section or next release section.

## Task 1: Lock Service-Level Codex Behavior

**Files:**
- Modify: `tests/unit/import-apply.service.test.ts`
- Modify: `src/services/import-apply.service.ts`
- Modify: `src/services/scope-options.ts`

- [x] **Step 1: Write the failing unit test for Codex platform support**

Add a unit test that loads a Codex imported profile and asserts the service no longer returns `IMPORT_PLATFORM_NOT_SUPPORTED`.

Example expectation:

```ts
expect(result.ok).toBe(true)
expect(result.action).toBe('import-apply')
expect(result.data?.importedProfile.platform).toBe('codex')
```

- [x] **Step 2: Write the failing unit test proving Codex skips Gemini project availability gate**

Add a test where Codex detection has no `scopeAvailability`, and assert the service does not fail with `IMPORT_SCOPE_UNAVAILABLE`.

Example expectation:

```ts
expect(result.error?.code).not.toBe('IMPORT_SCOPE_UNAVAILABLE')
```

- [x] **Step 3: Write the failing unit test for unsupported Claude**

Tighten the current unsupported-platform test so it explicitly covers Claude remaining unsupported after Codex is enabled.

Example expectation:

```ts
expect(result.error).toEqual({
  code: 'IMPORT_PLATFORM_NOT_SUPPORTED',
  message: '当前仅支持导入应用 Gemini 或 Codex profile。',
})
```

- [x] **Step 4: Run the import-apply unit tests to verify red**

Run:

```bash
corepack pnpm vitest run tests/unit/import-apply.service.test.ts
```

Expected: FAIL because the service still hardcodes Gemini-only behavior and `appliedScope` assumptions.

- [x] **Step 5: Implement the minimal platform-aware service changes**

Implement only the minimum needed:

- widen the platform support gate to `gemini` and `codex`
- keep Claude and others on `IMPORT_PLATFORM_NOT_SUPPORTED`
- compute `appliedScope` as platform-resolved string or `undefined`
- gate `scopeAvailability` only when the platform/scope actually requires it
- keep Gemini `project` semantics unchanged

- [x] **Step 6: Re-run the import-apply unit tests**

Run:

```bash
corepack pnpm vitest run tests/unit/import-apply.service.test.ts
```

Expected: PASS for the newly added platform-support and gate-order cases.

- [x] **Step 7: Commit**

```bash
git add tests/unit/import-apply.service.test.ts src/services/import-apply.service.ts src/services/scope-options.ts
git commit -m "feat: support codex import apply service flow"
```

## Task 2: Freeze Success Contract for Non-Scoped Platforms

**Files:**
- Modify: `tests/unit/public-json-schema.test.ts`
- Modify: `src/types/command.ts`
- Modify: `docs/public-json-output.schema.json`

- [x] **Step 1: Write the failing type/schema test for widened `appliedScope`**

Update the public contract test so `ImportApplyCommandOutput.appliedScope` is no longer asserted as `'user' | 'project'`.

Example expectation:

```ts
expectTypeOf<ImportApplyCommandOutput>().toMatchTypeOf<{
  sourceFile: string
  importedProfile: Profile
  appliedScope?: string
  backupId: string
}>()
```

- [x] **Step 2: Write the failing schema sample for a Codex success result**

Add a sample with:

- `platform: 'codex'`
- `appliedScope` absent or `undefined`
- real `changedFiles` for `config.toml` and `auth.json`

Assert it passes public schema validation once the schema is updated.

- [x] **Step 3: Run the schema contract tests to verify red**

Run:

```bash
corepack pnpm vitest run tests/unit/public-json-schema.test.ts
```

Expected: FAIL because the current type/schema still encodes Gemini-only scope assumptions.

- [x] **Step 4: Implement the minimal type/schema widening**

Update:

- `ImportApplyCommandOutput`
- any related error/detail interfaces
- JSON schema defs for `ImportApplyCommandOutput`

Do not widen unrelated command contracts.

- [x] **Step 5: Re-run the schema contract tests**

Run:

```bash
corepack pnpm vitest run tests/unit/public-json-schema.test.ts
```

Expected: PASS with both Gemini and Codex-compatible success contract coverage.

- [x] **Step 6: Commit**

```bash
git add tests/unit/public-json-schema.test.ts src/types/command.ts docs/public-json-output.schema.json
git commit -m "feat: widen import apply public contract for codex"
```

## Task 3: Prove CLI Integration Against Real Codex Targets

**Files:**
- Modify: `tests/integration/cli-commands.test.ts`
- Modify: `src/services/import-apply.service.ts`
- Modify: `src/types/command.ts`

- [x] **Step 1: Write the failing CLI integration test for Codex import apply success**

Add an integration case that:

1. writes an import source file containing a Codex profile
2. runs `import apply <file> --profile codex-prod --json`
3. asserts:
   - `ok=true`
   - `action='import-apply'`
   - `changedFiles` includes `config.toml` and `auth.json`
   - output `backupId` exists

- [x] **Step 2: Write the failing CLI integration test for invalid Codex scope**

Add a case like:

```bash
api-switcher import apply <file> --profile codex-prod --scope project --json
```

Assert it fails through the existing invalid-scope path instead of pretending Codex supports project scope.

- [x] **Step 3: Update the old non-Gemini-not-supported integration assertion**

Replace the old broad failure assumption with a narrower one:

- Claude import apply is still unsupported
- Codex import apply is supported

- [x] **Step 4: Run the CLI integration tests to verify red**

Run:

```bash
corepack pnpm vitest run tests/integration/cli-commands.test.ts
```

Expected: FAIL because CLI integration does not yet support Codex success.

- [x] **Step 5: Make the smallest implementation adjustments needed for CLI green**

Only patch whatever still blocks the real CLI path after Task 1 and Task 2, such as:

- output shaping
- invalid scope handling
- any command-layer assumptions still phrased as Gemini-only

- [x] **Step 6: Re-run the CLI integration tests**

Run:

```bash
corepack pnpm vitest run tests/integration/cli-commands.test.ts
```

Expected: PASS for the new Codex success path and unsupported-Claude path.

- [x] **Step 7: Commit**

```bash
git add tests/integration/cli-commands.test.ts src/services/import-apply.service.ts src/types/command.ts
git commit -m "test: cover codex import apply cli integration"
```

## Task 4: Update Public Docs and Product Surface

**Files:**
- Modify: `README.md`
- Modify: `docs/public-json-schema.md`
- Modify: `CHANGELOG.md`

- [x] **Step 1: Write the failing doc assertions mentally against the current wording**

Confirm the current docs are now wrong in these places:

- README says `import apply` is Gemini-only
- schema doc says Codex has no import-apply support
- release notes do not mention Codex import apply

This step is a doc red check, not a code test.

- [x] **Step 2: Update README command surface and platform boundary wording**

Change wording to:

- `import apply` supports Gemini and Codex
- Gemini keeps scope/high-risk semantics
- Codex writes its two real target files and does not use `--scope`
- Claude remains unsupported

- [x] **Step 3: Update public schema doc wording**

Adjust `docs/public-json-schema.md` so machine consumers are told clearly:

- `scopeCapabilities` / `scopePolicy` are platform-specific
- Codex import apply success does not imply scoped target support
- `appliedScope` may be absent for non-scoped platforms

- [x] **Step 4: Update changelog**

Add one concise entry recording Codex support for `import apply`.

- [x] **Step 5: Run minimal verification for docs-adjacent regressions**

Run:

```bash
corepack pnpm vitest run tests/unit/public-json-schema.test.ts tests/integration/cli-commands.test.ts
```

Expected: PASS, confirming doc-backed schema/CLI contract remains correct.

- [x] **Step 6: Commit**

```bash
git add README.md docs/public-json-schema.md CHANGELOG.md
git commit -m "docs: document codex import apply support"
```

## Task 5: Final Verification Pass

**Files:**
- Verify only, no new source files unless a discovered regression requires it.

- [x] **Step 1: Run the focused test suite**

Run:

```bash
corepack pnpm vitest run tests/unit/import-apply.service.test.ts tests/unit/public-json-schema.test.ts tests/integration/cli-commands.test.ts
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
git diff --stat HEAD~4..HEAD
git status --short
```

Expected: only the planned service, test, schema, and doc files changed.

- [x] **Step 5: Commit any final fixups if verification exposed a real issue**

Only if needed:

```bash
git add <files>
git commit -m "fix: address codex import apply verification issues"
```
