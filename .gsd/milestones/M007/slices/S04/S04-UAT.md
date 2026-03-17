# S04: Action Toolbar and Right Panel Lifecycle — UAT

**Milestone:** M007
**Written:** 2026-03-17

## UAT Type

- UAT mode: mixed (artifact-driven + live-runtime)
- Why this mode is sufficient: Build verification and code inspection confirm structural correctness (toolbar wiring, animation config, session lifecycle logic, DELETE path). Live-runtime testing confirms the animated panel, real PTY session SSE stream, and completion auto-close against a running GSD instance. Both layers are required because the completion signal path cannot be exercised without a real GSD execution.

## Preconditions

1. `npm run build:web-host` exits 0 (already confirmed — run again if needed)
2. GSD web server running at `http://localhost:3000` (`npm --prefix web run dev`)
3. A GSD workspace is available (the project running `gsd --web` must have a workspace)
4. Browser DevTools open (Network tab + Console tab)
5. Chat Mode accessible from sidebar (S02 prerequisite)

## Smoke Test

Navigate to Chat Mode. Confirm the header shows at minimum a primary action button (Play or similar). If the button renders and shows a workflow label, the toolbar is live.

---

## Test Cases

### 1. Toolbar renders with live workspace state

1. Navigate to Chat Mode (click "Chat" in sidebar)
2. In browser console, run: `document.querySelector('[data-testid="chat-mode-action-bar"]')`
3. **Expected:** Non-null element — confirms `ChatModeHeader` mounted
4. Run: `document.querySelector('[data-testid="chat-primary-action"]')?.textContent`
5. **Expected:** Shows a workflow phase label (e.g. "Start", "Next", "Stop", "Auto", or "New Milestone")
6. If workspace is not in "ready" state (e.g. still booting), observe the primary button disabled state
7. **Expected:** Button has `cursor-not-allowed opacity-50` styling when `workflowAction.disabled === true`

### 2. Phase action trigger buttons are visible when workspace is ready

1. Navigate to Chat Mode while workspace boot status is "ready"
2. Look for "Discuss" and "Plan" buttons below the main action row
3. Run: `document.querySelector('[data-testid="chat-panel-trigger-discuss"]')`
4. **Expected:** Non-null — Discuss trigger button present
5. Run: `document.querySelector('[data-testid="chat-panel-trigger-plan"]')`
6. **Expected:** Non-null — Plan trigger button present
7. If workspace is not ready (booting), verify these buttons are NOT rendered
8. **Expected:** Buttons absent during boot — row only shown when `bootStatus === "ready"` and auto is inactive

### 3. Clicking a phase trigger opens the action panel with correct styling

1. Ensure workspace is in "ready" state
2. In DevTools Network, clear the request log
3. Click the "Discuss" button
4. **Expected (panel):** A panel slides in from the right with spring animation
5. **Expected (header):** Panel header shows sky-tinted top border (`border-sky-500`) and tinted background (`bg-sky-500/10`)
6. **Expected (title):** Panel header shows "DISCUSS" label (or similar) in sky accent text
7. **Expected (console):** `[ActionPanel] open sessionId=gsd-action-<timestamp> command=/gsd`
8. **Expected (Network):** A new SSE stream request appears for the `gsd-action-<timestamp>` session ID
9. Run: `document.querySelector('[data-testid="action-panel"]')?.dataset.sessionId`
10. **Expected:** Returns the `gsd-action-<timestamp>` ID matching the console log

### 4. Main chat session remains live while panel is open

1. With action panel open (from test 3)
2. Observe the left portion of the layout (main `ChatPane`)
3. **Expected:** Main chat (session `gsd-main`) continues receiving and displaying messages; it is NOT frozen or replaced by the action panel
4. In DevTools Network: verify two SSE streams are active — one for `gsd-main`, one for `gsd-action-<timestamp>`
5. **Expected:** Both streams show as active (pending/streaming), not closed

### 5. Manual close (X button) removes panel and triggers session DELETE

1. With action panel open, click the X button in the panel header
2. Run: `document.querySelector('[data-testid="action-panel-close"]')` first to confirm button exists, then click it
3. **Expected (animation):** Panel slides out to the right (spring exit animation)
4. **Expected (layout):** Main `ChatPane` expands back to full width with CSS width transition
5. **Expected (console):** `[ActionPanel] close reason=manual sessionId=<id>`
6. **Expected (console):** `[ActionPanel] unmount cleanup sessionId=<id>` — DELETE fired
7. **Expected (Network):** A DELETE request to `/api/terminal/sessions?id=<id>` appears
8. **Expected (Network):** The SSE stream for that session ID transitions to closed/cancelled
9. Run: `document.querySelector('[data-testid="action-panel"]')`
10. **Expected:** Returns null — panel no longer in DOM

### 6. Initial command sent automatically after panel SSE connects

1. Open the action panel (click Discuss)
2. Watch the Console immediately after the panel appears
3. **Expected (console sequence):**
   - `[ChatPane] SSE connected sessionId=gsd-action-<id>`
   - `[ChatPane] initial command sent sessionId=<id> command=/gsd`
4. **Expected:** The command fires ONCE — not repeatedly on subsequent SSE keepalives
5. In the panel's chat content area, verify a response begins streaming (PTY is running `/gsd`)
6. **Expected:** Chat messages appear in the action panel's chat bubble list

### 7. Opening a second panel replaces the first (no stacking)

1. Open the Discuss panel — note its session ID from console
2. While it is open, click the Plan button
3. **Expected (console):** `[ActionPanel] close reason=replace sessionId=<old-id>`
4. **Expected (console):** `[ActionPanel] open sessionId=gsd-action-<new-timestamp> command=/gsd`
5. **Expected (Network):** Old SSE stream closes; new SSE stream opens for new session ID
6. **Expected (panel header):** Panel shows amber accent (Plan uses amber color) — different tint from Discuss (sky)
7. **Expected:** Only one panel visible at a time

