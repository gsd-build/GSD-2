# S03: Theme Defaults & Light Mode Color Audit

**Goal:** Make dark mode the default theme and migrate all raw Tailwind accent colors to semantic CSS custom property tokens for consistent light mode appearance.
**Demo:** Dark mode is the default; every non-monochrome color in light mode uses semantic design tokens consistently — verified by grep scan.

## Must-Haves

- `defaultTheme="dark"` in ThemeProvider (layout.tsx)
- All semantic state colors (success, warning, error, info) use CSS custom property tokens instead of raw Tailwind classes
- Light mode `:root` block has correct, visually consistent oklch values for `--success`, `--warning`, `--info`, `--destructive`
- `rg "emerald-|amber-|red-[0-9]|sky-|orange-[0-9]|green-[0-9]|blue-[0-9]" web/components/gsd/ -g '*.tsx'` returns zero hits for semantic state colors (non-semantic uses like git diff colors, data viz, and interactive hover states are acceptable)
- `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0
- `rg` scan for raw Tailwind accent colors returns zero semantic-state hits

## Tasks

- [ ] **T01: Default theme + high-traffic component audit** `est:2h`
  - Why: The default theme needs to change and the heaviest components (visualizer-view 53 hits, command-surface 42 hits, remaining-command-panels 25 hits, diagnostics-panels 25 hits) account for most of the raw color usage
  - Files: `web/app/layout.tsx`, `web/app/globals.css`, `web/components/gsd/visualizer-view.tsx`, `web/components/gsd/command-surface.tsx`, `web/components/gsd/remaining-command-panels.tsx`, `web/components/gsd/diagnostics-panels.tsx`
  - Do: Change `defaultTheme="system"` to `defaultTheme="dark"` in layout.tsx. Add new semantic CSS custom properties if needed (e.g. `--success-foreground`, `--warning-bg`, `--info-bg` variants with opacity). Then migrate the four heaviest components from raw Tailwind colors to semantic token classes. Map: `emerald-*` → success tokens, `amber-*` → warning tokens, `red-*` → destructive tokens, `sky-*`/`blue-*` → info tokens. Some colors are non-semantic (git diff indicators, data visualization, decorative accents) — those can remain as-is if they don't represent success/warning/error/info states.
  - Verify: `npm run build:web-host` exits 0, `rg` count decreases significantly
  - Done when: Default theme is dark, 4 heaviest components migrated

- [ ] **T02: Remaining component audit + verification** `est:1.5h`
  - Why: ~18 more components with raw accent colors need migration and a final verification scan
  - Files: `web/components/gsd/knowledge-captures-panel.tsx`, `web/components/gsd/settings-panels.tsx`, `web/components/gsd/chat-mode.tsx`, `web/components/gsd/projects-view.tsx`, `web/components/gsd/scope-badge.tsx`, `web/components/gsd/activity-view.tsx`, `web/components/gsd/sidebar.tsx`, `web/components/gsd/roadmap.tsx`, `web/components/gsd/shell-terminal.tsx`, `web/components/gsd/terminal.tsx`, `web/components/gsd/status-bar.tsx`, `web/components/gsd/app-shell.tsx`, `web/components/gsd/file-content-viewer.tsx`, `web/components/gsd/onboarding/step-ready.tsx`, `web/components/gsd/onboarding/step-optional.tsx`, `web/components/gsd/onboarding/step-authenticate.tsx`, `web/components/gsd/onboarding/step-dev-root.tsx`, `web/components/gsd/onboarding/step-provider.tsx`
  - Do: Continue the audit for all remaining components. Apply the same semantic token mapping. After all migrations, run `rg` to verify zero semantic-state raw colors remain. Legitimate non-semantic uses (like git diff `M`/`A`/`D` indicators, data visualization bars, decorative interactive hovers) can keep raw colors — document which are intentional. Check that the light mode `:root` tokens produce visually correct greens/ambers/reds/blues.
  - Verify: `npm run build:web-host` exits 0 + final `rg` scan
  - Done when: All semantic colors migrated, build passes, grep scan clean

## Files Likely Touched

- `web/app/layout.tsx`
- `web/app/globals.css`
- 22 component files under `web/components/gsd/`
