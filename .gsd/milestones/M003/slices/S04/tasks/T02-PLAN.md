---
estimated_steps: 6
estimated_files: 4
---

# T02: Store wiring, contract state, and diagnostics panel components

**Slice:** S04 — Diagnostics panels — forensics, doctor, skill-health
**Milestone:** M003

## Description

Wire the three diagnostic API routes into the browser UI: add diagnostics state tracking to the command surface contract, add fetch methods to the workspace store, create panel components for each diagnostic surface, and replace the generic placeholder rendering in command-surface.tsx.

This follows the exact pattern used for recovery diagnostics: `CommandSurfaceRecoveryState` in the contract, `loadRecoveryDiagnostics()` in the store, and `renderRecoverySection()` in the command surface component. The three diagnostics panels are simpler than recovery because they don't need bridge/validation/interrupted-run cross-referencing — they're pure data display with one action (doctor fix).

**Relevant skills:** `frontend-design` — for panel component styling.

## Steps

1. **Add diagnostics state types to `web/lib/command-surface-contract.ts`.** Add a `CommandSurfaceDiagnosticsState` interface (or three separate interfaces — one per panel) tracking:
   - `phase: "idle" | "loading" | "loaded" | "error"`
   - `data: <ReportType> | null` (ForensicReport, DoctorReport, SkillHealthReport from diagnostics-types.ts)
   - `error: string | null`
   - `lastLoadedAt: string | null`
   
   Add a unified `diagnostics` field to `WorkspaceCommandSurfaceState`:
   ```ts
   diagnostics: {
     forensics: CommandSurfaceDiagnosticsPhaseState<ForensicReport>
     doctor: CommandSurfaceDiagnosticsPhaseState<DoctorReport>
     skillHealth: CommandSurfaceDiagnosticsPhaseState<SkillHealthReport>
   }
   ```
   
   Add a `createInitialDiagnosticsState()` factory function. Wire it into `createInitialCommandSurfaceState()`.
   
   Import the report types from `../lib/diagnostics-types.ts` (note: command-surface-contract.ts is IN `web/lib/`, so relative import is `./diagnostics-types.ts`).

2. **Add fetch methods to `web/lib/gsd-workspace-store.tsx`.** Add three fetch methods following the `loadRecoveryDiagnostics` pattern:
   - `loadForensicsDiagnostics()` — GET `/api/forensics`, parse response as `ForensicReport`, update `commandSurface.diagnostics.forensics` state
   - `loadDoctorDiagnostics(scope?: string)` — GET `/api/doctor?scope=<scope>`, parse as `DoctorReport`, update doctor state
   - `applyDoctorFixes(scope?: string)` — POST `/api/doctor` with `{ scope }` body, parse as `DoctorFixResult`, reload doctor data after success
   - `loadSkillHealthDiagnostics()` — GET `/api/skill-health`, parse as `SkillHealthReport`, update skill-health state
   
   Each method: set phase to "loading" → fetch → on success set phase "loaded" + data → on failure set phase "error" + error message. Follow the `loadRecoveryDiagnostics` pattern for patchState calls and error normalization, but much simpler since there's no bridge/validation cross-referencing.

