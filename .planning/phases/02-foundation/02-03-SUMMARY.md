---
phase: 02-foundation
plan: 03
subsystem: watch
tags: [renderer, subprocess, signal-handling, tty, tmux, chokidar, placeholder]

# Dependency graph
requires:
  - phase: 02-01
    provides: "startPlanningWatcher from watcher.ts, types.ts with WatchLockData/WATCH_LOCK_FILE"
  - phase: 02-02
    provides: "clearWatchLock from orchestrator.ts"

provides:
  - "renderer-entry.ts subprocess entry point with SIGTERM/SIGHUP/SIGINT signal handlers"
  - "parseQuitSequence state machine detecting qq, Esc Esc, Ctrl+C within 500ms window"
  - "getEffectiveWidth() PTY guard enforcing minimum 40 columns"
  - "renderPlaceholder() displaying contextual messages based on .planning/ state"
  - "Stdin raw mode setup for quit key detection in tmux PTY"
  - "File watcher integration triggering placeholder re-render on .planning/ changes"

affects: [phase-03-core-renderer, phase-04-renderer-entry-command-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional main block (isMainModule guard) prevents subprocess execution when imported for testing"
    - "Module-level state with resetQuitState() export for test isolation"
    - "stdout capture in tests via process.stdout.write override + restore in finally block"
    - "TDD: RED commit of failing tests before GREEN implementation commit"

key-files:
  created:
    - src/resources/extensions/gsd/watch/renderer-entry.ts
    - src/resources/extensions/gsd/tests/watch-renderer-entry.test.ts
  modified: []

key-decisions:
  - "isMainModule guard uses process.argv[1] endsWith check so tests can import exported helpers without triggering main block"
  - "Module-level lastKey/lastKeyTime state reset via exported resetQuitState() for test isolation without module re-import"
  - "Phase 2 watcher callback re-renders placeholder; Phase 3 replaces with tree rendering"

patterns-established:
  - "Subprocess entry guard: check process.argv[1] endsWith filename before main block execution"
  - "Quit state machine: module-level state with timeout-based reset, exported reset fn for tests"

requirements-completed: [TMUX-03]

# Metrics
duration: 3min
completed: 2026-03-27
---

# Phase 02 Plan 03: Renderer Entry Subprocess Summary

**Standalone renderer subprocess with signal handling (SIGTERM/SIGHUP/SIGINT), qq/Esc Esc/Ctrl+C quit detection with 500ms window, PTY width guard (min 40), and contextual placeholder rendering tied to .planning/ state**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-27T04:41:44Z
- **Completed:** 2026-03-27T04:43:52Z
- **Tasks:** 1 (TDD: RED + GREEN phases)
- **Files modified:** 2

## Accomplishments

- Renderer subprocess entry point with all three termination signal handlers registered before any rendering
- Quit key state machine detects qq and Esc Esc within configurable 500ms window; Ctrl+C handled via raw byte \x03
- PTY width guard enforces minimum 40 columns via getEffectiveWidth() preventing zero-width pane crashes
- renderPlaceholder() emits contextual messages: project name from PROJECT.md heading, "Waiting for project..." if no .planning/, "Loading project..." otherwise
- File watcher integration via startPlanningWatcher() — changes trigger placeholder re-render (Phase 3 replaces with tree rendering)
- All 10 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for renderer-entry** - `3a4d68d1` (test)
2. **Task 1 (GREEN): Implement renderer-entry** - `dd5d4b87` (feat)

_TDD task: RED commit (failing tests) + GREEN commit (passing implementation)_

## Files Created/Modified

- `src/resources/extensions/gsd/watch/renderer-entry.ts` — Standalone subprocess entry: CLEANUP_SIGNALS, parseQuitSequence, resetQuitState, getEffectiveWidth, renderPlaceholder, shutdown(), isMainModule-guarded main block
- `src/resources/extensions/gsd/tests/watch-renderer-entry.test.ts` — 10 unit tests covering signal array, quit sequences, width guard, and placeholder rendering

## Decisions Made

- Used `process.argv[1]?.endsWith("renderer-entry.ts") || ...endsWith("renderer-entry.js")` guard so the module can be imported for testing without running the subprocess main block
- Exported `resetQuitState()` for test `beforeEach` isolation instead of module re-loading, which is simpler and avoids re-import overhead
- Phase 2 watcher callback re-renders placeholder only; Phase 3 will replace the callback with full tree rendering

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- renderer-entry.ts is ready for Phase 3 to replace the placeholder callback with tree rendering
- All termination paths (SIGTERM, SIGHUP, SIGINT, qq, Esc Esc, Ctrl+C) tested and verified
- PTY width guard and placeholder display working — no blocking concerns for Phase 3

---
*Phase: 02-foundation*
*Completed: 2026-03-27*
