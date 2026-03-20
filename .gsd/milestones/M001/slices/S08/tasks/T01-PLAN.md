---
estimated_steps: 4
estimated_files: 1
---

# T01: Wire custom engine reconcile + verify into handleAgentEnd

**Slice:** S08 — Dashboard Integration + End-to-End Validation
**Milestone:** M001

## Description

`handleAgentEnd` in `auto.ts` currently routes all agent completions through dev-specific post-unit processing (`postUnitPreVerification` → `runPostUnitVerification` → `postUnitPostVerification`). Custom workflow steps never complete because `engine.reconcile()` is never called. This task adds a custom engine branch that detects `s.activeEngineId?.startsWith("custom:")` early in `handleAgentEnd` and routes custom workflow completions through `engine.reconcile()` + `policy.verify()`, completely bypassing dev-specific processing.

**Relevant skills:** None needed — this is surgical wiring in auto.ts.

## Steps

1. **Read `handleAgentEnd` in `auto.ts`** (starts at ~line 767). Understand the flow: reentrancy guard → clearUnitTimeout → postUnitPreVerification → runPostUnitVerification → postUnitPostVerification → dispatchNextUnit. The custom branch must go after the reentrancy guard and `s.handlingAgentEnd = true`, after `clearUnitTimeout()`, but before `PostUnitContext` construction.

2. **Add the custom engine branch.** After `clearUnitTimeout()` (~line 790), insert:
   ```typescript
   // ── Custom workflow: reconcile + verify (skip dev post-unit processing) ──
   if (s.activeEngineId?.startsWith("custom:")) {
     const { engine, policy } = resolveEngine(s);
     const engineState = await engine.deriveState(s.basePath);
     
     // Reconcile: mark the completed step in GRAPH.yaml
     if (s.currentUnit) {
       const reconcileResult = await engine.reconcile(engineState, {
         unitType: s.currentUnit.type,
         unitId: s.currentUnit.id,
       });
       
       // Verify the completed step
       const verifyOutcome = await policy.verify(
         s.currentUnit.type,
         s.currentUnit.id,
         { basePath: s.basePath },
       );
       
       if (verifyOutcome === "pause") {
         await pauseAuto(ctx, pi, `Verification paused for step ${s.currentUnit.id}`);
         return;
       }
       
       if (verifyOutcome === "retry") {
         // Re-dispatch same step with verification failure context
         s.pendingVerificationRetry = {
           attempt: (s.pendingVerificationRetry?.attempt ?? 0) + 1,
           failureContext: `Verification failed for step ${s.currentUnit.id}. Check the step's produces artifacts and verify config.`,
         };
       }
       
       if (reconcileResult.outcome === "stop") {
         await stopAuto(ctx, pi, reconcileResult.reason ?? "Workflow complete");
         return;
       }
     }
     
     // Dispatch next step
     await dispatchNextUnit(ctx, pi);
     return;
   }
   ```
   The `return` at the end ensures dev-specific processing is never reached for custom workflows.

3. **Verify `resolveEngine` import already exists.** It's imported at line ~154. The `CompletedStep` type from `engine-types.ts` is needed for the `reconcile` call — check the `reconcile` signature to confirm the shape. The method signature is `reconcile(state: EngineState, completedStep: CompletedStep)` where `CompletedStep = { unitType: string; unitId: string }`. The `s.currentUnit` has `type` and `id` fields, so map `type` → `unitType`, `id` → `unitId`.

4. **Run type-check and existing tests.** `npx tsc --noEmit --project tsconfig.extensions.json` must pass. Run the full existing workflow test suite to confirm zero regression. The branch only fires when `s.activeEngineId?.startsWith("custom:")` — existing tests never set this, so they're unaffected.

## Must-Haves

- [ ] Custom engine detection at top of `handleAgentEnd` via `s.activeEngineId?.startsWith("custom:")`
- [ ] `engine.reconcile()` called to mark completed step in GRAPH.yaml
- [ ] `policy.verify()` called to run verification gates
- [ ] Verify "pause" → `pauseAuto()`, verify "retry" → retry context set, reconcile "stop" → `stopAuto()`
- [ ] Branch returns early — dev-specific processing completely bypassed for custom workflows
- [ ] All existing tests pass unchanged (zero regression)

## Verification

- `npx tsc --noEmit --project tsconfig.extensions.json` — zero type errors
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/custom-engine-integration.test.ts` — 11/11 pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/context-verification-integration.test.ts` — 4/4 pass
- All other existing workflow tests pass

## Inputs

- `src/resources/extensions/gsd/auto.ts` — `handleAgentEnd()` at ~line 767, `resolveEngine` import at ~line 154, `s.activeEngineId` on the session object, `pauseAuto`, `stopAuto`, `dispatchNextUnit` all already in scope
- `src/resources/extensions/gsd/engine-types.ts` — `CompletedStep` type: `{ unitType: string; unitId: string }`
- `src/resources/extensions/gsd/custom-workflow-engine.ts` — `reconcile()` expects `CompletedStep`, returns `ReconcileResult` (`{ outcome: "stop" | "continue"; reason?: string }`)
- `src/resources/extensions/gsd/custom-execution-policy.ts` — `verify()` returns `"continue" | "retry" | "pause"`
- S05 Forward Intelligence: `CustomExecutionPolicy.verify()` fail-open — missing DEFINITION.yaml or unknown stepId returns "continue"
- S06 Forward Intelligence: `deriveState()` and `reconcile()` both exclude expanded steps from completion checks

## Observability Impact

- **New signal:** Custom workflow step completions now flow through `engine.reconcile()` → `policy.verify()` in `handleAgentEnd`, producing observable state transitions in `GRAPH.yaml` (pending → complete).
- **Inspection:** `cat <runDir>/GRAPH.yaml` shows step status after each reconcile call. The `ReconcileResult.outcome` ("stop" | "continue") and `verify()` outcome ("continue" | "retry" | "pause") are now exercised at runtime.
- **Failure visibility:** `ctx.ui.notify()` fires on verification pause with the step ID. `stopAuto()` includes the reconcile reason string. `pendingVerificationRetry.failureContext` carries the specific step ID that failed verification — visible in the retry prompt prepended by `dispatchNextUnit`.
- **No regression:** The branch is guarded by `s.activeEngineId?.startsWith("custom:")` — dev workflows never enter this path, so all existing observability is untouched.

## Expected Output

- `src/resources/extensions/gsd/auto.ts` — modified with ~30-40 line custom engine branch in `handleAgentEnd()`, after `clearUnitTimeout()` and before dev-specific `PostUnitContext` construction
