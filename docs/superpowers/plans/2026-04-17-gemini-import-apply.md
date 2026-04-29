# Gemini import apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Gemini-only `import apply` command that applies a single imported profile under local-first scope rules, with explicit scope gating, confirmation gating, and rollback-compatible snapshot provenance.

**Architecture:** Reuse the existing `import preview`, `use`, `rollback`, snapshot, and Gemini scope infrastructure instead of inventing a parallel import execution path. Build `import apply` as an orchestration layer that reads one imported profile, re-resolves local scope reality, enforces availability-before-confirmation gating, then delegates validation/preview/apply/snapshot through existing services and adapter contracts.

**Tech Stack:** TypeScript, Commander CLI, Vitest, existing adapter registry/services, JSON/text renderers, README/docs contract docs.

> **Status note (2026-04-29):** The original Gemini-first plan has been exceeded by a broader mainline `import apply` implementation. The checklist below is backfilled to reflect that the contract, orchestration, rendering, docs, and verification work have landed.

---

## File Structure

- Create: `src/services/import-apply.service.ts`
  Single orchestration service for Gemini-only import apply.
- Create: `tests/unit/import-apply.service.test.ts`
  Unit tests for source/profile filtering, local-first gate order, confirmation behavior, and success contract.
- Modify: `src/commands/import.command.ts`
  Add `apply` subcommand wiring and argument validation.
- Modify: `src/cli/index.ts`
  Register the new nested import apply command if needed by current CLI composition.
- Modify: `src/types/command.ts`
  Add `ImportApplyCommandOutput` and related failure detail shapes.
- Modify: `src/constants/exit-codes.ts`
  Add any new stable business error codes for import apply.
- Modify: `src/renderers/json-renderer.ts`
  Serialize the new command output/error shape.
- Modify: `src/renderers/text-renderer.ts`
  Render import apply success/failure with scope-aware details.
- Modify: `src/services/import-source.service.ts`
  Add helper(s) for selecting a single imported profile by id/name if current API is too batch-oriented.
- Modify: `src/services/snapshot.service.ts`
  Add snapshot provenance support for `origin: 'import-apply'`.
- Modify: `src/types/snapshot.ts`
  Extend manifest typing for provenance metadata.
- Modify: `README.md`
  Document the new command, its Gemini-only boundary, and gate order.
- Modify: `docs/public-json-schema.md`
  Document public contract for `import apply --json`.
- Modify: `docs/public-json-output.schema.json`
  Add machine-readable schema for import apply success/failure.
- Modify: `tests/unit/public-json-schema.test.ts`
  Assert new schema sections and required fields.
- Modify: `tests/integration/cli-commands.test.ts`
  Add CLI JSON/text integration coverage for import apply.
- Modify: `tests/integration/gemini-preview-use-rollback.test.ts`
  Add Gemini-focused end-to-end import apply cases if that test harness already owns Gemini scope workflows.

## Task 1: Define Public Contract

**Files:**
- Modify: `src/types/command.ts`
- Modify: `src/constants/exit-codes.ts`
- Test: `tests/unit/public-json-schema.test.ts`

- [x] **Step 1: Write failing schema/type expectations for import apply**

Add tests covering:

```ts
expect(schema.properties?.action.enum).toContain('import-apply')
expect(schema.$defs?.ImportApplyCommandOutput).toBeDefined()
expect(schema.$defs?.ImportApplyCommandOutput.required).toEqual(
  expect.arrayContaining(['sourceFile', 'importedProfile', 'appliedScope', 'scopePolicy', 'backupId']),
)
```

Also add expectations for new error codes:

```ts
expect(EXIT_CODES).toContain('IMPORT_PROFILE_NOT_FOUND')
expect(EXIT_CODES).toContain('IMPORT_PLATFORM_NOT_SUPPORTED')
expect(EXIT_CODES).toContain('IMPORT_APPLY_NOT_READY')
expect(EXIT_CODES).toContain('IMPORT_SCOPE_UNAVAILABLE')
expect(EXIT_CODES).toContain('IMPORT_APPLY_FAILED')
```

