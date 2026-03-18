# S05: Progress Bar Dynamics & Terminal Text Size

**Goal:** Make the dashboard progress bar dynamically color based on completion percentage and add a terminal text size setting.
**Demo:** Dashboard progress bar transitions red→green by completion percentage; terminal text size is adjustable in settings and applies to chat + expert terminals.

## Must-Haves

- Progress bar transitions red (0%) → yellow (50%) → green (100%) via color interpolation
- New "Terminal Text Size" setting in the settings panel
- Terminal text size options: small (11px), medium (13px, default), large (15px), extra-large (17px)
- Setting persists in localStorage (or web preferences)
- Setting applies to: shell-terminal.tsx (used in expert split mode) and chat-mode.tsx terminal
- Setting does NOT apply to the persistent footer terminal (terminal.tsx)
- `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0
- Visual: progress bar shows color gradient, terminal text size changes when setting is changed

## Tasks

- [x] **T01: Dynamic progress bar + terminal text size setting** `est:1.5h`
  - Why: Both are small self-contained UI changes that fit in one task
  - Files: `web/components/gsd/dashboard.tsx`, `web/components/gsd/shell-terminal.tsx`, `web/components/gsd/chat-mode.tsx`, `web/components/gsd/settings-panels.tsx`, `web/app/api/preferences/route.ts`
  - Do: In `dashboard.tsx`, replace the static `bg-foreground` progress bar color with a dynamic `style={{ backgroundColor: ... }}` that interpolates between red (0%), yellow (50%), and green (100%) using oklch color space. Create a `getProgressColor(percent: number): string` helper. For terminal text size: add a `terminalFontSize` field to web preferences (localStorage via a React context or the existing `/api/preferences` route). Add a "Terminal Text Size" section to settings-panels.tsx with 4 options. In `shell-terminal.tsx`, read the preference and pass it to xterm `fontSize` option instead of hardcoded `13`. In `chat-mode.tsx`, apply the same font size to any terminal/code rendering. Do NOT change `terminal.tsx` (footer terminal).
  - Verify: `npm run build:web-host` exits 0
  - Done when: Progress bar dynamically colors, terminal text size is configurable and applies to the right terminals

## Files Likely Touched

- `web/components/gsd/dashboard.tsx`
- `web/components/gsd/shell-terminal.tsx`
- `web/components/gsd/chat-mode.tsx`
- `web/components/gsd/settings-panels.tsx`
- `web/app/api/preferences/route.ts` (if using server-side persistence)
