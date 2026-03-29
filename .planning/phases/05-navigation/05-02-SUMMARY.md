---
phase: 05-navigation
plan: 02
subsystem: watch/renderer-entry
tags: [navigation, cursor, vim-keys, collapse, help-overlay, tdd, cursor-sticky]
dependency_graph:
  requires: [05-01 (VisibleNode type and collapse-aware renderTreeLines)]
  provides: [parseNavKey, NavKey, resetNavigationState, getCursorIndex, getCollapsedPhases, isHelpOverlayVisible, applyCursorHighlight, renderHelpOverlayLines, ensureCursorInViewport]
  affects: [renderer-entry.ts (renderTree, stdin handler, watcher onChange, resize handler)]
tech_stack:
  added: []
  patterns: [TDD red-green, ANSI reverse video highlight, module-level Set for collapse state, cursor-sticky node identity matching]
key_files:
  created: []
  modified:
    - src/resources/extensions/gsd/watch/renderer-entry.ts
    - src/resources/extensions/gsd/tests/watch-renderer-entry.test.ts
decisions:
  - "NavKey parsed before ArrowKey in stdin handler so j/k/h/l/g/G/? never reach parseArrowKey or parseQuitSequence"
  - "Help overlay guard placed first in stdin handler — single Esc consumed as dismiss, never reaches parseQuitSequence (prevents stale quit state)"
  - "collapsedPhases module-level Set persists across refreshes — pruned of stale dirNames on each renderTree call"
  - "Cursor-sticky uses kind+dirName/planId identity matching, falls back to clamped index on deletion"
metrics:
  duration_minutes: 4
  completed_date: "2026-03-27"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 2
---

# Phase 05 Plan 02: Navigation Wiring Summary

**One-liner:** Wired j/k/h/l/g/G/? vim navigation, reverse-video cursor highlight, help overlay with badge legend, collapse/expand persistence, and cursor-sticky refresh into renderer-entry.ts using ANSI `\x1b[7m` reverse video.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add failing tests 29-47 for navigation | e18ca72b | watch-renderer-entry.test.ts |
| 1 (GREEN) | Implement all navigation features | bcab59f1 | renderer-entry.ts |

## What Was Built

### New Exports (renderer-entry.ts)

- `NavKey` type: `"cursor-up" | "cursor-down" | "collapse" | "expand" | "jump-top" | "jump-bottom" | "help" | null`
- `parseNavKey(chunk)`: Maps j/k/h/l/g/G/? to NavKey values; returns null for non-nav input
- `resetNavigationState()`: Resets cursorIndex, collapsedPhases, helpOverlayVisible, lastRenderedNodes for test isolation
- `getCursorIndex()`: Returns current cursor position
- `getCollapsedPhases()`: Returns copy of collapsed phase Set
- `isHelpOverlayVisible()`: Returns help overlay state
- `applyCursorHighlight(line, width)`: Wraps line in `\x1b[7m...\x1b[0m` reverse video, padding to full width
- `ensureCursorInViewport(cursor, totalNodes, contentHeight)`: Adjusts viewportOffset to keep cursor visible
- `renderHelpOverlayLines(width)`: Returns KEYBINDINGS and BADGE LEGEND sections as string array

### Wiring into renderTree()

- Calls `renderTreeLines(milestone, width, collapsedPhases)` (passes collapse state)
- Prunes stale collapse entries on every render (dirNames no longer in active phases)
- Clamps cursorIndex after node count changes
- Stores both `lastRenderedLines` and `lastRenderedNodes`
- When `helpOverlayVisible`: renders overlay content through viewport instead of tree
- Otherwise: applies `applyCursorHighlight` to cursor row before viewport slice

### Stdin Handler Priority (D-15)

1. Help overlay guard: when visible, only `?`, `\x1b` (Esc), `\x03` (Ctrl+C) active — all other keys silently consumed
2. `parseNavKey(chunk)`: cursor-down/up, collapse/expand, jump-top/bottom, help toggle
3. `parseArrowKey(chunk)`: viewport scroll (Phase 4, unchanged)
4. `parseQuitSequence(chunk)`: qq/EscEsc/Ctrl+C quit

### Cursor-Sticky Refresh (D-05)

- watcher onChange records `prevNode = lastRenderedNodes[cursorIndex]` before renderTree
- After renderTree, finds same logical node by kind+dirName/planId identity
- Falls back to clamped index if node was deleted

### Resize Handler Update

- Added `cursorIndex` clamp after resize (may have fewer/more nodes at new width)

### Tests (47 total, all passing)

- Tests 29-37: parseNavKey key mapping
- Test 38: resetNavigationState resets all three state variables
- Tests 39-40: applyCursorHighlight reverse video wrapping and width padding
- Tests 41-44: renderHelpOverlayLines headers, j/k entry, all 7 badge entries
- Tests 45-47: ensureCursorInViewport adjusts/preserves viewportOffset correctly

## Deviations from Plan

None — plan executed exactly as written.

## Verification

```
npx tsx --test src/resources/extensions/gsd/tests/watch-renderer-entry.test.ts
ℹ tests 47
ℹ pass 47
ℹ fail 0

npx tsx --test src/resources/extensions/gsd/tests/watch-tree-renderer.test.ts
ℹ tests 26
ℹ pass 26
ℹ fail 0
```

## Known Stubs

None — all navigation features fully implemented and tested.

## Self-Check: PASSED

- FOUND: src/resources/extensions/gsd/watch/renderer-entry.ts
- FOUND: src/resources/extensions/gsd/tests/watch-renderer-entry.test.ts
- FOUND: e18ca72b (test RED commit)
- FOUND: bcab59f1 (feat GREEN commit)
