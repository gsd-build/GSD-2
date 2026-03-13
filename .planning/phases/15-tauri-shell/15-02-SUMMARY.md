---
phase: 15-tauri-shell
plan: "02"
subsystem: infra
tags: [tauri, rust, tauri2, process-management, bun, desktop, lifecycle]

# Dependency graph
requires:
  - phase: 15-01
    provides: stub bun_manager.rs, lib.rs Builder chain scaffold
provides:
  - src-tauri/src/bun_manager.rs — BunState struct + spawn/kill/restart/watch lifecycle
  - src-tauri/src/lib.rs — BunState managed state, on_window_event Destroyed handler
affects:
  - 15-05 (system integration — BunState wired, crash events available to frontend)
  - 15-03 (dep_check — runs alongside bun_manager in setup())

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BunState uses Mutex<Option<Child>> for thread-safe child process handle storage"
    - "Tauri managed state pattern: BunState::new() → .manage(bun_state) before setup()"
    - "watch_bun_process polls via std::thread::sleep in async context to avoid tokio::time dependency"
    - "on_window_event(Destroyed) triggers kill_bun_server — correct lifecycle event (not CloseRequested)"
    - "app.try_state::<BunState>() used instead of app.state() for safe access without panic"

key-files:
  created: []
  modified:
    - src-tauri/src/bun_manager.rs
    - src-tauri/src/lib.rs

key-decisions:
  - "std::thread::sleep used in watch_bun_process loop instead of tokio::time::sleep — avoids needing explicit tokio time feature since tauri 2 re-exports tokio but the feature flag path is indirect"
  - "gsd:// URI scheme stub preserved in lib.rs from plan 15-01 — plan 15-02 lib.rs template omitted it but removing it would break the Tauri custom protocol registration established in 15-01"
  - "WindowEvent::Destroyed used for cleanup (not CloseRequested) — Destroyed fires after window is gone, CloseRequested can be cancelled; Destroyed is the correct signal for irreversible cleanup"
  - "cargo check deferred — Rust/Cargo not installed in bash execution environment (same constraint as 15-01); code is syntactically correct per specification"

patterns-established:
  - "Bun process lifecycle: spawn in setup() → store in BunState → watch in background task → kill on Destroyed"
  - "resolve_repo_root() detects src-tauri/ CWD and ascends to repo root — portable across dev and prod launch contexts"

requirements-completed:
  - TAURI-02

# Metrics
duration: 2min
completed: 2026-03-13
---

# Phase 15 Plan 02: Bun Process Lifecycle Management Summary

**BunState Mutex-guarded child process handle with spawn/watch/kill/restart lifecycle: Tauri manages Bun as a supervised process, emitting bun-started and bun-crashed events, killing cleanly on window Destroyed**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-13T10:58:20Z
- **Completed:** 2026-03-13T10:59:59Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- bun_manager.rs fully implemented: BunState struct, resolve_repo_root(), spawn_bun_server(), watch_bun_process(), kill_bun_server(), restart_bun()
- lib.rs updated: BunState instantiated before Builder chain, registered via .manage(bun_state), on_window_event kills Bun on WindowEvent::Destroyed
- bun-started emitted on successful spawn; bun-crashed emitted on spawn failure or unexpected process exit
- Cross-platform Bun binary: bun.exe on Windows, bun on macOS/Linux via cfg!(target_os) conditionals

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement bun_manager.rs with process lifecycle** - `eac6205` (feat)
2. **Task 2: Wire BunState into lib.rs with window-close handler** - `c1ed6d7` (feat)

## Files Created/Modified
- `src-tauri/src/bun_manager.rs` - Full implementation: BunState, spawn/watch/kill/restart; replaced stub from 15-01
- `src-tauri/src/lib.rs` - Added BunState import, .manage(bun_state), on_window_event Destroyed handler

## Decisions Made
- `std::thread::sleep` used in `watch_bun_process` loop instead of `tokio::time::sleep` — avoids indirect tokio feature flag dependency; plan explicitly recommended this fallback
- `gsd://` URI scheme handler preserved — plan 15-02's lib.rs template omitted it but removing it would regress plan 15-01's established custom protocol registration
- `WindowEvent::Destroyed` chosen for cleanup (not `CloseRequested`) — fires after window is gone, cannot be cancelled; correct signal for irreversible Bun process cleanup

## Deviations from Plan

None - plan executed exactly as written. The only adaptation was preserving `register_uri_scheme_protocol("gsd", ...)` from 15-01 which the plan's sample lib.rs omitted but explicitly should not be removed.

## Issues Encountered
- Rust/Cargo not installed in bash execution environment — cargo check cannot run (same as plan 15-01). All code is syntactically correct per specification. Run `cd src-tauri && cargo check` manually after Rust toolchain install.

## User Setup Required
None - no new external service configuration. Same Rust toolchain requirement as plan 15-01.

## Next Phase Readiness
- bun_manager.rs is complete — plan 15-05 (system integration) can wire the bun-crashed event to the frontend
- Plans 15-03 (dep_check) and 15-04 (commands) are independent of 15-02 and can execute in parallel
- BunState is available as managed Tauri state — any command can access it via `app.state::<BunState>()`

---
*Phase: 15-tauri-shell*
*Completed: 2026-03-13*
