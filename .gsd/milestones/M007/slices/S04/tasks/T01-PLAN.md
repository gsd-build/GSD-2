# T01: Action Toolbar

**Slice:** S04
**Milestone:** M007

## Goal

Build `ChatModeHeader` — the header bar for Chat Mode containing the view title, GSD workflow action buttons, and the New Milestone dialog trigger. Buttons derive from `deriveWorkflowAction()` and reflect live workspace state.

## Must-Haves

### Truths

- `ChatModeHeader` renders a primary action button and secondary action buttons matching Power Mode's toolbar
- Button labels, variants (default/destructive), and disabled states match `deriveWorkflowAction()` output
- When `isNewMilestone === true`, the primary button opens `NewMilestoneDialog` instead of sending a command
- Buttons are disabled when `workflowAction.disabled === true`
- The header shows "Chat Mode" label and a subtitle or badge indicating current GSD state

### Artifacts

- `web/components/gsd/chat-mode.tsx` — `ChatModeHeader` component added
- `web/components/gsd/new-milestone-dialog.tsx` — imported (not modified)

### Key Links

- `ChatModeHeader` uses `useGSDWorkspaceState()` and `useGSDWorkspaceActions()` from `gsd-workspace-store`
- `deriveWorkflowAction()` from `@/lib/workflow-actions`
- `buildPromptCommand()` from `@/lib/gsd-workspace-store`
- Primary action sends command via `sendCommand(buildPromptCommand(command, bridge))`

## Steps

1. Read `web/components/gsd/dual-terminal.tsx` header section to understand the exact action bar pattern to mirror
2. Build `ChatModeHeader` component:
   - Use `useGSDWorkspaceState()` to get `state.boot`, `state.commandInFlight`, `state.bootStatus`
   - Derive `workflowAction` using `deriveWorkflowAction({...})`
   - Render primary button: label, icon (Play for start actions, Loader2 spinning when in-flight, Milestone for new milestone), destructive variant for Stop
   - Render secondary buttons (workflowAction.secondaries)
   - Wire primary button: if `isNewMilestone`, open `NewMilestoneDialog`; else call `onPrimaryAction(command)` prop
   - Wire secondary buttons: call `onSecondaryAction(command)` prop
3. Props interface: `{ onPrimaryAction: (command: string) => void; onSecondaryAction: (command: string) => void; onNewMilestone: () => void }`
4. Add `NewMilestoneDialog` state in the parent `ChatMode` component; pass `onNewMilestone` callback to header
5. Style: same visual density as Power Mode toolbar but feels at home in the chat interface. Clean button row in a card-style header bar.
6. Wire into `ChatMode`: pass `sendCommand(buildPromptCommand(cmd, bridge))` as `onPrimaryAction` and `onSecondaryAction`

## Context

- This is a direct mirror of Power Mode's action bar, adapted to be a prop-driven component rather than inline. The logic should be nearly identical — the difference is that the chat version passes actions up rather than handling them inline.
- The action buttons in the header affect the MAIN GSD session (not a side panel). The side panel is opened separately in T02.
- For S04, the secondary "action button" that opens a right panel is a separate concept from these workflow buttons. The workflow buttons (Auto, Stop, Step) operate on the main session. A separate set of "action" buttons (Discuss, Plan, etc.) will open panels — but that's T02/T03. For T01, just mirror the workflow action bar.

## Observability Impact

### Signals that change

- `ChatModeHeader` renders with `data-testid="chat-mode-action-bar"` — inspectable in DevTools / tests to verify the toolbar is mounted
- Primary button carries `data-testid="chat-primary-action"` and reflects the current `workflowAction.primary.label`
- Secondary buttons carry `data-testid="chat-secondary-action-{command}"` for per-action targeting
- `NewMilestoneDialog` open/close state is local (`milestoneDialogOpen`) — toggled by the primary button when `isNewMilestone === true`

### How a future agent inspects this

1. **React DevTools**: inspect `ChatModeHeader` props/state — `workflowAction` shape, `milestoneDialogOpen`
2. **DOM**: `document.querySelector('[data-testid="chat-mode-action-bar"]')` confirms the header rendered; button text confirms label matches workspace phase
3. **Browser console**: no dedicated `ChatModeHeader` log; rely on `useGSDWorkspaceState` store logs for state transitions
4. **Build**: `npm run build:web-host` verifying 0 TypeScript errors is the primary correctness gate

### Failure visibility

- If `deriveWorkflowAction` returns `primary: null` (e.g., project setup pending), the primary button is absent — header shows title only
- If `buildPromptCommand` throws (non-serializable command), the error surfaces in the browser console and the click handler silently fails — action bar stays enabled but nothing sends
- Disabled state (`workflowAction.disabled === true`) is visible via `opacity-50` + `cursor-not-allowed` on all buttons
