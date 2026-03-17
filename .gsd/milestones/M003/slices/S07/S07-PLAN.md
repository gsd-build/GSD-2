# S07: Remaining Command Surfaces

**Goal:** Replace all 10 placeholder GSD command surfaces with real browser-native panels backed by live data.
**Demo:** Opening `/gsd quick`, `/gsd history`, `/gsd undo`, `/gsd steer`, `/gsd hooks`, `/gsd inspect`, `/gsd export`, `/gsd cleanup`, `/gsd queue`, or `/gsd status` in the browser terminal shows a real panel with appropriate content, controls, and state visibility — no "Coming in a future update" placeholders remain.

## Must-Haves

- All 10 surfaces render real panel components (not the generic placeholder)
- History panel shows metrics ledger data with phase/slice/model breakdowns
- Inspect panel shows GSD database introspection (schema version, counts, recent entries)
- Hooks panel shows hook status entries with name, type, enabled, targets, cycle counts
- Export panel generates downloadable markdown/JSON from metrics data
- Undo panel shows last completed unit info with a confirm-to-undo action
- Cleanup panel shows branch/snapshot listing with delete actions
- Steer panel shows OVERRIDES.md content and provides a form to send new steering messages
- Quick panel shows usage instructions matching TUI behavior
- Status and queue panels show workspace state from existing data (no new API)
- All new API routes follow the child-process pattern (execFile + resolve-ts.mjs)
- `npm run build` and `npm run build:web-host` succeed
- Existing parity contract test (118 tests) still passes

## Proof Level

- This slice proves: integration
- Real runtime required: yes (API routes serve real project data via child-process calls)
- Human/UAT required: no (build + contract test + absence of placeholder divs is sufficient)

## Verification

- `npm run build` — TypeScript compilation with all new types, services, store actions, components
- `npm run build:web-host` — Next.js production build with all new components and API routes
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — existing 118 tests still pass (dispatch unchanged)
- `rg "This surface will be implemented" web/components/gsd/command-surface.tsx` — returns 0 matches (placeholder text removed)
- Each new API route file exists and exports a GET function: `web/app/api/history/route.ts`, `web/app/api/inspect/route.ts`, `web/app/api/hooks/route.ts`, `web/app/api/export-data/route.ts`, `web/app/api/undo/route.ts`, `web/app/api/cleanup/route.ts`, `web/app/api/steer/route.ts`

## Observability / Diagnostics

- Runtime signals: each load function in the store transitions through `idle → loading → loaded/error` phases via `CommandSurfaceDiagnosticsPhaseState<T>`, visible in React DevTools or store inspection
- Inspection surfaces: each API route at `/api/{history,inspect,hooks,export-data,undo,cleanup,steer}` returns JSON or structured error; curl-testable
- Failure visibility: API errors surface as `phase: "error"` with `error` string in the command surface state; panels show error messages inline
- Redaction constraints: none — no secrets in metrics/hooks/inspect/export data

## Integration Closure

- Upstream surfaces consumed: `metrics.ts` (loadLedgerFromDisk, aggregation functions), `post-unit-hooks.ts` (getHookStatus, formatHookStatus), `commands.ts` (InspectData, formatInspectOutput, handleInspect logic), `export.ts` (writeExportFile), `undo.ts` (handleUndo logic, completed-units.json), `commands.ts` (handleCleanupBranches/handleCleanupSnapshots logic), `native-git-bridge.ts` (nativeBranchList, nativeForEachRef), `paths.ts` (gsdRoot, OVERRIDES path)
- New wiring introduced: 7 API routes, 6 child-process services, 10 panel components in remaining-command-panels.tsx, 10 switch cases in command-surface.tsx renderSection(), 7 store load functions, auto-loader useEffect extension
- What remains before the milestone is truly usable end-to-end: S08 (parity audit) and S09 (test hardening)

## Tasks

- [x] **T01: Create browser-safe types and extend command surface state contract** `est:25m`
  - Why: All panel components and store actions depend on typed data shapes. The state contract needs phase-tracked slices for surfaces that load data. This unblocks T02, T03, and T04.
  - Files: `web/lib/remaining-command-types.ts` (NEW), `web/lib/command-surface-contract.ts` (EDIT)
  - Do: Create `remaining-command-types.ts` with browser-safe mirrors of upstream types (HistoryData, InspectData, HookStatusEntry, ExportResult, UndoInfo, CleanupData, SteerData). Add a `CommandSurfaceRemainingState` interface to `command-surface-contract.ts` with `CommandSurfaceDiagnosticsPhaseState<T>` slices for each data-bearing surface. Wire into the command surface initial state.
  - Verify: `npm run build` succeeds with all new types resolved
  - Done when: All 7 data-shape interfaces exist in `remaining-command-types.ts`, `CommandSurfaceRemainingState` is in the contract with initial state factory, and build passes

