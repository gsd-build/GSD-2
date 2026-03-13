---
phase: 14-slice-integration
plan: 02
subsystem: ui
tags: [react, typescript, tdd, accordion, milestone, slice, gsd2]

# Dependency graph
requires:
  - phase: 14-slice-integration
    plan: 01
    provides: GSD2SliceInfo[], SliceAction union type, GSD2State slices/uatFile/gitBranchCommits

provides:
  - SliceAccordion.tsx — accordion container with openSliceIds state, activeSliceId auto-expand, isAutoMode effect
  - MilestoneHeader.tsx — rewritten with GSD2State: totalCost, budget ceiling bar (amber/red thresholds), Start next slice button
  - MilestoneView.tsx — uses gsd2State prop (replaces planningState/PhaseState); renders SliceAccordion
  - TabLayout.tsx — Slice tab removed; only Chat & Task + Milestone remain; SliceAccordion in milestone tab

affects:
  - 14-03 (SliceDetailPanel — fills SliceAccordion expanded content stub)
  - 14-04 (UATPanel — fills UAT section within SliceAccordion)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Source-text TDD strategy for React components — read .tsx file as string, assert implementation text patterns"
    - "SliceAccordion openSliceIds: Set<string> local state for O(1) expand/collapse lookups"
    - "useEffect re-expand pattern — when isAutoMode becomes true, add activeSliceId to openSliceIds"

key-files:
  created:
    - packages/mission-control/src/components/milestone/SliceAccordion.tsx
    - packages/mission-control/tests/slice-accordion.test.ts
  modified:
    - packages/mission-control/src/components/views/MilestoneView.tsx
    - packages/mission-control/src/components/milestone/MilestoneHeader.tsx
    - packages/mission-control/src/components/layout/TabLayout.tsx
    - packages/mission-control/src/components/layout/SingleColumnView.tsx
    - packages/mission-control/tests/milestone.test.tsx
    - packages/mission-control/tests/sidebar-tree.test.tsx

key-decisions:
  - "MilestoneView prop renamed planningState → gsd2State; SingleColumnView updated to pass gsd2State= in same commit"
  - "TabLayout retains deprecated PhaseState/PlanState path in chat-task tab for now — full GSD2 migration deferred to Phase 15 cleanup"
  - "MilestoneHeader totalCost derived from slices[].costEstimate sum — not from projectState.cost (projectState.cost tracks session spend, not per-slice estimates)"
  - "Budget bar only renders when budgetCeiling is non-null and >0 — avoids divide-by-zero"
  - "Start next slice button disabled if onStartNext prop not provided — graceful degradation when no WebSocket handler wired yet"

patterns-established:
  - "Source-text TDD: test reads .tsx as string and asserts key implementation markers — works without React rendering in Bun"
  - "Template literal data-testid pattern: data-testid={`slice-row-${id}`} — tests match with data-testid={`slice-row- prefix"

requirements-completed: [SLICE-01, SLICE-07]

# Metrics
duration: 10min
completed: 2026-03-13
---

# Phase 14 Plan 02: SliceAccordion Container + MilestoneView Wiring Summary

**SliceAccordion accordion container with auto-expand/collapse; MilestoneHeader shows totalCost + budget ceiling bar; Slice tab removed from TabLayout; 617 tests pass**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-13T08:20:44Z
- **Completed:** 2026-03-13T08:30:44Z
- **Tasks:** 2 (TDD accordion + structural wiring)
- **Files modified:** 8

## Accomplishments

- Created `SliceAccordion.tsx` with `openSliceIds: Set<string>` state, activeSliceId auto-expand on mount, `useEffect` re-expand when `isAutoMode` becomes true, toggle click handler
- Updated `MilestoneHeader.tsx` to use `GSD2State` — totalCost from `slices[].costEstimate`, budget ceiling ProgressBar with amber (80%) / red (95%) color thresholds, "Start next slice" shortcut button
- Updated `MilestoneView.tsx` to use `gsd2State` prop and render `SliceAccordion` in place of `PhaseList` + `CommittedHistory`
- Removed `{ id: "slice", label: "Slice" }` from `TabLayout.tsx` TABS array and its render branch; removed `ContextBudgetChart`, `BoundaryMap`, `UatStatus` imports
- 10 new source-text TDD tests in `slice-accordion.test.ts`; updated 2 backward-compat test files; full suite 617 pass (up from 607 baseline)

