# S04: Action Toolbar and Right Panel Lifecycle

**Goal:** Add the GSD workflow action toolbar to Chat Mode and implement the right-panel lifecycle — a secondary `ChatPane` that spawns on action button click and auto-closes when the GSD action completes.

**Demo:** In Chat Mode, a toolbar shows state-aware workflow buttons. Clicking "Plan" (or equivalent) opens a right-panel chat with a distinct tinted header. The panel runs in a fresh PTY session. When GSD returns to idle (completion signal), the panel animates closed ~1.5s later. The main chat stays live throughout. No orphaned sessions.

## Must-Haves

- `ChatModeHeader` toolbar present with primary + secondary workflow action buttons matching `deriveWorkflowAction()` output
- Buttons disabled when `workflowAction.disabled === true`; primary button shows Loader2 when command in flight
- New Milestone button opens `NewMilestoneDialog` (reuse from dual-terminal.tsx)
- Clicking an action opens `ActionPanel` with a fresh secondary PTY session
- `ActionPanel` has distinct visual treatment: tinted header border using `accentColor`, action label as title, X close button
- `initialCommand` sent to secondary PTY session automatically after SSE connects
- `CompletionSignal` from `ChatPane`'s parser triggers panel close after 1500ms delay
- Manual X close works at any time
- Only one panel open at a time; opening a new one replaces the current
- Panel open/close uses `AnimatePresence` + `motion.div` with slide-in from right
- On panel close: secondary PTY session DELETEd via `/api/terminal/sessions`
- `npm run build:web-host` exits 0; no session leaks verified

## Proof Level

- This slice proves: integration — action button click → panel opens → command runs in secondary session → completion detected → panel auto-closes → session cleaned up
- Real runtime required: yes — must verify panel lifecycle end-to-end against a running GSD instance
- Human/UAT required: yes — visual inspection of animation and panel styling

## Verification

- `npm run build:web-host` exits 0
- Manual: click an action button; verify right panel slides in with correct label and accent color; verify secondary PTY session appears in DevTools Network (SSE stream for new session ID)
- Manual: let GSD action complete; verify panel auto-closes ~1.5s after completion; verify DevTools shows no ongoing SSE stream for that session ID
- Manual: open panel, click X mid-action; verify panel closes and session is deleted

## Observability / Diagnostics

- Runtime signals: `ActionPanel` logs panel open (sessionId, command) and close (reason: completion/manual/replace) — allows diagnosing session leaks
- Inspection surfaces: DevTools Network tab — active SSE streams reveal live sessions; `/api/terminal/sessions` list endpoint (if available) shows session inventory
- Failure visibility: if session DELETE fails (network error), log the error with sessionId for manual cleanup
- Redaction constraints: none — session IDs are not sensitive

## Integration Closure

- Upstream surfaces consumed: `ChatPane` from S02 (main component for action panel content); `TuiPrompt` intercept components from S03 (active inside panel); `CompletionSignal` from `PtyChatParser` via `ChatPane.onCompletionSignal` prop; `deriveWorkflowAction()` from `web/lib/workflow-actions.ts`; `useGSDWorkspaceState()` + `useGSDWorkspaceActions()` + `buildPromptCommand()` from `web/lib/gsd-workspace-store.tsx`; `NewMilestoneDialog` from `web/components/gsd/new-milestone-dialog.tsx`
- New wiring introduced: `ChatModeHeader` replaces the placeholder header in `ChatMode`; `ActionPanel` + `AnimatePresence` wired into `ChatMode` layout; `openPanel` / `closePanel` state management in `ChatMode`
- What remains before the milestone is truly usable end-to-end: nothing — this slice completes the milestone

## Tasks