- [x] **T02: Build read-only child-process services and API routes for history, inspect, hooks, and export** `est:45m`
  - Why: Four surfaces need server-side data that requires calling upstream extension modules via child process. Each follows the established forensics-service.ts pattern exactly.
  - Files: `src/web/history-service.ts` (NEW), `src/web/inspect-service.ts` (NEW), `src/web/hooks-service.ts` (NEW), `src/web/export-service.ts` (NEW), `web/app/api/history/route.ts` (NEW), `web/app/api/inspect/route.ts` (NEW), `web/app/api/hooks/route.ts` (NEW), `web/app/api/export-data/route.ts` (NEW)
  - Do: Build 4 services using execFile + resolve-ts.mjs child-process pattern from forensics-service.ts. Each service resolves the upstream module path, spawns a child that imports via pathToFileURL, calls the relevant function, and writes JSON to stdout. Routes are thin GET handlers matching the forensics route pattern.
  - Verify: `npm run build` succeeds; each route file exports GET function
  - Done when: All 4 services + 4 routes exist, follow the child-process pattern, and compile cleanly

- [x] **T03: Build mutation services, steer API route, and wire all store load actions** `est:50m`
  - Why: Undo and cleanup need GET+POST routes (read state, then mutate). Steer needs a GET route for OVERRIDES.md content. The store needs load functions for all 7 API-backed surfaces so the auto-loader and panels can fetch data.
  - Files: `src/web/undo-service.ts` (NEW), `src/web/cleanup-service.ts` (NEW), `web/app/api/undo/route.ts` (NEW), `web/app/api/cleanup/route.ts` (NEW), `web/app/api/steer/route.ts` (NEW), `web/lib/gsd-workspace-store.tsx` (EDIT)
  - Do: Build undo-service (GET: read last completed unit from completed-units.json; POST: execute undo via child process). Build cleanup-service (GET: list branches/snapshots via child process calling native-git-bridge; POST: delete specified branches/snapshots). Build steer route (GET: read OVERRIDES.md via readFileSync — no child process needed). Add 7 store load functions following loadForensicsDiagnostics pattern, each fetching from its API route and patching the remaining-state slice.
  - Verify: `npm run build` succeeds; store load functions are exported in the hook return value
  - Done when: 2 mutation services + 3 routes + 7 store load functions exist and compile; store exposes all load functions via useGSDWorkspace hook

- [ ] **T04: Build all 10 panel components, wire into command-surface.tsx, and verify builds** `est:1h`
  - Why: This is the visible output — replacing every placeholder with a real panel. Each panel renders data from the store (loaded via T03's actions) or static content. The auto-loader useEffect chain needs extension for surfaces that fetch on open.
  - Files: `web/components/gsd/remaining-command-panels.tsx` (NEW), `web/components/gsd/command-surface.tsx` (EDIT)
  - Do: Create `remaining-command-panels.tsx` with 10 exported panel components following diagnostics-panels.tsx patterns: QuickPanel (static usage), HistoryPanel (metrics table + breakdowns), UndoPanel (last unit info + confirm button), SteerPanel (OVERRIDES display + message form), HooksPanel (hook status table), InspectPanel (DB overview + recent entries), ExportPanel (format selector + download button), CleanupPanel (branch/snapshot lists + delete buttons), QueuePanel (milestone registry from workspace data), StatusPanel (active state summary from workspace data). Wire into command-surface.tsx: add 10 switch cases replacing the startsWith("gsd-") placeholder, extend the auto-loader useEffect for surfaces that need data fetching. Remove the placeholder fallback text.
  - Verify: `npm run build` and `npm run build:web-host` succeed; `npx tsx --test src/tests/web-command-parity-contract.test.ts` passes (118 tests); `rg "This surface will be implemented" web/components/gsd/command-surface.tsx` returns 0 matches
  - Done when: All 10 GSD surfaces render named panel components, no placeholder text remains, both builds succeed, and parity contract test passes

## Files Likely Touched

- `web/lib/remaining-command-types.ts` (NEW)
- `web/lib/command-surface-contract.ts` (EDIT)
- `src/web/history-service.ts` (NEW)
- `src/web/inspect-service.ts` (NEW)
- `src/web/hooks-service.ts` (NEW)
- `src/web/export-service.ts` (NEW)
- `src/web/undo-service.ts` (NEW)
- `src/web/cleanup-service.ts` (NEW)
- `web/app/api/history/route.ts` (NEW)
- `web/app/api/inspect/route.ts` (NEW)
- `web/app/api/hooks/route.ts` (NEW)
- `web/app/api/export-data/route.ts` (NEW)
- `web/app/api/undo/route.ts` (NEW)
- `web/app/api/cleanup/route.ts` (NEW)
- `web/app/api/steer/route.ts` (NEW)
- `web/lib/gsd-workspace-store.tsx` (EDIT)
- `web/components/gsd/remaining-command-panels.tsx` (NEW)
- `web/components/gsd/command-surface.tsx` (EDIT)
