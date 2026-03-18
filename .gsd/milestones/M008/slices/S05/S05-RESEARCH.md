# S05 — Progress Bar Dynamics & Terminal Text Size — Research

**Date:** 2026-03-18
**Depth:** Light — two independent, well-scoped features using established codebase patterns.

## Summary

This slice has two independent deliverables: (1) make the dashboard progress bar transition from red→yellow→green based on task completion percentage, and (2) add a terminal text size preference that applies to the power-view DualTerminal and chat-mode StructuredTerminalActionPane, but not the footer terminal.

Both are straightforward. The progress bar currently uses `bg-foreground` (monochrome) and just needs an inline `backgroundColor` style driven by a color interpolation function. The terminal font size is hardcoded to `fontSize: 13` in `getXtermOptions()` inside `shell-terminal.tsx` — it needs to read from a persisted preference (localStorage) and be configurable via a new settings panel section. The codebase already has a localStorage pattern (sidebar collapsed state in app-shell.tsx) and the settings panel has four existing exported panels to follow as templates.

## Recommendation

Build the progress bar color function first — it's a pure function with zero dependencies that can be verified instantly in the browser. Then add the terminal text size preference, which touches more files but follows well-established patterns. Use localStorage for persistence (same pattern as sidebar state), add a `TerminalSizePanel` to settings-panels.tsx, and thread the font size through ShellTerminal props (for power/footer discrimination) and the headless terminal in chat-mode.

## Implementation Landscape

### Key Files

- `web/components/gsd/dashboard.tsx` — Progress bar at lines 387–392. Currently: `className="h-full rounded-full bg-foreground transition-all duration-500"` with `style={{ width: '${progressPercent}%' }}`. The `progressPercent` variable is already computed at line 142. Change: replace `bg-foreground` with dynamic `backgroundColor` style using an interpolation function. The percentage text display (line 380) could also get colored text to match.

- `web/components/gsd/shell-terminal.tsx` — `getXtermOptions(isDark)` at line 85 returns `fontSize: 13` hardcoded. `ShellTerminalProps` (line 20) needs a new optional `fontSize?: number` prop. The `TerminalInstance` internal component (line 113) needs to accept and forward this. The footer terminal is rendered without any command/sessionPrefix props (`<ShellTerminal className="h-full" />`), while DualTerminal passes `command="gsd" sessionPrefix="gsd-main"` — but discrimination should be done by explicit prop, not by inferring from command presence.

- `web/components/gsd/dual-terminal.tsx` — Renders two `<ShellTerminal>` instances (lines 140, 153) for power view. These need to receive the user's fontSize preference.

- `web/components/gsd/app-shell.tsx` — The footer terminal at line 390: `<ShellTerminal className="h-full" />`. This must NOT receive the user font size — it stays at the default 13px. The localStorage pattern for sidebar collapsed state (lines 129–145) is the model for persisting terminal font size.

- `web/components/gsd/chat-mode.tsx` — `StructuredTerminalActionPane` (line 1720) uses a headless `Terminal` from xterm.js. It doesn't currently set fontSize on this headless terminal, but for consistent behavior the headless terminal's row/column calculations could be affected by font size. However, the headless terminal is never directly visible — its output is parsed and rendered as React chat bubbles. The font size setting applies to the *rendered* chat content, which uses Tailwind text classes (`text-sm`, `text-[11px]`), not xterm fontSize. **Clarification needed from the requirement**: R120 says "applies to chat mode terminals" — but chat mode doesn't show raw xterm terminals to the user. It shows parsed markdown chat bubbles. The most useful interpretation is that the text size setting applies to chat bubble content text, not the hidden headless terminal. If the setting only targets xterm-visible terminals, then only DualTerminal (power view) is affected.

- `web/components/gsd/settings-panels.tsx` — 835 lines, four exported panels: `PrefsPanel`, `ModelRoutingPanel`, `BudgetPanel`, `RemoteQuestionsPanel`. New `TerminalSizePanel` follows the same pattern. Uses helper components: `SettingsHeader`, `KvRow`, `Pill`, etc.

- `web/lib/settings-types.ts` — Browser-safe type definitions. Could add a `TerminalSettings` interface here, but since the terminal font size is purely browser-side (no server round-trip needed), localStorage alone is sufficient without a new type.

- `web/app/globals.css` — Defines oklch semantic tokens: `--success` (green, hue 145), `--warning` (yellow, hue 85), `--destructive` (red, hue 25). The progress bar interpolation can use these hues as reference points for the red→yellow→green gradient.

### Build Order

1. **Progress bar color interpolation** — Pure utility function + one-line dashboard change. Zero risk, immediately verifiable. Write a `getProgressColor(percent: number): string` function that returns an oklch color string interpolating hue from ~25 (red/destructive) through ~85 (yellow/warning) to ~145 (green/success). Apply it as inline `backgroundColor` on the progress bar div, removing `bg-foreground`.

2. **Terminal font size localStorage hook** — Create a `useTerminalFontSize()` hook (or inline in app-shell) that reads/writes `gsd-terminal-font-size` from localStorage with a default of 13. Pattern: mirror the sidebar collapsed state persistence at app-shell.tsx lines 129–145.

3. **Terminal font size settings panel** — Add `TerminalSizePanel` to settings-panels.tsx with a slider or preset buttons (e.g., 11, 12, 13, 14, 15, 16). Export it and wire into command-surface.tsx under an appropriate section.

4. **Thread font size to ShellTerminal** — Add optional `fontSize` prop to `ShellTerminalProps`. Pass it into `getXtermOptions`. In `dual-terminal.tsx`, read the preference and pass it to both ShellTerminal instances. In `app-shell.tsx`, do NOT pass it to the footer terminal.

5. **Build verification** — `npm run build:web-host` must exit 0.

### Verification Approach

- **Progress bar**: Open dashboard with an active slice that has some tasks done. Visually confirm the bar is red at low %, yellow at ~50%, green at high %. The `transition-all duration-500` already on the element will make color changes smooth.
- **Terminal font size**: Change the setting in settings panel. Confirm DualTerminal (power view) updates font size. Confirm footer terminal stays at 13px. Confirm setting persists across page refresh.
- **Build**: `npm run build:web-host` exits 0.

## Constraints

- The footer terminal (`<ShellTerminal className="h-full" />` in app-shell.tsx line 390) must NOT be affected by the font size setting — per D084.
- The progress bar colors should use oklch to stay consistent with the existing design token system in globals.css.
- Terminal font size must persist across sessions via localStorage — no server-side persistence needed for a browser-only preference.
