# S04: Diagnostics panels — forensics, doctor, skill-health

**Goal:** Three browser panels replace the S02 placeholder stubs with real diagnostic data: `/gsd forensics` shows anomaly scanning results, `/gsd doctor` shows health checks with fix actions, `/gsd skill-health` shows per-skill pass rates and heal suggestions.

**Demo:** User types `/gsd forensics` in the browser terminal → command surface sheet opens with real anomaly list, recent units, crash lock status. `/gsd doctor` → full issue list with severity/scope badges and "Apply Fixes" button. `/gsd skill-health` → skill table with pass rates, token trends, staleness flags, and suggestions.

## Must-Haves

- Three child-process services (`forensics-service.ts`, `doctor-service.ts`, `skill-health-service.ts`) following the visualizer/recovery pattern
- Three API routes (`/api/forensics` GET, `/api/doctor` GET+POST, `/api/skill-health` GET) returning valid JSON
- Browser-safe type definitions in `web/lib/diagnostics-types.ts` mirroring upstream report shapes
- Store fetch methods and diagnostics state fields in workspace store and contract
- Real panel components replacing placeholder rendering for `gsd-forensics`, `gsd-doctor`, `gsd-skill-health` sections
- Doctor POST route applies fixes via `runGSDDoctor(basePath, { fix: true, scope })` — clearly separated from GET
- Contract test validating service response shapes and dispatch→render pipeline
- `buildForensicReport()` exported from upstream `forensics.ts` (currently module-private)

## Proof Level

- This slice proves: integration
- Real runtime required: yes (child processes call upstream modules against real project data)
- Human/UAT required: no (contract tests + build verification sufficient)

## Verification

- `npx tsx --test src/tests/web-diagnostics-contract.test.ts` — passes with assertions on all three service response shapes, dispatch→surface pipeline, and doctor fix action
- `npx tsx --test src/tests/web-command-parity-contract.test.ts` — all 118 tests still pass (no dispatch regressions)
- `npm run build` — exit 0
- `npm run build:web-host` — exit 0

## Observability / Diagnostics

- Runtime signals: each API route returns `{ error: string }` with status 500 on child-process failure; doctor POST returns `{ fixesApplied: string[] }` on success
- Inspection surfaces: `curl http://localhost:3000/api/forensics`, `/api/doctor`, `/api/skill-health` return inspectable JSON; `curl -X POST http://localhost:3000/api/doctor` returns fix results
- Failure visibility: child-process stderr captured in error message; store tracks loading/error/loaded phase per diagnostic panel
- Redaction constraints: forensics report may contain file paths from basePath — no secrets expected

## Integration Closure

- Upstream surfaces consumed: `forensics.ts` (`buildForensicReport`), `doctor.ts` (`runGSDDoctor`, `summarizeDoctorIssues`, `filterDoctorIssues`), `skill-health.ts` (`generateSkillHealthReport`), all via child-process pattern
- New wiring introduced: 3 services → 3 API routes → store fetch methods → panel components in command surface sheet; `buildForensicReport` exported from forensics.ts
- What remains before the milestone is truly usable end-to-end: S05 (knowledge/captures), S06 (settings), S07 (remaining commands), S08 (parity audit), S09 (test hardening)

## Tasks

- [x] **T01: Backend services, API routes, and browser-safe types** `est:35m`
  - Why: Foundation for all three panels — child-process services that call upstream modules, API routes that serve JSON, and browser-safe types. This is the riskiest work (child-process wiring) and unblocks all frontend work.
  - Files: `src/resources/extensions/gsd/forensics.ts`, `src/web/forensics-service.ts`, `src/web/doctor-service.ts`, `src/web/skill-health-service.ts`, `web/app/api/forensics/route.ts`, `web/app/api/doctor/route.ts`, `web/app/api/skill-health/route.ts`, `web/lib/diagnostics-types.ts`
  - Do: Export `buildForensicReport` from forensics.ts. Create three service files following the visualizer-service.ts pattern (execFile + resolve-ts.mjs + --experimental-strip-types). Create three API route files following the visualizer route pattern (GET → service call → JSON response). Doctor route also needs a POST handler for fix actions. Create diagnostics-types.ts with browser-safe interfaces mirroring ForensicReport, DoctorReport, DoctorIssue, DoctorSummary, SkillHealthReport, SkillHealthEntry, SkillHealSuggestion. ForensicReport has no Maps — straight JSON.stringify works. Doctor service passes scope param from query string and fix flag from POST. Skill-health is simplest — no params needed.
  - Verify: `npm run build` succeeds. Each route file is syntactically valid TypeScript that imports from its service.
  - Done when: All 8 files exist with correct imports, types, and patterns. Build passes.

