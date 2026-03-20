# S07: LLM-Assisted Builder + CLI Commands

**Goal:** `/gsd workflow` CLI surface provides full lifecycle management for custom workflows, with `{{variable}}` parameter substitution in step prompts and an LLM-assisted builder conversation for creating new definitions.
**Demo:** `/gsd workflow run test-pipeline --param topic=security` starts a custom workflow run with parameterized prompts. `/gsd workflow list` shows definitions and active runs. `/gsd workflow validate my-def.yaml` checks schema. `/gsd workflow new` starts an LLM conversation that produces valid YAML.

## Must-Haves

- `substituteParams(definition, overrides?)` replaces `{{key}}` in step prompts at dispatch time (not snapshot time) — preserves R007 immutable snapshot
- `commands-workflow.ts` exports `handleWorkflow()` with six subcommands: `new`, `run`, `list`, `pause`, `resume`, `validate`
- `setActiveEngineId()` exported from `auto.ts` to allow setting `custom:<runDir>` before `startAuto()`
- `/gsd workflow run <name>` creates a run via `createRun()`, sets engine ID, and starts auto-mode
- `/gsd workflow pause` and `resume` delegate to existing `pauseAuto` / `startAuto` (D008)
- `/gsd workflow validate <file>` parses YAML and displays validation results
- `/gsd workflow list` shows available definitions and active runs with status
- `/gsd workflow new` loads an LLM conversation prompt that guides the user to produce valid YAML
- `workflow-builder.md` prompt template embeds the V1 schema rules and a complete example
- Routing wired into `commands.ts` with completions and help text
- Auto-mode conflict guard on `run` and `new` (same as `/gsd start`)
- All existing tests pass (zero regression)

## Proof Level

- This slice proves: integration — CLI commands exercise the full definition→run→dispatch pipeline
- Real runtime required: no (mocked `pi.sendMessage` and `ctx.ui.notify`)
- Human/UAT required: yes — builder prompt quality is verified manually in S08

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/param-substitution.test.ts` — all pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/commands-workflow.test.ts` — all pass
- `npx tsc --noEmit --project tsconfig.extensions.json` — 0 errors
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/definition-run-integration.test.ts` — 0 regressions
- `test -f src/resources/extensions/gsd/prompts/workflow-builder.md` — prompt file exists
- Prompt file contains a complete YAML example and V1 schema rules

## Observability / Diagnostics

- Runtime signals: `ctx.ui.notify()` messages for run creation, validation results, list output, and errors
- Inspection surfaces: `/gsd workflow list` shows definitions + active runs; `/gsd workflow validate` shows schema errors; `cat <runDir>/GRAPH.yaml` shows step state
- Failure visibility: validation errors are structured arrays from `validateDefinition()`; run creation errors include definition path and full error message; auto-mode conflict guard produces clear error message
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `definition-loader.ts` (loadDefinition, validateDefinition, WorkflowDefinition), `run-manager.ts` (createRun, listRuns), `auto.ts` (startAuto, pauseAuto, isAutoActive, isAutoPaused), `prompt-loader.ts` (loadPrompt), `graph.ts` (readGraph)
- New wiring introduced: `commands-workflow.ts` → imported into `commands.ts` routing; `setActiveEngineId()` added to `auto.ts`; `workflow-builder.md` prompt added to `prompts/`; `substituteParams()` called from `resolveDispatch()` in `custom-workflow-engine.ts`
- What remains before the milestone is truly usable end-to-end: S08 (dashboard integration + end-to-end acceptance validation)

## Tasks

- [ ] **T01: Implement `{{variable}}` parameter substitution with dispatch-time resolution** `est:25m`
  - Why: Completes R006's deferred parameterization requirement. Parameters must substitute at dispatch time (in `resolveDispatch`) not snapshot time to preserve R007's byte-exact `copyFileSync` contract. This unblocks T02's `run --param` flag.
  - Files: `src/resources/extensions/gsd/definition-loader.ts`, `src/resources/extensions/gsd/custom-workflow-engine.ts`, `src/resources/extensions/gsd/tests/param-substitution.test.ts`
  - Do: (1) Add `substituteParams(definition, overrides?)` to `definition-loader.ts` — replaces `{{key}}` in all step `prompt` fields using `definition.params` merged with optional overrides. Reject param values containing `..`. Throw on unresolved `{{key}}` that exists in prompts but has no value. (2) In `custom-workflow-engine.ts` `resolveDispatch()`, after parsing the frozen DEFINITION.yaml, call `substituteParams()` on the definition's step prompts before building the dispatch prompt. Also handle the case where params+overrides are stored in a `PARAMS.json` file alongside DEFINITION.yaml (so `run --param` overrides persist into the snapshot). (3) Write comprehensive unit tests for `substituteParams()`.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/param-substitution.test.ts`
  - Done when: all param substitution tests pass, existing `definition-run-integration.test.ts` still passes, type check passes

