# TUI Dashboard Cleanup, Optimization & Feature Improvements

## Overview
Consolidate duplicated code across TUI dashboard files, optimize refresh performance,
use the shared design system consistently, and add missing features that improve
the operator experience during auto-mode runs.

## Scope
Files in scope:
- `src/resources/extensions/gsd/auto-dashboard.ts`
- `src/resources/extensions/gsd/dashboard-overlay.ts`
- `src/resources/extensions/gsd/visualizer-overlay.ts`
- `src/resources/extensions/gsd/visualizer-views.ts`
- `src/resources/extensions/gsd/visualizer-data.ts`
- `src/resources/extensions/shared/ui.ts`
- New: `src/resources/extensions/shared/format-utils.ts`
- Test files for all of the above

---

## Wave 1 — Shared Utilities Extraction & Dedup

### 1.1 Create `format-utils.ts` shared module
- Extract `formatDuration(ms)` (currently duplicated 3×)
- Extract `padRight(content, width)` (duplicated 2×)
- Extract `joinColumns(left, right, width)` (duplicated 2×)
- Extract `centerLine(content, width)` (duplicated 1× but general-purpose)
- Extract `fitColumns(parts, width, separator)` (from dashboard-overlay)
- Extract `sparkline(values)` (from visualizer-views)
- Export from shared module, update all import sites

### 1.2 Use shared STATUS_GLYPH / STATUS_COLOR consistently
- Replace hardcoded `✓`, `▸`, `○` in dashboard-overlay.ts with `STATUS_GLYPH`
- Replace hardcoded `✓`, `▸`, `○` in visualizer-views.ts with `STATUS_GLYPH`
- Replace inline color decisions with `STATUS_COLOR` lookups

### 1.3 Fix code quality issues
- Remove redundant dynamic `import('node:fs')` in `visualizer-data.ts:443`
  (statSync already imported at top)
- Remove `stripAnsi` from visualizer-overlay.ts — check if pi-tui exports one,
  otherwise add to format-utils
- Fix `(entry as any)` casts in `auto-dashboard.ts:374-380` with proper type narrowing

### 1.4 Tests for Wave 1
- Unit tests for all `format-utils.ts` exports
- Verify existing dashboard/visualizer tests still pass

---

## Wave 2 — Performance Optimizations

### 2.1 Mtime-based cache for visualizer data loader
- Track mtimes for roadmap, plan, summary, knowledge, captures, preferences files
- Skip re-parsing files whose mtime hasn't changed since last load
- Increase visualizer refresh interval from 2s → 5s

### 2.2 Incremental token sums in progress widget
- Cache cumulative token counts instead of re-scanning all session entries per render
- Only scan new entries since last cached count

### 2.3 Safe sparkline for large arrays
- Replace `Math.max(...values)` with loop-based max to avoid stack overflow on large arrays

### 2.4 Tests for Wave 2
- Mtime cache hit/miss test
- Verify sparkline handles 10k+ values without crash

---

## Wave 3 — Feature Improvements

### 3.1 Failed unit visibility
- Show `✗` glyph for failed/errored units in completed list (dashboard overlay)
- Add failure count to Cost & Usage section
- Show error reasons when available from ledger data

### 3.2 ETA / time remaining estimate
- Calculate average duration per unit type from historical data
- Display "~Xm remaining" in progress widget and dashboard overlay
- Show in Agent view of visualizer

### 3.3 Dashboard ↔ Visualizer toggle
- Add `v` key in dashboard overlay to open visualizer
- Add `d` key in visualizer overlay to open dashboard
- Show hint in both overlay footers

### 3.4 Terminal resize invalidation
- Listen for SIGWINCH in both overlays
- Invalidate cache and request re-render on resize

### 3.5 Fix dispose race in dashboard overlay
- Set `this.disposed = true` before clearing interval in `handleInput` close path

### 3.6 Tests for Wave 3
- Test failed unit rendering
- Test ETA calculation with mock data
- Test resize handler triggers invalidation

---

## Out of Scope (future PRs)
- Per-task metrics in visualizer
- Clipboard copy on export
- Notification/toast system
- Dark/light theme switching
- Search/filter in dashboard overlay
- Context window pressure tracking in Health tab
