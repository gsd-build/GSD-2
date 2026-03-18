---
id: T01
parent: S03
milestone: M008
provides:
  - Dark mode as default theme when no user preference is stored (R114)
key_files:
  - web/app/layout.tsx
key_decisions:
  - none
patterns_established:
  - none
observability_surfaces:
  - "Browser DevTools: <html class=\"dark\"> when no localStorage theme key exists"
  - "grep 'enableSystem' web/app/layout.tsx should return nothing — reversion indicator"
duration: 5m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Set default theme to dark

**Changed ThemeProvider default from `"system"` to `"dark"` and removed `enableSystem` prop.**

## What Happened

Single-line edit in `web/app/layout.tsx`: the `<ThemeProvider>` element was changed from `defaultTheme="system" enableSystem` to `defaultTheme="dark"`. This means users with no stored theme preference get dark mode unconditionally instead of OS-detected preference.

## Verification

- `grep -c 'defaultTheme="dark"' web/app/layout.tsx` → `1` ✅
- `grep -c 'enableSystem' web/app/layout.tsx` → `0` ✅

### Slice-level checks

- Slice check 1 (`defaultTheme="dark"`): ✅ passes
- Slice check 2 (raw accent colors = 0): 234 remaining — expected, T02/T03 scope
- Slice check 3 (production build): not run — deferred to T03

## Diagnostics

- Inspect `<html>` class attribute in browser DevTools — should contain `dark` with no stored preference.
- `localStorage.getItem('theme')` → `null` confirms default is in effect.
- If `enableSystem` reappears in grep, the change was reverted.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `web/app/layout.tsx` — Changed ThemeProvider defaultTheme to "dark", removed enableSystem prop
- `.gsd/milestones/M008/slices/S03/S03-PLAN.md` — Added Observability / Diagnostics section, marked T01 done
- `.gsd/milestones/M008/slices/S03/tasks/T01-PLAN.md` — Added Observability Impact section
