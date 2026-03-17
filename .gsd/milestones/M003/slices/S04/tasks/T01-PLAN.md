---
estimated_steps: 8
estimated_files: 8
---

# T01: Backend services, API routes, and browser-safe types

**Slice:** S04 — Diagnostics panels — forensics, doctor, skill-health
**Milestone:** M003

## Description

Create the backend plumbing for three diagnostic panels: child-process services that call upstream forensics/doctor/skill-health modules, API routes that serve the results as JSON, and browser-safe type definitions. This follows the exact pattern established by `src/web/visualizer-service.ts` and `web/app/api/visualizer/route.ts` — every sub-problem has a proven reference.

The one prerequisite change is exporting `buildForensicReport()` from `forensics.ts`, which is currently module-private. This is a 1-line change (add `export` keyword) and is the lowest-risk path per the research doc.

**Relevant skills:** None needed — this is pure pattern replication from existing services.

## Steps

1. **Export `buildForensicReport` from forensics.ts.** Open `src/resources/extensions/gsd/forensics.ts`, find the line `async function buildForensicReport(basePath: string): Promise<ForensicReport>` and add the `export` keyword. This is the only upstream modification in this slice.

2. **Create `web/lib/diagnostics-types.ts`.** Define browser-safe interfaces mirroring the upstream types. Include:
   - `ForensicAnomaly` — type (7 variants), severity, unitType?, unitId?, summary, details
   - `ForensicUnitTrace` — file, unitType, unitId, seq, mtime (omit ExecutionTrace — too deep, serialize as nested object or flatten key counts)
   - `ForensicReport` — gsdVersion, timestamp, basePath, activeMilestone, activeSlice, anomalies, recentUnits, crashLock (nullable), doctorIssueCount (number instead of full DoctorIssue[]), unitTraceCount, completedKeyCount, metrics summary (totalUnits, totalCost, totalDuration — flattened from MetricsLedger)
   - `DoctorSeverity` — "info" | "warning" | "error"
   - `DoctorIssue` — severity, code, scope, unitId, message, file?, fixable
   - `DoctorReport` — ok, issues, fixesApplied, summary (total/errors/warnings/infos/fixable/byCode)
   - `DoctorFixResult` — ok, fixesApplied
   - `SkillHealthEntry` — name, totalUses, successRate, avgTokens, tokenTrend, lastUsed, staleDays, avgCost, flagged, flagReason?
   - `SkillHealthReport` — generatedAt, totalUnitsWithSkills, skills, staleSkills, decliningSkills, suggestions
   - `SkillHealSuggestion` — skillName, trigger, message, severity

   Add a header comment matching the pattern in `web/lib/visualizer-types.ts`: "Browser-safe TypeScript interfaces for diagnostics panels. Mirrors upstream types — do NOT import from those modules directly."

3. **Create `src/web/forensics-service.ts`.** Follow `visualizer-service.ts` exactly:
   - Import `execFile` from `node:child_process`, `existsSync` from `node:fs`, `join` from `node:path`
   - Import `resolveBridgeRuntimeConfig` from `./bridge-service.ts`
   - The child script: import `buildForensicReport` from forensics.ts via `pathToFileURL`, call it with `basePath`, serialize to JSON. The forensic report has no Maps — `JSON.stringify` works directly. However, simplify the output: instead of sending the full `unitTraces` (which contain deep `ExecutionTrace` objects with arrays of tool calls), send a count + simplified traces (just file/unitType/unitId/seq/mtime). Instead of sending full `metrics` (MetricsLedger with nested UnitMetrics[]), send a summary object (totalUnits, totalCost, totalDuration). Instead of full `doctorIssues` array, send the count (the doctor panel has its own dedicated API route for full issue details). Keep full `anomalies`, `recentUnits`, `crashLock`, `completedKeys` count, and metadata fields.
   - Export `collectForensicsData()` returning `Promise<ForensicReport>` (the browser-safe version from diagnostics-types.ts — do NOT import from forensics.ts).
   - Use env vars for module path and basePath, matching the visualizer pattern.
   - Max buffer: 2MB (same as visualizer).

4. **Create `src/web/doctor-service.ts`.** Same child-process pattern:
   - The child script calls `runGSDDoctor(basePath, { fix, scope })` and `summarizeDoctorIssues(report.issues)`.
   - For GET (diagnostic view): `fix: false`, optional `scope` from env var. Return full issues array + summary.
   - For POST (apply fixes): `fix: true`, optional `scope` from env var. Return `{ ok: report.ok, fixesApplied: report.fixesApplied }`.
   - Export two functions: `collectDoctorData(scope?: string)` and `applyDoctorFixes(scope?: string)`.
   - Important: the recovery-diagnostics-service already calls `runGSDDoctor` — reference its child-script pattern for how to pass scope/fix params via env vars.

