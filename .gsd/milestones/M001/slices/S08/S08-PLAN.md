# S08: Dashboard Integration + End-to-End Validation

**Goal:** Custom workflow progress renders in the TUI widget and overlay, and the full engine lifecycle (dispatch → reconcile → verify → iterate → complete) works end-to-end through the auto-loop's `handleAgentEnd` path.
**Demo:** Run a YAML-defined workflow with context_from, verify, iterate, and params through the engine lifecycle. Steps complete via reconcile, verification gates fire, iteration expands, dashboard shows step N/M progress, and the workflow reaches completion.

## Must-Haves

- Custom engine branch in `handleAgentEnd` that calls `engine.reconcile()` + `policy.verify()` and bypasses dev-specific post-unit processing
- `"custom-step"` entry in `UNIT_TYPE_INFO` for widget verb/phase rendering
- `updateProgressWidget` accepts optional `DisplayMetadata` and renders step progress from it when present
- `GSDDashboardOverlay.loadData()` detects custom engine and renders step-list from `engine.getDisplayMetadata()` instead of roadmap files
- Integration tests proving the full engine lifecycle with context_from, verify, iterate, and params exercised together
- All existing tests pass with zero regressions

## Proof Level

- This slice proves: final-assembly
- Real runtime required: no (engine layer exercised directly via tests)
- Human/UAT required: yes (full build→run→complete journey is UAT, but automated integration tests prove the engine pipeline)

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/e2e-workflow-integration.test.ts` — end-to-end engine lifecycle with context, verify, iterate, params, and dashboard metadata
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/custom-engine-integration.test.ts` — zero regression on existing 11 tests
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/definition-loader.test.ts` — zero regression on existing 25 tests
- `npx tsc --noEmit --project tsconfig.extensions.json` — zero type errors
- Existing 88+ workflow tests pass unchanged

## Observability / Diagnostics

- Runtime signals: `GRAPH.yaml` step status transitions (pending → complete/expanded), `DisplayMetadata` step counts, verification outcomes (continue/retry/pause)
- Inspection surfaces: `cat <runDir>/GRAPH.yaml` for step state, `/gsd workflow list` for run status, dashboard widget shows step N/M
- Failure visibility: `VerificationResult.reason` from `runVerification()`, `reconcile()` outcome, `resolveDispatch()` stop reasons with level
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `custom-workflow-engine.ts` (deriveState, resolveDispatch, reconcile, getDisplayMetadata), `custom-execution-policy.ts` (verify), `context-injector.ts` (injectContext), `custom-verification.ts` (runVerification), `graph.ts` (expandIteration, readGraph, writeGraph), `definition-loader.ts` (loadDefinition, validateDefinition, substituteParams), `run-manager.ts` (createRun), `commands-workflow.ts` (handleWorkflow), `engine-resolver.ts` (resolveEngine)
- New wiring introduced in this slice: custom engine branch in `handleAgentEnd`, DisplayMetadata rendering in widget + overlay
- What remains before the milestone is truly usable end-to-end: nothing — this is the final slice

## Tasks

- [x] **T01: Wire custom engine reconcile + verify into handleAgentEnd** `est:30m`
  - Why: `handleAgentEnd` currently routes all completions through dev-specific post-unit processing. Custom workflow steps never complete because `engine.reconcile()` is never called. This is the central integration gap — without it, custom workflows dispatch but never advance.
  - Files: `src/resources/extensions/gsd/auto.ts`
  - Do: Add a branch at the top of `handleAgentEnd` (after the reentrancy guard, before `postUnitPreVerification`) that checks `s.activeEngineId?.startsWith("custom:")`. When true: resolve engine via `resolveEngine(s)`, call `engine.deriveState()`, then `engine.reconcile()` with the completed step info from `s.currentUnit`, then `policy.verify()`. If verify returns "retry", set `s.pendingVerificationRetry` context and re-dispatch. If verify returns "pause", call `pauseAuto()`. If reconcile returns "stop", call `stopAuto()`. Otherwise call `dispatchNextUnit()`. The branch must `return` before dev-specific processing starts. Guard with `clearUnitTimeout()` at the top of the branch. Must NOT modify any code path that runs for dev workflows.
  - Verify: `npx tsc --noEmit --project tsconfig.extensions.json` passes; existing 88+ workflow tests pass unchanged
  - Done when: Custom engine completions route through reconcile+verify instead of dev post-unit processing, and all existing tests still pass

- [ ] **T02: Render custom workflow progress in dashboard widget and overlay** `est:30m`
  - Why: Without dashboard integration, custom workflows are a black box — the user sees no progress. R014 requires the widget to show step name and N/M fraction from `DisplayMetadata`.
  - Files: `src/resources/extensions/gsd/auto-dashboard.ts`, `src/resources/extensions/gsd/dashboard-overlay.ts`, `src/resources/extensions/gsd/auto.ts`
  - Do: (1) Add `"custom-step": { verb: "running", phaseLabel: "WORKFLOW" }` to `UNIT_TYPE_INFO`. (2) Add optional `displayMeta?: DisplayMetadata` parameter to `updateProgressWidget` in auto-dashboard.ts (after `tierBadge`). When `displayMeta` is provided and `displayMeta.stepCount` is non-null, render step progress bar using `stepCount.completed`/`stepCount.total` instead of `getRoadmapSlicesSync()`. Show `displayMeta.engineLabel` as the milestone title and `displayMeta.progressSummary` as the action target. (3) In auto.ts, after calling `engine.getDisplayMetadata()` for custom engine dispatches (T01's branch), pass the metadata through the `updateProgressWidget` wrapper. Add `displayMeta` as an optional 5th parameter to the wrapper, and pass it through to `_updateProgressWidget`. (4) In dashboard-overlay.ts `loadData()`: import `resolveEngine` and `getActiveEngineId` from auto.ts. When `getActiveEngineId()?.startsWith("custom:")`, resolve the engine, call `engine.deriveState()` + `engine.getDisplayMetadata()`, and build a `MilestoneView` from DisplayMetadata (steps as SliceView entries, step completion as progress). Fall through to existing dev path otherwise.
  - Verify: `npx tsc --noEmit --project tsconfig.extensions.json` passes; existing tests pass unchanged
  - Done when: `"custom-step"` has verb/phaseLabel, widget renders step N/M from DisplayMetadata when available, overlay shows step list for custom workflows

- [ ] **T03: End-to-end integration tests proving full engine lifecycle** `est:40m`
  - Why: R015 requires the full user journey proof. Individual slice tests proved isolated features. This test exercises them all together: context_from flows into dispatch prompts, verify gates check output, iterate expands steps, params substitute, and DisplayMetadata tracks progress through the entire lifecycle. Also proves R012 (builder produces valid YAML), R013 (CLI pipeline runtime validation), and validates R009/R010 in the integrated context.
  - Files: `src/resources/extensions/gsd/tests/e2e-workflow-integration.test.ts`
  - Do: Create a comprehensive integration test file with: (1) A fixture DEFINITION.yaml with 3+ steps including `context_from`, `verify` (content-heuristic), `iterate`, and `params`. (2) A test that walks the engine through the full lifecycle: createRun → write PARAMS.json → engine.deriveState → engine.resolveDispatch → simulate writing artifacts → engine.reconcile → policy.verify → loop. Assert: context injection text appears in dispatch prompts (R009), verification returns correct outcomes for each policy type (R010), iteration expands and instances complete, params substitute into prompts, DisplayMetadata step counts are accurate at each stage. (3) A test for dashboard rendering: construct DisplayMetadata, verify `unitVerb("custom-step")` and `unitPhaseLabel("custom-step")` return expected values. (4) A test for the reconcile→complete flow: walk a 3-step workflow to completion, verify reconcile returns "stop" when all steps are done. (5) A test for verify-retry flow: create a step with content-heuristic verify and no artifact → verify returns "retry". Use `--import ./src/resources/extensions/gsd/tests/resolve-ts.mjs` loader per L003.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/e2e-workflow-integration.test.ts` — all tests pass
  - Done when: ≥8 tests pass covering full lifecycle with context/verify/iterate/params, dashboard metadata rendering, reconcile completion, and verify-retry flow

## Files Likely Touched

- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/auto-dashboard.ts`
- `src/resources/extensions/gsd/dashboard-overlay.ts`
- `src/resources/extensions/gsd/tests/e2e-workflow-integration.test.ts`
