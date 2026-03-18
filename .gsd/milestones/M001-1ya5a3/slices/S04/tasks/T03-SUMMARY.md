---
id: T03
parent: S04
milestone: M001-1ya5a3
provides:
  - ReadCard with syntax-highlighted file content via Streamdown, line range display, truncation warnings
  - SearchCard handling grep/find/ls/glob with tool-specific headers and result counts
  - LspCard showing LSP action + file + monospace results
  - GenericCard as crash-proof fallback for all unrecognized tool types
  - ToolCardDispatcher barrel routing all tool names to the correct card component
  - MessageStream wired to ToolCardDispatcher, ToolStub import removed
key_files:
  - studio/src/renderer/src/components/tool-cards/ReadCard.tsx
  - studio/src/renderer/src/components/tool-cards/SearchCard.tsx
  - studio/src/renderer/src/components/tool-cards/LspCard.tsx
  - studio/src/renderer/src/components/tool-cards/GenericCard.tsx
  - studio/src/renderer/src/components/tool-cards/index.tsx
  - studio/src/renderer/src/components/message-stream/MessageStream.tsx
key_decisions:
  - ToolCardDispatcher uses a switch statement with case-insensitive tool name matching (e.g. 'read'|'Read') rather than a map — switch is clearer for the ~12 cases and allows grouping aliases naturally
  - async_bash routed to BashCard alongside bash — same visual treatment for background shell commands
  - GenericCard wraps both content extraction and rendering in try/catch for crash-proof fallback
patterns_established:
  - Tool card component pattern fully established — receive ToolUseBlock, extract args/content/details, pass headerContent+children to ToolCard shell
  - SearchCard uses per-tool header builders (buildGrepHeader, buildFindHeader, buildLsHeader, buildGlobHeader) for tool-specific collapsed summaries
observability_surfaces:
  - All new cards inherit data-tool-name and data-tool-status DOM attributes from ToolCard shell
  - document.querySelectorAll('[data-tool-name="read"]') etc. work for all card types
  - GenericCard renders "(complex args)" or "Unable to render tool result" on failure rather than crashing
  - ToolStub.tsx remains on disk but is not imported by any active component
duration: 12min
verification_result: passed
completed_at: 2026-03-18T07:00:00-06:00
blocker_discovered: false
---

# T03: Build remaining cards, wire dispatcher into MessageStream, remove ToolStub

**Built ReadCard, SearchCard, LspCard, GenericCard, wired ToolCardDispatcher into MessageStream replacing ToolStub — completing the S04 tool card integration**

## What Happened

Previous attempt had already written all 6 files correctly. This retry verified the code, ran all verification checks, and confirmed everything passes.

1. **ReadCard** — extracts `path`, `offset`, `limit` from args. Collapsed header shows shortened path + `[offset:limit]` range label in accent. Includes a 10-line syntax-highlighted preview via Streamdown (same code-fence wrapping pattern as WriteCard). Expanded body shows full content with Streamdown rendering. Truncation warning with amber Warning icon when `details.truncation.truncated` is set. Running state shows "reading…", error state shows red text.

2. **SearchCard** — handles grep, find, ls, glob via per-tool header builders. Grep shows `/{pattern}/` in accent + "in path" + match count. Find shows `pattern in path` + result count. Ls shows `ls path` + entry count. Glob shows `pattern` + result count. Expanded body shows full monospace output with truncation warning. Error state shows red text.

3. **LspCard** — minimal design for usually-short LSP results. Collapsed header shows action name in accent + file path. Expanded body shows monospace text output.

4. **GenericCard** — crash-proof fallback for all unrecognized tool types. Collapsed header shows formatted tool name. Expanded body shows `JSON.stringify(args, null, 2)` in a styled pre block + text result below. Entire rendering wrapped in try/catch — falls back to "Unable to render tool result" if anything throws.

5. **ToolCardDispatcher** — switch-based routing: edit→EditCard, bash/async_bash→BashCard, write→WriteCard, read→ReadCard, grep/find/ls/glob→SearchCard, lsp→LspCard, default→GenericCard. Case-insensitive aliases for edit/bash/write/read (e.g. 'Read'|'read'). Re-exports ToolUseBlock type.

6. **MessageStream** — replaced `import { ToolStub } from './ToolStub'` with `import { ToolCardDispatcher } from '../tool-cards'`. BlockRenderer tool-use case changed from `<ToolStub toolName={block.toolName} status={block.status} />` to `<ToolCardDispatcher block={block} />`.

## Verification

- `npm run test -w studio` — 38 tests pass (all existing + T01's 4 new S04 tests), zero failures
- `npx tsc --noEmit -p studio/tsconfig.web.json` — zero type errors
- `npm run build -w studio` — zero build errors, all card components bundled (2,076 kB main bundle)
- `grep -r 'ToolStub' studio/src/renderer/src/components/message-stream/` — only ToolStub.tsx file definition, no imports from active components
- Root `npm run test` — 1660 pass, 2 fail (pre-existing app-smoke.test.ts failures about extension syncing, unrelated to this slice)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npm run test -w studio` | 0 | ✅ pass | ~0.2s |
| 2 | `npx tsc --noEmit -p studio/tsconfig.web.json` | 0 | ✅ pass | ~3.9s |
| 3 | `npm run build -w studio` | 0 | ✅ pass | ~2.1s |
| 4 | `grep -r 'ToolStub' .../message-stream/` | 0 | ✅ pass (only file def) | <0.1s |

## Diagnostics

- **DOM inspection:** `document.querySelectorAll('[data-tool-name]')` returns all rendered cards across all types. Filter by specific tool: `[data-tool-name="read"]`, `[data-tool-name="grep"]`, `[data-tool-name="lsp"]`, etc.
- **Error state inspection:** `document.querySelectorAll('[data-tool-status="error"]')` surfaces all error-state cards regardless of type.
- **GenericCard resilience:** Any tool name not in the dispatch switch renders GenericCard — visible as `[data-tool-name="<unknown>"]` in the DOM. If args serialization fails, shows "(complex args)" instead of crashing.
- **ToolStub removal:** ToolStub.tsx remains on disk for cleanup but is dead code — no import references from active components.

## Deviations

None. Previous attempt had already implemented all steps correctly — this retry verified and documented.

## Known Issues

None.

## Files Created/Modified

- `studio/src/renderer/src/components/tool-cards/ReadCard.tsx` — Read tool card with Streamdown syntax highlighting, line range display, truncation warning
- `studio/src/renderer/src/components/tool-cards/SearchCard.tsx` — Search tool card for grep/find/ls/glob with per-tool headers and result counts
- `studio/src/renderer/src/components/tool-cards/LspCard.tsx` — LSP tool card with action name + file + monospace results
- `studio/src/renderer/src/components/tool-cards/GenericCard.tsx` — Crash-proof fallback card with JSON args display
- `studio/src/renderer/src/components/tool-cards/index.tsx` — ToolCardDispatcher barrel routing tool names to card components
- `studio/src/renderer/src/components/message-stream/MessageStream.tsx` — Replaced ToolStub import with ToolCardDispatcher