3. **Create `web/components/gsd/diagnostics-panels.tsx`.** This is a new file with three panel components. Extract to a separate file to keep command-surface.tsx from growing further (it's already 2092 lines).

   **ForensicsPanel:**
   - Header: "Forensic Analysis" with timestamp
   - Anomalies section: list each anomaly with severity badge (color-coded), type tag, summary, details
   - Recent units section: table with type, id, model, cost, duration columns
   - Crash lock section: if present, show PID, started at, unit type/id; if null, show "No crash lock"
   - Metrics summary: total units, total cost, total duration if available
   - Loading/error states

   **DoctorPanel:**
   - Header: "Doctor Health Check" with ok/not-ok indicator
   - Summary bar: total issues, errors, warnings, infos counts with colored badges
   - Issue list: each issue shows severity badge, code (humanized), scope, unitId, message, file if present, fixable indicator
   - "Apply Fixes" button (calls applyDoctorFixes from store) — only enabled if fixable > 0
   - Fix results: show fixesApplied list after successful fix
   - Loading/error states

   **SkillHealthPanel:**
   - Header: "Skill Health" with generatedAt timestamp
   - Stats bar: total skills, stale count, declining count
   - Skill table: name, uses, success rate (%), avg tokens, token trend (↑/↓/→), stale days, avg cost, flagged indicator
   - Stale skills list with names
   - Declining skills list with names
   - Suggestions section: each suggestion shows severity badge, skill name, trigger, message
   - Loading/error states

   All three panels import types from `@/lib/diagnostics-types` and store methods from `@/lib/gsd-workspace-store`.

4. **Wire panels into `web/components/gsd/command-surface.tsx`.** Modify `renderSection()`:
   - Import `ForensicsPanel`, `DoctorPanel`, `SkillHealthPanel` from `./diagnostics-panels`
   - Before the existing `if (commandSurface.section?.startsWith("gsd-"))` check, add specific cases:
     ```ts
     case "gsd-forensics": return <ForensicsPanel />
     case "gsd-doctor": return <DoctorPanel />
     case "gsd-skill-health": return <SkillHealthPanel />
     ```
   - These replace the generic placeholder for these three surfaces while leaving all other gsd-* surfaces on the placeholder.

5. **Auto-fetch on section open.** In the store or component, trigger data fetching when the command surface opens to a diagnostics section. Pattern: in command-surface.tsx, use a `useEffect` that checks `commandSurface.section` and calls the appropriate load method if data is stale or unloaded. Reference how recovery diagnostics auto-fetches — check `commandSurface.section === "recovery"` pattern.

6. **Verify build.** Run `npm run build:web-host` to confirm all new imports, components, and store methods compile and bundle correctly.

## Must-Haves

- [ ] `WorkspaceCommandSurfaceState` has a `diagnostics` field with state for all three panels
- [ ] `createInitialCommandSurfaceState()` includes initial diagnostics state
- [ ] Store has `loadForensicsDiagnostics()`, `loadDoctorDiagnostics()`, `applyDoctorFixes()`, `loadSkillHealthDiagnostics()` methods
- [ ] `ForensicsPanel`, `DoctorPanel`, `SkillHealthPanel` components exist and render real data
- [ ] `renderSection()` in command-surface.tsx renders the three panel components instead of placeholder
- [ ] Doctor panel has an "Apply Fixes" button that calls the POST route
- [ ] Data auto-fetches when a diagnostics section opens
- [ ] `npm run build:web-host` passes

## Verification

- `npm run build:web-host` — exit 0
- `rg "ForensicsPanel|DoctorPanel|SkillHealthPanel" web/components/gsd/command-surface.tsx` — all three referenced
- `rg "loadForensicsDiagnostics|loadDoctorDiagnostics|loadSkillHealthDiagnostics|applyDoctorFixes" web/lib/gsd-workspace-store.tsx` — all four methods exist
- `rg "diagnostics" web/lib/command-surface-contract.ts` — state type present
- The generic gsd-* placeholder in renderSection() still handles remaining surfaces (gsd-queue, gsd-export, etc.)

## Inputs

- `web/lib/diagnostics-types.ts` — T01 output: browser-safe type definitions for all three report types
- `web/app/api/forensics/route.ts`, `web/app/api/doctor/route.ts`, `web/app/api/skill-health/route.ts` — T01 output: API routes that the store fetches from
- `web/lib/command-surface-contract.ts` — existing contract with `CommandSurfaceRecoveryState` as pattern reference (line ~100-130)
- `web/lib/gsd-workspace-store.tsx` — existing store with `loadRecoveryDiagnostics()` as pattern reference (line ~2032-2170)
- `web/components/gsd/command-surface.tsx` — existing component with `renderSection()` at line ~1897 and recovery section rendering as pattern reference

## Expected Output

- `web/lib/command-surface-contract.ts` — modified: diagnostics state types added (~30-40 new lines), createInitialDiagnosticsState factory, diagnostics field in WorkspaceCommandSurfaceState
- `web/lib/gsd-workspace-store.tsx` — modified: 4 new fetch methods (~120-160 new lines), diagnostics initial state wired
- `web/components/gsd/diagnostics-panels.tsx` — new file: 3 panel components (~250-350 lines)
- `web/components/gsd/command-surface.tsx` — modified: 3 new case branches + imports + useEffect for auto-fetch (~15-25 new lines)

## Observability Impact

- **Browser-side phase tracking**: Each diagnostics panel now exposes a `phase` field (`idle` | `loading` | `loaded` | `error`) in `commandSurface.diagnostics.{forensics,doctor,skillHealth}` — inspectable via React DevTools or `useGSDWorkspaceState()`.
- **Error surfacing**: API errors from `/api/forensics`, `/api/doctor`, `/api/skill-health` are captured in `state.error` and rendered inline in each panel. Errors include status codes and server-side stderr messages.
- **Doctor fix lifecycle**: `fixPending`, `lastFixResult`, and `lastFixError` fields on the doctor state track the POST /api/doctor flow end-to-end. The panel renders fix results and errors explicitly.
- **Auto-fetch trigger**: A `useEffect` triggers data loading when a diagnostics section opens and phase is `idle`. This is observable via the loading spinner in each panel.
- **Failure inspection**: `data-testid` attributes on each panel (`diagnostics-forensics`, `diagnostics-doctor`, `diagnostics-skill-health`) and the fix button (`doctor-apply-fixes`) enable automated UI testing.
