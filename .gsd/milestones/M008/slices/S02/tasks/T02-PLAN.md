---
estimated_steps: 6
estimated_files: 1
---

# T02: Update banner in app shell

**Slice:** S02 — Browser Update UI
**Milestone:** M008

## Description

Add an UpdateBanner component to the app shell that checks for updates on mount and shows a dismissible banner with an update trigger button.

## Steps

1. Read `web/components/gsd/app-shell.tsx` to understand the layout structure
2. Create an `UpdateBanner` component inside app-shell.tsx (or as a separate file if app-shell is already large) — checks `/api/update` on mount with session-throttling
3. When `updateAvailable` is true, render a banner showing `v{current} → v{latest}` with an "Update" button
4. "Update" button POSTs to `/api/update`, shows a loading spinner while running, then success or error state
5. Add dismiss button that sets sessionStorage flag to hide for the rest of the session
6. Place banner at top of app shell, above the main content area. Run `npm run build:web-host` to verify.

## Must-Haves

- [ ] Banner checks for updates on mount (at most once per session)
- [ ] Banner shows current → latest version when update is available
- [ ] "Update" button triggers POST with loading/success/error feedback
- [ ] Banner is dismissible (persists in sessionStorage)
- [ ] `npm run build:web-host` exits 0

## Verification

- `npm run build:web-host` exits 0

## Inputs

- `web/components/gsd/app-shell.tsx` — current app shell layout
- `web/app/api/update/route.ts` — T01's API route

## Expected Output

- `web/components/gsd/app-shell.tsx` — updated with UpdateBanner component
