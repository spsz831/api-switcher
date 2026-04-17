# Gemini Dual-Track Contract Design

## Context

The current Gemini implementation in `api-switcher` mixes three different concerns into one adapter contract:

- Officially supported Gemini CLI `settings.json` fields
- Runtime authentication that is only effective through environment variables
- Unofficial proxy or gateway configuration such as custom base URL

That model is good enough for an initial closed-loop implementation, but it is not strict enough for a production-quality adapter. The current behavior accepts unsupported input, explains it through warnings, and still presents the platform as partially managed. This creates a semantic gap between what the adapter says and what the underlying CLI actually honors.

This design introduces a dual-track contract:

- Stable track: explicit support for Gemini CLI behavior that is documented and stable.
- Experimental track: explicit opt-in support for non-official gateway or proxy behavior, clearly marked as experimental in validation, preview, apply, current-state reporting, and rollback.

The goal is to make Gemini support stricter without making the adapter less useful for real-world proxy setups.

## Goals

- Make the default Gemini adapter behavior align with the official Gemini CLI contract.
- Keep custom gateway support available, but only as explicit experimental support.
- Stop treating runtime-only values as if they were normal managed file fields.
- Make preview and current-state output distinguish stable managed config, runtime auth, and experimental extensions.
- Keep the current CLI surface small and compatible where possible.

## Non-Goals

- This change does not introduce encrypted secret storage.
- This change does not implement full multi-scope Gemini config merging across user, project, and local scopes.
- This change does not guarantee that experimental proxy config will be honored by upstream Gemini CLI in every environment.
- This change does not refactor Claude or Codex contracts.

## Source of Truth

Gemini configuration must be represented as three separate categories:

1. Stable managed settings
2. Runtime authentication
3. Experimental extensions

### Stable Managed Settings

These are fields that `api-switcher` writes to Gemini configuration files because there is a stable, documented contract for them.

For this iteration, the stable managed file remains:

- User scope `settings.json`

Stable managed keys for this iteration:

- `enforcedAuthType`

### Runtime Authentication

These values are part of the selected profile, but they are not represented as stable file-managed fields.

For this iteration:

- `GEMINI_API_KEY` is a runtime secret reference.
- It participates in profile validation and preview.
- It must be rendered as runtime-effective auth, not as a `settings.json` managed field.
- It is never reported as if rollback can restore it.

### Experimental Extensions

These values exist to support common proxy/gateway setups, but they are not part of the stable Gemini CLI contract.

For this iteration:

- `GEMINI_BASE_URL`

Experimental values must:

- be explicit in the profile contract
- be opt-in
- carry a warning or limitation in all relevant outputs
- never silently downgrade into normal stable managed behavior

## Profile Contract Changes

The profile model remains backward-compatible at the top level, but Gemini will adopt stronger semantics inside `apply` and `meta`.

### Proposed Shape

Gemini profiles will use:

- `apply` for stable managed settings and runtime auth references
- `meta.experimental` for experimental adapter behavior flags

Example:

```json
{
  "id": "gemini-office",
  "name": "gemini-office",
  "platform": "gemini",
  "source": {
    "apiKey": "gm-live-xxx",
    "authType": "gemini-api-key",
    "baseURL": "https://proxy.example.com"
  },
  "apply": {
    "GEMINI_API_KEY": "gm-live-xxx",
    "enforcedAuthType": "gemini-api-key"
  },
  "meta": {
    "experimental": {
      "geminiBaseUrl": "https://proxy.example.com"
    }
  }
}
```

If backward compatibility is required for existing data, the adapter should still detect legacy `apply.GEMINI_BASE_URL` and normalize it into the experimental track in memory. That compatibility path should be treated as transitional behavior and documented as such.

## Target Resolution

Gemini target resolution remains intentionally narrow for this iteration:

- Stable track target: user-level `settings.json`
- Experimental track target: no default write target unless a reliable file or env contract is explicitly supported by the implementation

This is the main behavior change from the current adapter:

- `GEMINI_BASE_URL` is not treated as a normal writeable managed field by default.
- If no reliable write target exists for the experimental field, `apply` must refuse to claim that it applied the experimental config.

## Adapter Semantics

### validate(profile)

Validation must return structured output across the three categories:

- Stable managed settings validation
- Runtime auth validation
- Experimental extension validation

Rules:

- Missing `GEMINI_API_KEY` remains an error.
- Unsupported `enforcedAuthType` values remain warnings unless they make the profile unusable.
- Experimental proxy config is always marked with an explicit warning or limitation.
- Legacy `apply.GEMINI_BASE_URL` must produce a compatibility warning and be normalized into the experimental path during validation.

Validation must clearly say:

- what is stable and file-managed
- what is runtime-only
- what is experimental and not guaranteed by upstream Gemini CLI

### preview(profile)

Preview must report changes separately:

- Stable file writes to `settings.json`
- Runtime auth requirements
- Experimental proxy intent