- [x] **Step 2: Run schema/type tests to verify they fail**

Run:

```bash
corepack pnpm vitest run tests/unit/public-json-schema.test.ts tests/unit/exit-codes.test.ts
```

Expected: FAIL because import apply types/schema/error codes are not declared yet.

- [x] **Step 3: Add minimal command/output/error types**

Define:

- `ImportApplyCommandOutput`
- `ImportApplyNotReadyDetails`
- `ImportApplySourceDetails`
- any provenance-related shared types if they belong in command typing

Add stable error codes in `src/constants/exit-codes.ts`.

- [x] **Step 4: Re-run schema/type tests**

Run:

```bash
corepack pnpm vitest run tests/unit/public-json-schema.test.ts tests/unit/exit-codes.test.ts
```

Expected: PASS for contract declarations still pending full schema plumbing.

- [x] **Step 5: Commit**

```bash
git add src/types/command.ts src/constants/exit-codes.ts tests/unit/public-json-schema.test.ts
git commit -m "feat: define import apply public contract"
```

## Task 2: Add Snapshot Provenance Support

**Files:**
- Modify: `src/types/snapshot.ts`
- Modify: `src/services/snapshot.service.ts`
- Test: `tests/unit/switch.service.test.ts`
- Test: `tests/unit/rollback.service.test.ts`

- [x] **Step 1: Write failing snapshot provenance tests**

Add tests asserting snapshot manifests can store:

```ts
provenance: {
  origin: 'import-apply',
  sourceFile: 'E:/tmp/exported.json',
  importedProfileId: 'gemini-prod',
}
```

Also assert existing `use` / `rollback` behavior remains unchanged when provenance is absent.

- [x] **Step 2: Run targeted snapshot tests**

Run:

```bash
corepack pnpm vitest run tests/unit/switch.service.test.ts tests/unit/rollback.service.test.ts
```

Expected: FAIL because provenance is not typed/persisted.

- [x] **Step 3: Extend snapshot manifest model minimally**

Add optional provenance field without changing existing rollback decision logic.

- [x] **Step 4: Re-run targeted snapshot tests**

Run:

```bash
corepack pnpm vitest run tests/unit/switch.service.test.ts tests/unit/rollback.service.test.ts
```

Expected: PASS with no regression in existing scope integrity behavior.

- [x] **Step 5: Commit**

```bash
git add src/types/snapshot.ts src/services/snapshot.service.ts tests/unit/switch.service.test.ts tests/unit/rollback.service.test.ts
git commit -m "feat: add snapshot provenance metadata"
```

## Task 3: Build Import Apply Service Gates

**Files:**
- Create: `src/services/import-apply.service.ts`
- Modify: `src/services/import-source.service.ts`
- Test: `tests/unit/import-apply.service.test.ts`

- [x] **Step 1: Write failing unit tests for source gate**

Cover:

- missing file bubbles `IMPORT_SOURCE_NOT_FOUND`
- profile id not found returns `IMPORT_PROFILE_NOT_FOUND`
- non-Gemini imported profile returns `IMPORT_PLATFORM_NOT_SUPPORTED`

Example:

```ts
expect(result).toMatchObject({
  ok: false,
  action: 'import-apply',
  error: { code: 'IMPORT_PROFILE_NOT_FOUND' },
})
```

- [x] **Step 2: Write failing unit tests for local-first gating**

Cover:

- `previewDecision.canProceedToApplyDesign = false` returns `IMPORT_APPLY_NOT_READY`
- project scope unavailable returns `IMPORT_SCOPE_UNAVAILABLE`
- project scope available but no `force` returns `CONFIRMATION_REQUIRED`
- availability failure happens before confirmation failure

- [x] **Step 3: Write failing unit test for successful user-scope apply path**

Assert success payload contains:

