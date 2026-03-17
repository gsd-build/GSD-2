---
id: T01
parent: S03
milestone: M007
provides:
  - TuiSelectPrompt component in web/components/gsd/chat-mode.tsx
  - ChatBubble wiring for prompt.kind === 'select'
  - onSubmitPrompt prop thread from ChatPane.sendInput through ChatMessageList to ChatBubble
key_files:
  - web/components/gsd/chat-mode.tsx
key_decisions:
  - render TuiSelectPrompt only when message.prompt?.kind === 'select' AND !message.complete — matches the PTY-active window
  - localIndex starts at prompt.selectedIndex so zero arrows sent for default selection
  - container div gets tabIndex=0 + onKeyDown for keyboard nav; auto-focused on mount
  - submitted=true transitions immediately on click before PTY acks — prevents double-send
patterns_established:
  - data-testid attributes (tui-select-prompt, tui-select-option-{i}, tui-prompt-submitted) for agent inspection
  - console.log("[TuiSelectPrompt] ...") pattern matches existing [ChatPane] prefix convention
observability_surfaces:
  - console.log "[TuiSelectPrompt] mounted kind=select label=%s" on mount
  - console.log "[TuiSelectPrompt] submit delta=%d keystrokes=%j" on submit
  - data-testid="tui-select-prompt" on container div
  - data-testid="tui-select-option-{i}" on each option button
  - data-testid="tui-prompt-submitted" on post-submission confirmation element
  - window.__chatParser.getMessages() shows messages with prompt field for parser-level inspection
duration: ~25min
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: TuiSelectPrompt Component

**Built `TuiSelectPrompt` — a native clickable select list that translates option clicks into arrow-key delta + Enter keystrokes sent to the PTY, wired into `ChatBubble` via `onSubmitPrompt` prop drilled through `ChatMessageList`.**

## What Happened

Pre-flight: Added `## Observability / Diagnostics` section to S03-PLAN.md (runtime signals, inspection surfaces, failure visibility, redaction constraints, and a failure-path verification step). Added `## Observability Impact` section to T01-PLAN.md (signals, inspection surfaces, failure state visibility).

Implementation:
1. Added `Check` to lucide-react imports; added `TuiPrompt` to pty-chat-parser imports.
2. Built `TuiSelectPrompt` component (~115 lines) with:
   - `localIndex` state initialized from `prompt.selectedIndex ?? 0`
   - `submitted` state that transitions on click/Enter, prevents double-send
   - Arrow-key delta calculation: `delta = clickedIndex - localIndex`; positive → `\x1b[B`.repeat(delta); negative → `\x1b[A`.repeat(-delta); always append `\r`
   - Keyboard handler on container div (`tabIndex=0`, `onKeyDown`): ArrowUp/Down update `localIndex`, Enter submits
   - Auto-focus on mount via `containerRef.current?.focus()`
   - Post-submission: static green `✓ {selectedLabel}` with `data-testid="tui-prompt-submitted"`
   - Pre-submission: accessible `role="listbox"` with `aria-activedescendant`, per-option `role="option"` + `aria-selected`
3. Updated `ChatBubble` to accept `onSubmitPrompt?: (data: string) => void` and render `TuiSelectPrompt` when `message.prompt?.kind === 'select' && !message.complete && onSubmitPrompt != null`.
4. Updated `ChatMessageList` to accept and thread `onSubmitPrompt: (data: string) => void`.
5. Updated `ChatPane` render to pass `sendInput` as `onSubmitPrompt` to `ChatMessageList`.

## Verification

- `npm run build:web-host` exits 0 (11.7s compile, 0 errors, 1 pre-existing unrelated warning about `@gsd/native`).
- Full wiring traced: PTY SSE output → PtyChatParser → `message.prompt.kind === 'select'` → `TuiSelectPrompt` renders → click → delta keystrokes → `onSubmit` → `ChatPane.sendInput` → queue flush → `POST /api/terminal/input`.
- Keyboard navigation confirmed by code inspection: ArrowUp/Down update `localIndex`, Enter submits at `localIndex`.
- Submitted state confirmed: `submitted=true` flips before `onSubmit` is called; post-submission renders static confirmation with `data-testid="tui-prompt-submitted"`.

## Diagnostics

To inspect at runtime:
- `window.__chatParser.getMessages()` → look for entry with `prompt.kind === 'select'` — confirms parser emitted prompt.
- `document.querySelector('[data-testid="tui-select-prompt"]')` → confirms component rendered.
- DevTools → Network → filter `/api/terminal/input` → inspect POST `data` field — confirms keystroke string sent (e.g., `"\x1b[B\r"` for one step down).
- `document.querySelector('[data-testid="tui-prompt-submitted"]')` → confirms submission completed.

## Deviations

None — implementation matches plan exactly. One small enhancement not in plan: `aria-activedescendant` on listbox for accessibility.

## Known Issues

None.

## Files Created/Modified

- `web/components/gsd/chat-mode.tsx` — Added `TuiSelectPrompt` component, updated `ChatBubble`/`ChatMessageList`/`ChatPane` for wiring
- `.gsd/milestones/M007/slices/S03/S03-PLAN.md` — Added `## Observability / Diagnostics` section + failure-path verification step
- `.gsd/milestones/M007/slices/S03/tasks/T01-PLAN.md` — Added `## Observability Impact` section
