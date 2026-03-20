---
estimated_steps: 5
estimated_files: 3
---

# T02: Render custom workflow progress in dashboard widget and overlay

**Slice:** S08 — Dashboard Integration + End-to-End Validation
**Milestone:** M001

## Description

The TUI progress widget and dashboard overlay are entirely dev-workflow-specific — they read `GSDState` fields (milestone/slice/task) and parse roadmap/plan files. Custom workflows have none of these. This task teaches both rendering surfaces to detect custom workflows and render progress from `DisplayMetadata` instead. Covers R014 (health widget shows custom workflow progress).

**Relevant skills:** None needed — TUI rendering changes.

## Steps

1. **Add `"custom-step"` to `UNIT_TYPE_INFO` in `auto-dashboard.ts`.** At ~line 53, add to the record:
   ```typescript
   "custom-step": { verb: "running", phaseLabel: "WORKFLOW" },
   ```
   This ensures `unitVerb("custom-step")` returns `"running"` and `unitPhaseLabel("custom-step")` returns `"WORKFLOW"` instead of the default fallback.

2. **Add optional `displayMeta` parameter to `updateProgressWidget` in `auto-dashboard.ts`.** The function signature at ~line 279 currently takes `(ctx, unitType, unitId, state, accessors, tierBadge?)`. Add `displayMeta?: DisplayMetadata` after `tierBadge`. Import `DisplayMetadata` from `engine-types.ts`. Inside the factory widget's `render()` function (~line 380+), when rendering the progress bar section: if `displayMeta?.stepCount` is non-null, render a progress bar using `displayMeta.stepCount.completed` / `displayMeta.stepCount.total` instead of calling `getRoadmapSlicesSync()`. Show `displayMeta.engineLabel` where `mid.title` normally goes, and `displayMeta.progressSummary` as the step description. When `displayMeta` is provided, also replace the string-array fallback (the `buildProgressTextLines` call) with a custom-workflow version.

3. **Thread `DisplayMetadata` through the auto.ts wrapper.** The thin `updateProgressWidget` wrapper at ~line 960 in auto.ts calls `_updateProgressWidget`. Add an optional `displayMeta?: DisplayMetadata` parameter to the wrapper and pass it through to `_updateProgressWidget`. In T01's custom engine branch, after `engine.deriveState()`, call `engine.getDisplayMetadata(engineState)` and pass the result to `updateProgressWidget` when dispatching. Also update the dispatch call site at ~line 1551 where `updateProgressWidget(ctx, unitType, unitId, state)` is called — when `s.activeEngineId?.startsWith("custom:")`, resolve the engine and get display metadata to pass through.

4. **Teach `GSDDashboardOverlay.loadData()` to handle custom workflows.** In `dashboard-overlay.ts` at ~line 136, import `getActiveEngineId` from `auto.ts` and `resolveEngine` from `engine-resolver.ts`. At the start of `loadData()`, check `getActiveEngineId()`. If it starts with `"custom:"`, resolve the engine, call `engine.deriveState(base)` and `engine.getDisplayMetadata(engineState)`. Build a `MilestoneView` from the metadata: `id` = "custom-workflow", `title` = `displayMeta.engineLabel`, `phase` = `displayMeta.currentPhase`. Create one `SliceView` per step from the graph (or simply use `displayMeta.stepCount` for a single progress row). Set `this.milestoneData` and return. If not custom, fall through to existing dev logic.

5. **Type-check and verify.** `npx tsc --noEmit --project tsconfig.extensions.json` must pass. All existing tests unchanged. The changes are all backward-compatible — `displayMeta` is optional everywhere, existing call sites don't pass it.

## Must-Haves

- [ ] `"custom-step"` in `UNIT_TYPE_INFO` with verb "running" and phaseLabel "WORKFLOW"
- [ ] `updateProgressWidget` accepts optional `DisplayMetadata` — all existing call sites unaffected
- [ ] Widget renders step N/M from `DisplayMetadata.stepCount` when available instead of roadmap slices
- [ ] Dashboard overlay detects custom engine and builds view from `DisplayMetadata`
- [ ] All existing tests pass unchanged

## Verification

- `npx tsc --noEmit --project tsconfig.extensions.json` — zero type errors
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/custom-engine-integration.test.ts` — 11/11 pass (zero regression)
- Grep verification: `grep -q "custom-step" src/resources/extensions/gsd/auto-dashboard.ts` succeeds
- Grep verification: `grep -q "DisplayMetadata" src/resources/extensions/gsd/auto-dashboard.ts` succeeds
- Grep verification: `grep -q "getActiveEngineId" src/resources/extensions/gsd/dashboard-overlay.ts` succeeds

## Inputs

- `src/resources/extensions/gsd/auto-dashboard.ts` — `UNIT_TYPE_INFO` at ~line 53, `updateProgressWidget` at ~line 279, factory widget render at ~line 320+, `getRoadmapSlicesSync()` at ~line 387
- `src/resources/extensions/gsd/dashboard-overlay.ts` — `loadData()` at ~line 136, `MilestoneView` / `SliceView` interfaces at end of file
- `src/resources/extensions/gsd/auto.ts` — wrapper `updateProgressWidget` at ~line 960, dispatch site at ~line 1551
- `src/resources/extensions/gsd/engine-types.ts` — `DisplayMetadata` interface with `engineLabel`, `currentPhase`, `progressSummary`, `stepCount: { completed: number; total: number } | null`
- T01 output: custom engine branch in `handleAgentEnd` — this task adds DisplayMetadata threading to that branch

## Expected Output

- `src/resources/extensions/gsd/auto-dashboard.ts` — modified: `"custom-step"` in UNIT_TYPE_INFO, `displayMeta?` parameter on `updateProgressWidget`, conditional rendering branch in widget factory
- `src/resources/extensions/gsd/dashboard-overlay.ts` — modified: custom engine detection in `loadData()`, DisplayMetadata-based `MilestoneView` construction
- `src/resources/extensions/gsd/auto.ts` — modified: `displayMeta` parameter threaded through wrapper, DisplayMetadata passed at dispatch site for custom workflows
