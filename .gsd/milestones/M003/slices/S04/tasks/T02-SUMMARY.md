---
id: T02
parent: S04
milestone: M003
provides:
  - diagnostics state tracking in command surface contract (forensics, doctor, skill-health)
  - store fetch methods for all three diagnostic APIs + doctor fix action
  - three real panel components replacing placeholder rendering
  - auto-fetch on section open via useEffect
key_files:
  - web/lib/command-surface-contract.ts
  - web/lib/gsd-workspace-store.tsx
  - web/components/gsd/diagnostics-panels.tsx
  - web/components/gsd/command-surface.tsx
key_decisions:
  - Doctor state extends the generic phase state with fixPending/lastFixResult/lastFixError fields for POST lifecycle tracking
  - Diagnostics panels extracted to separate file (diagnostics-panels.tsx) to avoid growing command-surface.tsx further
  - Auto-fetch triggers only when phase is "idle" (not on every section open) to avoid redundant requests
patterns_established:
  - CommandSurfaceDiagnosticsPhaseState<T> generic for phase/data/error/lastLoadedAt — reusable for future diagnostics panels
  - Private patchDiagnosticsPhaseState/patchDoctorState helpers on store class for type-safe nested state updates
  - Panel components consume store directly via hooks (useGSDWorkspaceState + useGSDWorkspaceActions) rather than prop-drilling
observability_surfaces:
  - commandSurface.diagnostics.{forensics,doctor,skillHealth}.phase tracks loading lifecycle per panel
  - commandSurface.diagnostics.doctor.{fixPending,lastFixResult,lastFixError} tracks fix POST lifecycle
  - data-testid attributes: diagnostics-forensics, diagnostics-doctor, diagnostics-skill-health, doctor-apply-fixes
  - Error messages from API include status codes and server stderr
duration: 15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Store wiring, contract state, and diagnostics panel components

**Wired three diagnostic API routes into the browser UI with contract state, store methods, real panel components, and auto-fetch on section open.**

## What Happened

Added a generic `CommandSurfaceDiagnosticsPhaseState<T>` interface to the command surface contract with phase/data/error/lastLoadedAt fields. Extended it with `CommandSurfaceDoctorState` that adds fixPending/lastFixResult/lastFixError for the doctor POST flow. Added `CommandSurfaceDiagnosticsState` combining all three panels, wired into `WorkspaceCommandSurfaceState.diagnostics` and reset on surface open.

Added four store methods: `loadForensicsDiagnostics`, `loadDoctorDiagnostics`, `applyDoctorFixes`, `loadSkillHealthDiagnostics`. Each follows the loading→success/error pattern with `patchState`. Doctor fix auto-reloads doctor data after success. Private `patchDiagnosticsPhaseState` and `patchDoctorState` helpers avoid repetitive nested spread patterns.

Created `diagnostics-panels.tsx` with three panel components: ForensicsPanel (anomalies, recent units table, crash lock, metrics), DoctorPanel (issue list with severity badges, fixable indicator, Apply Fixes button, fix results), SkillHealthPanel (skill table with pass rates/trends/staleness, stale/declining lists, suggestions). All follow the recovery section's styling patterns (SeverityIcon, DiagHeader, StatPill, etc.).

Wired panels into `renderSection()` with three explicit case branches before the generic gsd-* placeholder fallback. Added a useEffect that auto-fetches when a diagnostics section opens and phase is idle.

## Verification

- `npm run build:web-host` — exit 0 ✅
- `npm run build` — exit 0 ✅
- `rg "ForensicsPanel|DoctorPanel|SkillHealthPanel" web/components/gsd/command-surface.tsx` — all three referenced ✅
- `rg "loadForensicsDiagnostics|loadDoctorDiagnostics|loadSkillHealthDiagnostics|applyDoctorFixes" web/lib/gsd-workspace-store.tsx` — all four methods exist ✅
- `rg "diagnostics" web/lib/command-surface-contract.ts` — state types present ✅
- Generic gsd-* placeholder still handles remaining surfaces (gsd-queue, gsd-export, etc.) ✅
- `web-command-parity-contract.test.ts` — pre-existing failure on `/gsd visualize` (view-navigate vs surface) unrelated to this change

## Diagnostics

- Inspect browser store state: `commandSurface.diagnostics.forensics.phase` etc. via React DevTools
- Panel test IDs: `data-testid="diagnostics-forensics"`, `diagnostics-doctor`, `diagnostics-skill-health`
- Fix button: `data-testid="doctor-apply-fixes"` — disabled when fixable count is 0 or fix in progress
- API errors render inline with red border, including server stderr

## Deviations

- Added `CommandSurfaceDoctorState` as a separate interface extending the generic phase state (plan suggested a single generic for all three). This was needed to track the fix POST lifecycle (fixPending, lastFixResult, lastFixError) which has no equivalent in forensics/skill-health.

## Known Issues

- `web-command-parity-contract.test.ts` has a pre-existing failure: `/gsd visualize` dispatches to `view-navigate` instead of `surface`. Not caused by this task.
- `web-diagnostics-contract.test.ts` does not exist yet — assigned to T03.

## Files Created/Modified

- `web/lib/command-surface-contract.ts` — added diagnostics state types, factory functions, diagnostics field in WorkspaceCommandSurfaceState
- `web/lib/gsd-workspace-store.tsx` — added 4 fetch methods, diagnostics type imports, exposed methods in useGSDWorkspaceActions
- `web/components/gsd/diagnostics-panels.tsx` — new file with ForensicsPanel, DoctorPanel, SkillHealthPanel components (~340 lines)
- `web/components/gsd/command-surface.tsx` — added panel imports, 3 case branches in renderSection, auto-fetch useEffect, store action destructuring
