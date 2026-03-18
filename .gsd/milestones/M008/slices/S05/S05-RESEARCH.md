# M008/S05 — Research

**Date:** 2026-03-18

## Summary

This slice has two independent features: dynamic progress bar coloring and terminal text size settings. Both are straightforward UI work using established patterns already in the codebase.

The progress bar in `dashboard.tsx` uses `bg-foreground` (monochrome). It needs a color interpolation function that maps the `progressPercent` (0–100) to a red→yellow→green gradient via inline `style`. The codebase already uses oklch tokens in `globals.css` but inline interpolation for a continuous gradient is simpler — compute an oklch or hsl color directly from the percentage.

Terminal font size is hardcoded to `fontSize: 13` in `shell-terminal.tsx`'s `getXtermOptions()`. The `ShellTerminal` component is used in three places: the footer terminal (app-shell.tsx), and two instances in `DualTerminal` (power/expert view). Chat mode uses `ChatPane` (React-rendered, not xterm) and `StructuredTerminalActionPane` (headless xterm, no visible font). The setting should affect `ShellTerminal` in `DualTerminal` (expert split) but NOT the footer `ShellTerminal`. A prop like `useCustomFontSize` or reading from localStorage with a discriminating prop is the clean approach.

## Recommendation

**Progress bar:** Add a pure utility function `getProgressColor(percent: number): string` that returns an HSL string interpolating red (0°) → yellow/amber (45°) → green (120°). Apply via inline `style={{ backgroundColor }}` on the progress bar fill div, replacing the static `bg-foreground` class. HSL is simpler than oklch for continuous interpolation and gives good visual results for this use case.

**Terminal text size:** Store the preference in localStorage under a key like `gsd-terminal-font-size`. Add a small `TerminalSettingsPanel` (or a section within `PrefsPanel`) to the settings surface with a slider/select for font size (10–20px range, default 13). Pass a `fontSize` prop to `ShellTerminal` — the footer caller in `app-shell.tsx` omits the prop (uses default 13), while `DualTerminal` reads from localStorage and passes it. For chat mode, the `ChatPane` renders markdown text (controlled by Tailwind classes like `text-sm`), so a CSS variable or Tailwind class override based on the stored preference handles that surface.

## Implementation Landscape

### Key Files

- `web/components/gsd/dashboard.tsx` — Progress bar at lines 388–391. Replace `bg-foreground` with inline style using computed color from `progressPercent`. The `progressPercent` variable is already computed at line 142.
- `web/components/gsd/shell-terminal.tsx` — `getXtermOptions()` at line 85–98 returns `fontSize: 13` hardcoded. Needs to accept a `fontSize` parameter. The `ShellTerminal` component (exported) needs a new optional `fontSize` prop.
- `web/components/gsd/dual-terminal.tsx` — Uses `<ShellTerminal>` twice (expert split). Must read font size from localStorage and pass it as a prop.
- `web/components/gsd/app-shell.tsx` — Uses `<ShellTerminal>` for the footer terminal at line 390. Must NOT pass a custom font size (uses default 13).
- `web/components/gsd/chat-mode.tsx` — `ChatPane` renders markdown-based chat at `text-sm` classes. Could apply a font size override via inline style or CSS variable if chat text size should also be adjustable. `StructuredTerminalActionPane` uses a headless off-screen xterm (line 1870–1875, positioned at `-10000px`), so its font size doesn't matter visually.
- `web/components/gsd/settings-panels.tsx` — Add a `TerminalSettingsPanel` component following the existing panel pattern (SettingsHeader, etc.). Needs a font size control (slider or select).
- `web/components/gsd/command-surface.tsx` — Import and render `TerminalSettingsPanel` in the `gsd-prefs` section (lines 2029–2036) alongside existing panels.
- `web/lib/settings-types.ts` — No changes needed for localStorage-only persistence.

### Build Order

1. **Progress bar color interpolation** — Add `getProgressColor(percent)` utility function in `dashboard.tsx` (or a small lib). Apply it to the progress bar fill div. This is fully independent and self-contained — can be verified visually immediately.

2. **Terminal font size localStorage hook** — Create a small custom hook `useTerminalFontSize()` that reads/writes `gsd-terminal-font-size` from localStorage with a default of 13. This unblocks both the settings panel and the terminal consumers.

3. **Wire font size into ShellTerminal** — Add optional `fontSize` prop to `ShellTerminal` and `TerminalInstance`. Thread it into `getXtermOptions()`. Update `DualTerminal` to use the hook and pass the value. Leave app-shell's footer call unchanged (no prop = default 13).

4. **Settings panel** — Add `TerminalSettingsPanel` to `settings-panels.tsx` with a font size control. Wire into command-surface's `gsd-prefs` section.

5. **Chat mode font size** — Apply the stored font size preference to `ChatPane`'s rendered text (text-sm classes → inline style override or CSS variable). This is the most optional step — chat mode renders markdown, not a terminal, so "terminal text size" may or may not apply here per requirement R120 ("chat mode terminals").

### Verification Approach

- **Progress bar:** Run the web app, navigate to dashboard with an active slice that has some tasks done. Visually confirm the bar shows red/yellow/green gradient based on completion. Test at 0%, ~50%, and 100%.
- **Terminal font size:** Open settings, change terminal font size. Verify the power/expert split terminal (DualTerminal) reflects the new size. Verify the footer terminal remains at default 13px. Verify the setting persists across page reload (localStorage).
- **Build:** `npm run build:web-host` exits 0.

## Constraints

- The footer terminal in `app-shell.tsx` must remain at the default font size (13px) per D084 — it's a compact persistent UI element.
- `StructuredTerminalActionPane` in chat-mode uses a headless off-screen xterm for parsing only — its font size is irrelevant.
- The existing localStorage pattern in `app-shell.tsx` (sidebar collapsed state) is the precedent for browser-local preferences.

## Common Pitfalls

- **xterm font size requires re-fit** — Changing `fontSize` on an existing xterm instance requires calling `fitAddon.fit()` afterward so the terminal recalculates its column/row dimensions. The `TerminalInstance` component already has a `useEffect` for theme changes that could serve as a pattern.
- **HSL vs oklch for progress color** — oklch gives perceptually uniform brightness but is harder to interpolate programmatically for a simple 3-stop gradient. HSL with a hue sweep from 0° (red) through ~45° (amber/yellow) to 120° (green) is simpler and visually sufficient for a progress bar.
