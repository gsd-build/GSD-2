---
phase: 02-foundation
plan: 02
subsystem: watch
tags: [tmux, orchestrator, singleton, lock, dispatch, catalog]
dependency_graph:
  requires: ["02-01"]
  provides: ["handleWatch", "watch/orchestrator.ts", "watch command dispatch"]
  affects: ["commands/handlers/core.ts", "commands/catalog.ts"]
tech_stack:
  added: []
  patterns:
    - "Dynamic import for lazy-loading orchestrator (same pattern as cmux)"
    - "PID-based singleton guard with lock file in .gsd/"
    - "process.kill(pid, 0) alive check (EPERM-aware, same as crash-recovery.ts)"
key_files:
  created:
    - src/resources/extensions/gsd/watch/orchestrator.ts
    - src/resources/extensions/gsd/tests/watch-orchestrator.test.ts
  modified:
    - src/resources/extensions/gsd/commands/handlers/core.ts
    - src/resources/extensions/gsd/commands/catalog.ts
decisions:
  - "Dynamic import used for orchestrator in core.ts to avoid loading at startup (matches cmux pattern)"
  - "Tests use exported helper functions for unit-testable guard logic; handleWatch end-to-end test deferred (requires process mocking)"
metrics:
  duration_minutes: 3
  completed_date: "2026-03-27"
  tasks_completed: 2
  files_changed: 4
---

# Phase 02 Plan 02: Watch Orchestrator and Command Wiring Summary

**One-liner:** Watch orchestrator with tmux guard, PID-based singleton lock, and `/gsd watch` dispatch wired into core handler and catalog.

## What Was Built

### Task 1: Watch Orchestrator (TDD)

Created `src/resources/extensions/gsd/watch/orchestrator.ts` implementing:

- `handleWatch(args, ctx)` — Main entry point. Checks `process.env.TMUX`, reads watch lock, handles alive/stale lock states, then spawns renderer pane.
- `buildTmuxInstallHint()` — Returns platform-specific tmux install instructions (darwin: brew, linux: apt/dnf, other: GitHub wiki).
- `readWatchLock(gsdDir)` — Reads and parses `.gsd/watch.lock`, returns null on missing/invalid file.
- `writeWatchLock(gsdDir, data)` — Writes lock data as JSON; creates `.gsd/` directory if missing.
- `clearWatchLock(gsdDir)` — Removes lock file; errors swallowed.
- `isWatchPidAlive(pid)` — `process.kill(pid, 0)` with EPERM guard (mirrors crash-recovery.ts pattern).
- `cleanupStaleLock(gsdDir, lock)` — Removes lock and attempts `tmux kill-pane` for orphaned pane.

Test file `watch-orchestrator.test.ts` — 14 tests, all passing, covering:
- Tests 7a/7b: `buildTmuxInstallHint` returns known install phrase
- Tests 8-10: lock read/write/null behaviors with real temp directories
- `isWatchPidAlive`: current PID (alive), PID 999999 (dead), invalid inputs
- Tests 1-6 (as guard logic tests): tmux guard notification content, stale lock cleanup

### Task 2: Command Wiring

Modified `src/resources/extensions/gsd/commands/handlers/core.ts`:
- Added `/gsd watch` to `showHelp()` VISIBILITY section
- Added dispatch block before final `return false`: dynamic import of orchestrator, delegates to `handleWatch`

Modified `src/resources/extensions/gsd/commands/catalog.ts`:
- Added `|watch` to `GSD_COMMAND_DESCRIPTION` pipe-separated list
- Added `{ cmd: "watch", desc: "..." }` to `TOP_LEVEL_SUBCOMMANDS`
- Added `watch: [{ cmd: "stop", desc: "Close the watch sidebar pane" }]` to `NESTED_COMPLETIONS`

## Verification

- `npm run build` completes without errors
- All 14 orchestrator tests pass
- Grep confirms dispatch block and catalog entry presence

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — orchestrator is fully implemented. The `renderer-entry.js` it references is created in plan 02-03; this is intentional per the two-phase architecture (orchestrator spawns renderer which will exist after plan 03).

## Self-Check: PASSED

Files created/present:
- FOUND: src/resources/extensions/gsd/watch/orchestrator.ts
- FOUND: src/resources/extensions/gsd/tests/watch-orchestrator.test.ts

Commits:
- test(02-02): 3e4d96d1
- feat(02-02) orchestrator: 1cf9967c
- feat(02-02) wiring: 27c3f9fb