- [ ] **T02: Create `commands-workflow.ts` with all CLI subcommands and wire into `commands.ts`** `est:45m`
  - Why: This is the primary user-facing deliverable — without CLI commands, custom workflows can't be started, listed, paused, resumed, or validated. Closes R013 (all six subcommands) and partially closes R012 (builder conversation setup).
  - Files: `src/resources/extensions/gsd/commands-workflow.ts`, `src/resources/extensions/gsd/commands.ts`, `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/run-manager.ts`, `src/resources/extensions/gsd/tests/commands-workflow.test.ts`
  - Do: (1) Add `setActiveEngineId(id: string | null)` to `auto.ts` — one-liner setter following the `_setDispatching` pattern. (2) Create `commands-workflow.ts` with `handleWorkflow(args, ctx, pi)` and `getWorkflowCompletions(prefix)`. Implement six subcommands: `new` (load `workflow-builder` prompt, sendMessage with triggerTurn), `run <name> [--param key=value]` (parse params, createRun, write PARAMS.json if overrides exist, setActiveEngineId, startAuto), `list` (scan workflow-defs + listRuns, format output), `pause` (delegate to pauseAuto), `resume` (re-derive engine ID from most recent incomplete run if needed, startAuto), `validate <name>` (read YAML, validateDefinition, display results). (3) Add auto-mode conflict guard on `run` and `new`. (4) Wire routing in `commands.ts`: import `handleWorkflow` and `getWorkflowCompletions`, add `workflow` routing block, add to `showHelp()` and `getArgumentCompletions`. (5) Extend `createRun()` in `run-manager.ts` to accept optional `params` and write `PARAMS.json` when provided. (6) Write integration tests covering `validate`, `list`, and the `run` → engine-activation flow.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/commands-workflow.test.ts` && `npx tsc --noEmit --project tsconfig.extensions.json`
  - Done when: all six subcommands are implemented, routing works from `commands.ts`, integration tests pass for validate/list/run, type check passes with 0 errors

- [ ] **T03: Create LLM builder prompt template for `/gsd workflow new`** `est:20m`
  - Why: Closes R012 — the builder prompt is what makes `/gsd workflow new` produce valid YAML definitions. Without a well-structured prompt, the LLM conversation would generate malformed or schema-violating definitions. The prompt is this slice's primary UX deliverable for workflow creation.
  - Files: `src/resources/extensions/gsd/prompts/workflow-builder.md`
  - Do: (1) Create `workflow-builder.md` in `prompts/` with a structured conversation guide. The prompt must: tell the LLM it's building a YAML workflow definition, embed the V1 schema rules (version:1, name required, steps with id/name/prompt/requires/produces), list all verification policies available (content-heuristic, shell-command, prompt-verify, human-review), explain `context_from` for step chaining, explain `iterate` for fan-out, include a complete example YAML definition, specify where to save ({{defsDir}}), instruct to validate with `validateDefinition()` before saving, instruct to write artifacts relative to the run directory (D018). (2) Use `{{defsDir}}` and `{{schemaVersion}}` as template variables (resolved by `loadPrompt()`). (3) Verify the prompt loads without error via `loadPrompt("workflow-builder", { defsDir: "test", schemaVersion: "1" })`.
  - Verify: `test -f src/resources/extensions/gsd/prompts/workflow-builder.md` && `node -e "const {loadPrompt} = require('./src/resources/extensions/gsd/prompt-loader.ts'); loadPrompt('workflow-builder', {defsDir:'/tmp', schemaVersion:'1'})"` (adapted for the project's module system)
  - Done when: `workflow-builder.md` exists, contains V1 schema rules and a complete YAML example, loads via `loadPrompt()` without errors

## Files Likely Touched

- `src/resources/extensions/gsd/definition-loader.ts` — add `substituteParams()`
- `src/resources/extensions/gsd/custom-workflow-engine.ts` — call `substituteParams()` in `resolveDispatch()`
- `src/resources/extensions/gsd/commands-workflow.ts` — **new**: all six `/gsd workflow` subcommands
- `src/resources/extensions/gsd/commands.ts` — wire `workflow` routing, completions, help text
- `src/resources/extensions/gsd/auto.ts` — add `setActiveEngineId()`
- `src/resources/extensions/gsd/run-manager.ts` — extend `createRun()` with optional `params`
- `src/resources/extensions/gsd/prompts/workflow-builder.md` — **new**: LLM builder conversation prompt
- `src/resources/extensions/gsd/tests/param-substitution.test.ts` — **new**: param substitution unit tests
- `src/resources/extensions/gsd/tests/commands-workflow.test.ts` — **new**: CLI command integration tests