### 8. Completion signal triggers auto-close (live runtime required)

1. Open the Discuss panel — `/gsd` begins running in the secondary session
2. Wait for GSD to complete its response and return to idle (the PTY session emits a CompletionSignal)
3. **Expected (console):** `[ActionPanel] completion signal received, closing in 1500ms sessionId=<id>`
4. **Expected:** Panel remains open for approximately 1.5 seconds after the signal
5. **Expected:** Panel slides out automatically after the delay
6. **Expected (console):** `[ActionPanel] unmount cleanup sessionId=<id>` — DELETE fired after exit animation
7. **Expected (Network):** SSE stream for that session closes

### 9. New Milestone dialog opens from primary toolbar

1. In Chat Mode, if workspace is in a state where "New Milestone" is the primary action (milestone === null)
2. Click the primary action button
3. **Expected:** NewMilestoneDialog modal opens
4. Press Escape to dismiss
5. **Expected:** Dialog closes; Chat Mode view unchanged

---

## Edge Cases

### Navigate away while panel is open (session cleanup backstop)

1. Open an action panel (click Discuss)
2. Note session ID from console: `[ActionPanel] open sessionId=gsd-action-<id>`
3. Click a different view in the sidebar (e.g. Dashboard) to navigate away from Chat Mode
4. **Expected:** Chat Mode unmounts, which unmounts `ActionPanel`
5. **Expected (console):** `[ActionPanel] unmount cleanup sessionId=<id>`
6. **Expected (Network):** DELETE request for the session ID
7. Navigate back to Chat Mode — verify no orphaned SSE stream for the old session ID

### Panel open when workspace is NOT ready

1. Observe the header when `bootStatus` is not "ready" (e.g. during initial boot)
2. **Expected:** The Discuss/Plan phase trigger buttons are NOT rendered (secondary row hidden)
3. Primary action button should be disabled or show boot status label

### React StrictMode double-mount (dev only)

1. In dev mode (`npm run dev`), open the action panel
2. Check console immediately after open
3. **Expected:** `[ActionPanel] unmount cleanup sessionId=<id>` fires ONCE during the initial double-mount cycle (StrictMode behavior)
4. **Expected:** A DELETE request fires during this initial cycle — this is expected and harmless in dev
5. **Expected:** The panel remains visible and functional after this initial cleanup cycle
6. This behavior does NOT occur in production builds

---

## Failure Signals

- `document.querySelector('[data-testid="chat-mode-action-bar"]')` returns null → `ChatModeHeader` not mounted; check ChatMode render, verify import
- Primary button always disabled regardless of workspace state → `deriveWorkflowAction()` wiring broken; check `useGSDWorkspaceState()` subscription
- Panel does not slide in → `AnimatePresence` or `motion.div` missing; check framer-motion import; verify `openPanel()` is called (console log)
- Panel slides in but has no accent color → `accentClasses()` returning empty strings; check color name passed in `PANEL_ACTIONS`
- `[ChatPane] initial command sent` never logged → `initialCommand` prop not received or SSE never reached `connected` state; check `ChatPaneProps`, check SSE stream in Network
- `[ActionPanel] unmount cleanup` never logged after close → unmount `useEffect` not registered; check `ActionPanel` component for the `useEffect` with empty dep array and cleanup function
- DELETE request never appears in Network after close → `fetch` inside unmount cleanup failing silently; check for `[ActionPanel] unmount session DELETE failed` in console
- Two active SSE streams for same session ID after re-open → `key={sessionId}` missing from `motion.div` wrapper; check `AnimatePresence` key prop
- Main chat stops updating while panel is open → SSE useEffect for main session disturbed; check that `actionPanelState` state changes do not reset `ChatPane` main session props

---

## Requirements Proved By This UAT

- R113 — Confirms the final piece: action toolbar renders live state, panel spawns secondary PTY session, panel auto-closes on completion, session cleanup fires without leaks. Combined with S01/S02/S03 UAT, R113 is fully validated.

## Not Proven By This UAT

- **CompletionSignal from a multi-step GSD workflow**: Test case 8 exercises the signal from a `/gsd` run; longer workflows (auto mode, multi-task runs) are not explicitly tested here. The signal path is identical regardless of workflow length.
- **Session leak under hard reload or browser close**: The unmount backstop fires on React unmount but not on hard browser close before the `fetch` completes. `sendBeacon` would close this gap but is not implemented.
- **Concurrent panel stress test**: Opening and closing panels rapidly is not tested. The functional setState updater prevents stale-closure races but concurrent replace operations are not stress-tested.
- **Completion signal timing accuracy**: The 1.5s delay is verified by reading the `setTimeout(1500)` code; actual wall-clock timing is not asserted in the UAT.

## Notes for Tester

- **Test 8 (completion auto-close) is the most important live-runtime check.** If GSD does not actually emit a CompletionSignal (e.g. because `/gsd` enters an interactive mode instead of completing), the panel will stay open. This is correct behavior — the panel only auto-closes on a real signal.
- The Discuss and Plan buttons both send `/gsd` as the initial command. Accent colors differ: Discuss = sky (blue), Plan = amber (yellow). Visually confirm the tint matches.
- In dev mode, ignore the first `[ActionPanel] unmount cleanup` log that fires immediately after opening — that is React StrictMode's intentional double-mount. The second open (the real panel) will not log an immediate cleanup.
- DevTools Network filter: use the session ID from the console log as the filter string to isolate that session's SSE stream.
