# S02: Browser Update UI

**Goal:** Show an update banner in the browser when a new GSD version is available, with a button to trigger the update asynchronously.
**Demo:** When a new GSD version is available, a banner appears in the browser; clicking "Update" triggers async npm install and shows progress.

## Must-Haves

- `/api/update` GET returns current version, latest version, and whether an update is available
- `/api/update` POST triggers async npm install and returns progress/result
- An update banner appears in the app shell when an update is available
- The banner shows current and latest version numbers
- Clicking "Update" triggers the update with visual progress feedback (pending → running → success/error)
- The banner can be dismissed
- `npm run build:web-host` exits 0

## Proof Level

- This slice proves: integration (real npm registry check)
- Real runtime required: yes (npm registry)
- Human/UAT required: yes (banner visibility)

## Verification

- `npm run build:web-host` exits 0
- `/api/update` GET returns version info when called directly

## Tasks

- [ ] **T01: Update API route** `est:45m`
  - Why: Need a server-side endpoint that checks for updates and can trigger an async npm install
  - Files: `web/app/api/update/route.ts`
  - Do: Create GET handler that reads the update check cache or fetches from npm registry, returns `{ currentVersion, latestVersion, updateAvailable }`. Create POST handler that spawns `npm install -g gsd-pi@latest` as a child process and returns the result. Use existing `compareSemver()` and cache infrastructure from `src/update-check.ts`.
  - Verify: `npm run build:web-host` exits 0
  - Done when: Both GET and POST handlers compile and return expected shapes

- [ ] **T02: Update banner in app shell** `est:1h`
  - Why: The user needs to see the update notification and trigger the update from the browser
  - Files: `web/components/gsd/app-shell.tsx`
  - Do: Add an `UpdateBanner` component that checks `/api/update` on mount (with throttling — at most once per session). Shows a dismissible banner when `updateAvailable` is true, displaying current → latest version. "Update" button POSTs to `/api/update`, shows spinner during install, then success/error state. Banner dismissal persists in sessionStorage. Place banner at the top of the app shell, above the main content area.
  - Verify: `npm run build:web-host` exits 0
  - Done when: Banner component renders, checks for updates, and handles the update flow

## Files Likely Touched

- `web/app/api/update/route.ts` (new)
- `web/components/gsd/app-shell.tsx`