5. **Create `src/web/skill-health-service.ts`.** Simplest of the three:
   - Child script calls `generateSkillHealthReport(basePath)` and writes JSON to stdout.
   - `SkillHealthReport` is already all plain objects — no conversion needed.
   - Export `collectSkillHealthData()` returning `Promise<SkillHealthReport>`.

6. **Create `web/app/api/forensics/route.ts`.** Follow the visualizer route pattern exactly:
   ```
   export const runtime = "nodejs"
   export const dynamic = "force-dynamic"
   export async function GET(): Promise<Response> { ... }
   ```
   Import `collectForensicsData` from the service. Wrap in try/catch, return JSON with `Cache-Control: no-store`.

7. **Create `web/app/api/doctor/route.ts`.** Same pattern but with both GET and POST:
   - GET: read `scope` from `request.nextUrl.searchParams`, call `collectDoctorData(scope)`.
   - POST: read `scope` from request body JSON (`{ scope?: string }`), call `applyDoctorFixes(scope)`.
   - Both return JSON with `Cache-Control: no-store`.

8. **Create `web/app/api/skill-health/route.ts`.** Same as visualizer route — GET only, call `collectSkillHealthData()`.

## Must-Haves

- [ ] `buildForensicReport` is exported from `src/resources/extensions/gsd/forensics.ts`
- [ ] `web/lib/diagnostics-types.ts` exports browser-safe interfaces for all three report types
- [ ] Three service files exist in `src/web/` following the child-process pattern (execFile + resolve-ts.mjs + --experimental-strip-types)
- [ ] Three API route files exist under `web/app/api/` (forensics GET, doctor GET+POST, skill-health GET)
- [ ] Doctor POST route calls `runGSDDoctor` with `fix: true` — clearly separated from the GET diagnostic view
- [ ] No web code imports directly from upstream extension modules (all via child-process)
- [ ] `npm run build` passes

## Verification

- `npm run build` — exit 0 (confirms all TypeScript compiles)
- `rg "export async function buildForensicReport" src/resources/extensions/gsd/forensics.ts` — matches
- `ls src/web/forensics-service.ts src/web/doctor-service.ts src/web/skill-health-service.ts` — all exist
- `ls web/app/api/forensics/route.ts web/app/api/doctor/route.ts web/app/api/skill-health/route.ts` — all exist
- `ls web/lib/diagnostics-types.ts` — exists
- `rg "from.*extensions/gsd/" src/web/forensics-service.ts src/web/doctor-service.ts src/web/skill-health-service.ts` — no matches (services don't import extension modules directly; they reference them via env vars for child processes)

## Inputs

- `src/web/visualizer-service.ts` — reference pattern for child-process service (execFile, resolve-ts.mjs, env vars, JSON parsing)
- `web/app/api/visualizer/route.ts` — reference pattern for API route (runtime, dynamic, GET handler, error handling)
- `src/web/recovery-diagnostics-service.ts` — reference for doctor child-script pattern (scope param, existing runGSDDoctor call)
- `src/resources/extensions/gsd/forensics.ts` — upstream module, `buildForensicReport()` to export
- `src/resources/extensions/gsd/doctor.ts` — upstream module, `runGSDDoctor()`, `summarizeDoctorIssues()`, exported types
- `src/resources/extensions/gsd/skill-health.ts` — upstream module, `generateSkillHealthReport()`, exported types
- `web/lib/visualizer-types.ts` — reference pattern for browser-safe type definitions

## Observability Impact

- **New API surfaces:** `GET /api/forensics`, `GET /api/doctor`, `POST /api/doctor`, `GET /api/skill-health` — each returns JSON payload or `{ error: string }` with 500 on child-process failure
- **Inspection:** `curl http://localhost:3000/api/forensics` (anomalies, recentUnits, crashLock), `/api/doctor` (issues array + summary), `/api/skill-health` (skills array + suggestions)
- **Failure signals:** child-process stderr is captured in the error message returned to the caller; each service rejects its Promise with a descriptive Error including stderr content
- **Doctor fix action:** `POST /api/doctor` returns `{ ok, fixesApplied }` on success — `fixesApplied` is an inspectable string array of what was changed

## Expected Output

- `src/resources/extensions/gsd/forensics.ts` — 1-line change: `export` added to `buildForensicReport`
- `web/lib/diagnostics-types.ts` — new file with browser-safe interfaces (~100-120 lines)
- `src/web/forensics-service.ts` — new child-process service (~80-100 lines)
- `src/web/doctor-service.ts` — new child-process service with GET+POST functions (~100-120 lines)
- `src/web/skill-health-service.ts` — new child-process service (~70-80 lines)
- `web/app/api/forensics/route.ts` — new GET route (~25 lines)
- `web/app/api/doctor/route.ts` — new GET+POST route (~50 lines)
- `web/app/api/skill-health/route.ts` — new GET route (~25 lines)