- [x] **T02: Store wiring, contract state, and diagnostics panel components** `est:40m`
  - Why: Connects the backend services to the UI — adds diagnostics state tracking to the command surface contract, fetch methods to the workspace store, and replaces the generic placeholder rendering with real panel components.
  - Files: `web/lib/command-surface-contract.ts`, `web/lib/gsd-workspace-store.tsx`, `web/components/gsd/diagnostics-panels.tsx`, `web/components/gsd/command-surface.tsx`
  - Do: Add diagnostics state types to contract (phase/data/error for each of forensics, doctor, skill-health — follow CommandSurfaceRecoveryState pattern). Add fetch methods to store (loadForensicsDiagnostics, loadDoctorDiagnostics, applyDoctorFixes, loadSkillHealthDiagnostics — follow loadRecoveryDiagnostics pattern). Create diagnostics-panels.tsx with ForensicsPanel, DoctorPanel, SkillHealthPanel components. Wire panels into command-surface.tsx renderSection() replacing the gsd-* placeholder case for these three surfaces. Forensics panel: anomaly list with severity badges, recent units table, crash lock status. Doctor panel: issue list with severity/scope filtering, fixable count, "Apply Fixes" button. Skill-health panel: skill table with pass rates, token trends, stale/declining flags, suggestions.
  - Verify: `npm run build:web-host` succeeds. The three gsd-* sections now render panel components instead of placeholder text.
  - Done when: Opening `/gsd forensics`, `/gsd doctor`, `/gsd skill-health` renders real panel components that fetch from API routes.

- [ ] **T03: Contract tests and build verification** `est:25m`
  - Why: Proves the full pipeline works — dispatch → surface → fetch → render — and catches regressions in existing dispatch.
  - Files: `src/tests/web-diagnostics-contract.test.ts`
  - Do: Create contract test file with: (1) import tests that verify diagnostics-types.ts exports expected interfaces, (2) service response shape tests that import each service function and validate return types (or mock child-process output and validate parsing), (3) dispatch pipeline tests that verify `/gsd forensics` → `gsd-forensics` surface → diagnostics panel component wiring, (4) doctor fix action test, (5) verify DoctorIssueCode type coverage. Follow the pattern from web-command-parity-contract.test.ts and web-recovery-diagnostics-contract.test.ts.
  - Verify: `npx tsx --test src/tests/web-diagnostics-contract.test.ts` passes. `npx tsx --test src/tests/web-command-parity-contract.test.ts` still passes (118 tests). `npm run build` and `npm run build:web-host` both exit 0.
  - Done when: New test file passes, existing parity tests pass, both builds succeed.

## Files Likely Touched

- `src/resources/extensions/gsd/forensics.ts` (export buildForensicReport)
- `src/web/forensics-service.ts` (new)
- `src/web/doctor-service.ts` (new)
- `src/web/skill-health-service.ts` (new)
- `web/app/api/forensics/route.ts` (new)
- `web/app/api/doctor/route.ts` (new)
- `web/app/api/skill-health/route.ts` (new)
- `web/lib/diagnostics-types.ts` (new)
- `web/lib/command-surface-contract.ts` (modify — add diagnostics state types)
- `web/lib/gsd-workspace-store.tsx` (modify — add fetch methods)
- `web/components/gsd/diagnostics-panels.tsx` (new)
- `web/components/gsd/command-surface.tsx` (modify — wire panels into renderSection)
- `src/tests/web-diagnostics-contract.test.ts` (new)