- `sourceFile`
- `importedProfile`
- `appliedScope`
- `scopePolicy`
- `backupId`
- provenance written as `import-apply`

- [x] **Step 4: Run import apply unit tests**

Run:

```bash
corepack pnpm vitest run tests/unit/import-apply.service.test.ts
```

Expected: FAIL because service does not exist.

- [x] **Step 5: Implement minimal orchestration service**

Implement service flow:

1. load import source
2. select exactly one profile
3. reject non-Gemini
4. obtain local observation / fidelity / previewDecision using existing import preview logic or extracted helpers
5. reject not-ready items
6. resolve requested scope locally
7. enforce availability-before-confirmation
8. validate + preview + snapshot + apply via existing adapter/service patterns
9. return success/failure in import apply contract

- [x] **Step 6: Re-run import apply unit tests**

Run:

```bash
corepack pnpm vitest run tests/unit/import-apply.service.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/services/import-apply.service.ts src/services/import-source.service.ts tests/unit/import-apply.service.test.ts
git commit -m "feat: add import apply service"
```

## Task 4: Wire CLI Command Surface

**Files:**
- Modify: `src/commands/import.command.ts`
- Modify: `src/cli/index.ts`
- Test: `tests/integration/cli-commands.test.ts`

- [x] **Step 1: Write failing CLI integration tests for command shape**

Cover:

- `api-switcher import apply exported.json --profile gemini-prod --json`
- missing `--profile` exits as a command usage failure
- non-Gemini profile returns `IMPORT_PLATFORM_NOT_SUPPORTED`

- [x] **Step 2: Write failing CLI integration tests for gate order**

Cover:

- project availability unavailable returns `IMPORT_SCOPE_UNAVAILABLE`
- same case does not return `CONFIRMATION_REQUIRED`
- project available without `--force` returns `CONFIRMATION_REQUIRED`

- [x] **Step 3: Run targeted CLI tests**

Run:

```bash
corepack pnpm vitest run tests/integration/cli-commands.test.ts -t "import apply"
```

Expected: FAIL because CLI command is not registered.

- [x] **Step 4: Register the CLI command**

Implement:

- `import apply <file>`
- required `--profile`
- optional `--scope`
- optional `--force`
- JSON/text rendering through existing command pipeline

- [x] **Step 5: Re-run targeted CLI tests**

Run:

```bash
corepack pnpm vitest run tests/integration/cli-commands.test.ts -t "import apply"
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/commands/import.command.ts src/cli/index.ts tests/integration/cli-commands.test.ts
git commit -m "feat: add import apply cli command"
```

## Task 5: Render JSON and Text Explainable

**Files:**
- Modify: `src/renderers/json-renderer.ts`
- Modify: `src/renderers/text-renderer.ts`
- Test: `tests/unit/text-renderer.test.ts`
- Test: `tests/unit/output-command-result.test.ts`

- [x] **Step 1: Write failing renderer tests for success output**

Assert text output includes:

- source file
- imported profile id
- applied scope
- scope policy
- scope availability when relevant
- backup id

Assert JSON rendering preserves stable success fields without flattening nested explainable.

- [x] **Step 2: Write failing renderer tests for failure output**

Cover:

- `IMPORT_APPLY_NOT_READY` shows preview decision and local observation context
- `IMPORT_SCOPE_UNAVAILABLE` shows scope policy + scope availability
- `CONFIRMATION_REQUIRED` still shows risk + scope details in import apply context

- [x] **Step 3: Run renderer tests**

Run:

```bash
corepack pnpm vitest run tests/unit/text-renderer.test.ts tests/unit/output-command-result.test.ts
```

Expected: FAIL because import apply rendering is missing.

- [x] **Step 4: Implement renderer support**

Keep wording aligned with existing import preview / Gemini scope text:

- availability failure before confirmation
- local-first language
- no misleading “add --force” when availability is unresolved

- [x] **Step 5: Re-run renderer tests**

Run:

