---
estimated_steps: 5
estimated_files: 1
---

# T03: End-to-end integration tests proving full engine lifecycle

**Slice:** S08 — Dashboard Integration + End-to-End Validation
**Milestone:** M001

## Description

Individual slices (S05, S06, S07) proved isolated features. This task writes integration tests that exercise all features together through the engine lifecycle, proving the complete build→run→verify→complete pipeline. Covers R015 (full user journey), validates R009 (context injection), R010 (verification policies), R012 (builder quality — valid YAML produced), and R013 (CLI runtime validation). Also tests dashboard metadata rendering from T02.

**Relevant skills:** None — uses Node.js built-in test runner, same patterns as existing `custom-engine-integration.test.ts`.

## Steps

1. **Create the test file** at `src/resources/extensions/gsd/tests/e2e-workflow-integration.test.ts`. Import from: `node:test`, `node:assert/strict`, `node:fs` (mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync), `node:path` (join), `node:os` (tmpdir). Import engine classes: `CustomWorkflowEngine`, `CustomExecutionPolicy`, `resolveEngine` from their source files. Import helpers: `createRun` from `run-manager.ts`, `loadDefinition`, `validateDefinition`, `substituteParams` from `definition-loader.ts`, `readGraph`, `writeGraph` from `graph.ts`, `unitVerb`, `unitPhaseLabel` from `auto-dashboard.ts`.

2. **Write the fixture helper.** Create a `setupE2EWorkflow()` function that:
   - Creates a tmp directory as `basePath`
   - Creates `workflow-defs/` subdirectory with a `test-e2e.yaml` definition containing:
     - `name: "E2E Test Workflow"`, `version: 1`, `params: { topic: "testing" }`
     - Step 1 (`research`): prompt with `{{topic}}`, produces `["research-notes.md"]`, verify `{ policy: "content-heuristic" }`
     - Step 2 (`outline`): prompt referencing topic, `context_from: ["research"]`, produces `["outline.md"]`, verify `{ policy: "content-heuristic", min_bytes: 10 }`
     - Step 3 (`draft`): iterate `{ source: "outline.md", pattern: "^## (.+)$" }`, prompt with `{{item}}` and `{{topic}}`, depends_on `["outline"]`
     - Step 4 (`review`): depends_on `["draft"]`, prompt with `{{topic}}`
   - Calls `createRun(basePath, "test-e2e")` to create the run with snapshot
   - Returns `{ basePath, runDir, cleanup }` where cleanup removes the tmp dir

3. **Test: full lifecycle with context + verify + iterate + params.** Walk the engine through:
   - `deriveState(basePath)` → phase should be "executing", not complete
   - `resolveDispatch(state)` → should dispatch step "research" with `{{topic}}` substituted to "testing"
   - Simulate agent: write `research-notes.md` to runDir
   - `reconcile(state, { unitType: "custom-step", unitId: "research" })` → outcome "continue"
   - `policy.verify("custom-step", "research", { basePath })` → should return "continue" (artifact exists)
   - `resolveDispatch` again → should dispatch "outline" step with context from research-notes.md injected into prompt
   - Assert: prompt contains "## Context from prior steps" and content from research-notes.md (R009)
   - Simulate agent: write `outline.md` with `## Chapter 1\n## Chapter 2\n## Chapter 3`
   - `reconcile` → "continue"
   - `resolveDispatch` again → should trigger iterate expansion, returning dispatch for first instance `draft--001`
   - Assert: `readGraph(runDir)` has expanded instances with parentStepId "draft"
   - Walk through all instances (draft--001, --002, --003) + review step to completion
   - Final `reconcile` → outcome "stop", reason "All steps complete"
   - `getDisplayMetadata` at various stages → verify stepCount.completed increments and stepCount.total is correct

4. **Test: dashboard metadata rendering.** Verify:
   - `unitVerb("custom-step")` returns "running"
   - `unitPhaseLabel("custom-step")` returns "WORKFLOW"
   - Construct a `DisplayMetadata` object and verify its shape matches what the widget expects
   - Call `getDisplayMetadata` on a mid-workflow engine state and verify `stepCount` is accurate

