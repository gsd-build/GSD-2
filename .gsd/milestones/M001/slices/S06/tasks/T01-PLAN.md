---
estimated_steps: 4
estimated_files: 2
---

# T01: Type iterate schema and add validation to definition-loader

**Slice:** S06 — Iteration with Durable Graph Expansion
**Milestone:** M001

## Description

The `iterate` field on `StepDefinition` is currently typed as `unknown` (forward-compat placeholder from S04). This task replaces it with a typed `IterateConfig` interface and adds validation in `validateDefinition()`. This is the foundation T02 needs to consume iterate configs for expansion logic.

The existing test fixture `{ source: "file.md", pattern: "^## (.+)" }` already conforms to the new typed shape, so existing tests should continue to pass without modification.

## Steps

1. **Add `IterateConfig` interface** in `definition-loader.ts`:
   ```typescript
   export interface IterateConfig {
     /** Artifact path (relative to run dir) to read and match against. */
     source: string;
     /** Regex pattern string. Must contain at least one capture group. Applied with global flag. */
     pattern: string;
   }
   ```
   Change `StepDefinition.iterate` from `iterate?: unknown` to `iterate?: IterateConfig`.

2. **Add iterate validation** in `validateDefinition()`, inside the per-step loop, after the existing `verify` validation block. If `step.iterate` is present:
   - Must be a non-null object with `source` (string, non-empty, no `..`) and `pattern` (string, non-empty).
   - `pattern` must be a valid regex (wrap in `try { new RegExp(pattern) } catch`).
   - `pattern` must contain at least one capture group — check via `new RegExp(pattern).source` containing `(` that isn't `(?` (or simpler: test that the regex has at least one capturing group by checking if `/\((?!\?)/.test(pattern)`).
   - Collect errors into the existing `errors[]` array (no short-circuit).

3. **Update the YAML→TypeScript conversion** in `loadDefinition()`: in the step mapping, change `iterate: s.iterate,` to properly type-narrow:
   ```typescript
   iterate: (s.iterate != null && typeof s.iterate === "object")
     ? s.iterate as IterateConfig
     : undefined,
   ```

4. **Add new unit tests** in `definition-loader.test.ts`:
   - `"validateDefinition: valid iterate config accepted"` — `{ source: "outline.md", pattern: "^## (.+)" }` → valid.
   - `"validateDefinition: iterate missing source → error"` — `{ pattern: "^## (.+)" }` → error mentioning source.
   - `"validateDefinition: iterate source with .. → error"` — `{ source: "../escape.md", pattern: "(.+)" }` → error mentioning path traversal.
   - `"validateDefinition: iterate invalid regex → error"` — `{ source: "f.md", pattern: "[invalid" }` → error mentioning regex.
   - `"validateDefinition: iterate pattern without capture group → error"` — `{ source: "f.md", pattern: "^## .+" }` → error mentioning capture group.
   - Verify the existing test `"validateDefinition: unknown fields (context_from, iterate) → accepted silently"` still passes — its fixture `{ source: "file.md", pattern: "^## (.+)" }` is a valid `IterateConfig`.

## Must-Haves

- [ ] `IterateConfig` interface exported from `definition-loader.ts`
- [ ] `StepDefinition.iterate` typed as `IterateConfig | undefined` (not `unknown`)
- [ ] Validation rejects: missing source, `..` in source, invalid regex, no capture group
- [ ] Existing 13+ definition-loader tests pass unchanged
- [ ] New iterate validation tests pass

## Verification

- `node --experimental-strip-types --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/definition-loader.test.ts` — all tests pass (13 existing + 5 new = 18+)
- `npx tsc --noEmit --project tsconfig.extensions.json` — zero type errors

## Inputs

- `src/resources/extensions/gsd/definition-loader.ts` — current file with `iterate?: unknown` on StepDefinition and no iterate validation in `validateDefinition()`
- `src/resources/extensions/gsd/tests/definition-loader.test.ts` — current 13 tests including the forward-compat test that passes `iterate: { source: "file.md", pattern: "^## (.+)" }`

## Expected Output

- `src/resources/extensions/gsd/definition-loader.ts` — `IterateConfig` exported, `StepDefinition.iterate` typed, validation added (~30 lines added)
- `src/resources/extensions/gsd/tests/definition-loader.test.ts` — 5 new iterate-specific tests (~60 lines added)

## Observability Impact

- **Validation errors surfaced:** Malformed `iterate` configs now produce specific error messages (`iterate.source must be a non-empty string`, `iterate.pattern is not a valid regex`, `iterate.pattern must contain at least one capture group`, `iterate.source contains disallowed '..' path traversal`) instead of being silently accepted.
- **Inspection:** A future agent can test iterate config validity by calling `validateDefinition()` with a parsed YAML object and inspecting the `errors[]` array for iterate-specific messages.
- **Failure visibility:** Invalid iterate configs are caught at definition load time (before any engine dispatch), so bad configs fail fast with all errors collected in a single pass — no partial-state failures downstream.
