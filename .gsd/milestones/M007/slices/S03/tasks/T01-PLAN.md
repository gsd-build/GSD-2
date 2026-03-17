# T01: TuiSelectPrompt Component

**Slice:** S03
**Milestone:** M007

## Goal

Build `TuiSelectPrompt` — renders a GSD arrow-key select list as a native clickable list of options. Clicking an option calculates the required arrow-key delta from the current selection, sends the arrow keystrokes + Enter to the PTY, and marks the prompt as submitted.

## Must-Haves

### Truths

- `TuiSelectPrompt` renders `prompt.options[]` as a styled list of clickable items
- Currently highlighted option (from `prompt.selectedIndex`) is visually distinct
- Clicking an option sends `\x1b[A` (arrow up) or `\x1b[B` (arrow down) the correct number of times, then `\r` (Enter) to the PTY
- After submission, the component shows the selected option as a confirmed choice (not interactive)
- Keyboard navigation works: up/down arrow keys on the component update the local selection; Enter submits

### Artifacts

- `web/components/gsd/chat-mode.tsx` — `TuiSelectPrompt` component added; wired into `ChatBubble` when `message.prompt?.kind === 'select'`

### Key Links

- `TuiSelectPrompt` props: `{ prompt: TuiPrompt; onSubmit: (data: string) => void }`
- `onSubmit` calls `ChatPane`'s `sendInput()` with the keystroke sequence
- Arrow key escape codes: up = `\x1b[A`, down = `\x1b[B`, Enter = `\r`

## Steps

1. Build `TuiSelectPrompt` component:
   - Props: `{ prompt: TuiPrompt; onSubmit: (data: string) => void }`
   - Local state: `localIndex` (starts at `prompt.selectedIndex ?? 0`)
   - Render: a styled list of option items; current `localIndex` item gets a highlighted style (e.g., accent background, checkmark indicator)
   - On option click: calculate delta = `clickedIndex - localIndex`; build keystroke string: if delta > 0, `\x1b[B`.repeat(delta); if delta < 0, `\x1b[A`.repeat(Math.abs(delta)); append `\r`; call `onSubmit(keystrokes)`, set `submitted = true`
   - On keyboard (when component or any option has focus): ArrowUp decrements `localIndex`, ArrowDown increments, Enter submits current `localIndex`
   - After submission: render as static "Selected: {option}" text, no longer interactive
2. Style the list: clean, compact option items with a subtle border, hover states, clear selected state indicator. Should feel like a native menu, not a terminal list.
3. Wire into `ChatBubble`: when `message.prompt?.kind === 'select'`, render `TuiSelectPrompt` below the message content
4. Wire `onSubmit` prop through `ChatPane`'s `sendInput` callback chain
5. Test: navigate to a GSD flow that shows a select prompt; verify clicking options sends correct keystrokes and GSD responds

## Observability Impact

### Signals Added by This Task
- **`[TuiSelectPrompt] mounted kind=select label=%s`** — logged on component mount; confirms prompt rendered.
- **`[TuiSelectPrompt] submit delta=%d keystrokes=%j`** — logged on option click; confirms delta calculation and keystroke string before sending.
- **`data-testid="tui-select-prompt"`** — DOM attribute on the select list container; allows agent to verify render via `browser_find`.
- **`data-testid="tui-prompt-submitted"`** — DOM attribute on the post-submission confirmation element; confirms component entered submitted state.
- **`data-testid="tui-select-option-{i}"`** — per-option attributes enabling targeted clicking in automated flows.

### How a Future Agent Inspects This Task
1. `window.__chatParser.getMessages()` — check if any message has `prompt.kind === 'select'`; confirms parser emitted the prompt.
2. `browser_find` with `selector="[data-testid='tui-select-prompt']"` — confirms component is in the DOM.
3. DevTools → Network → filter `/api/terminal/input` → inspect `data` field of POST body — confirms keystroke sequence sent.
4. Power Mode terminal or `window.__chatParser.getMessages()` after click — confirms GSD session advanced (new message or prompt change).

### Failure State Visibility
- Component absent from DOM despite prompt in parser → wiring gap in `ChatBubble` dispatch block.
- POST body missing or wrong — keystroke delta calculation or `onSubmit` wiring is broken.
- Component renders but `submitted` never appears → `onSubmit` is not being called through the prop chain.