```bash
corepack pnpm vitest run tests/unit/text-renderer.test.ts tests/unit/output-command-result.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/renderers/json-renderer.ts src/renderers/text-renderer.ts tests/unit/text-renderer.test.ts tests/unit/output-command-result.test.ts
git commit -m "feat: render import apply results"
```

## Task 6: Expand Gemini Integration Coverage

**Files:**
- Modify: `tests/integration/gemini-preview-use-rollback.test.ts`
- Modify: `tests/integration/cli-commands.test.ts`

- [x] **Step 1: Add failing Gemini-focused integration tests**

Cover:

- user-scope import apply success
- project-scope availability failure
- project-scope confirmation failure
- project-scope success with `--force`
- rollback after import apply respects recorded scope

- [x] **Step 2: Run Gemini integration tests**

Run:

```bash
corepack pnpm vitest run tests/integration/gemini-preview-use-rollback.test.ts tests/integration/cli-commands.test.ts -t "import apply|rollback"
```

Expected: FAIL until service/CLI integration is complete.

- [x] **Step 3: Fill any orchestration gaps revealed by integration**

Typical likely fixes:

- snapshot provenance propagation
- scope policy population
- changedFiles / noChanges behavior
- rollback manifest compatibility

- [x] **Step 4: Re-run Gemini integration tests**

Run:

```bash
corepack pnpm vitest run tests/integration/gemini-preview-use-rollback.test.ts tests/integration/cli-commands.test.ts -t "import apply|rollback"
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add tests/integration/gemini-preview-use-rollback.test.ts tests/integration/cli-commands.test.ts
git commit -m "test: cover gemini import apply flows"
```

## Task 7: Update Public Docs and Schema

**Files:**
- Modify: `README.md`
- Modify: `docs/public-json-schema.md`
- Modify: `docs/public-json-output.schema.json`
- Modify: `tests/unit/public-json-schema.test.ts`

- [x] **Step 1: Write failing documentation/schema assertions**

Add tests for:

- `import-apply` action in public schema
- success contract defs
- failure detail defs where stable

- [x] **Step 2: Run public schema tests**

Run:

```bash
corepack pnpm vitest run tests/unit/public-json-schema.test.ts
```

Expected: FAIL because machine-readable schema has not been updated.

- [x] **Step 3: Update docs and schema**

Document:

- command syntax
- Gemini-only scope
- single-profile boundary
- local-first apply rule
- availability-before-confirmation gate order
- rollback provenance note

- [x] **Step 4: Re-run public schema tests**

Run:

```bash
corepack pnpm vitest run tests/unit/public-json-schema.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add README.md docs/public-json-schema.md docs/public-json-output.schema.json tests/unit/public-json-schema.test.ts
git commit -m "docs: document import apply contract"
```

## Task 8: Full Verification

**Files:**
- Modify: none unless fixes are needed
- Test: `tests/unit/import-apply.service.test.ts`
- Test: `tests/integration/cli-commands.test.ts`
- Test: `tests/integration/gemini-preview-use-rollback.test.ts`
- Test: `tests/unit/text-renderer.test.ts`
- Test: `tests/unit/output-command-result.test.ts`
- Test: `tests/unit/public-json-schema.test.ts`

- [x] **Step 1: Run focused verification suite**

Run:

```bash
corepack pnpm vitest run tests/unit/import-apply.service.test.ts tests/integration/cli-commands.test.ts tests/integration/gemini-preview-use-rollback.test.ts tests/unit/text-renderer.test.ts tests/unit/output-command-result.test.ts tests/unit/public-json-schema.test.ts
```

Expected: PASS.

- [x] **Step 2: Run typecheck**

Run:

```bash
corepack pnpm typecheck
```

Expected: PASS.

- [x] **Step 3: Run build**

Run:

```bash
corepack pnpm build
```

Expected: PASS.

- [x] **Step 4: If anything fails, fix and re-run only the affected slice, then repeat full verification**

- [x] **Step 5: Commit final integration**

```bash
git add .
git commit -m "feat: add gemini import apply"
```
