---
phase: 03-core-renderer
plan: 02
subsystem: watch/tree-renderer
tags: [tree-renderer, layout-engine, badge-formatting, tdd, ansi-safe, width-aware]
dependency_graph:
  requires: [buildMilestoneTree, MilestoneNode, PhaseNode, PlanNode, NodeStatus, visibleWidth, truncateToWidth]
  provides: [renderTreeLines, renderTree]
  affects: [renderer-entry.ts, sidebar-display]
tech_stack:
  added: []
  patterns: [pure-functions, tdd-red-green, ansi-safe-layout, atomic-write, d12-name-wins]
key_files:
  created:
    - src/resources/extensions/gsd/watch/tree-renderer.ts
    - src/resources/extensions/gsd/tests/watch-tree-renderer.test.ts
  modified:
    - src/resources/extensions/gsd/watch/renderer-entry.ts
    - src/resources/extensions/gsd/tests/watch-renderer-entry.test.ts
key_decisions:
  - "Badge string always 8 visible chars (space + 7 circles) — separates cleanly from name"
  - "MIN_NAME_WITH_BADGES=4 threshold — below this available space, badges drop entirely"
  - "MIN_WIDTH_FOR_PLANS=30 — plan lines hidden below 30 columns per D-13"
  - "renderPlaceholder kept in renderer-entry.ts for backward compatibility — not deleted"
  - "Atomic stdout.write (clear + content in one call) prevents flicker per Pitfall 5"
metrics:
  duration: "~4 minutes"
  completed: "2026-03-27"
  tasks: 2
  files: 4
---

# Phase 3 Plan 02: Tree Renderer Summary

**One-liner:** Width-aware ANSI terminal renderer converting MilestoneNode to box-drawing tree output with status icons and 7-slot lifecycle badge strings via TDD.

## What Was Built

The display layer for the GSD Watch sidebar. Takes the typed tree model from Plan 01 and produces formatted terminal output with box-drawing characters, status icons, and lifecycle badge circles. Handles width-aware layout, badge truncation on narrow panes, and wires into renderer-entry.ts replacing all three `renderPlaceholder` call sites.

### Files Created / Modified

- **`src/resources/extensions/gsd/watch/tree-renderer.ts`** — New renderer module: `renderTreeLines(milestone, width) -> string[]`, layout engine with badge formatting and D-12 name-wins truncation
- **`src/resources/extensions/gsd/tests/watch-tree-renderer.test.ts`** — 16 unit tests covering all layout behaviors, status icons, badge formatting, and width constraints
- **`src/resources/extensions/gsd/watch/renderer-entry.ts`** — Modified: new imports, `renderTree()` function, three call sites switched from `renderPlaceholder` to `renderTree`
- **`src/resources/extensions/gsd/tests/watch-renderer-entry.test.ts`** — Modified: added 3 integration tests for `renderTree`

### Key Behaviors

| Function | Purpose |
|----------|---------|
| `renderTreeLines(milestone, width)` | Main export: MilestoneNode + width -> terminal-safe string[] |
| `formatMilestoneLine(milestone, width)` | Root header: STATUS_ICON + " " + truncated label |
| `formatPhaseLine(phase, prefix, width)` | Phase line: prefix + icon + name + optional badge string |
| `formatBadgeString(badges)` | " " + 7 filled/empty circles (8 visible chars) |
| `formatPlanLine(plan, prefix, width)` | Plan line: prefix + icon + truncated label (no badges) |
| `renderTree(projectRoot)` | Builds tree model + renders + atomic stdout.write with screen clear |

### Layout Rules Applied

- **D-12 (name wins over badges):** If `available < MIN_NAME_WITH_BADGES + badgeWidth`, drop all badges; name gets full available space
- **D-13 (plan visibility threshold):** Plans hidden when `width < MIN_WIDTH_FOR_PLANS (30)`
- **D-02 (box-drawing hierarchy):** `├──` for non-last, `└──` for last, `│   ` vs `    ` continuation prefix
- **D-09 (status icons):** `✓` done, `◆` active, `○` pending, `✘` blocked
- **D-05 (lifecycle badges):** `●` filled, `○` empty — 7 slots per phase

## TDD Execution

- **RED commit:** `ac8eceb8` — 16 failing tests, `tree-renderer.ts` absent
- **GREEN commit:** `4a4b3758` — All 16 tests pass after implementation

## Test Coverage (46 tests total)

**watch-tree-renderer.test.ts (16 tests):**
- Box-drawing characters: 3 tests (├── present, └── present, correct placement)
- Status icons: 4 tests (✓, ◆, ○, milestone header)
- Badge formatting: 2 tests (specific badge array, badges visible at 80)
- Width-aware layout: 3 tests (30-col no overflow, 20-col extreme, all widths)
- Plan indentation: 3 tests (deeper than phases, last-under-last, last-under-non-last)
- Edge cases: 1 test (empty phases = single header line)

**watch-renderer-entry.test.ts additions (3 tests):**
- `renderTree` output contains screen clear sequence
- `renderTree` output contains tree drawing characters (not placeholder)
- `renderTree` output is non-empty beyond the clear sequence

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

1. Badge string formatted as `" " + 7 circles` — leading space provides visual separation from phase name without needing extra logic
2. `MIN_NAME_WITH_BADGES = 4` — threshold for dropping badges: if fewer than 4 chars remain for name after badge allocation, drop all badges to preserve readability
3. `MIN_WIDTH_FOR_PLANS = 30` — plan lines hidden below 30 columns; at this width only phase names and badges (if room) are shown
4. `renderPlaceholder` retained in `renderer-entry.ts` — not deleted to preserve backward compatibility with existing tests that import it
5. Atomic write pattern: `process.stdout.write("\x1b[2J\x1b[H" + lines.join("\n") + "\n")` — single call prevents flicker from partial screen state

## Known Stubs

None — `renderTree` fully wires `buildMilestoneTree` and `renderTreeLines` with live filesystem data. All call sites in `renderer-entry.ts` use real rendering.

## Self-Check: PASSED

- FOUND: `src/resources/extensions/gsd/watch/tree-renderer.ts`
- FOUND: `src/resources/extensions/gsd/tests/watch-tree-renderer.test.ts`
- FOUND: `src/resources/extensions/gsd/watch/renderer-entry.ts` (modified)
- FOUND: `src/resources/extensions/gsd/tests/watch-renderer-entry.test.ts` (modified)
- FOUND: commit ac8eceb8 (TDD RED — 16 failing tests)
- FOUND: commit 4a4b3758 (TDD GREEN — 16 tests pass)
- FOUND: commit b605db00 (Task 2 — renderTree wired, all 46 tests pass)
