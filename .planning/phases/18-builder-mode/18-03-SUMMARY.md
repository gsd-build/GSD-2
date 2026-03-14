---
phase: 18-builder-mode
plan: "03"
subsystem: ui
tags: [react, builder-mode, slice-cards, discuss-mode, vocabulary]

requires:
  - phase: 18-01
    provides: InterfaceModeContext, useBuilderMode hook, BUILDER_VOCAB foundation
  - phase: 14-slice-integration
    provides: SlicePlanned, SliceInProgress, SliceNeedsReview, SliceComplete, SliceRow, SliceAccordion

provides:
  - builderMode prop on all four slice card components (SlicePlanned, SliceInProgress, SliceNeedsReview, SliceComplete)
  - builderMode prop on SliceRow with StatusBadge Builder labels
  - SliceAccordion reads useBuilderMode() and threads builderMode to SliceRow
  - builderMode prop on QuestionCard hiding area label in Builder mode
  - builderMode prop on DecisionLogDrawer showing 'Your decisions so far' in Builder mode
  - useChatMode reads useBuilderMode() and passes builderMode to QuestionCard and DecisionLogDrawer

affects:
  - 18-04
  - any future phase touching slice card UI or discuss mode

tech-stack:
  added: []
  patterns:
    - "Prop-conditional vocabulary: builderMode? prop added to existing components, inline ternaries for 1-2 labels, no component duplication"
    - "Hook threading: SliceAccordion reads useBuilderMode() and passes result down; useChatMode reads useBuilderMode() same pattern"

key-files:
  created: []
  modified:
    - packages/mission-control/src/components/milestone/SlicePlanned.tsx
    - packages/mission-control/src/components/milestone/SliceInProgress.tsx
    - packages/mission-control/src/components/milestone/SliceNeedsReview.tsx
    - packages/mission-control/src/components/milestone/SliceComplete.tsx
    - packages/mission-control/src/components/milestone/SliceRow.tsx
    - packages/mission-control/src/components/milestone/SliceAccordion.tsx
    - packages/mission-control/src/components/chat/QuestionCard.tsx
    - packages/mission-control/src/components/chat/DecisionLogDrawer.tsx
    - packages/mission-control/src/hooks/useChatMode.tsx

key-decisions:
  - "All changes prop-conditional via inline ternaries — no duplicate components created"
  - "SliceAccordion is the integration point for builder mode in slice UI — reads useBuilderMode() and passes down rather than requiring all callers to know about builder mode"
  - "useChatMode reads useBuilderMode() internally — callers (ChatPanel, SingleColumnView) need no changes"
  - "QuestionCard area label hidden entirely in Builder mode (not replaced) — 'Question N of N' progress display already provides sufficient context"

patterns-established:
  - "Container components (Accordion, useChatMode) read useBuilderMode() and pass builderMode down as prop — leaf components remain pure and testable"

requirements-completed:
  - BUILDER-05
  - BUILDER-06

duration: 12min
completed: 2026-03-14
---

# Phase 18 Plan 03: Builder Vocabulary on Slice Cards and Discuss Mode Summary

**builderMode prop threaded to all four slice cards, SliceRow StatusBadge, QuestionCard, and DecisionLogDrawer — non-technical Builder vocabulary applied via inline ternaries with zero component duplication**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-14T12:00:00Z
- **Completed:** 2026-03-14T12:12:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- All four slice card components accept `builderMode?: boolean` and show plain-English labels when true
- SliceRow StatusBadge updated with Builder vocabulary for all four status values
- SliceAccordion imports `useBuilderMode()` and threads `builderMode` to every SliceRow — no call sites need to change
- QuestionCard hides the `question.area` label (GSD-internal terminology) in Builder mode
- DecisionLogDrawer header shows 'Your decisions so far' instead of 'Decisions' in Builder mode
- useChatMode reads `useBuilderMode()` and passes `builderMode` to both discuss mode components
- 747 tests pass, pre-existing infrastructure failures unchanged (SERV-01, SERV-05)

## Task Commits

Each task was committed atomically:

1. **Task 1: Builder labels on all four slice card components + SliceRow StatusBadge** - `93baaa2` (feat)
2. **Task 2: Builder vocabulary in QuestionCard and DecisionLogDrawer** - `b373495` (feat)

## Files Created/Modified

- `packages/mission-control/src/components/milestone/SlicePlanned.tsx` - Added builderMode prop; 'PLANNED'→'Ready to build', 'Review plan'→'See what will be built', 'Start this slice'→'Build this feature'
- `packages/mission-control/src/components/milestone/SliceInProgress.tsx` - Added builderMode prop; '● EXECUTING'→'Building now', 'Steer'→'Give direction'
- `packages/mission-control/src/components/milestone/SliceNeedsReview.tsx` - Added builderMode prop; '⚠ NEEDS YOUR REVIEW'→'Ready for your review', 'Merge to main'→'Ship it'
- `packages/mission-control/src/components/milestone/SliceComplete.tsx` - Added builderMode prop; '✓ COMPLETE'→'Done'
- `packages/mission-control/src/components/milestone/SliceRow.tsx` - Added builderMode to SliceRowProps and StatusBadge; passes builderMode to all four slice card renders
- `packages/mission-control/src/components/milestone/SliceAccordion.tsx` - Imports useBuilderMode(), passes builderMode to SliceRow
- `packages/mission-control/src/components/chat/QuestionCard.tsx` - Added builderMode to QuestionCardViewProps and QuestionCard; hides area span when builderMode=true
- `packages/mission-control/src/components/chat/DecisionLogDrawer.tsx` - Added builderMode prop; shows 'Your decisions so far' header in Builder mode
- `packages/mission-control/src/hooks/useChatMode.tsx` - Imports useBuilderMode(); passes builderMode to QuestionCard and DecisionLogDrawer overlay render

## Decisions Made

- All changes prop-conditional via inline ternaries — no duplicate components created (anti-pattern explicitly avoided)
- SliceAccordion is the integration point for Builder mode in slice UI — it reads `useBuilderMode()` and passes `builderMode` down rather than requiring all callers (MilestoneView, MilestoneHeader) to know about builder mode
- useChatMode reads `useBuilderMode()` internally — callers (ChatPanel, SingleColumnView) need no changes, keeping the interface clean
- QuestionCard area label hidden entirely in Builder mode rather than replaced with a generic label — 'Question N of N' already provides progress context, removing GSD jargon is cleaner than substituting it

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Builder mode visual vocabulary complete across all major UI surfaces
- Phase 18-04 (final integration / smoke testing) can proceed
- BUILDER-05 and BUILDER-06 requirements satisfied

---
*Phase: 18-builder-mode*
*Completed: 2026-03-14*
