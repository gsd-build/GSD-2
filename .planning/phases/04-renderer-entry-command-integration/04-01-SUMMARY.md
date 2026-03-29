---
phase: 04-renderer-entry-command-integration
plan: "01"
subsystem: watch/renderer-entry
tags: [viewport, scrolling, tdd, arrow-keys, status-bar, auto-follow]
dependency_graph:
  requires:
    - 03-02-SUMMARY.md  # renderTreeLines() returns string[] — prerequisite for viewport slicing
  provides:
    - DISP-04 viewport scrolling implementation
    - getEffectiveHeight, parseArrowKey, renderViewport, scrollViewport, resetViewportState, getViewportOffset
  affects:
    - renderer-entry.ts main execution block (stdin, resize, watcher)
tech_stack:
  added: []
  patterns:
    - Module-level viewport state (viewportOffset) mirroring lastKey/lastKeyTime pattern
    - Arrow key detection before quit state machine in stdin handler (Pitfall 1 mitigation)
    - Conditional status bar only when content exceeds viewport (Pitfall 2 mitigation)
    - Smart auto-follow: only update offset when active phase was already in view
key_files:
  created: []
  modified:
    - src/resources/extensions/gsd/watch/renderer-entry.ts
    - src/resources/extensions/gsd/tests/watch-renderer-entry.test.ts
decisions:
  - "parseArrowKey runs first in stdin handler before parseQuitSequence — complete arrow sequences consumed before quit state machine sees \\x1b prefix"
  - "scrollable = total > height (using full height) before reducing contentHeight — prevents blank status bar row when tree fits entirely (Pitfall 2)"
  - "lastRenderedLines module-level cache stores previous render output for arrow key and resize handlers"
  - "Direct viewportOffset mutation in resize handler intentional — scrollViewport API is for user scroll; resize clamp needs direct assignment without delta"
metrics:
  duration: "13 minutes"
  completed: "2026-03-27"
  tasks_completed: 2
  files_modified: 2
requirements:
  - DISP-04
---

# Phase 04 Plan 01: Viewport Scrolling for renderer-entry Summary

**One-liner:** Arrow-key viewport scrolling with conditional status bar and smart auto-follow, implemented via TDD in renderer-entry.ts (6 new exports, 15 new tests).

---

## What Was Built

Added viewport scrolling to the renderer subprocess so tall project trees are navigable via Up/Down arrow keys, with a conditional scroll-position status bar and smart auto-follow on file changes.

### New Exports in renderer-entry.ts

| Export | Purpose |
|--------|---------|
| `getEffectiveHeight()` | Guards `process.stdout.rows || 0` with MIN_HEIGHT=3, mirrors existing `getEffectiveWidth()` |
| `parseArrowKey(chunk)` | Returns `"up" \| "down" \| null` — pure function, detects `\x1b[A` / `\x1b[B` |
| `renderViewport(lines, offset, height, width)` | Slices line array to viewport window, appends conditional status bar |
| `scrollViewport(delta, totalLines, contentHeight)` | Mutates `viewportOffset` with clamping to `[0, totalLines-contentHeight]` |
| `resetViewportState()` | Resets `viewportOffset` to 0 — exported for test `beforeEach` isolation |
| `getViewportOffset()` | Returns current offset — exported for test assertions |

### Main Block Changes

- **renderTree()**: Now calls `getEffectiveHeight()` and `renderViewport()`, stores output in `lastRenderedLines`
- **stdin data handler**: `parseArrowKey()` checked FIRST before `parseQuitSequence()` — returns early on arrow match (Pitfall 1 mitigation)
- **resize handler**: Clamps `viewportOffset` to valid range before re-render (Pitfall 4 mitigation)
- **watcher callback**: Smart auto-follow — checks if active phase (`◆`) was in view before refresh, only scrolls to follow if it was

---

## Tests Added (15 new, Tests 14–28)

| Test | Coverage |
|------|---------|
| Test 14-15 | `getEffectiveHeight()` returns rows or MIN_HEIGHT |
| Test 16-19 | `parseArrowKey()` up/down/null returns |
| Test 20-24 | `renderViewport()` no-scroll case, slice case, status bar arrow hide/show |
| Test 25-26 | `scrollViewport()` top/bottom clamping |
| Test 27 | `resetViewportState()` offset reset |
| Test 28 | Arrow key isolation — `parseArrowKey` does not corrupt quit state machine |

**Total: 28 tests pass (13 existing + 15 new), 0 failures.**

---

## Commits

| Hash | Phase | Description |
|------|-------|-------------|
| `0bce54aa` | TDD RED | Add failing tests 14-28 for viewport functions |
| `b5a57998` | TDD GREEN | Implement viewport functions in renderer-entry.ts |
| `5f33a9e4` | Wire | Wire viewport into main execution block |

---

## Deviations from Plan

None — plan executed exactly as written. All specified functions, constants, patterns, and test behaviors match the plan's action blocks and UI-SPEC viewport state contract.

---

## Known Stubs

None. All viewport functions are fully implemented and wired. The `renderViewport` function always produces real output based on actual `process.stdout.rows` and rendered tree lines. No placeholder or hardcoded values in the data path.

---

## Self-Check: PASSED
