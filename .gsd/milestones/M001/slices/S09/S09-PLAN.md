# S09: End-to-End Integration Test

**Goal:** A single comprehensive integration test proves the assembled workflow engine pipeline works end-to-end — from YAML definition through run creation, dependency-ordered dispatch, verification, context injection, iterate/fan-out, parameter substitution, and dashboard metadata.
**Demo:** `npm run test:integration -- --test-name-pattern "e2e-workflow-pipeline"` passes, exercising every engine feature in a single multi-step workflow.

## Must-Haves

- Test exercises the full engine-level pipeline: `createRun()` → `deriveState()` → `resolveDispatch()` → artifact write → `reconcile()` → `verify()` → repeat
- One multi-feature YAML definition tests dependency ordering, parameter substitution, content-heuristic verification, shell-command verification, `context_from` injection, and iterate/fan-out — all in one flow
- Dependency ordering proven: steps dispatch only when their `requires` dependencies are complete
- Context injection proven: dispatched prompts include content from prior step artifacts via `context_from`
- Iterate/fan-out proven: a step with `iterate` config expands into sub-steps, dispatches each, and blocks downstream until all complete
- Parameter substitution proven: `{{ param }}` placeholders resolve from defaults and overrides
- Verification proven: content-heuristic and shell-command policies return "continue" when criteria met
- Dashboard metadata proven: `getDisplayMetadata()` returns correct step count and progress at each stage
- Completion detection proven: after all steps complete, `deriveState()` returns `isComplete: true`

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test --test-name-pattern "e2e-workflow-pipeline" src/resources/extensions/gsd/tests/e2e-workflow-pipeline-integration.test.ts` — all tests pass
- `npm run test:integration` — includes this test via the `*integration*` glob and passes
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test --test-name-pattern "validateDefinition accepts" src/resources/extensions/gsd/tests/e2e-workflow-pipeline-integration.test.ts` — definition validation edge-case test passes (proves invalid definitions are caught)

## Tasks

- [x] **T01: Write end-to-end workflow pipeline integration test** `est:45m`
  - Why: This is the sole task for S09 — it proves the assembled engine pipeline works by driving a multi-feature workflow definition through the full engine lifecycle at the engine level (not through autoLoop, avoiding timing-dependent flakiness).
  - Files: `src/resources/extensions/gsd/tests/e2e-workflow-pipeline-integration.test.ts`
  - Do: Write a single test file following the `iterate-engine-integration.test.ts` pattern (real temp dirs, `makeTempRun` helper, `dispatch`/`reconcile` helpers). Define a 4-step workflow YAML definition that exercises params, context_from, iterate, content-heuristic and shell-command verification, and dependency ordering. Drive the engine loop manually: derive → dispatch → write artifact → reconcile → verify. Assert dispatch ordering, enriched prompts, verification outcomes, dashboard metadata at each stage, and final completion.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/e2e-workflow-pipeline-integration.test.ts`
  - Done when: All tests pass, exercising every engine feature in one integrated flow

## Observability / Diagnostics

- **Runtime signals:** Test assertions produce structured pass/fail output via `node:test` runner with `--test-name-pattern` filtering. Each engine feature (dependency ordering, param substitution, context injection, iterate, verification, dashboard metadata, completion) has explicit assertions that surface which specific capability failed.
- **Inspection surfaces:** The test creates real temp directories with DEFINITION.yaml, GRAPH.yaml, and PARAMS.json — all inspectable on disk during debugging. Failed test runs leave temp dirs for post-mortem inspection (cleanup only runs on success via `afterEach`).
- **Failure visibility:** Test names are descriptive enough to identify which engine pipeline stage failed without reading test source. Assertion messages include expected vs. actual values for param substitution, prompt content, step IDs, and graph state.
- **Diagnostic verification:** The test validates that `deriveState()` correctly reports `isComplete: false` during intermediate stages and `isComplete: true` only after all steps complete — proving the completion detection signal is reliable.

## Files Likely Touched

- `src/resources/extensions/gsd/tests/e2e-workflow-pipeline-integration.test.ts`
