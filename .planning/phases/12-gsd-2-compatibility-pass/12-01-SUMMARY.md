---
phase: 12-gsd-2-compatibility-pass
plan: "01"
subsystem: testing
tags: [bun-test, tdd, red-tests, gsd2, state-deriver, slash-commands]

requires:
  - phase: 11.1-pre-v2-stabilization
    provides: ClaudeProcessManager with _spawnFn injection, buildFullState, SettingsView

provides:
  - "RED test stubs for COMPAT-04 (slash command registry)"
  - "RED test stubs for COMPAT-05 (gsd binary spawn)"
  - "RED test stubs for COMPAT-06 (needsMigration flag)"
  - "RED test stubs for COMPAT-07 (GSD 2 SettingsView fields)"
  - "GSD 2 fixture block in state-deriver.test.ts (COMPAT-01, -02, -03)"

affects: [12-02, 12-03, 12-04, 12-05]

tech-stack:
  added: []
  patterns:
    - "Static source-text assertions for UI field gating (SettingsView source read as string)"
    - "Mock _spawnFn injection to capture binary name without real process spawn"
    - "GSD 2 fixture helper createGsd2Fixture() creating .gsd/ directory structure"

key-files:
  created:
    - packages/mission-control/tests/slash-commands.test.ts
    - packages/mission-control/tests/claude-process-gsd.test.ts
    - packages/mission-control/tests/migration-banner.test.ts
    - packages/mission-control/tests/settings-view-gsd2.test.ts
  modified:
    - packages/mission-control/tests/state-deriver.test.ts

key-decisions:
  - "Static source-text strategy for SettingsView: read SettingsView.tsx as string and assert field labels present/absent — avoids React hook rendering complexity in Bun test environment"
  - "settings-view-gsd2.test.ts: per-phase model test checks for 'research', 'planning', 'execution', 'completion' strings — broad enough to survive implementation choices"
  - "claude-process-gsd.test.ts: --resume test passes in RED state (no sessionId on first call) — binary name test is the primary RED gate for COMPAT-05"
  - "state-deriver GSD 2 fixture block: 4 of 6 new tests RED, 2 pass as structural guards (no-crash, roadmap defined)"

patterns-established:
  - "GSD 2 test pattern: createGsd2Fixture() builds .gsd/ dir with STATE.md, M001-ROADMAP.md, S01-PLAN.md, T01-SUMMARY.md, preferences.md"

requirements-completed: []

duration: 4min
completed: 2026-03-12
---

# Phase 12 Plan 01: GSD 2 Compatibility Pass — Wave 0 Red Test Stubs Summary

**Five RED-gating test files created: 4 new stubs (COMPAT-04 through COMPAT-07) + state-deriver augmented with GSD 2 fixture block (COMPAT-01 through COMPAT-03)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-12T18:07:03Z
- **Completed:** 2026-03-12T18:11:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created four new RED test stubs — all runnable with no import errors, all failing on assertions
- Augmented `state-deriver.test.ts` with a `createGsd2Fixture()` helper and 6 GSD 2 test cases (4 RED, 2 structural guards)
- All 15 existing v1 state-deriver tests remain GREEN (no regression)
- Full suite: 20 pass, 20 fail — exit code non-zero confirming RED state before Wave 1 implementation

## Task Commits

1. **Task 1: RED test stubs for COMPAT-04, -05, -06, -07** - `6d505e9` (test)
2. **Task 2: Augment state-deriver.test.ts with GSD 2 fixtures** - `aaacc89` (test)

## Files Created/Modified

- `packages/mission-control/tests/slash-commands.test.ts` — 8 assertions on GSD 2 registry (9 entries, no /gsd: colon prefix)
- `packages/mission-control/tests/claude-process-gsd.test.ts` — spawned binary must be "gsd", no --resume flag
- `packages/mission-control/tests/migration-banner.test.ts` — needsMigration field: true when .planning/ only, false when .gsd/ present
- `packages/mission-control/tests/settings-view-gsd2.test.ts` — "Budget ceiling" and "Skill discovery" must appear; "Skip permissions" and "Allowed tools" must not
- `packages/mission-control/tests/state-deriver.test.ts` — GSD 2 fixture describe block added below existing v1 tests

## Decisions Made

- Used static source-text assertions for `settings-view-gsd2.test.ts`: reads `SettingsView.tsx` as a string and checks for label text. This avoids React hook rendering complexity (no RTL installed, React 19 renderToString does not support hooks). The test fails/passes purely based on what strings appear in the component source.
- The `--resume` test in `claude-process-gsd.test.ts` passes in current RED state (no session ID on first call means no --resume flag added). The primary RED gate for COMPAT-05 is the binary name assertion ("claude" vs "gsd").
- `state-deriver.test.ts` GSD 2 block: 4 of 6 new tests are RED. 2 structural guard tests pass (no-crash + roadmap defined). This is acceptable — the RED tests cover all COMPAT-01/02/03 behavioral assertions.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- All RED gates are in place: Wave 1 plans (12-02 through 12-05) can now implement production code knowing tests will turn green
- COMPAT-04: slash-commands.ts must export 9 GSD 2 entries with space syntax
- COMPAT-05: ClaudeProcessManager must spawn "gsd" binary
- COMPAT-06: buildFullState must return needsMigration: boolean based on .planning/ vs .gsd/ presence
- COMPAT-07: SettingsView must render "Budget ceiling" and "Skill discovery", remove "Skip permissions" and "Allowed tools"
- COMPAT-01/02/03: buildFullState must support GSD 2 .gsd/ schema with dynamic ID resolution

---
*Phase: 12-gsd-2-compatibility-pass*
*Completed: 2026-03-12*
