---
id: T02
parent: S05
milestone: M008
provides:
  - useTerminalFontSize() hook for localStorage-persisted terminal font size
  - TerminalSizePanel settings panel with preset size buttons
  - fontSize prop on ShellTerminal for external control
key_files:
  - web/lib/use-terminal-font-size.ts
  - web/components/gsd/settings-panels.tsx
  - web/components/gsd/shell-terminal.tsx
  - web/components/gsd/dual-terminal.tsx
  - web/components/gsd/chat-mode.tsx
  - web/components/gsd/command-surface.tsx
key_decisions:
  - Used custom event `terminal-font-size-changed` for same-tab cross-component sync, plus native storage events for cross-tab sync
  - Font size clamped to 8–24 range with validation on read from localStorage
  - Preview text in TerminalSizePanel renders with selected font size for immediate visual feedback
patterns_established:
  - localStorage + custom event pattern for cross-component preference sync (mirrors sidebar collapsed state pattern)
observability_surfaces:
  - localStorage key `gsd-terminal-font-size` — single source of truth for persisted value
  - Window event `terminal-font-size-changed` — fires on every local change
  - data-testid `settings-terminal-size` on the panel wrapper
duration: 15m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T02: Add terminal text size preference with settings panel

**Added `useTerminalFontSize()` hook, `TerminalSizePanel` in settings, and threaded fontSize through DualTerminal and chat mode — footer terminal explicitly excluded.**

## What Happened

1. Created `web/lib/use-terminal-font-size.ts` — a `useTerminalFontSize()` hook that reads/writes `gsd-terminal-font-size` from localStorage with default 13. Syncs across tabs via `storage` event and across same-tab hook instances via a custom `terminal-font-size-changed` window event. Values clamped to 8–24 range.

2. Added `TerminalSizePanel` to `settings-panels.tsx` following existing panel patterns (SettingsHeader, cn-based active state). Panel shows 6 preset size buttons (11, 12, 13, 14, 15, 16) with the current size highlighted, and a live preview line rendered at the selected font size.

3. Wired `TerminalSizePanel` into `command-surface.tsx` — added to the `gsd-prefs` section alongside PrefsPanel, ModelRoutingPanel, BudgetPanel, and RemoteQuestionsPanel.

4. Added optional `fontSize?: number` prop to `ShellTerminalProps` in `shell-terminal.tsx`. Updated `getXtermOptions(isDark, fontSize?)` to accept fontSize. Threaded fontSize through `TerminalInstance` — on initial render and via a new useEffect that updates `termRef.current.options.fontSize` and re-fits when fontSize changes dynamically.

5. In `dual-terminal.tsx`, imported and called `useTerminalFontSize()`, passing `fontSize={terminalFontSize}` to both ShellTerminal instances.

6. Footer terminal in `app-shell.tsx` left untouched — `<ShellTerminal className="h-full" />` has no fontSize prop, stays at default 13px.

7. In `chat-mode.tsx`, imported `useTerminalFontSize` in both `StructuredTerminalActionPane` and `ChatPane`. Applied fontSize as an inline style on the chat message list wrappers so chat content text respects the setting.

## Verification

- `npm run build:web-host` exits 0 ✅
- `rg "TerminalSizePanel" web/components/gsd/settings-panels.tsx` — confirms panel exists ✅
- `rg "useTerminalFontSize" web/` — confirms hook imported in dual-terminal, settings-panels, and chat-mode (plus the hook definition itself) ✅
- `grep "ShellTerminal" web/components/gsd/app-shell.tsx` — footer terminal at line 390 has no fontSize prop ✅
- `rg "bg-foreground"` on dashboard progress bar — no matches (T01 clean) ✅

## Diagnostics

- **localStorage:** `localStorage.getItem('gsd-terminal-font-size')` returns the persisted numeric value or null (default 13)
- **Custom event:** `terminal-font-size-changed` fires on window when font size changes within a tab
- **xterm update:** When fontSize changes, `TerminalInstance` updates `termRef.current.options.fontSize` and triggers `fitAddon.fit()` + `sendResize()` — if terminals don't visually update, check this effect
- **Panel testid:** `[data-testid="settings-terminal-size"]` identifies the panel in DOM
- **Invalid stored values:** Hook silently falls back to 13 if localStorage contains non-numeric or out-of-range values

## Deviations

None — implementation follows plan exactly.

## Known Issues

None.

## Files Created/Modified

- `web/lib/use-terminal-font-size.ts` — new hook for localStorage-persisted terminal font size with cross-tab/cross-component sync
- `web/components/gsd/settings-panels.tsx` — added `Type` icon import, `useTerminalFontSize` import, and `TerminalSizePanel` component
- `web/components/gsd/shell-terminal.tsx` — added `fontSize` to ShellTerminalProps and TerminalInstanceProps, updated `getXtermOptions(isDark, fontSize?)`, added useEffect for dynamic fontSize updates, threaded prop through TerminalInstance
- `web/components/gsd/dual-terminal.tsx` — imported `useTerminalFontSize`, passes `fontSize={terminalFontSize}` to both ShellTerminal instances
- `web/components/gsd/chat-mode.tsx` — imported `useTerminalFontSize`, applied fontSize to ChatMessageList wrapper and ChatPane messages wrapper
- `web/components/gsd/command-surface.tsx` — imported and rendered `TerminalSizePanel` in gsd-prefs section
- `web/components/gsd/app-shell.tsx` — NOT modified (footer terminal stays at default, confirming D084)
- `.gsd/milestones/M008/slices/S05/tasks/T02-PLAN.md` — added Observability Impact section