Rules:

- `effectiveFields` must not flatten all Gemini inputs into one undifferentiated list.
- `GEMINI_API_KEY` must appear as runtime-effective auth, not as a user-scope managed setting.
- Experimental `base URL` must appear with `source: managed-policy` or another explicit experimental marker.
- `backupPlanned` only reflects actual file writes.
- If experimental proxy config has no write target, preview must state that explicitly.

### detectCurrent(profiles)

Current-state detection must become more honest:

- Stable match is based only on stable managed file fields.
- Runtime auth can only be reported as profile-associated intent, not confirmed current environment state.
- Experimental proxy match must be reported separately from stable match if the adapter supports reading it.

If experimental config cannot be reliably detected, current-state output must say so rather than pretending the profile is fully matched.

### apply(profile)

Apply must separate file writes from runtime-only and experimental behavior.

Rules:

- Stable managed fields are written to `settings.json`.
- Runtime auth is not written as file-managed state unless a stable contract exists.
- Experimental proxy config is only applied when the experimental path is explicitly enabled and a reliable write target exists.
- If experimental config is requested but there is no write target, `apply` must return a failure or no-op with an explicit message. It must not report success for unsupported writes.

### rollback(snapshotId)

Rollback only restores what was actually backed up and written.

Rules:

- Stable `settings.json` changes are restorable.
- Runtime auth is never restorable by rollback.
- Experimental config is only restorable if it was written to a backed-up target file.

Rollback output must explicitly separate:

- restored stable files
- non-restored runtime auth
- non-restored experimental extensions

## Output Model Changes

The current shared adapter types are almost sufficient, but Gemini needs better labeling.

Recommended adjustments:

- Use `source: env` for runtime auth fields.
- Use `source: managed-policy` for experimental values surfaced by the adapter but not backed by stable upstream guarantees.
- Add notes to `managedBoundaries` that explain whether a boundary is stable or experimental.
- Prefer explicit `warnings` for experimental behavior and `limitations` for unsupported restore/detect behavior.

No broad type-system redesign is required if the existing `EffectiveSource` union is used carefully.

## Migration and Compatibility

This change must preserve existing profiles where possible.

### Legacy Gemini Profiles

Legacy Gemini profiles may contain:

- `apply.GEMINI_BASE_URL`

Compatibility strategy:

- Read it.
- Normalize it into the experimental contract at runtime.
- Warn that the field is now experimental and should be migrated.
- Keep export output explicit so users can see the new structure.

### Add Command

`add --platform gemini --url` should stop pretending this is a normal stable Gemini option.

Recommended behavior:

- Allow `--url` only behind an explicit experimental flag in a later CLI enhancement, or
- keep current refusal behavior until the CLI has a dedicated experimental input model.

For this implementation slice, the safer choice is to keep `add` strict and leave experimental Gemini profile authoring to file-based editing until the CLI contract is expanded deliberately.

## Files To Modify

Primary implementation files:

- `src/adapters/gemini/gemini.adapter.ts`
- `src/adapters/gemini/gemini.mapper.ts`
- `src/adapters/gemini/gemini.target-resolver.ts`
- `src/types/profile.ts`
- `src/types/adapter.ts`
- `src/services/add.service.ts`
- `src/services/export.service.ts`
- `src/renderers/text-renderer.ts`
- `tests/unit/gemini.adapter.test.ts`
- `tests/unit/text-renderer.test.ts`
- `tests/integration/gemini-preview-use-rollback.test.ts`
- `tests/integration/cli-commands.test.ts`
- `README.md`

Possible small helper additions:

- `src/adapters/gemini/gemini.contract.ts`
- `src/adapters/gemini/gemini.experimental.ts`

## Testing Strategy

Tests must be split by contract type:

### Stable Track Tests

- validate stable official profile
- preview stable settings-only change
- apply stable `settings.json` write
- detectCurrent stable match
- rollback stable file restore

### Runtime Auth Tests

- missing `GEMINI_API_KEY` fails validation
- preview marks auth as runtime/env-based
- rollback states env auth is not restorable

### Experimental Track Tests

- legacy `apply.GEMINI_BASE_URL` normalizes into experimental path
- preview marks proxy config as experimental
- apply refuses unsupported experimental writes when no write target exists
- current-state reports experimental detect limitations clearly

### CLI/Renderer Tests

- text output distinguishes stable / runtime / experimental
- JSON output preserves structured distinction
- warnings and limitations remain explainable

## Risks

- If we keep backward compatibility too loose, the adapter will stay ambiguous.
- If we make experimental apply fail too aggressively, users with working local proxy setups may see regressions.
- If we change profile shape without compatibility handling, existing tests and stored fixtures will break.

## Recommendation

Implement the strict dual-track model now, but preserve legacy input compatibility in the adapter layer. Do not expand Gemini CLI authoring flags in the same change unless the internal contract is already stable.
