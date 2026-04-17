# Gemini Multi-Scope Detection Design

## Context

The current Gemini implementation assumes a single user-level `settings.json` target. That no longer matches the official Gemini CLI configuration model, which layers multiple sources with defined precedence. As a result, `api-switcher` can currently write a valid user settings file but still mis-explain the effective state when project-level or system-level configuration participates in the runtime result.

This design upgrades Gemini detection and target resolution to understand the official multi-scope configuration model while keeping write behavior intentionally narrow and safe for this iteration.

## Goals

- Detect Gemini configuration across all officially relevant file scopes.
- Compute and explain the effective configuration using official precedence rules.
- Make `current`, `list`, `preview`, and `validate` reflect multi-scope reality.
- Keep write behavior restricted to a single managed scope for now.
- Preserve the Gemini dual-track model introduced earlier:
  - stable managed settings
  - runtime auth
  - experimental extensions

## Non-Goals

- This change does not introduce multi-scope write orchestration.
- This change does not implement trust-folder policy management.
- This change does not make `system-overrides` writable by default.
- This change does not attempt to introspect active environment variables beyond the profile-associated runtime auth semantics already supported.

## Official Scope Model

The Gemini CLI configuration model must be represented as the following file scopes:

1. `system-defaults`
2. `user`
3. `project`
4. `system-overrides`

These scopes are applied in precedence order such that later scopes override earlier ones.

On top of these file scopes, runtime behavior may still be affected by:

- environment variables
- CLI arguments

For `api-switcher`, file-scope merging and explanation are in scope; environment and CLI arg effects remain explainable overlays, not directly detectable state.

## Recommended Implementation Strategy

### Recommended Scope Coverage

Implement all four official file scopes for detection and target resolution:

- `system-defaults`
- `user`
- `project`
- `system-overrides`

### Recommended Write Strategy

For this iteration, keep writes restricted to one explicit managed scope:

- default write target: `user`

This yields a safe split:

- detection and explanation are multi-scope
- writes and rollback remain single-scope

## Path Resolution Model

Gemini target resolution should stop returning only one path. It should return a structured list of candidate scope targets.

### Resolver Output

The resolver should return entries shaped roughly like:

```ts
type GeminiScopeTarget = {
  scope: 'system-defaults' | 'user' | 'project' | 'system-overrides'
  path: string
  exists: boolean
  writable: boolean
  role: 'settings'
}
```

### Scope Sources

The resolver should support environment overrides for tests and controlled execution. Recommended environment variables:

- `API_SWITCHER_GEMINI_SYSTEM_DEFAULTS_SETTINGS_PATH`
- `API_SWITCHER_GEMINI_USER_SETTINGS_PATH`
- `API_SWITCHER_GEMINI_PROJECT_ROOT`
- `API_SWITCHER_GEMINI_SYSTEM_OVERRIDES_SETTINGS_PATH`

Compatibility path:

- `API_SWITCHER_GEMINI_SETTINGS_PATH` continues to mean the user-scope settings path unless a dedicated user-scope override is set.

### Project Scope

Project scope should resolve to:

- `<project-root>/.gemini/settings.json`

If no project root is available, project scope should still be listed as unresolved or absent in a structured way rather than silently omitted from reasoning.

## Scope Loading and Merge Semantics

Introduce a Gemini scope loader that:

- reads each available settings file
- parses the JSON safely
- extracts stable managed Gemini settings from each scope
- merges them by official precedence

### Merge Rules

- Start from `system-defaults`
- overlay `user`
- overlay `project`
- overlay `system-overrides`

The merged object becomes the effective stored file configuration.

### Explainability Requirements

The loader must preserve enough information to answer:

- which scopes exist
- which scopes contributed values
- which scope last overrode each managed field

This matters because `effectiveConfig.overrides` should explain why the final value differs from a lower-precedence scope.

## Adapter Semantics

### listTargets()

`listTargets()` should return all four scope targets, not just the write target.

Each target must include:

- `scope`
- `path`
- `exists`
- `managedKeys`

Writeability should not be inferred from `TargetFileInfo` for now unless the shared type is extended; warnings can communicate non-writable scopes when relevant.

### validate(profile)

Validation remains profile-centric, but it should now:

- describe the managed boundary across multi-scope detection
- explain that `api-switcher` currently manages one write scope while detecting multiple read scopes
- keep runtime auth and experimental warnings from the Gemini dual-track model

