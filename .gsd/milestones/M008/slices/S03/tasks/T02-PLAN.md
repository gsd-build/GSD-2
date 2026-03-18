---
estimated_steps: 6
estimated_files: 18
---

# T02: Remaining component audit + verification

**Slice:** S03 — Theme Defaults & Light Mode Color Audit
**Milestone:** M008

## Description

Complete the color audit for all remaining components (~18 files) and run a final verification scan to ensure zero semantic-state raw Tailwind colors remain.

## Steps

1. Migrate `knowledge-captures-panel.tsx` (18 hits), `settings-panels.tsx` (12 hits), `chat-mode.tsx` (11 hits), `projects-view.tsx` (9 hits)
2. Migrate `scope-badge.tsx` (4), `activity-view.tsx` (4), `sidebar.tsx` (2), `roadmap.tsx` (2)
3. Migrate `shell-terminal.tsx` (2), `terminal.tsx` (1), `status-bar.tsx` (2), `app-shell.tsx` (2), `file-content-viewer.tsx` (1)
4. Migrate onboarding components: `step-ready.tsx` (4), `step-optional.tsx` (4), `step-authenticate.tsx` (4), `step-dev-root.tsx` (2), `step-provider.tsx` (1)
5. Run `rg "emerald-|amber-|red-[0-9]|sky-|orange-[0-9]|green-[0-9]|blue-[0-9]" web/components/gsd/ -g '*.tsx'` — verify zero semantic-state hits. Document any intentional non-semantic raw color usage.
6. Run `npm run build:web-host` to verify everything compiles

## Must-Haves

- [ ] All ~18 remaining components migrated
- [ ] Final `rg` scan shows zero semantic-state raw colors
- [ ] Any intentional non-semantic raw colors documented
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0
- `rg` scan for raw Tailwind accent colors returns zero semantic-state hits

## Inputs

- T01's semantic token mapping and globals.css changes
- 18 component files with raw accent colors

## Expected Output

- 18 component files migrated to semantic tokens
- Clean `rg` scan result
