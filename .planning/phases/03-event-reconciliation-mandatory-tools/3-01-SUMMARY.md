---
phase: 03-event-reconciliation-mandatory-tools
plan: 01
subsystem: event-reconciliation
tags: [reconciliation, event-log, worktree, conflict-detection, tdd]
dependency_graph:
  requires: [workflow-events.ts, workflow-engine.ts, workflow-manifest.ts, atomic-write.ts]
  provides: [workflow-reconcile.ts, reconcile.test.ts]
  affects: [auto-worktree-sync.ts, auto-worktree.ts, worktree-command.ts]
tech_stack:
  added: []
  patterns: [event-log fork-point detection, entity-level conflict detection, atomic all-or-nothing merge]
key_files:
  created:
    - src/resources/extensions/gsd/workflow-reconcile.ts
    - src/resources/extensions/gsd/engine/reconcile.test.ts
  modified:
    - src/resources/extensions/gsd/auto-worktree-sync.ts
    - src/resources/extensions/gsd/auto-worktree.ts
    - src/resources/extensions/gsd/worktree-command.ts
decisions:
  - "Static import of reconcileWorktreeLogs in auto-worktree.ts (function is sync, dynamic import would require making mergeMilestoneToMain async)"
  - "reconcileWorktreeLogs takes base paths (not db file paths) to match event log location (.gsd/event-log.jsonl)"
  - "engine db accessed via cast to access writeManifest after replayAll (engine.db is private)"
metrics:
  duration: 5 min
  completed: 2026-03-22
  tasks_completed: 2
  files_created: 2
  files_modified: 3
---

# Phase 3 Plan 01: Event-Log Reconciliation Module Summary

**One-liner:** Event-log reconciliation replaces INSERT OR REPLACE worktree merge — fork-point detection + entity-level conflict blocking with CONFLICTS.md output.

## What Was Built

`workflow-reconcile.ts` module that reads both event logs, finds the fork point, detects entity-level conflicts between diverged events, and either auto-merges (non-conflicting) or blocks entirely and writes CONFLICTS.md (conflicting). Wired into all three sync/merge call sites, replacing the old `reconcileWorktreeDb()` function.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | TDD reconciliation module (RED + GREEN) | 623c3185, 0270e71f | reconcile.test.ts, workflow-reconcile.ts |
| 2 | Wire reconciliation into sync call sites | c8f2a00f | auto-worktree-sync.ts, auto-worktree.ts, worktree-command.ts |

## Test Results

- `engine/reconcile.test.ts`: 10/10 tests pass
- `engine/*.test.ts` full suite: 130/130 tests pass (no regressions)

## Key Exports from workflow-reconcile.ts

- `interface ConflictEntry` — entity type/id + both sides' events
- `interface ReconcileResult` — `{ autoMerged: number; conflicts: ConflictEntry[] }`
- `function extractEntityKey(event)` — maps cmd to `{ type, id }` or null
- `function detectConflicts(mainDiverged, wtDiverged)` — entity-level conflict detection
- `function writeConflictsFile(basePath, conflicts, worktreePath)` — writes .gsd/CONFLICTS.md
- `function reconcileWorktreeLogs(mainBasePath, worktreeBasePath)` — main algorithm

## Algorithm Summary

1. Read both event logs (readEvents)
2. findForkPoint() — last common hash index
3. Slice diverged sets from each side
4. If both empty → return `{ autoMerged: 0, conflicts: [] }`
5. detectConflicts() — group by entity key, find intersection
6. If conflicts → writeConflictsFile, log to stderr, return early (D-04 all-or-nothing)
7. If clean → sort merged by timestamp, engine.replayAll()
8. Write merged event log explicitly (base + merged in timestamp order)
9. writeManifest via engine.db cast
10. Return `{ autoMerged: merged.length, conflicts: [] }`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] reconcileWorktreeDb import causes TS error in auto-worktree.ts**

The plan said to use dynamic import in auto-worktree.ts, but `mergeMilestoneToMain` is a synchronous function. Using `await import()` in a sync function is not valid. Instead, added a static top-level import of `reconcileWorktreeLogs` from `./workflow-reconcile.js`, which is simpler and equally correct since there are no circular dependencies.

- **Found during:** Task 2
- **Fix:** Static import instead of dynamic import in auto-worktree.ts
- **Files modified:** src/resources/extensions/gsd/auto-worktree.ts

## Self-Check

All created files verified:
- `src/resources/extensions/gsd/workflow-reconcile.ts` — exists
- `src/resources/extensions/gsd/engine/reconcile.test.ts` — exists

All commits verified:
- 623c3185 — test(3-01): RED phase
- 0270e71f — feat(3-01): GREEN phase
- c8f2a00f — feat(3-01): wiring

## Self-Check: PASSED
