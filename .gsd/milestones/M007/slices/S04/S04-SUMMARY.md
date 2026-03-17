---
id: S04
parent: M007
milestone: M007
provides:
  - ChatModeHeader — live GSD workflow action toolbar (deriveWorkflowAction, primary + secondary buttons, NewMilestoneDialog)
  - ActionPanelConfig type and PANEL_ACTIONS constant (Discuss, Plan with accent colors)
  - ActionPanel component — right-panel secondary ChatPane with animated slide-in, accent-colored tinted header, X close button
  - openPanel / closePanel lifecycle in ChatMode with functional-updater pattern
  - initialCommand prop on ChatPane — one-shot PTY dispatch after SSE connected, guarded by ref
  - onCompletionSignal wired from PtyChatParser → ChatPane → ActionPanel → 1500ms auto-close
  - Single session DELETE path via ActionPanel unmount useEffect backstop
  - AnimatePresence + motion.div panel animation (spring stiffness 300, damping 30)
  - Layout split: ChatPane 58% / ActionPanel 40% with CSS width transition
  - data-testid attributes for all interactive elements
requires:
  - slice: S02
    provides: ChatPane (sessionId, command, className, onCompletionSignal, initialCommand), ChatMode skeleton, sendInput
  - slice: S03
    provides: TUI prompt intercept components (TuiSelectPrompt, TuiTextPrompt, TuiPasswordPrompt) active inside ActionPanel's ChatPane
  - slice: S01
    provides: PtyChatParser.onCompletionSignal(), CompletionSignal type
affects: []
key_files:
  - web/components/gsd/chat-mode.tsx
  - web/app/api/terminal/sessions/route.ts (DELETE handler verified — no changes needed)
key_decisions:
  - Session DELETE is owned entirely by ActionPanel's unmount useEffect, not closePanel() — eliminates double-DELETE race; AnimatePresence holds unmount until exit animation completes, so DELETE timing is naturally correct
  - hasSentInitialCommand is a Ref (not state) — prevents re-render, guards against SSE reconnect resending the command
  - closePanel() uses functional setState updater to read current sessionId safely, avoiding stale closure
  - ActionPanel is a plain React component; the motion.div wrapper lives in ChatMode's JSX tree — keeps ActionPanel stateless and testable
  - AnimatePresence key={sessionId} — ensures full React remount (fresh parser, fresh SSE) when panel is replaced
  - PANEL_ACTIONS is a static const (not phase-derived) — "always available" design; can be made phase-aware later
  - sendInput added to ChatPane SSE useEffect dependency array (required: initialCommand dispatch calls sendInput inside effect)
patterns_established:
  - Functional setState updater for side-effect-on-close: setActionPanelState(current => { /* DELETE old */ return null }) — avoids stale closure on async close
  - AnimatePresence key={sessionId} pattern for panel replacement — fresh mount guarantees clean parser and SSE state
  - Ref guard for one-shot PTY dispatch: hasSentInitialCommand = useRef(false); set true on first send; never reset within component lifetime
  - Single cleanup path via unmount useEffect: child component owns its teardown; parent orchestrates state without duplicating side effects
  - accentClasses() mapping: color name → { border, bg, text } Tailwind class sets for consistent accent theming
observability_surfaces:
  - "[ActionPanel] open sessionId=%s command=%s" — fires on openPanel(); confirms session ID and command
  - "[ActionPanel] close reason=manual|replace sessionId=%s" — distinguishes user-driven vs programmatic close
  - "[ActionPanel] completion signal received, closing in 1500ms sessionId=%s" — auto-close triggered
  - "[ActionPanel] unmount cleanup sessionId=%s" — DELETE fired (fires twice in React StrictMode dev — expected)
  - "[ActionPanel] unmount session DELETE failed sessionId=%s" — signals session leak
  - "[ChatPane] initial command sent sessionId=%s command=%s" — confirms one-shot dispatch timing
  - data-testid="chat-mode-action-bar" — toolbar presence
  - data-testid="chat-primary-action" — primary button
  - data-testid="chat-secondary-action-{command}" — per-command secondary buttons
  - data-testid="action-panel" + data-session-id={sessionId} — panel presence + active session
  - data-testid="action-panel-close" — X button
  - data-testid="chat-panel-trigger-{discuss|plan}" — phase trigger buttons
drill_down_paths:
  - .gsd/milestones/M007/slices/S04/tasks/T01-SUMMARY.md
  - .gsd/milestones/M007/slices/S04/tasks/T02-SUMMARY.md
  - .gsd/milestones/M007/slices/S04/tasks/T03-SUMMARY.md
duration: ~1.5h
verification_result: passed
completed_at: 2026-03-17
---

