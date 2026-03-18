---
estimated_steps: 8
estimated_files: 6
---

# T01: Default theme + high-traffic component audit

**Slice:** S03 — Theme Defaults & Light Mode Color Audit
**Milestone:** M008

## Description

Change the default theme to dark and migrate the four heaviest components from raw Tailwind accent colors to semantic CSS custom property tokens.

## Steps

1. Read `web/app/layout.tsx` — change `defaultTheme="system"` to `defaultTheme="dark"`
2. Read `web/app/globals.css` — review existing `:root` and `.dark` semantic tokens. Add any missing variant tokens needed for the migration (e.g. opacity variants for backgrounds/borders)
3. Establish the mapping: `emerald-*` → success, `amber-*` → warning, `red-*` → destructive, `sky-*`/`blue-*` → info. Create Tailwind utility classes that reference the CSS custom properties.
4. Migrate `web/components/gsd/visualizer-view.tsx` (53 hits) — replace raw accent classes with semantic tokens. Preserve non-semantic uses (data viz bars, decorative accents)
5. Migrate `web/components/gsd/command-surface.tsx` (42 hits) — replace semantic-state colors. Git diff indicators (`M`/`A`/`D`/`R`/`C`/`U`) are non-semantic and can stay
6. Migrate `web/components/gsd/remaining-command-panels.tsx` (25 hits)
7. Migrate `web/components/gsd/diagnostics-panels.tsx` (25 hits)
8. Run `npm run build:web-host` and `rg` to verify progress

## Must-Haves

- [ ] `defaultTheme="dark"` in layout.tsx
- [ ] Semantic CSS tokens expanded if needed in globals.css
- [ ] 4 heaviest components migrated from raw Tailwind to semantic tokens
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0
- `rg` count of raw accent colors in the 4 migrated files drops to near-zero (non-semantic uses excepted)

## Inputs

- `web/app/globals.css` — existing `:root` and `.dark` tokens
- `web/app/layout.tsx` — ThemeProvider defaultTheme prop

## Expected Output

- `web/app/layout.tsx` — default theme changed to dark
- `web/app/globals.css` — possibly expanded with semantic token variants
- 4 component files migrated to semantic tokens
