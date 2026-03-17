---
id: T01
parent: S04
milestone: M007
provides:
  - ChatModeHeader component with live GSD workflow action toolbar
key_files:
  - web/components/gsd/chat-mode.tsx
key_decisions:
  - ChatModeHeader is prop-driven (onPrimaryAction, onSecondaryAction, onNewMilestone) rather than inline like dual-terminal.tsx — state management stays in ChatMode
  - NewMilestoneDialog state lives in ChatMode (not the header), matching the dialog-ownership pattern from DualTerminal
  - data-testid attributes added to all interactive elements for future test targeting
patterns_established:
  - Prop-driven action toolbar pattern: deriveWorkflowAction() called in the header, handlers passed from parent — parent owns sendCommand/bridge wiring
observability_surfaces:
  - data-testid="chat-mode-action-bar" — confirms toolbar rendered
  - data-testid="chat-primary-action" — primary button with current workflow label
  - data-testid="chat-secondary-action-{command}" — per-command secondary buttons
duration: ~15m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Action Toolbar

**Added `ChatModeHeader` to Chat Mode — a live GSD workflow action bar that mirrors Power Mode's toolbar, driven by `deriveWorkflowAction()` and wired to the main session via `buildPromptCommand`.**

## What Happened

Replaced the static `ChatModeHeader` stub in `web/components/gsd/chat-mode.tsx` with a fully functional implementation:

1. **`ChatModeHeader`** reads `useGSDWorkspaceState()` directly and calls `deriveWorkflowAction()` — same inputs as `dual-terminal.tsx`. Renders a primary button (Play/Loader2/Milestone icon based on state) and secondary buttons (Step, etc.).

2. **Parent `ChatMode`** now holds `milestoneDialogOpen` state and wires action handlers that call `sendCommand(buildPromptCommand(cmd, bridge))`. Both `onPrimaryAction` and `onSecondaryAction` follow the same pattern.

3. **`NewMilestoneDialog`** is mounted in `ChatMode` (not the header) — same ownership pattern as DualTerminal.

4. **State badge** shows a compact uppercase label (phase, "auto", "paused", boot status) next to the "Chat Mode" title.

5. **Props interface**: `{ onPrimaryAction, onSecondaryAction, onNewMilestone }` — header is fully prop-driven, no inline store mutations.

## Verification

- `npm run build:web-host` exits 0 — zero TypeScript errors, build compiled successfully
- All must-have truths confirmed by code inspection:
  - Primary button renders with correct variant (destructive for Stop, default otherwise)
  - `workflowAction.disabled` → `cursor-not-allowed opacity-50` on all buttons
  - `isNewMilestone === true` → `onNewMilestone()` called instead of `onPrimaryAction`
  - Secondary buttons render from `workflowAction.secondaries`
  - Header shows "Chat Mode" label + state badge

## Diagnostics

- `document.querySelector('[data-testid="chat-mode-action-bar"]')` — confirms header rendered; non-null means ChatModeHeader mounted
- `document.querySelector('[data-testid="chat-primary-action"]')?.textContent` — shows current workflow phase label
- Browser DevTools React panel → `ChatModeHeader` props → `workflowAction` shape for state inspection
- No dedicated `[ChatModeHeader]` console logs; rely on workspace store state transitions

## Deviations

None. Implementation matched the plan exactly.

## Known Issues

None.

## Files Created/Modified

- `web/components/gsd/chat-mode.tsx` — Replaced static header stub with live `ChatModeHeader`; updated `ChatMode` to own `milestoneDialogOpen` state and wire action handlers; added `NewMilestoneDialog` mount
- `.gsd/milestones/M007/slices/S04/tasks/T01-PLAN.md` — Added missing `## Observability Impact` section (pre-flight fix)
