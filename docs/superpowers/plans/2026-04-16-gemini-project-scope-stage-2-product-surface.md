# Gemini Project Scope Stage 2 Product Surface Plan

**Goal:** Freeze and partially implement the Stage-2 Gemini project-scope product surface so discovery failure UX, confirmation policy, and export fidelity are coherent without prematurely building `import`.

**Architecture:** Treat Gemini `project scope` as a four-layer product model: capability, availability, risk, and integrity. Keep runtime write behavior unchanged, but tighten user-facing messaging and export semantics so future `import` can build on stable contracts.

**Tech Stack:** TypeScript, Vitest, Markdown docs

---

### Task 1: Unify Gemini Project Root Failure Messaging

**Files:**
- Modify: `src/adapters/gemini/gemini.scope-resolver.ts`
- Test: `tests/unit/gemini.adapter.test.ts`
- Test: `tests/integration/cli-commands.test.ts`

- [x] Replace remaining English resolver messages with the Stage-2 Chinese product copy.
- [x] Add CLI text coverage proving availability failure shows remediation and does not imply `--force`.
- [x] Verify with targeted Gemini resolver + CLI tests.

### Task 2: Freeze Stage-2 Product Design

**Files:**
- Add: `docs/superpowers/specs/2026-04-16-gemini-project-scope-stage-2-product-surface-design.md`

- [x] Document the product model:
  - capability
  - availability
  - risk
  - integrity
- [x] Freeze project-root discovery UX and message rules.
- [x] Freeze user -> project confirmation semantics.
- [x] Define export/import boundary without implementing `import`.

### Task 3: Decide Minimal Additional Code Scope

**Files:**
- Modify: `src/services/export.service.ts`
- Modify: `src/types/command.ts`
- Modify: `docs/public-json-schema.md`
- Modify: `README.md`
- Test: `tests/unit/export.service.test.ts`
- Test: `tests/integration/cli-commands.test.ts`

- [ ] Evaluate whether to add `observedAt` to `export`.
- [ ] If adopted, keep it observational only and document that import must re-resolve local availability.
- [x] Evaluate whether to add `observedAt` to `export`.
- [x] If adopted, keep it observational only and document that import must re-resolve local availability.
- [ ] Do not add `import` execution logic in this stage.

### Task 4: Phase-3 Gate

**Files:**
- Add later: dedicated import spec/plan

- [ ] Only start Phase 3 when the user explicitly wants `import preview/import apply`.
- [ ] Before Phase 3, create a separate spec covering:
  - import preview
  - fidelity mismatch presentation
  - local re-resolution before write-back
  - project/user conflict policy

### Verification

- [x] `corepack pnpm vitest run tests/unit/gemini.adapter.test.ts`
- [x] `corepack pnpm vitest run tests/integration/cli-commands.test.ts -t "project root 修复建议|preview --scope project 在 project scope 无法解析"`
- [x] `corepack pnpm typecheck`
