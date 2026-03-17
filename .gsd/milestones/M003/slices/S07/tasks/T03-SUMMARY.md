---
id: T03
parent: S07
milestone: M003
provides:
  - undo-service with collectUndoInfo() and executeUndo() child-process functions
  - cleanup-service with collectCleanupData() and executeCleanup() child-process functions
  - GET+POST API routes for /api/undo and /api/cleanup
  - GET API route for /api/steer (OVERRIDES.md reader)
  - 7 store load functions (history, inspect, hooks, exportData, undo, cleanup, steer)
  - 2 store mutation functions (executeUndoAction, executeCleanupAction)
key_files:
  - src/web/undo-service.ts
  - src/web/cleanup-service.ts
  - web/app/api/undo/route.ts
  - web/app/api/cleanup/route.ts
  - web/app/api/steer/route.ts
  - web/lib/gsd-workspace-store.tsx
key_decisions:
  - Undo collectUndoInfo() reads completed-units.json directly (plain JSON) while executeUndo() uses child-process for git operations
  - Cleanup uses child-process for both read and write since nativeBranchList/nativeForEachRef are in native-git-bridge.ts with .ts imports
  - Steer route reads OVERRIDES.md directly (same as KNOWLEDGE.md pattern from S05, per D059)
patterns_established:
  - patchRemainingCommandsPhaseState helper for typed state patches across all 7 remaining command slices
  - Mutation store functions (executeUndoAction, executeCleanupAction) auto-reload their respective data after success
observability_surfaces:
  - "curl /api/undo GET returns UndoInfo; POST returns UndoResult { success, message }"
  - "curl /api/cleanup GET returns CleanupData; POST returns CleanupResult { deletedBranches, prunedSnapshots, message }"
  - "curl /api/steer GET returns SteerData { overridesContent }"
  - Store phase transitions visible in React DevTools on commandSurface.remainingCommands.*
duration: 15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T03: Build mutation services, steer API route, and wire all store load actions

**Built 2 mutation services (undo, cleanup), steer route, and wired 7 load + 2 mutation functions into the workspace store.**

## What Happened

Created undo-service.ts with two functions: `collectUndoInfo()` reads completed-units.json directly for display data; `executeUndo()` uses child-process pattern to invoke upstream's `findCommitsForUnit`, `uncheckTaskInPlan`, and git revert operations. Created cleanup-service.ts with `collectCleanupData()` (child-process for nativeBranchList/nativeForEachRef) and `executeCleanup()` (child-process for nativeBranchDelete/nativeUpdateRef). Created steer route as a plain file read of OVERRIDES.md.

Wired all 7 remaining command surfaces into the store with phase-tracked load functions following the exact `loadForensicsDiagnostics` pattern (fetch → phase transition → data patch), plus 2 mutation functions that POST and auto-reload data. Added `patchRemainingCommandsPhaseState` generic helper for typed state patching. Updated ActionKeys type and useGSDWorkspaceActions hook exports.

## Verification

- `npm run build` — exit 0, all packages compiled successfully
- `rg "loadHistoryData|loadInspectData|loadHooksData|loadExportData|loadUndoInfo|loadCleanupData|loadSteerData" web/lib/gsd-workspace-store.tsx` — all 7 found (declarations, type union entries, hook exports)
- `ls web/app/api/{undo,cleanup,steer}/route.ts` — all 3 exist
- `ls src/web/{undo,cleanup}-service.ts` — both exist
- All 7 API route files confirmed: history, inspect, hooks, export-data, undo, cleanup, steer
- `executeUndoAction` and `executeCleanupAction` confirmed in store with type union + hook exports

## Diagnostics

- `curl http://localhost:3000/api/undo` — GET returns UndoInfo or `{error}` with 500
- `curl -X POST http://localhost:3000/api/undo` — POST returns UndoResult `{success, message}` or `{error}` with 500
- `curl http://localhost:3000/api/cleanup` — GET returns CleanupData `{branches, snapshots}` or `{error}` with 500
- `curl -X POST -H 'Content-Type: application/json' -d '{"branches":[],"snapshots":[]}' http://localhost:3000/api/cleanup` — POST returns CleanupResult
- `curl http://localhost:3000/api/steer` — GET returns `{overridesContent: string|null}`
- Store: all 7 `commandSurface.remainingCommands.*` slices transition idle→loading→loaded/error

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/web/undo-service.ts` — new; collectUndoInfo + executeUndo child-process service
- `src/web/cleanup-service.ts` — new; collectCleanupData + executeCleanup child-process service
- `web/app/api/undo/route.ts` — new; GET + POST route for undo
- `web/app/api/cleanup/route.ts` — new; GET + POST route for cleanup
- `web/app/api/steer/route.ts` — new; GET route for OVERRIDES.md
- `web/lib/gsd-workspace-store.tsx` — added remaining-command-types import, patchRemainingCommandsPhaseState helper, 7 load functions, 2 mutation functions, ActionKeys + hook exports