### preview(profile)

Preview should:

- load all scopes
- compute effective stored config from multi-scope merge
- compare the managed write target after applying the profile
- explain whether a higher-precedence or lower-precedence scope currently influences the effective value

For this iteration:

- diff summary should remain scoped to the single managed write target
- effective config should reflect merged multi-scope stored state
- overrides should explain cross-scope precedence

### detectCurrent(profiles)

Current-state detection should:

- compute merged multi-scope effective file config
- compare that effective config to each Gemini profile’s stable settings
- refuse to mark experimental base URL profiles as fully matched unless experimental detectability is later implemented

`currentScope` should reflect the highest-precedence scope that currently contributes the final managed value when that is unambiguous. If multiple managed keys come from different scopes, `currentScope` may use the highest contributing scope and warnings should explain mixed provenance.

### apply(profile)

Apply should still write one file only.

Recommended behavior:

- resolve write target to `user` scope by default
- write only stable managed settings to that target
- compute effective config using all scopes after the write
- report limitations when higher-precedence scopes could still override the final runtime result

This is the key safety guard: multi-scope detection must not become silent multi-scope mutation.

### rollback(snapshotId)

Rollback should continue restoring only files that were actually backed up during apply. Since apply stays single-scope for now:

- rollback remains single-scope for Gemini writes
- output must still mention that effective runtime state may depend on other scopes that were not modified

## Shared Type Implications

The existing shared adapter types are close, but Gemini multi-scope detection will lean on:

- `TargetFileInfo.scope`
- `ConfigFieldView.scope`
- `OverrideExplanation.targetScope`
- `ManagedBoundary.type = 'scope-aware'`

Recommendation:

- For Gemini multi-scope detection, use `scope-aware` boundaries when describing the four-layer model.
- Keep diff summaries focused on the actual write target path.

No broad type redesign is required for this iteration.

## Managed Boundary Model

Gemini should expose two boundary layers:

1. A scope-aware detection boundary describing official scope precedence.
2. A managed-fields boundary for the actual write target.

Example notes:

- "Gemini 当前按 system-defaults < user < project < system-overrides 的顺序合并 settings.json。"
- "本次仅托管 user scope 的 Gemini settings.json，其他 scope 只参与探测与解释。"

## Current-State Summary Behavior

Because `CurrentStateService` uses `detectCurrent()` to build list and current summaries, Gemini multi-scope detection will directly improve:

- `current`
- `list`

However, list risk/health inference still relies on a simple `managed` boolean plus matched profile id. That is good enough for now, but mixed-scope override warnings may justify future refinement.

## Backward Compatibility

The previous environment variable:

- `API_SWITCHER_GEMINI_SETTINGS_PATH`

should remain valid and be treated as:

- user-scope settings path

This avoids breaking existing tests and local setups.

## Files To Modify

Primary files:

- `src/adapters/gemini/gemini.target-resolver.ts`
- `src/adapters/gemini/gemini.adapter.ts`
- `tests/unit/gemini.adapter.test.ts`
- `tests/integration/gemini-preview-use-rollback.test.ts`
- `tests/integration/cli-commands.test.ts`
- `README.md`

Likely new helper files:

- `src/adapters/gemini/gemini.scope-resolver.ts`
- `src/adapters/gemini/gemini.scope-loader.ts`

## Testing Strategy

### Unit Tests

- resolver returns all four scopes
- user-scope compatibility env var still works
- merge precedence follows official scope ordering
- current-state matching uses merged effective config
- higher-precedence scope overrides are surfaced in effective config explanations

### Integration Tests

- preview uses merged effective config while diffing only the managed write target
- use writes the user scope and reports if project or system overrides still win
- current and list reflect project/system override presence
- rollback restores the user scope write target only

### CLI Tests

- `current --json` reports all Gemini targets with scopes
- `preview --json` shows scope-aware boundaries and effective merged values
- text output explains scope precedence in human-readable form

## Risks

- Path conventions for `system-defaults` and `system-overrides` may vary by installation context, so resolver overrides are necessary.
- If precedence explanation is too shallow, users may still think the write target equals the effective target.
- If apply writes user scope while project/system overrides win, users may perceive the tool as broken unless the output is explicit.

## Recommendation

Implement full four-scope detection and effective-config explanation now, but keep Gemini writes restricted to the user scope until scope-aware write strategy is separately designed and tested.