- [x] **T01: Action toolbar** `est:1h`
  - Why: Without the toolbar, Chat Mode has no way to drive GSD workflow actions
  - Files: `web/components/gsd/chat-mode.tsx`, `web/components/gsd/new-milestone-dialog.tsx` (import only)
  - Do: (1) Read `web/components/gsd/dual-terminal.tsx` header section — copy the workflow action bar logic exactly. (2) Build `ChatModeHeader` with props `{ onPrimaryAction: (cmd: string) => void; onSecondaryAction: (cmd: string) => void; onNewMilestone: () => void; onOpenPanel: (cfg: ActionPanelConfig) => void }`. (3) Inside: call `useGSDWorkspaceState()`, derive `workflowAction` via `deriveWorkflowAction({...})`, render primary button (Loader2 when in-flight, Milestone for new-milestone, Play otherwise) and secondary buttons. (4) Wire `isNewMilestone ? onNewMilestone() : onPrimaryAction(cmd)` for primary; `onSecondaryAction(cmd)` for secondaries. (5) Add a second row of "phase action" buttons below the workflow row — these open panels: `{ label: "Discuss", command: "/gsd", accentColor: "sky" }`, `{ label: "Plan", command: "/gsd", accentColor: "amber" }`. Render only when workspace is ready and auto is not active. (6) Replace the placeholder header in `ChatMode` with `ChatModeHeader`; add `NewMilestoneDialog` state; wire all callbacks through `sendCommand(buildPromptCommand(cmd, bridge))`.
  - Verify: verify primary button reflects workspace state (disabled when not ready, Stop when auto active); click a secondary phase button; verify `onOpenPanel` is called with correct config
  - Done when: toolbar renders state-aware buttons, workflow actions dispatch to PTY via sendCommand, New Milestone dialog opens correctly

- [ ] **T02: ActionPanel component and layout split** `est:1.5h`
  - Why: The panel itself — with distinct styling, ChatPane inside, and X close button
  - Files: `web/components/gsd/chat-mode.tsx`
  - Do: (1) Define `ActionPanelConfig: { label: string; command: string; sessionId: string; accentColor: string }`. (2) Add `actionPanelState: ActionPanelConfig | null` to `ChatMode`. (3) Build `ActionPanel` with props `{ config: ActionPanelConfig; onClose: () => void }`: tinted top-border using `config.accentColor` (e.g., `border-t-2 border-sky-500`); action label as title in header; X close button calls `onClose()`; full-height `ChatPane` with `sessionId={config.sessionId}` + `command="pi"` + `onCompletionSignal={() => scheduleClose()}` (1500ms timeout). (4) `scheduleClose`: `setTimeout(() => onClose(), 1500)`. (5) Layout: when `actionPanelState !== null`, split the main content area with flexbox — main `ChatPane` at 60% width, `ActionPanel` at 40%. Add a subtle vertical divider. (6) Wrap with `AnimatePresence`; animate: `initial={{ x: "100%", opacity: 0 }}`, `animate={{ x: 0, opacity: 1 }}`, `exit={{ x: "100%", opacity: 0 }}`, `transition={{ type: "spring", stiffness: 300, damping: 30 }}`.
  - Verify: click a panel-triggering button; verify panel slides in from right with correct label and tinted border; verify main pane still shows chat; verify X button closes with animation
  - Done when: panel renders with correct styling, animation works, main pane remains visible alongside

- [ ] **T03: Panel session lifecycle and cleanup** `est:1h`
  - Why: Without session cleanup, every panel open leaks a PTY session
  - Files: `web/components/gsd/chat-mode.tsx`, `web/app/api/terminal/sessions/route.ts` (verify DELETE exists)
  - Do: (1) Read `web/app/api/terminal/sessions/route.ts` — verify DELETE handler exists; if missing, add it (mirror the DELETE pattern from `web/components/gsd/shell-terminal.tsx` `closeTab` function). (2) Implement `openPanel(cfg)` in `ChatMode`: if panel already open capture old `sessionId`, close first (set state to null), wait 350ms for exit animation, then set new `actionPanelState`. Generate `sessionId = "gsd-action-" + Date.now()`. (3) Implement `closePanel()`: capture `sessionId` from current state, set `actionPanelState = null`; after 350ms DELETE session: `fetch("/api/terminal/sessions?id=${sessionId}", { method: "DELETE" })`. (4) Add `useEffect` cleanup in `ActionPanel` itself: on unmount, DELETE the session as a backstop (prevents leaks if React unmounts without `closePanel` being called — e.g., navigating away from Chat Mode). (5) Test replace behavior: open panel, click a different action — verify old session deleted, new panel opens.
  - Verify: open panel, close it, check DevTools Network — no active SSE stream for the closed session ID; verify `fetch DELETE` request appears in Network tab; navigate away from Chat Mode while panel is open — verify session still gets cleaned up
  - Done when: every panel close (manual, auto, replace, navigation) results in session DELETE, no orphaned SSE streams

## Files Likely Touched

- `web/components/gsd/chat-mode.tsx`
- `web/app/api/terminal/sessions/route.ts` (verify/add DELETE)