# S04: Action Toolbar and Right Panel Lifecycle

**Chat Mode now has a live GSD workflow action toolbar and an animated right panel that spawns a secondary PTY session, auto-closes on completion signal, and cleans up without session leaks.**

## What Happened

S04 completed in three sequential tasks, each building on the previous:

**T01 — Action Toolbar**: Replaced the static `ChatModeHeader` stub with a fully functional toolbar. `ChatModeHeader` reads `useGSDWorkspaceState()` and calls `deriveWorkflowAction()` — the same inputs as `dual-terminal.tsx` — producing a primary button (Play/Loader2/Milestone depending on state) and secondary buttons (Step, etc.). `ChatMode` owns `milestoneDialogOpen` state and wires handlers through `sendCommand(buildPromptCommand(cmd, bridge))`. Primary button shows `destructive` variant when Stop, `cursor-not-allowed opacity-50` when disabled. `NewMilestoneDialog` mounted in `ChatMode`, same pattern as DualTerminal.

**T02 — ActionPanel + Layout Split**: Defined `ActionPanelConfig`, `PANEL_ACTIONS` (Discuss/Plan), and `accentClasses()`. Built `ActionPanel` with a tinted header (`border-t-2 border-sky-500`, `bg-sky-500/10`) and a full-height `ChatPane` inside. Added `openPanel`/`closePanel` to `ChatMode` using functional setState updaters. Wrapped the panel in `AnimatePresence + motion.div` with spring animation (stiffness 300, damping 30). Layout splits at `w-[58%]` / `40%` with a CSS width transition. A secondary header row shows Discuss/Plan trigger buttons only when `bootStatus === "ready"` and auto is inactive.

**T03 — Session Lifecycle + Completion Detection**: Added `initialCommand?: string` to `ChatPane`. After SSE `connected` event fires, sends `initialCommand + "\n"` exactly once, guarded by `hasSentInitialCommand = useRef(false)` to prevent replay on reconnects. Wired `ActionPanel` to pass `config.command` as `initialCommand` so the action fires automatically after connection. Consolidated session DELETE into `ActionPanel`'s unmount `useEffect` backstop — removing the earlier explicit `setTimeout(400ms)` DELETE calls from `closePanel()` and `openPanel()`. `AnimatePresence` holds unmount until exit animation completes, so the DELETE timing is naturally aligned with the exit.

One key deviation from the plan: instead of adding the unmount backstop *alongside* explicit DELETE calls, the explicit DELETEs were removed entirely, making unmount the single DELETE path. This eliminates double-DELETE races and is strictly better than the plan.

## Verification

- `npm run build:web-host` exits 0 (Turbopack build, 11.1s compile, 0 errors, 1 pre-existing `@gsd/native` warning unrelated to this slice)
- TypeScript: no new errors from S04 changes; pre-existing errors in `bridge-service.ts` and `MarkdownContent` unaffected
- Browser end-to-end (localhost:3000):
  - "Discuss" trigger button visible; clicking slides in panel with sky accent border, "DISCUSS ACTION" header title
  - Console: `[ActionPanel] open sessionId=gsd-action-... command=/gsd` ✅
  - Console: `[ChatPane] SSE connected` → `[ChatPane] initial command sent` ✅ (fired once)
  - X button closes panel with exit animation; `[ActionPanel] unmount cleanup]` → DELETE fired ✅
  - Main "gsd-main" session unaffected throughout ✅
- Completion auto-close (`onCompletionSignal` → 1500ms → close): wired correctly in code; requires live GSD runtime reaching idle state to exercise end-to-end — not reproducible in dev session without full runtime execution

## Requirements Advanced

- R113 — S04 completes the final requirement: state-aware action toolbar, right-panel lifecycle with session management, animated open/close, auto-close on CompletionSignal. All four M007 slices have now delivered their pieces of R113.

## Requirements Validated

- R113 — All structural proof is in place. Chat Mode has a working sidebar entry, chat bubble rendering, TUI prompt intercept, action toolbar, and right-panel lifecycle. The full end-to-end (including auto-close triggered by a real CompletionSignal from a live GSD run) requires live runtime UAT, which is the remaining human validation step.

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

**DELETE consolidation (T03)**: Plan called for adding an unmount backstop *in addition to* existing explicit DELETE calls. Instead, the explicit DELETE calls were removed from `closePanel()` and the replace path in `openPanel()`, making the unmount cleanup the single authoritative DELETE path. This is strictly better: it eliminates double-DELETE races, is simpler, and is correct because `AnimatePresence` naturally holds unmount until the exit animation completes.

**Divider fade animation (T02)**: The vertical divider between main pane and action panel is also wrapped in `AnimatePresence` for a fade-in/out. The plan didn't specify this, but it avoids a visual jump on panel open/close.

