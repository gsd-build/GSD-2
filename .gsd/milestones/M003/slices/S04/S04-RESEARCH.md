# S04 — Research: Diagnostics panels — forensics, doctor, skill-health

**Date:** 2026-03-16

## Summary

This slice builds three browser panels that replace the placeholder `gsd-forensics`, `gsd-doctor`, and `gsd-skill-health` surfaces from S02 with real diagnostic data. The pattern is well-established: S03 (visualizer) proved the child-process service → API route → component pipeline, and the existing recovery diagnostics surface already calls `runGSDDoctor()` via the same child-process mechanism. All three upstream modules (`forensics.ts`, `doctor.ts`, `skill-health.ts`) use `.js` import extensions that Turbopack cannot resolve, so the child-process pattern is mandatory.

The main work is:
1. Three new `src/web/*-service.ts` files that spawn child processes to call the upstream functions and serialize results to JSON.
2. Three new `web/app/api/` routes (forensics, doctor, skill-health) that call those services — matching the visualizer/recovery route pattern exactly.
3. Browser-safe type definitions in `web/lib/diagnostics-types.ts` mirroring the upstream report shapes.
4. A diagnostics panel component that replaces the generic `gsd-*` placeholder in `command-surface.tsx` with three real panel renderers.
5. Store wiring to fetch data when each panel opens, and contract tests.

The approach is straightforward because every sub-problem has a proven pattern in the codebase.

## Recommendation

Follow the visualizer/recovery service pattern exactly: one child-process service per upstream module, one API route per service, browser-safe types, component rendering in the command surface sheet. No novel architecture needed.

Key design choices:
- **Forensics**: Since `buildForensicReport()` is private, the child script calls it by importing forensics.ts and invoking the private function directly (the child process runs the module's own code, so privacy boundaries don't apply). Alternatively, export `buildForensicReport` — simpler and low-risk since it has no side effects except reading files.
- **Doctor**: Already partially surfaced by the recovery diagnostics service. The new doctor panel shows the full report (all issues, all severities) with scope/severity filtering and a "Run Fix" action via POST. The recovery surface shows only a summary.
- **Doctor fix action**: Add a POST route to `/api/doctor` that calls `runGSDDoctor(basePath, { fix: true, scope })`. This is the only mutating operation in this slice.
- **Skill-health**: `generateSkillHealthReport()` is exported and returns a clean serializable `SkillHealthReport`. Simplest of the three — no Map→Record conversion needed.

## Implementation Landscape

### Key Files

**Upstream modules (read-only — these exist and work):**
- `src/resources/extensions/gsd/forensics.ts` — `buildForensicReport(basePath)` returns `ForensicReport` with anomalies, unitTraces, metrics, doctorIssues, recentUnits, crashLock. Types are module-private (not exported).
- `src/resources/extensions/gsd/doctor.ts` — `runGSDDoctor(basePath, opts)` returns `DoctorReport` with issues array, fixesApplied. `summarizeDoctorIssues()`, `filterDoctorIssues()`, `selectDoctorScope()` are all exported. Types (`DoctorReport`, `DoctorIssue`, `DoctorSummary`, `DoctorSeverity`, `DoctorIssueCode`) are exported.
- `src/resources/extensions/gsd/skill-health.ts` — `generateSkillHealthReport(basePath, staleDays?)` returns `SkillHealthReport` with skills array, staleSkills, decliningSkills, suggestions. Types (`SkillHealthReport`, `SkillHealthEntry`, `SkillHealSuggestion`) are exported.

**Established pattern to follow (already proven):**
- `src/web/visualizer-service.ts` — Child-process pattern: `execFile` + `resolve-ts.mjs` + `--experimental-strip-types` + inline script. Returns `SerializedVisualizerData`.
- `src/web/recovery-diagnostics-service.ts` — Same pattern but more complex (already calls `runGSDDoctor` and `synthesizeCrashRecovery`). Good reference for doctor scope resolution and error handling.
- `web/app/api/visualizer/route.ts` — GET route calling service, returning JSON with `Cache-Control: no-store`.
- `web/app/api/recovery/route.ts` — Same pattern.

**Files to create:**
- `src/web/forensics-service.ts` — Child process calling `buildForensicReport()` (needs export or direct invocation), serializes `ForensicReport` to JSON.
- `src/web/doctor-service.ts` — Child process calling `runGSDDoctor()` with scope/fix options, serializes `DoctorReport` to JSON.
- `src/web/skill-health-service.ts` — Child process calling `generateSkillHealthReport()`, serializes `SkillHealthReport` to JSON.
- `web/app/api/forensics/route.ts` — GET route → `collectForensicsData()`.
- `web/app/api/doctor/route.ts` — GET route → `collectDoctorData(scope)`, POST route → `runDoctorFix(scope)`.
- `web/app/api/skill-health/route.ts` — GET route → `collectSkillHealthData()`.
- `web/lib/diagnostics-types.ts` — Browser-safe interfaces mirroring ForensicReport, DoctorReport, SkillHealthReport.

