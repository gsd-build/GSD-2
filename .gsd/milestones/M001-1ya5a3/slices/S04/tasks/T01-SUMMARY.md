---
id: T01
parent: S04
milestone: M001-1ya5a3
provides:
  - Enhanced ToolUseBlock type with content, details, isError, partialResult fields
  - tool_execution_update event handler in buildMessageBlocks
  - Structured result extraction from tool_execution_end
  - ToolCard shell component with smooth CSS grid-rows expand/collapse animation
  - getLanguageFromPath utility mapping 30+ file extensions to Shiki language IDs
  - diff and @types/diff packages installed in studio workspace
  - Diff line background CSS classes (.diff-removed, .diff-added, .diff-context)
key_files:
  - studio/src/renderer/src/lib/message-model.ts
  - studio/test/message-model.test.mjs
  - studio/src/renderer/src/components/tool-cards/ToolCard.tsx
  - studio/src/renderer/src/lib/lang-map.ts
  - studio/src/renderer/src/styles/index.css
  - studio/package.json
key_decisions:
  - Children always rendered in ToolCard expanded body (not conditionally) — required for CSS grid-rows height transition to measure content
  - ToolResultContent type exported from message-model for downstream card components to import
  - Raw result field preserved alongside structured content/details for backward compatibility
patterns_established:
  - CSS grid-rows 0fr↔1fr transition for smooth expand/collapse without JS height measurement
  - formatToolName exported from ToolCard (not ToolStub) as the canonical location for tool cards
observability_surfaces:
  - data-tool-name and data-tool-status DOM attributes on ToolCard for DevTools inspection
  - buildMessageBlocks returns blocks with content, details, isError, partialResult for console inspection
duration: 25min
verification_result: passed
completed_at: 2026-03-18T01:47:00-06:00
blocker_discovered: false
---

# T01: Enhance message model, install diff, build ToolCard shell and language utility

**Enhanced ToolUseBlock with structured result fields, added tool_execution_update handler, built ToolCard expand/collapse shell, and created lang-map utility**

## What Happened

Merged S03 branch into worktree (only conflict was binary .gsd/gsd.db-shm/wal files, resolved by accepting theirs). Then executed the 5 steps:

1. Installed `diff@^8.0.3` and `@types/diff@^7.0.2` in studio workspace.

2. Enhanced `ToolUseBlock` type with `content`, `details`, `isError`, `partialResult` fields. Added `ToolResultContent` exported type. Added `tool_execution_update` case that sets `partialResult` on existing blocks. Enhanced `tool_execution_end` to extract structured results (content array + details) when available, detect `isError` from three signals (`data.error`, `data.status`, `result.isError`), and always preserve raw `result` for backward compat.

3. Updated replicated test function (K001 pattern) to match enhanced source. Added 4 new tests covering: partial result accumulation, structured result extraction, isError detection, and backward-compat plain string results.

4. Created `lang-map.ts` with `getLanguageFromPath()` covering 30+ extensions. Default fallback is `'text'`.

5. Built `ToolCard.tsx` shell with: status-dependent border colors, Phosphor status icons (CircleNotch/Check/XCircle), clickable header with rotating CaretRight chevron, and CSS `grid-template-rows` 0fr↔1fr transition for smooth 300ms expand/collapse animation. Children always rendered (not conditional) so the grid transition can measure content height. Added diff line background CSS classes.

## Verification

- `node --test studio/test/*.test.mjs` — 38 tests pass (34 existing + 4 new S04 tests)
- `npx tsc --noEmit -p studio/tsconfig.web.json` — zero type errors
- `npm run build -w studio` — zero build errors, all card components bundled

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --test studio/test/*.test.mjs` | 0 | ✅ pass | ~0.2s |
| 2 | `npx tsc --noEmit -p studio/tsconfig.web.json` | 0 | ✅ pass | ~4.7s |
| 3 | `npm run build -w studio` | 0 | ✅ pass | ~4.8s |

## Diagnostics

- **DOM inspection:** `document.querySelectorAll('[data-tool-status]')` returns all rendered ToolCards; filter by `[data-tool-status="error"]` for error states.
- **Console inspection:** `buildMessageBlocks(useSessionStore.getState().events)` shows blocks with `content`, `details`, `isError`, `partialResult` fields.
- **ToolCard expand state:** React DevTools shows `isExpanded` state on ToolCard instances.

## Deviations

- Had to merge S03 branch into worktree before starting — S03 code (message-model.ts, ToolStub.tsx, test files) was on a separate branch not yet merged into the milestone branch at the S04 planning commit.
- `npm run test -w studio` resolved to the main project's studio directory rather than the worktree's. Used `node --test studio/test/*.test.mjs` directly instead — this runs from the worktree correctly.

## Known Issues

- None.

## Files Created/Modified

- `studio/src/renderer/src/lib/message-model.ts` — Enhanced ToolUseBlock type, added tool_execution_update handler, structured result extraction in tool_execution_end
- `studio/test/message-model.test.mjs` — Updated replicated buildMessageBlocks, added 4 new tests for S04 features
- `studio/src/renderer/src/components/tool-cards/ToolCard.tsx` — New shared ToolCard shell with expand/collapse animation, status icons, data attributes
- `studio/src/renderer/src/lib/lang-map.ts` — New file extension → Shiki language ID mapping utility
- `studio/src/renderer/src/styles/index.css` — Added .diff-removed, .diff-added, .diff-context CSS classes
- `studio/package.json` — Added diff and @types/diff dependencies
- `.gsd/milestones/M001-1ya5a3/slices/S04/tasks/T01-PLAN.md` — Added Observability Impact section
