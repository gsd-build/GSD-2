---
phase: 17-permission-model
plan: 01
subsystem: ui
tags: [react, trust-api, permissions, settings, tdd, bun-test]

# Dependency graph
requires:
  - phase: 16-oauth-keychain
    provides: SettingsView with Provider section already in place; design system tokens established
provides:
  - trust-api.ts with isTrusted/writeTrustFlag/registerTrustRoutes (GET+POST /api/trust)
  - TrustDialog modal component (once-per-project trust confirmation, POSTs /api/trust)
  - AdvancedPermissionsPanel with 5 toggleable rows + locked row + amber debug warning
  - SettingsView updated with Build Permissions section + "Manage build permissions →" link
  - App.tsx updated with TrustDialog import (wiring deferred to plan 02)
affects: [17-02, 18-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "node:fs/promises access() for file existence check (no throw on ENOENT)"
    - "Static source-text strategy for source assertions in Bun tests"
    - "Inline styles for design token colors (prevents Tailwind purge risk on rgba)"
    - "TDD RED-GREEN with per-phase commits for test/feat separation"

key-files:
  created:
    - packages/mission-control/src/server/trust-api.ts
    - packages/mission-control/src/components/permissions/TrustDialog.tsx
    - packages/mission-control/src/components/permissions/AdvancedPermissionsPanel.tsx
    - packages/mission-control/tests/trust-api.test.ts
    - packages/mission-control/tests/trust-dialog.test.tsx
  modified:
    - packages/mission-control/src/components/views/SettingsView.tsx
    - packages/mission-control/src/App.tsx

key-decisions:
  - "TrustDialog imported in App.tsx but not yet rendered — wiring to trust flag check deferred to plan 02"
  - "AdvancedPermissionsPanel rendered inline inside SettingsView Build Permissions section (not modal)"
  - "registerTrustRoutes accepts (url, method, body) tuple rather than Request object — consistent with settings-api handler signature"
  - "isTrusted uses access() not readFile — cheaper existence check, correct semantics"
  - "Static source-text strategy reused from Phase 12-01 for SettingsView/App.tsx assertions"

patterns-established:
  - "Pattern: trust flag at .gsd/.mission-control-trust — empty file, presence == trust granted"
  - "Pattern: registerTrustRoutes returns null for non-matching pathnames (same as handleSettingsRequest)"

requirements-completed: [PERM-01, PERM-02, PERM-04]

# Metrics
duration: 5min
completed: 2026-03-14
---

# Phase 17 Plan 01: Permission Model — Trust API + UI Summary

**trust-api.ts (isTrusted/writeTrustFlag/GET+POST /api/trust), TrustDialog modal, AdvancedPermissionsPanel (5 toggles + locked row), SettingsView Build Permissions section replacing skip-permissions toggle**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-14T09:18:51Z
- **Completed:** 2026-03-14T09:24:18Z
- **Tasks:** 3
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments

- trust-api.ts: `isTrusted`, `writeTrustFlag`, `registerTrustRoutes` — 7 tests all pass
- TrustDialog: full-screen modal with plain-language AI will/won't-do list, CTA calls POST /api/trust, loading spinner, "Advanced permission settings →" secondary link
- AdvancedPermissionsPanel: packageInstall, shellBuildCommands, gitCommits, gitPush, askBeforeEach toggles + locked "File operations inside project" row + amber debug warning for askBeforeEach
- SettingsView: "Build Permissions" section with descriptive text + "Manage build permissions →" link that toggles AdvancedPermissionsPanel inline — no skip-permissions toggle anywhere
- App.tsx: TrustDialog imported (wiring to trust flag + gsdDir deferred to plan 02)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: trust-api failing tests** - `1dbfe33` (test)
2. **Task 1 GREEN: trust-api.ts implementation** - `fa68ca6` (feat)
3. **Task 2: TrustDialog + AdvancedPermissionsPanel** - `36dcd3e` (feat)
4. **Task 3 RED: trust-dialog failing tests** - `3341529` (test)
5. **Task 3 GREEN: SettingsView + App.tsx update** - `1e51cfd` (feat)

_TDD tasks have separate test → feat commits_

## Files Created/Modified

- `packages/mission-control/src/server/trust-api.ts` — isTrusted, writeTrustFlag, registerTrustRoutes (GET/POST /api/trust)
- `packages/mission-control/src/components/permissions/TrustDialog.tsx` — TrustDialog modal component
- `packages/mission-control/src/components/permissions/AdvancedPermissionsPanel.tsx` — AdvancedPermissionsPanel + PermissionSettings interface + DEFAULT_PERMISSION_SETTINGS
- `packages/mission-control/tests/trust-api.test.ts` — 7 tests for trust-api (isTrusted, writeTrustFlag, registerTrustRoutes)
- `packages/mission-control/tests/trust-dialog.test.tsx` — 10 source-text assertion tests (SettingsView, App.tsx, AdvancedPermissionsPanel)
- `packages/mission-control/src/components/views/SettingsView.tsx` — Added Build Permissions section + AdvancedPermissionsPanel import + state
- `packages/mission-control/src/App.tsx` — Added TrustDialog import

## Decisions Made

- TrustDialog is imported in App.tsx but rendering/wiring to trust flag + gsdDir is plan 02's responsibility — the import establishes the dependency contract
- AdvancedPermissionsPanel renders inline in SettingsView (not as a modal) — simpler UX, avoids z-index conflicts
- `registerTrustRoutes` takes `(url, method, body)` tuple to match existing settings-api handler pattern
- `isTrusted` uses `access()` not `readFile` — cheaper existence check, no data needed
- Inline styles used for design token colors in TrustDialog and AdvancedPermissionsPanel to prevent Tailwind purge

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- trust-api.ts fully functional and tested — plan 02 can call isTrusted/writeTrustFlag directly
- TrustDialog component ready to be rendered by App.tsx once gsdDir is available
- AdvancedPermissionsPanel ready to be wired to persistent storage (plan 02)
- All 17 new tests pass; frontend build succeeds (240 modules)

---
*Phase: 17-permission-model*
*Completed: 2026-03-14*