**Files to modify:**
- `web/components/gsd/command-surface.tsx` — Replace the generic `gsd-*` placeholder for `gsd-forensics`, `gsd-doctor`, `gsd-skill-health` with real panel components. Either inline renderers or extracted components.
- `web/lib/gsd-workspace-store.tsx` — Add fetch methods for each diagnostic panel, add state fields to track loading/data/error for each.
- `web/lib/command-surface-contract.ts` — Add state fields for diagnostics panels to `WorkspaceCommandSurfaceState` (similar to `recovery: CommandSurfaceRecoveryState`).

**Test files:**
- `src/tests/web-diagnostics-contract.test.ts` — Contract test that the three API services return expected shapes. Can follow the pattern of existing contract tests.

### Build Order

**Task 1: Services and API routes (foundation — unblocks everything)**
Create the three service files and three API routes. Prove they return valid JSON by running `curl` against a dev server or by a simple contract test that imports and calls the service functions. This is the hardest part because it involves child-process wiring with the resolve-ts.mjs loader.

Build doctor first — it has the most complexity (scope param, fix action via POST, existing partial coverage in recovery service for reference). Then forensics (needs `buildForensicReport` to be accessible — either export it or invoke it in the child script by calling the private function through the module). Then skill-health (simplest, no Maps to convert).

**Task 2: Browser-safe types**
Define `web/lib/diagnostics-types.ts` with browser-safe interfaces for all three report types. These mirror upstream types but avoid importing from Node.js modules. Follow the pattern of `web/lib/visualizer-types.ts`.

**Task 3: Store wiring**
Add state fields and fetch methods to the workspace store and command surface contract. Follow the recovery diagnostics pattern: pending/loaded/error states, fetch on section open, action result handling.

**Task 4: Panel components**
Replace the `gsd-*` placeholder rendering in `command-surface.tsx` with real panel content for each diagnostic surface. Forensics: anomaly list with severity badges, recent units table, crash lock status. Doctor: issue list with severity/scope filtering, fixable count, "Apply Fixes" button. Skill-health: skill table with pass rates, token trends, stale/declining flags, heal suggestions.

**Task 5: Contract tests**
Test that dispatch → surface open → data fetch → render pipeline works for all three panels. Test the API route response shapes. Test the doctor fix POST action.

### Verification Approach

1. **Build passes:** `npm run build` and `npm run build:web-host` succeed with all new types, routes, and components.
2. **API routes return data:** `curl http://localhost:3000/api/forensics`, `/api/doctor`, `/api/skill-health` return valid JSON with expected top-level fields.
3. **Doctor fix works:** `curl -X POST http://localhost:3000/api/doctor` returns fixesApplied array.
4. **Existing tests pass:** `npx tsx --test src/tests/web-command-parity-contract.test.ts` — all 118 tests still pass (no regressions in dispatch).
5. **New contract test:** `npx tsx --test src/tests/web-diagnostics-contract.test.ts` validates service response shapes.
6. **Panel renders:** Opening `/gsd forensics`, `/gsd doctor`, `/gsd skill-health` in the browser shows real data panels instead of placeholder text.

## Constraints

- **Child-process pattern is mandatory** — all three upstream modules use `.js` import extensions that Turbopack cannot resolve. Direct import fails at build time. (KNOWLEDGE.md: "Turbopack Cannot Resolve .js→.ts Extension Imports")
- **`buildForensicReport()` is private** — either export it from forensics.ts (preferred, minimal change) or call the module's internal function chain from the child script by importing `forensics.ts` and running the build logic inline. Exporting is cleaner.
- **Doctor already partially surfaced** — the recovery diagnostics service already calls `runGSDDoctor()` via child process. The new doctor panel must show the full report (all issues, all severities) with scope/severity filtering, not just the recovery summary view. Reuse the child-script pattern from recovery-diagnostics-service.ts but with different output shaping.
- **No web imports from extension modules** — per KNOWLEDGE.md: "Web code only imports from native-git-bridge.ts — NOT from auto.ts, index.ts, commands.ts, state.ts, preferences.ts, types.ts, or git-service.ts."

## Common Pitfalls

- **ForensicReport contains Maps** — No, forensics.ts uses plain arrays and objects (unlike visualizer-data.ts which uses Maps for criticalPath). No Map→Record conversion needed for forensics. Doctor and skill-health also use plain objects.
- **Forensics needs a "problem description" parameter** — The TUI `handleForensics()` prompts the user for a problem description. The browser panel should either accept it as a query param or default to a generic scan (skip the prompt and send empty string). Since `buildForensicReport()` doesn't need the problem description (only `saveForensicReport` and the prompt builder use it), this is a non-issue for the data API.
- **Doctor fix is destructive** — The `runGSDDoctor(basePath, { fix: true })` modifies files on disk (marks tasks done, creates stub summaries, clears locks, etc.). The POST endpoint must be clearly separated from the GET endpoint and should require confirmation in the UI.

## Open Risks

- **`buildForensicReport()` is module-private** — The child script can still call it by importing the module and invoking internal functions (Node doesn't enforce TS module privacy at runtime), but exporting it is cleaner. If the planner decides not to modify upstream files, the child script can replicate the build logic or call `handleForensics` with a mock context. Exporting `buildForensicReport` is the lowest-risk path.
