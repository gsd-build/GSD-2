---
phase: 04-remote-access-settings-ui
plan: 01
subsystem: api
tags: [next.js, tailscale, cookie-auth, password-management, route-handlers]

# Dependency graph
requires:
  - phase: 01-password-auth-and-cookie-sessions
    provides: "web-password-storage.ts (setPassword), web-session-auth.ts (createSessionToken, getOrCreateSessionSecret)"
  - phase: 02-tailscale-serve-integration
    provides: "tailscale.ts (isTailscaleInstalled, getTailscaleStatus)"
provides:
  - "POST /api/settings/password — authenticated endpoint to change password and re-issue cookie"
  - "GET /api/tailscale/status — Tailscale connection status for settings UI"
affects: [04-remote-access-settings-ui-03, 04-remote-access-settings-ui-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Settings API routes under /api/settings/ (not /api/auth/) to require authentication via middleware"
    - "Tailscale status endpoint wraps synchronous CLI calls in async GET handler with graceful fallback"

key-files:
  created:
    - web/app/api/settings/password/route.ts
    - web/app/api/tailscale/status/route.ts
  modified: []

key-decisions:
  - "Password change endpoint is at /api/settings/password (not /api/auth/password) — /api/auth/* is exempt from auth checks, settings/ requires authentication"
  - "Import from web-password-storage.ts (not web-auth-storage.ts) — web-auth-storage.ts is the OAuth credential store; web-password-storage.ts is the dedicated web UI password file"
  - "Tailscale route maps fqdn->dnsName and url->tailnetUrl to match UI contract from plan, bridging Phase 2 field names to Phase 4 UI expectations"
  - "isTailscaleInstalled() and getTailscaleStatus() are synchronous in tailscale.ts — route calls them without await"

patterns-established:
  - "Settings routes: /api/settings/* for authenticated operations that change server state"
  - "Tailscale status: thin wrapper over synchronous CLI module, maps field names for UI contract"

requirements-completed: [SETT-01, SETT-04, TAIL-11]

# Metrics
duration: 8min
completed: 2026-03-28
---

# Phase 04 Plan 01: Remote Access API Endpoints Summary

**Password change endpoint and Tailscale status API backing the Remote Access settings panel, with field-name bridging between Phase 2 CLI module and Phase 4 UI contract**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-28T20:14:00Z
- **Completed:** 2026-03-28T20:22:24Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- POST /api/settings/password endpoint that calls Phase 1's setPassword() for hashing/storage/secret rotation, then re-issues a fresh gsd-session cookie so the current browser remains authenticated
- GET /api/tailscale/status endpoint that wraps Phase 2's synchronous CLI module and returns a consistent { installed, connected, hostname, tailnetUrl, dnsName } shape for the settings UI
- Both endpoints follow the existing Next.js route handler pattern (runtime = "nodejs", dynamic = "force-dynamic")

## Task Commits

Each task was committed atomically:

1. **Task 1: POST /api/settings/password endpoint** - `40a72384` (feat)
2. **Task 2: GET /api/tailscale/status endpoint** - `7ffbf75c` (feat)

## Files Created/Modified

- `web/app/api/settings/password/route.ts` - Authenticated password change endpoint; calls setPassword(), rotates secret, re-issues cookie
- `web/app/api/tailscale/status/route.ts` - Tailscale status query; wraps isTailscaleInstalled() and getTailscaleStatus() with field name mapping

## Decisions Made

- Password change endpoint placed at /api/settings/password rather than /api/auth/password — the middleware exempts /api/auth/* from credential checks, so placing it there would bypass auth entirely
- Import corrected from `web-auth-storage` (OAuth credential store, wrong module) to `web-password-storage` (dedicated web UI password file) — per STATE.md decision from Phase 01
- Tailscale API maps Phase 2 field names (`fqdn` → `dnsName`, `url` → `tailnetUrl`) to match the UI contract specified in the plan
- isTailscaleInstalled() and getTailscaleStatus() are synchronous functions in the Phase 2 module — called without await

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected import module name for password storage**
- **Found during:** Task 1 (password endpoint)
- **Issue:** Plan specified `import.*web-auth-storage` but `web-auth-storage.ts` is the OAuth credential store (incompatible interface). The actual password storage is `web-password-storage.ts` as documented in STATE.md decisions.
- **Fix:** Used `web-password-storage.ts` for setPassword import instead
- **Files modified:** web/app/api/settings/password/route.ts
- **Verification:** TypeScript compilation succeeds, function signature matches
- **Committed in:** 40a72384 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed Tailscale route import path depth (4 levels → 5 levels)**
- **Found during:** Task 2 (Tailscale status endpoint)
- **Issue:** Initial route used `../../../../src/web/tailscale.ts` (4 levels up) but the file is at depth 5 from the monorepo root relative to `web/app/api/tailscale/status/`
- **Fix:** Corrected to `../../../../../src/web/tailscale.ts`
- **Files modified:** web/app/api/tailscale/status/route.ts
- **Verification:** TypeScript reports no errors for the file
- **Committed in:** 7ffbf75c (Task 2 commit)

**3. [Rule 1 - Bug] Adapted Tailscale route to actual synchronous API and discriminated union return type**
- **Found during:** Task 2 (Tailscale status endpoint)
- **Issue:** Plan showed `isTailscaleInstalled()` as async returning `Promise<boolean>` and `getTailscaleStatus()` as async returning `TailscaleInfo | null`. Actual Phase 2 implementation: both are synchronous, getTailscaleStatus returns `TailscaleStatusResult` discriminated union ({ ok: true, info } | { ok: false, reason })
- **Fix:** Removed await keywords, used `result.ok` discriminant to access `result.info`, mapped field names (fqdn→dnsName, url→tailnetUrl)
- **Files modified:** web/app/api/tailscale/status/route.ts
- **Verification:** TypeScript compilation succeeds, all fields present in response
- **Committed in:** 7ffbf75c (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 Rule 1 bugs — wrong module reference, wrong import depth, wrong async API assumptions)
**Impact on plan:** All auto-fixes necessary for correctness. The plan's interface assumptions didn't match Phase 1 and Phase 2 actual implementations. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## Known Stubs

None — both endpoints wire directly to real Phase 1 and Phase 2 modules.

## Next Phase Readiness

- POST /api/settings/password ready for Plan 04-03 settings UI to call
- GET /api/tailscale/status ready for Plan 04-03 settings UI to poll
- Both endpoints follow existing route patterns and will integrate cleanly with the Next.js proxy middleware

---
*Phase: 04-remote-access-settings-ui*
*Completed: 2026-03-28*
