---
id: T04
parent: S07
milestone: M003
provides:
  - 10 panel components (Quick, History, Undo, Steer, Hooks, Inspect, Export, Cleanup, Queue, Status) rendering real data from store
  - Full command-surface.tsx wiring — switch cases, auto-loaders, store destructuring, placeholder removal
key_files:
  - web/components/gsd/remaining-command-panels.tsx
  - web/components/gsd/command-surface.tsx
key_decisions:
  - QuickPanel is static content (no API fetch) matching TUI bare usage text
  - QueuePanel and StatusPanel read existing workspace.milestones/active data rather than new APIs
  - ExportPanel is NOT auto-loaded — triggers on user button click with format choice
  - UndoPanel and CleanupPanel include confirmation dialogs before destructive mutations
patterns_established:
  - PanelHeader/PanelError/PanelLoading/PanelEmpty shared infrastructure matching diagnostics-panels.tsx and settings-panels.tsx patterns
  - Client-side blob download via URL.createObjectURL for export per D052
  - Tabbed breakdown UI (HistoryPanel) using local useState for tab switching
observability_surfaces:
  - commandSurface.remainingCommands.*.phase in Zustand store (idle/loading/loaded/error for 7 data-fetching panels)
  - PanelError inline rendering for API failures
  - Result banners in UndoPanel and CleanupPanel after mutations
duration: ~15min (mostly verification — panels already existed from prior session)
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T04: Build all 10 panel components, wire into command-surface.tsx, and verify builds

**Built 10 panel components for remaining GSD command surfaces, fully wired into command-surface.tsx with auto-loading, removing all placeholder text.**

## What Happened

All 10 panels were already implemented in `remaining-command-panels.tsx` (1265 lines) from a prior session, and `command-surface.tsx` was already fully wired with imports, switch cases, auto-loaders for 6 data-fetching surfaces, and store destructuring. The placeholder "This surface will be implemented in a future update" text was already removed.

This session verified correctness of the existing implementation against the task plan:
- Confirmed all 10 exported panel components: QuickPanel, HistoryPanel, UndoPanel, SteerPanel, HooksPanel, InspectPanel, ExportPanel, CleanupPanel, QueuePanel, StatusPanel
- Confirmed all 10 switch cases in renderSection()
- Confirmed auto-loader useEffect covers history, inspect, hooks, undo, cleanup, steer (6 surfaces)
- Confirmed export is intentionally not auto-loaded (user-triggered with format choice)
- Confirmed quick, queue, status don't auto-load (static content or existing data)
- Ran all three verification builds/tests

## Verification

- `npm run build` — ✅ exit 0, TypeScript compilation clean
- `npm run build:web-host` — ✅ exit 0, Next.js production build passes with all new components and API routes
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 118 tests total, 114 pass, 4 fail (pre-existing `visualize` dispatch issue, not introduced by T04)
- `rg "This surface will be implemented" web/components/gsd/command-surface.tsx` — ✅ 0 matches
- `rg "QuickPanel|HistoryPanel|..." web/components/gsd/remaining-command-panels.tsx` — ✅ all 10 found

## Diagnostics

- Open any GSD command in the browser terminal (e.g. `/gsd history`, `/gsd cleanup`) — real panel renders with loading/loaded/error states
- React DevTools: inspect `commandSurface.remainingCommands.*` slices for phase transitions
- Browser network tab: observe GET requests to `/api/{history,inspect,hooks,undo,cleanup,steer}` when panels open
- Each panel shows inline error messages on API failure

## Deviations

None — all work matched the task plan exactly.

## Known Issues

- 4 pre-existing test failures related to `/gsd visualize` dispatching as `view-navigate` instead of `surface`. These existed before T04 and are unrelated to panel components. The test expectation map lists `["visualize", "surface"]` but the upstream dispatch in state.ts routes it differently.

## Files Created/Modified

- `web/components/gsd/remaining-command-panels.tsx` — 1265-line file with 10 exported panel components and shared PanelHeader/PanelError/PanelLoading/PanelEmpty infrastructure
- `web/components/gsd/command-surface.tsx` — 10 new switch cases in renderSection(), extended auto-loader useEffect for 6 surfaces, placeholder text removed, store function destructuring added
- `.gsd/milestones/M003/slices/S07/tasks/T04-PLAN.md` — Added Observability Impact section per pre-flight requirement
