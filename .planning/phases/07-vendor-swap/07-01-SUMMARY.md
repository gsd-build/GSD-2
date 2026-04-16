---
phase: 07-vendor-swap
plan: "01"
subsystem: infra
tags: [pi-mono, vendor, github-clone, backup]

# Dependency graph
requires: []
provides:
  - "/tmp/pi-mono-0.67.2 — pi-mono source at v0.67.2 cloned from GitHub"
  - "/tmp/gsd-additions — all GSD-authored files backed up from pi-coding-agent before replacement"
affects: [07-02, 07-03, 07-04, 07-05, 07-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GSD additions backed up to /tmp/gsd-additions before any source replacement"

key-files:
  created: []
  modified: []

key-decisions:
  - "D-01 (npm tarball) superseded by D-02 (GitHub clone) — tarballs contain only dist/, not src/"
  - "spot-check.txt shows only comment-level @gsd references in non-extension non-test files — no in-body mutations requiring manual review before Plan 05"

patterns-established:
  - "Backup GSD additions before destructive vendor replace — /tmp/gsd-additions serves as restore source in Plan 05"

requirements-completed: [VEND-01]

# Metrics
duration: 5min
completed: 2026-04-16
---

# Phase 07 Plan 01: Source Acquisition + Pre-Swap GSD Capture Summary

**pi-mono v0.67.2 cloned from GitHub and all GSD-authored additions in pi-coding-agent backed up to /tmp/gsd-additions before any source replacement begins**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-16T00:36:00Z
- **Completed:** 2026-04-16T00:36:32Z
- **Tasks:** 2
- **Files modified:** 0 (all writes to /tmp)

## Accomplishments
- Cloned pi-mono at exact tag v0.67.2 from GitHub (D-02 strategy — npm tarballs have no src/)
- Verified all four source directories present: packages/agent/src, packages/ai/src, packages/tui/src, packages/coding-agent/src
- Backed up 8 GSD-only extension files + extensions/index.ts to /tmp/gsd-additions/extensions/
- Backed up keybindings-types.ts, lsp/, theme/, resources/, types/ subsystems
- Backed up 5 GSD-only component files (chat-frame.ts, dynamic-border.test.ts, provider-manager.ts, timestamp.ts, tree-render-utils.ts)
- Captured all @gsd/agent-core import lines to agent-core-imports.txt (31 lines across 17 files)
- Captured src/index.ts and core/index.ts to index-blocks/
- Spot-check confirmed: no in-body @gsd mutations outside extensions/tests — only comment references and module augmentation

## Task Commits

Both tasks write only to /tmp — no repository files were modified. No per-task commits required.

**Plan metadata:** (committed as plan docs commit below)

## Files Created/Modified

No repository files created or modified. All output written to:
- `/tmp/pi-mono-0.67.2/` — pi-mono v0.67.2 source
- `/tmp/gsd-additions/` — backed up GSD additions

## Decisions Made

- D-01 (npm tarball extraction) confirmed impossible — tarballs contain only `dist/`, no `src/`. D-02 (GitHub clone) is the only viable strategy.
- spot-check.txt reviewed: entries are all comment-line references and one module augmentation (`declare module "@gsd/pi-agent-core"` in messages.ts, `Symbol.for("@gsd/pi-coding-agent:theme")` in theme.ts) — no manual review required before Plan 05.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Self-Check

- /tmp/pi-mono-0.67.2 exists with four source directories: PASS
- /tmp/gsd-additions with all required subdirectories and files: PASS
- No repository files modified (both tasks are /tmp-only): PASS

## Self-Check: PASSED

## Next Phase Readiness

Plan 07-02 can proceed: pi-mono source is at /tmp/pi-mono-0.67.2, GSD additions are captured at /tmp/gsd-additions. Source ready for vendor replacement steps in subsequent plans.

---
*Phase: 07-vendor-swap*
*Completed: 2026-04-16*