5. **Test: verify-retry and verify-pause flows.**
   - Create a step with `verify: { policy: "content-heuristic" }` and produces `["missing.md"]`
   - Dispatch and reconcile without writing the artifact
   - `policy.verify()` → returns "retry" (artifact missing)
   - Create a step with `verify: { policy: "human-review" }`
   - `policy.verify()` → returns "pause"
   - Create a step with `verify: { policy: "prompt-verify", prompt: "Is it good?" }`
   - `policy.verify()` → returns "pause"

## Must-Haves

- [ ] Full lifecycle test: deriveState → resolveDispatch → reconcile → verify loop through 4+ steps with context_from, iterate, verify, params
- [ ] Context injection verified: dispatch prompt contains `## Context from prior steps` with prior artifact content (R009)
- [ ] Verification policy outcomes verified: content-heuristic returns correct result based on artifact presence (R010)
- [ ] Iteration verified: steps expand from pattern match, instances complete, expanded parent excluded from counts
- [ ] Param substitution verified: `{{topic}}` replaced with param value in dispatched prompts
- [ ] DisplayMetadata verified: stepCount accurate at each lifecycle stage
- [ ] Dashboard unit type verified: `unitVerb("custom-step")` and `unitPhaseLabel("custom-step")` return expected values
- [ ] Verify-retry and verify-pause flows tested
- [ ] ≥8 tests total

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/e2e-workflow-integration.test.ts` — all tests pass (≥8 tests)
- `npx tsc --noEmit --project tsconfig.extensions.json` — zero type errors

## Inputs

- `src/resources/extensions/gsd/custom-workflow-engine.ts` — `deriveState()`, `resolveDispatch()`, `reconcile()`, `getDisplayMetadata()` — the engine lifecycle API
- `src/resources/extensions/gsd/custom-execution-policy.ts` — `verify()` returns "continue"/"retry"/"pause"
- `src/resources/extensions/gsd/context-injector.ts` — context appears as `## Context from prior steps` header in dispatch prompts (P009)
- `src/resources/extensions/gsd/graph.ts` — `readGraph()`, `writeGraph()`, `expandIteration()` — step state tracking
- `src/resources/extensions/gsd/definition-loader.ts` — `loadDefinition()`, `validateDefinition()`, `substituteParams()`, `VerifyPolicy` type
- `src/resources/extensions/gsd/run-manager.ts` — `createRun()` creates run directory with DEFINITION.yaml + GRAPH.yaml
- `src/resources/extensions/gsd/auto-dashboard.ts` — `unitVerb()`, `unitPhaseLabel()` — T02 added `"custom-step"` entry
- `src/resources/extensions/gsd/tests/custom-engine-integration.test.ts` — reference for test patterns (makeTmpDir, make3StepGraph, etc.)
- K001: Use `tsconfig.extensions.json` for type checking
- L003: Always use `--import ./src/resources/extensions/gsd/tests/resolve-ts.mjs` loader
- P009: `injectContext()` returns empty string for no-op, non-empty starts with `## Context from prior steps`
- P010: Use fixed timestamps for determinism in YAML output comparisons
- P011: Instance IDs use `<parentId>--<zeroPad3>` format

## Expected Output

- `src/resources/extensions/gsd/tests/e2e-workflow-integration.test.ts` — new test file (~350-450 lines) with ≥8 tests covering: full lifecycle, context injection, verification outcomes, iteration expansion, param substitution, DisplayMetadata accuracy, dashboard unit type rendering, verify-retry/pause flows

## Observability Impact

- **New signals:** 12 integration tests covering the full engine lifecycle. Test failures surface via `node --test` exit code and structured output with assertion details.
- **Inspection:** Run `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/e2e-workflow-integration.test.ts` to verify all lifecycle paths. Each test exercises a specific feature (context injection, verification, iteration, params, DisplayMetadata) in isolation.
- **Failure visibility:** Node's built-in test runner reports failed assertions with expected vs actual values and stack traces. Test names describe the exact feature being validated.
- **Known limitation documented:** `substituteParams()` throws when `{{item}}` iterate placeholders coexist with real params, silently breaking all engine processing in `resolveDispatch()`. Tests are structured to avoid this cross-contamination. A future fix should make `substituteParams` skip `{{item}}` placeholders.
