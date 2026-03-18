---
estimated_steps: 2
estimated_files: 1
---

# T01: Set default theme to dark

**Slice:** S03 — Theme Defaults & Light Mode Color Audit
**Milestone:** M008

## Description

Change the GSD web mode default theme from `"system"` to `"dark"` so that users with no stored theme preference get dark mode. This delivers requirement R114. The change is in the ThemeProvider component in `layout.tsx`.

## Steps

1. Open `web/app/layout.tsx` and find the `<ThemeProvider>` element (line ~40). Change `defaultTheme="system"` to `defaultTheme="dark"`. Remove the `enableSystem` prop from the same element — it's no longer needed since we're hardcoding dark as the default rather than detecting the OS preference.
2. Verify: run `grep 'defaultTheme="dark"' web/app/layout.tsx` — must match. Run `grep 'enableSystem' web/app/layout.tsx` — must return nothing.

## Must-Haves

- [ ] `defaultTheme="dark"` is set on ThemeProvider
- [ ] `enableSystem` prop is removed from ThemeProvider

## Verification

- `grep -c 'defaultTheme="dark"' web/app/layout.tsx` returns `1`
- `grep -c 'enableSystem' web/app/layout.tsx` returns `0`

## Inputs

- `web/app/layout.tsx` — current file has `defaultTheme="system"` and `enableSystem` on line ~40

## Observability Impact

- **Changed signal:** The `<html>` element's `class` attribute defaults to `dark` instead of matching the OS preference. With no stored `theme` key in localStorage, the page renders in dark mode unconditionally.
- **Inspection:** DevTools → Elements → `<html class="dark">`. DevTools → Application → Local Storage → absence of `theme` key confirms default is in effect.
- **Failure state:** If the change is missing or reverted, the `<html>` element will have `class="light"` (or system-detected value) for users with light OS preference and no stored theme. `grep 'enableSystem' web/app/layout.tsx` returning a match indicates reversion.

## Expected Output

- `web/app/layout.tsx` — ThemeProvider now uses `defaultTheme="dark"` with no `enableSystem` prop