## Task Commits

Each task was committed atomically:

1. **Task 1: SliceAccordion container component (TDD RED→GREEN)** - `ba9418c` (feat)
2. **Task 2: Update MilestoneView + MilestoneHeader + remove Slice tab** - `956684f` (feat)

## Files Created/Modified

- `packages/mission-control/src/components/milestone/SliceAccordion.tsx` — Accordion with openSliceIds state, auto-expand, toggle, placeholder row content
- `packages/mission-control/tests/slice-accordion.test.ts` — 10 source-text TDD tests
- `packages/mission-control/src/components/views/MilestoneView.tsx` — Now uses gsd2State + SliceAccordion
- `packages/mission-control/src/components/milestone/MilestoneHeader.tsx` — Rewritten with GSD2State, totalCost, budget bar, Start next slice
- `packages/mission-control/src/components/layout/TabLayout.tsx` — Slice tab removed; 2-tab layout; SliceAccordion in milestone tab
- `packages/mission-control/src/components/layout/SingleColumnView.tsx` — MilestoneView call updated to gsd2State=
- `packages/mission-control/tests/milestone.test.tsx` — Updated MilestoneHeader tests to use GSD2State mock
- `packages/mission-control/tests/sidebar-tree.test.tsx` — Updated MilestoneView prop reference gsd2State=

## Decisions Made

- `MilestoneView` prop renamed `planningState` → `gsd2State`; `SingleColumnView` updated in same commit to keep TypeScript clean
- `TabLayout` retains deprecated `PhaseState`/`PlanState` access in the chat-task tab — full GSD2 migration of chat-task task display is deferred (pre-existing tech debt)
- `MilestoneHeader` derives `totalCost` from `slices[].costEstimate` sum rather than `projectState.cost` — `projectState.cost` is session API spend, not per-slice estimates
- Budget bar only renders when `budgetCeiling` is non-null and > 0 to avoid divide-by-zero
- `Start next slice` button disabled if no `onStartNext` prop — graceful degradation before full WebSocket wiring in 14-03/14-04

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test assertion updated for template literal `data-testid`**
- **Found during:** Task 1 GREEN phase (slice-accordion.test.ts)
- **Issue:** Plan spec said assert `data-testid="slice-row-"` with double quotes; actual TSX uses template literal `data-testid={\`slice-row-${slice.id}\`}` so source contains `data-testid={\`` not `data-testid="slice-row-`
- **Fix:** Updated test to assert `data-testid={\`slice-row-` — matches the template literal form used in implementation
- **Files modified:** `packages/mission-control/tests/slice-accordion.test.ts`
- **Verification:** 10/10 tests pass
- **Committed in:** `ba9418c`

**2. [Rule 1 - Bug] Updated backward-compat tests for renamed MilestoneView prop and MilestoneHeader API**
- **Found during:** Task 2 (full test suite run after wiring)
- **Issue:** `milestone.test.tsx` called `MilestoneHeader({ projectState: ..., roadmap: ... })` (old API); `sidebar-tree.test.tsx` asserted `"planningState":null` in rendered JSON
- **Fix:** Updated `milestone.test.tsx` to use `GSD2State` mock and new `gsd2State=` prop; updated `sidebar-tree.test.tsx` assertion to `"gsd2State":null`
- **Files modified:** `tests/milestone.test.tsx`, `tests/sidebar-tree.test.tsx`
- **Verification:** 617 tests pass; 0 fail
- **Committed in:** `956684f`

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in test assertions not matching implementation)
**Impact on plan:** Necessary for test correctness. No scope creep.

## Issues Encountered

None beyond the 2 auto-fixed backward-compat test updates above.

## Next Phase Readiness

- `SliceAccordion` renders placeholder expanded content — Plan 14-03 fills in `SliceRow` detail cards
- `onAction` prop wired through `MilestoneView` → `SliceAccordion` — Plan 14-03/14-04 connects to WebSocket `sendMessage`
- `Start next slice` button calls `onAction({ type: 'start_slice', sliceId })` — WebSocket routing in 14-03
- 617 tests passing baseline confirmed

---
*Phase: 14-slice-integration*
*Completed: 2026-03-13*