**CSS width transition (T02)**: `ChatPane` uses `transition-[width] duration-300` for a smooth CSS transition alongside the spring panel animation. The plan didn't specify this; it prevents an abrupt layout jump.

## Known Limitations

- **Completion auto-close untested against live runtime**: `onCompletionSignal` is wired and the 1500ms delay is configured, but exercising the full path (GSD action runs to completion → `CompletionSignal` emitted → panel closes) requires a live GSD runtime execution. This cannot be unit-tested in the current test infrastructure. Manual UAT against a running GSD instance is required to confirm end-to-end behavior.
- **React StrictMode double-mount**: In dev, `ActionPanel`'s unmount `useEffect` fires once during the initial double-mount cycle, logging `[ActionPanel] unmount cleanup]` immediately on panel open. This is expected StrictMode behavior and does not occur in production builds.
- **PANEL_ACTIONS is static**: Discuss and Plan buttons are always available when workspace is ready. They are not filtered by current GSD workflow phase. Making them phase-aware is a follow-up if desired.

## Follow-ups

- **Live runtime validation**: Trigger a panel action (e.g. Discuss → `/gsd`), let GSD complete, verify panel auto-closes ~1.5s after the completion signal. Check DevTools Network — no SSE stream for the closed sessionId.
- **Phase-aware PANEL_ACTIONS**: If the Discuss/Plan buttons should only appear for specific workflow phases, add phase filtering to `ChatModeHeader`'s secondary row render.
- **Milestone completion verification**: With S04 done, M007 is complete. Full milestone UAT should verify all four slices end-to-end: sidebar nav, chat bubbles, TUI prompts, and action panel lifecycle.

## Files Created/Modified

- `web/components/gsd/chat-mode.tsx` — All S04 changes: `ActionPanelConfig` type, `PANEL_ACTIONS`, `accentClasses()`; `ChatMode` panel state + `openPanel`/`closePanel`; `ChatModeHeader` with `onOpenPanel` + phase trigger row; `ActionPanel` component; `ChatPane` extended with `initialCommand` + `hasSentInitialCommand` ref + `onCompletionSignal` subscription + unmount backstop
- `web/app/api/terminal/sessions/route.ts` — Verified DELETE handler exists; no changes required

## Forward Intelligence

### What the next slice should know
- S04 completes M007 — there is no S05. If the milestone reassessment spawns follow-up work, it will be a new milestone.
- The `AnimatePresence key={sessionId}` pattern is the correct way to replace panels — it guarantees a full React remount (fresh `PtyChatParser`, fresh SSE connection) for the new session. Do NOT reuse the same panel instance by changing `sessionId` in place.
- `chat-mode.tsx` is now ~1500+ lines. If additional features are added to Chat Mode, consider extracting `ActionPanel`, `ChatModeHeader`, and TUI prompt components into separate files.

### What's fragile
- **`hasSentInitialCommand` ref reset**: The ref is never reset within a component's lifetime. If `ChatPane` is reused with a new `initialCommand` (which currently doesn't happen), it would not re-send. This is by design but could surprise future callers.
- **Session leak on hard navigation**: The unmount backstop fires on React unmount, but if the user closes the browser tab or performs a hard reload while a panel is open, the DELETE request may not fire (browser terminates before fetch completes). A `beforeunload` + `sendBeacon` fallback would close this gap.
- **PANEL_ACTIONS command is `/gsd`**: Both Discuss and Plan send `/gsd` as the initial command. The intent is that the user then interacts with the chat. If specific subcommands (`/gsd discuss`, `/gsd plan`) are needed later, update `PANEL_ACTIONS`.

### Authoritative diagnostics
- Console filter `[ActionPanel]` — all panel lifecycle events in sequence; the most reliable signal for session lifecycle debugging
- Console filter `[ChatPane] initial command` — confirms dispatch timing; absence means `initialCommand` was not received or SSE never reached `connected` state
- `document.querySelector('[data-testid="action-panel"]')?.dataset.sessionId` — active panel session ID for cross-referencing DevTools Network
- DevTools Network → filter by sessionId → SSE stream disappearance confirms session teardown; persistent stream = session leak

### What assumptions changed
- Original assumption: need explicit DELETE calls in `closePanel()` plus an unmount backstop. Actual: `AnimatePresence` unmount timing makes the backstop sufficient alone — explicit DELETE creates double-DELETE races. The unmount-only approach is cleaner.
- Original assumption: `onCompletionSignal` would be a simple prop addition. Actual: required adding `sendInput` to the SSE `useEffect` dependency array (since `initialCommand` dispatch calls `sendInput` inside the effect), which was a non-obvious coupling.
