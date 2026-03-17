---
id: T01
parent: S04
milestone: M003
provides:
  - browser-safe diagnostics type definitions (forensics, doctor, skill-health)
  - child-process services for forensics, doctor, and skill-health
  - API routes for /api/forensics (GET), /api/doctor (GET+POST), /api/skill-health (GET)
  - exported buildForensicReport from upstream forensics.ts
key_files:
  - web/lib/diagnostics-types.ts
  - src/web/forensics-service.ts
  - src/web/doctor-service.ts
  - src/web/skill-health-service.ts
  - web/app/api/forensics/route.ts
  - web/app/api/doctor/route.ts
  - web/app/api/skill-health/route.ts
key_decisions:
  - ForensicReport browser type flattens unitTraces (strips ExecutionTrace), metrics (summary only), and doctorIssues (count only)
patterns_established:
  - diagnostics child-process services follow visualizer-service.ts pattern exactly (execFile + resolve-ts.mjs + experimental-strip-types + env var module paths)
  - doctor service exposes two functions (collectDoctorData + applyDoctorFixes) with scope passed via GSD_DOCTOR_SCOPE env var
observability_surfaces:
  - GET /api/forensics → ForensicReport JSON or { error } 500
  - GET /api/doctor?scope=X → DoctorReport JSON or { error } 500
  - POST /api/doctor → DoctorFixResult JSON or { error } 500
  - GET /api/skill-health → SkillHealthReport JSON or { error } 500
duration: 12m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T01: Backend services, API routes, and browser-safe types

**Created three child-process services, three API routes, and browser-safe type definitions for the forensics/doctor/skill-health diagnostic panels.**

## What Happened

Added `export` to `buildForensicReport()` in forensics.ts (the only upstream change). Created `web/lib/diagnostics-types.ts` with browser-safe interfaces for all three report shapes — ForensicReport gets a simplified representation (ExecutionTrace stripped to counts, MetricsLedger flattened to totalUnits/totalCost/totalDuration, doctorIssues replaced with count).

Built three service files (`forensics-service.ts`, `doctor-service.ts`, `skill-health-service.ts`) following the visualizer-service.ts child-process pattern exactly. Doctor service exposes two functions: `collectDoctorData(scope?)` for read-only diagnostics and `applyDoctorFixes(scope?)` for mutating fix actions.

Created three API route files: forensics (GET), doctor (GET + POST), skill-health (GET). All follow the visualizer route pattern with `runtime = "nodejs"`, `dynamic = "force-dynamic"`, try/catch error handling, and `Cache-Control: no-store`.

## Verification

- `npm run build` — exit 0 (all TypeScript compiles cleanly)
- `npm run build:web-host` — exit 0 (Next.js production build succeeds; all three routes appear in route table: `/api/forensics`, `/api/doctor`, `/api/skill-health`)
- `rg "export async function buildForensicReport" src/resources/extensions/gsd/forensics.ts` — matches
- `ls src/web/forensics-service.ts src/web/doctor-service.ts src/web/skill-health-service.ts` — all exist
- `ls web/app/api/forensics/route.ts web/app/api/doctor/route.ts web/app/api/skill-health/route.ts` — all exist
- `ls web/lib/diagnostics-types.ts` — exists
- `rg "from.*extensions/gsd/" src/web/forensics-service.ts src/web/doctor-service.ts src/web/skill-health-service.ts` — no matches (services don't import extension modules directly)
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — 114 pass, 4 fail (pre-existing failures on `/gsd visualize` — unrelated to this task)

## Diagnostics

- `curl http://localhost:3000/api/forensics` → ForensicReport JSON with anomalies, recentUnits, crashLock, metrics summary
- `curl http://localhost:3000/api/doctor` → DoctorReport JSON with full issues array + summary
- `curl -X POST http://localhost:3000/api/doctor -H 'Content-Type: application/json' -d '{"scope":"M003"}'` → DoctorFixResult with fixesApplied array
- `curl http://localhost:3000/api/skill-health` → SkillHealthReport JSON with skills, suggestions, staleSkills
- All routes return `{ error: string }` with status 500 on child-process failure, with stderr captured in the error message

## Deviations

None.

## Known Issues

- Parity tests have 4 pre-existing failures on `/gsd visualize` dispatch mapping — not introduced by this task.

## Files Created/Modified

- `src/resources/extensions/gsd/forensics.ts` — added `export` keyword to `buildForensicReport`
- `web/lib/diagnostics-types.ts` — new: browser-safe interfaces for ForensicReport, DoctorReport, DoctorIssue, DoctorSummary, DoctorFixResult, SkillHealthReport, SkillHealthEntry, SkillHealSuggestion
- `src/web/forensics-service.ts` — new: child-process service calling buildForensicReport with simplified output
- `src/web/doctor-service.ts` — new: child-process service with collectDoctorData and applyDoctorFixes
- `src/web/skill-health-service.ts` — new: child-process service calling generateSkillHealthReport
- `web/app/api/forensics/route.ts` — new: GET route for forensics data
- `web/app/api/doctor/route.ts` — new: GET + POST route for doctor diagnostics and fix actions
- `web/app/api/skill-health/route.ts` — new: GET route for skill health data
- `.gsd/milestones/M003/slices/S04/tasks/T01-PLAN.md` — added Observability Impact section
