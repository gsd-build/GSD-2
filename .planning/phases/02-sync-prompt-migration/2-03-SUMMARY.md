---
phase: 02-sync-prompt-migration
plan: 03
subsystem: prompts
tags: [prompt-migration, tool-calls, gsd-complete-task, gsd-complete-slice, gsd-plan-slice]

# Dependency graph
requires:
  - phase: 01-engine-foundation
    provides: "WorkflowEngine tools (gsd_complete_task, gsd_complete_slice, gsd_plan_slice)"
provides:
  - "Prompt instructions directing agents to use engine tools instead of checkbox edits"
  - "Content-assertion tests verifying tool references and absence of checkbox instructions"
affects: [03-tool-mandatory-cutover, agent-compliance-telemetry]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Hard switch prompt migration (no fallback language per D-07)"]

key-files:
  created:
    - src/resources/extensions/gsd/engine/prompt-migration.test.ts
  modified:
    - src/resources/extensions/gsd/prompts/execute-task.md
    - src/resources/extensions/gsd/prompts/complete-slice.md
    - src/resources/extensions/gsd/prompts/plan-slice.md

key-decisions:
  - "Hard switch with no fallback — prompts do not say 'if tool unavailable, edit file instead' per D-07"
  - "plan-slice.md migration is additive — file-write steps preserved, tool call added as new step 8"

patterns-established:
  - "Content-assertion tests: read prompt files at test time and assert on string contents for migration verification"

requirements-completed: [PMG-01, PMG-02, PMG-03]

# Metrics
duration: 2min
completed: 2026-03-22
---

# Phase 2 Plan 3: Prompt Migration Summary

**Migrated execute-task, complete-slice, and plan-slice prompts from checkbox-edit instructions to engine tool-call instructions with content-assertion tests**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-22T22:52:54Z
- **Completed:** 2026-03-22T22:54:51Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created content-assertion test suite verifying all three prompts reference correct tool names and lack checkbox-edit instructions
- Replaced execute-task.md step 16 checkbox edit with gsd_complete_task tool call
- Replaced complete-slice.md step 10 checkbox edit with gsd_complete_slice tool call
- Added plan-slice.md step 8 with gsd_plan_slice tool call (additive — file-write steps preserved)
- All 9 content-assertion tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Content-assertion tests for prompt migration** - `c186c28c` (test)
2. **Task 2: Update three prompts with tool-call instructions** - `0d53c4f5` (feat)

_Note: TDD workflow — test commit (RED) followed by implementation commit (GREEN)_

## Files Created/Modified
- `src/resources/extensions/gsd/engine/prompt-migration.test.ts` - Content assertions for all three prompt files (9 tests across 3 describe blocks)
- `src/resources/extensions/gsd/prompts/execute-task.md` - Step 16 now calls gsd_complete_task; final MUST paragraph updated
- `src/resources/extensions/gsd/prompts/complete-slice.md` - Step 10 now calls gsd_complete_slice; final MUST paragraph updated
- `src/resources/extensions/gsd/prompts/plan-slice.md` - Added step 8 calling gsd_plan_slice; steps 8-10 renumbered to 9-11

## Decisions Made
- Hard switch with no fallback language per D-07 — agents must use tools, no "if unavailable" escape hatch
- plan-slice migration is additive (step 8 added after file-write steps 6-7) rather than replacement, since file-write and tool registration are complementary

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three high-traffic prompts now instruct agents to use engine tools
- Content-assertion tests provide regression guard against future prompt edits reintroducing checkbox instructions
- Ready for telemetry-based compliance validation before mandatory cutover (Phase 3)

---
*Phase: 02-sync-prompt-migration*
*Completed: 2026-03-22*
