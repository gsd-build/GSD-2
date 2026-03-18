---
estimated_steps: 8
estimated_files: 5
---

# T01: Dynamic progress bar + terminal text size setting

**Slice:** S05 — Progress Bar Dynamics & Terminal Text Size
**Milestone:** M008

## Description

Replace the static monochrome progress bar color with dynamic red→yellow→green interpolation based on completion percentage. Add a terminal text size preference that applies to chat mode and expert split terminals but not the footer terminal.

## Steps

1. Read `web/components/gsd/dashboard.tsx` — find the progress bar (currently `bg-foreground`)
2. Create a `getProgressColor(percent: number): string` helper that returns an oklch color interpolating: 0% = red (oklch ~0.55 0.2 25), 50% = yellow/amber (oklch ~0.75 0.15 85), 100% = green (oklch ~0.65 0.17 145). Use linear interpolation between the three stops.
3. Replace the progress bar's `className="bg-foreground"` with `style={{ backgroundColor: getProgressColor(progressPercent) }}`
4. Add terminal font size preference: create a small React context or localStorage hook (`useTerminalFontSize`) that reads/writes `gsd-terminal-font-size` from localStorage with a default of `13`
5. Add a "Terminal Text Size" section to settings-panels.tsx with 4 radio options: Small (11px), Medium (13px, default), Large (15px), Extra Large (17px)
6. In `shell-terminal.tsx`, replace hardcoded `fontSize: 13` with the preference value from the hook
7. In `chat-mode.tsx`, apply the font size to terminal/code content if applicable (check if it uses a separate terminal instance or just styled divs)
8. Run `npm run build:web-host` to verify

## Must-Haves

- [ ] Progress bar color interpolates red→yellow→green based on percentage
- [ ] Terminal text size preference stored in localStorage
- [ ] Settings panel shows 4 size options
- [ ] shell-terminal.tsx uses the preference value
- [ ] chat-mode.tsx respects the preference
- [ ] Footer terminal (terminal.tsx) unchanged
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0
- `rg "fontSize: 13" web/components/gsd/shell-terminal.tsx` returns zero (no longer hardcoded)

## Inputs

- `web/components/gsd/dashboard.tsx` — progress bar with `bg-foreground`
- `web/components/gsd/shell-terminal.tsx` — hardcoded `fontSize: 13`
- `web/components/gsd/settings-panels.tsx` — existing settings panel patterns

## Expected Output

- `web/components/gsd/dashboard.tsx` — dynamic progress bar color
- `web/components/gsd/shell-terminal.tsx` — reads font size preference
- `web/components/gsd/chat-mode.tsx` — respects font size preference
- `web/components/gsd/settings-panels.tsx` — terminal text size section added
- `web/lib/use-terminal-font-size.ts` — new hook for font size preference (or inline)
