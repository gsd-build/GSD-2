---
estimated_steps: 4
estimated_files: 3
---

# T01: Implement `{{variable}}` parameter substitution with dispatch-time resolution

**Slice:** S07 — LLM-Assisted Builder + CLI Commands
**Milestone:** M001

## Description

Add `substituteParams()` to `definition-loader.ts` that replaces `{{key}}` placeholders in step prompts with values from the definition's `params` map merged with optional CLI overrides. Wire it into `custom-workflow-engine.ts`'s `resolveDispatch()` so substitution happens at dispatch time — not at snapshot time — preserving R007's byte-exact `copyFileSync` contract.

This completes R006's deferred parameterization requirement. The DEFINITION.yaml snapshot remains an exact copy of the source, and parameters are resolved when the step prompt is assembled for dispatch. CLI overrides (from `--param key=value`) are stored in a separate `PARAMS.json` file in the run directory, read at dispatch time alongside the definition.

**Relevant skills:** None needed — pure TypeScript function + unit tests using Node.js built-in test runner.

## Steps

1. **Add `substituteParams()` to `definition-loader.ts`.**
   - Function signature: `substituteParams(definition: WorkflowDefinition, overrides?: Record<string, string>): WorkflowDefinition`
   - Merge `definition.params ?? {}` with `overrides ?? {}` (overrides win)
   - For each step, replace `{{key}}` in `step.prompt` with the merged value
   - Reject any param value containing `..` (path traversal guard, throw Error)
   - After substitution, scan all step prompts for remaining `{{key}}` patterns. If any remain that are not escaped, throw an Error listing the unresolved keys
   - Return a new `WorkflowDefinition` with substituted prompts (do not mutate input)
   - Export the function

2. **Wire `substituteParams()` into `resolveDispatch()` in `custom-workflow-engine.ts`.**
   - After parsing DEFINITION.yaml into a `WorkflowDefinition` object in `resolveDispatch()`, check if a `PARAMS.json` file exists in `this.runDir`
   - If PARAMS.json exists, read and parse it as `Record<string, string>`
   - Call `substituteParams(definition, paramsFromFile)` to get a definition with resolved prompts
   - Use the substituted definition when building the dispatch prompt (the `nextStep.prompt` from the graph still has raw `{{key}}` — instead use the matching step from the substituted definition)
   - Important: the `nextStep` from `getNextPendingStep(graph)` has the raw prompt from GRAPH.yaml. The substituted prompt comes from the definition's steps. Match by step ID.
   - For iteration instances: their prompts in GRAPH.yaml already contain the parent's raw prompt. Substitute params in those too by running substitution on the prompt string directly.

3. **Write `param-substitution.test.ts` with comprehensive unit tests.**
   - Test cases:
     - Basic `{{key}}` replacement with single param
     - Multiple params in one prompt
     - CLI overrides take precedence over definition params
     - Missing param value (key in prompt but not in params) throws Error listing the key
     - Param value containing `..` throws Error
     - No params and no `{{key}}` in prompts — passthrough (no error)
     - Prompt with `{{key}}` but definition has no params field and no overrides — throws
     - Non-mutating: original definition is not modified
   - Use `import test from "node:test"` and `import assert from "node:assert/strict"`
   - Import `substituteParams` from `../definition-loader.ts`
   - Run with: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/param-substitution.test.ts`

4. **Verify no regressions in existing tests.**
   - Run `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/definition-loader.test.ts` — all 13 pass
   - Run `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/definition-run-integration.test.ts` — all 4 pass
   - Run `npx tsc --noEmit --project tsconfig.extensions.json` — 0 errors

## Must-Haves

- [ ] `substituteParams()` exported from `definition-loader.ts`
- [ ] Substitution is non-mutating (returns new WorkflowDefinition)
- [ ] `..` in param values is rejected with a thrown Error
- [ ] Unresolved `{{key}}` after substitution throws Error listing the missing keys
- [ ] `resolveDispatch()` in `custom-workflow-engine.ts` reads PARAMS.json and calls `substituteParams()`
- [ ] Iteration instance prompts are also substituted
- [ ] All param-substitution unit tests pass
- [ ] Existing definition-loader and integration tests pass (zero regression)

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/param-substitution.test.ts` — all tests pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/definition-loader.test.ts` — 13/13 pass (no regression)
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/definition-run-integration.test.ts` — 4/4 pass (no regression)
- `npx tsc --noEmit --project tsconfig.extensions.json` — 0 errors

## Observability Impact

- Signals added/changed: `substituteParams()` throws descriptive errors for missing params or path traversal — these propagate up through `resolveDispatch()` as dispatch stop-reasons
- How a future agent inspects this: check `PARAMS.json` in run directory for stored overrides; check `DEFINITION.yaml` for raw template prompts with `{{key}}`; dispatch errors include param names
- Failure state exposed: unresolved `{{key}}` params listed in error message; path-traversal param values listed in error

## Inputs

- `src/resources/extensions/gsd/definition-loader.ts` — existing `WorkflowDefinition` type with `params?: Record<string, string>` field already parsed from YAML
- `src/resources/extensions/gsd/custom-workflow-engine.ts` — `resolveDispatch()` method that parses DEFINITION.yaml and builds dispatch prompts
- `src/resources/extensions/gsd/graph.ts` — `getNextPendingStep()` returns a `GraphStep` with a `prompt` field (raw from GRAPH.yaml)
- S04 summary: `createRun()` returns `{ runId, runDir }` — PARAMS.json will be written alongside DEFINITION.yaml
- Research: substitution at dispatch time preserves R007. PARAMS.json stores CLI overrides separately from the byte-exact snapshot.

## Expected Output

- `src/resources/extensions/gsd/definition-loader.ts` — modified: new `substituteParams()` export (~30 lines)
- `src/resources/extensions/gsd/custom-workflow-engine.ts` — modified: `resolveDispatch()` reads PARAMS.json and calls `substituteParams()` before building prompts (~15 lines added)
- `src/resources/extensions/gsd/tests/param-substitution.test.ts` — new: 8+ unit tests for `substituteParams()` (~120 lines)
