---
id: T02
parent: S04
milestone: M001-1ya5a3
provides:
  - DiffView component with custom diff format parsing and word-level intra-line highlighting
  - EditCard component with path/diff summary header and full DiffView expanded body
  - BashCard component with terminal-styled output and 5-line preview
  - WriteCard component with syntax-highlighted file content via Streamdown/Shiki reuse
key_files:
  - studio/src/renderer/src/components/tool-cards/DiffView.tsx
  - studio/src/renderer/src/components/tool-cards/EditCard.tsx
  - studio/src/renderer/src/components/tool-cards/BashCard.tsx
  - studio/src/renderer/src/components/tool-cards/WriteCard.tsx
key_decisions:
  - DiffView parses diff lines into a typed ParsedLine array in a single pass, collecting consecutive removed/added batches to detect 1:1 pairs for intra-line highlighting — same algorithm as the TUI diff.ts reference
  - WriteCard reuses Streamdown + codePlugin by wrapping file content in a markdown code fence rather than calling codeToHtml directly — zero new Shiki wiring needed
  - shortenPath uses a regex pattern (/Users|/home prefix detection) since os.homedir() is unavailable in the renderer process
patterns_established:
  - Tool card component pattern — receive full ToolUseBlock, extract args/content/details, pass headerContent and children to ToolCard shell
  - Error state pattern — check block.isError, extract error text from block.content (first text entry) with block.result string fallback
observability_surfaces:
  - data-tool-name="edit"|"bash"|"write" DOM attributes on each card for DevTools filtering
  - data-tool-status="running"|"done"|"error" for visual state inspection
  - DiffView renders unmatched lines as separators rather than crashing on malformed diff input
  - BashCard shows truncation warning when details.truncation.truncated is set
duration: 15min
verification_result: passed
completed_at: 2026-03-18T01:52:00-06:00
blocker_discovered: false
---

# T02: Build Edit, Bash, and Write card components

**Built DiffView with intra-line word highlighting, EditCard with diff summary/preview, BashCard with terminal-styled output, and WriteCard with Shiki syntax highlighting via Streamdown reuse**

## What Happened

Built the four files specified in the plan — DiffView, EditCard, BashCard, WriteCard.

DiffView parses the custom diff format (`+NNN content` / `-NNN content` / ` NNN content`) in a single pass. Consecutive removed lines followed by consecutive added lines are batched; when exactly one removed pairs with one added, `Diff.diffWords()` computes intra-line tokens. Changed tokens render with `bg-red-500/25` or `bg-emerald-500/25` backgrounds. Line numbers are right-aligned in a fixed-width gutter. Separator lines (like `---`) render as muted dividers.

EditCard shows a shortened file path + `:firstChangedLine` + diff summary ("+N -M lines") in the collapsed header. Expanded body shows `<DiffView>` when the diff is available. Running state with no diff yet shows an "editing…" label. When diff is missing but oldText/newText exist, falls back to a preview of old→new text. Error state shows red text.

BashCard shows `$ command` in monospace with the first 5 lines of output as a collapsed preview. Expanded body has a `bg-[#0c0c0c]` terminal container with full output in monospace. Shows a truncation warning with Warning icon when `details.truncation.truncated` is set. Error output renders in `text-red-400`.

WriteCard wraps `args.content` in a markdown code fence using the language from `getLanguageFromPath(args.path)`, then renders through `<Streamdown>` with the existing `codePlugin` and `components` — reusing all Shiki infrastructure with zero new wiring.

## Verification

- `npx tsc --noEmit -p studio/tsconfig.web.json` — zero type errors
- `npm run build -w studio` — zero build errors, all new components bundled
- `npm run test -w studio` — 34 tests pass (no regressions)
- Root `npm run test` has 1 pre-existing failure (version mismatch in e2e-smoke TTY test) unrelated to this task

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx tsc --noEmit -p studio/tsconfig.web.json` | 0 | ✅ pass | ~3.3s |
| 2 | `npm run build -w studio` | 0 | ✅ pass | ~4.2s |
| 3 | `npm run test -w studio` | 0 | ✅ pass | ~0.2s |

## Diagnostics

- **DOM inspection:** `document.querySelectorAll('[data-tool-name="edit"]')` returns EditCard instances; same for `bash` and `write`.
- **Error state inspection:** `document.querySelectorAll('[data-tool-status="error"]')` surfaces all error-state cards.
- **DiffView resilience:** Lines that don't match the `+/-/space` prefix pattern render as separators — no crash on malformed diff strings.
- **BashCard truncation:** When `block.details.truncation.truncated` is true, a yellow warning with line counts is shown.

## Deviations

None.

## Known Issues

- `shortenPath` uses a regex heuristic (`/Users|/home` prefix) since `os.homedir()` isn't available in the Electron renderer. Will fail to shorten paths on non-standard home directory configurations.

## Files Created/Modified

- `studio/src/renderer/src/components/tool-cards/DiffView.tsx` — Diff parser and renderer with line coloring and Diff.diffWords() intra-line highlighting
- `studio/src/renderer/src/components/tool-cards/EditCard.tsx` — Edit tool card with path/diff summary header, DiffView body, old→new fallback
- `studio/src/renderer/src/components/tool-cards/BashCard.tsx` — Bash tool card with terminal styling, 5-line preview, truncation warning
- `studio/src/renderer/src/components/tool-cards/WriteCard.tsx` — Write tool card with Streamdown/Shiki syntax highlighting via code fence wrapping
- `.gsd/milestones/M001-1ya5a3/slices/S04/tasks/T02-PLAN.md` — Added Observability Impact section
