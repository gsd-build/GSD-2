---
id: T02
parent: S02
milestone: M001
provides:
  - 70-assertion round-trip fidelity test suite for all importer functions
  - Auto-migration hookup in startAuto() — silent DB creation on first run
key_files:
  - src/resources/extensions/gsd/tests/md-importer.test.ts
  - src/resources/extensions/gsd/auto.ts
key_decisions:
  - Dynamic import for gsd-db and md-importer in startAuto() to avoid top-level dependency on SQLite
  - Auto-migration checks for DECISIONS.md, REQUIREMENTS.md, or milestones/ before attempting import
patterns_established:
  - Auto-migration guarded by try/catch with stderr logging — failure never blocks auto-mode
  - gsdDir parameter convention (project basePath, not .gsd/) propagated to auto-migration call
observability_surfaces:
  - stderr: "gsd-migrate: auto-migration failed: <message>" when auto-migration errors (graceful degradation)
  - stderr: "gsd-migrate: imported N decisions, N requirements, N artifacts" on successful auto-migration
  - .gsd/gsd.db file presence after first auto-mode run on projects with markdown files
duration: 12m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T02: Round-trip fidelity tests + auto-migration hookup

**Enhanced md-importer test suite to 70 assertions covering all field types, malformed input, and validated-section parsing; wired auto-migration into startAuto() with graceful degradation.**

## What Happened

1. **Test enhancements** — T01 created the initial test file with 57 assertions. Added 13 more: R017 validated-section assertions (status, validation, notes from Proof bullet), R030/R040 class+description assertions for deferred/out-of-scope, malformed/empty row skip test for decisions parser, R002 why/notes/validation round-trip assertions.

2. **Auto-migration hookup** — Added auto-migration block to `startAuto()` in auto.ts between the `.gsd/` bootstrap and crash recovery sections. Logic: if `.gsd/` exists but `gsd.db` doesn't, and markdown files exist (DECISIONS.md, REQUIREMENTS.md, or milestones/), dynamically import gsd-db and md-importer, open the DB, and run `migrateFromMarkdown(base)`. Uses `await import()` to avoid top-level dependency on SQLite. Entire block wrapped in try/catch — migration failure logs to stderr and auto-mode continues (D003 graceful degradation).

3. **Verified all 9 must-haves** — Every field of Decision and Requirement types tested via round-trip, hierarchy artifacts content-checked, supersession chains validated, idempotent re-import confirmed, missing files handled, schema v1→v2 migration verified, auto-migration compiles clean, 284/284 tests pass.

## Verification

- `npx tsc --noEmit` — clean compilation (0 errors)
- `node --test src/resources/extensions/gsd/tests/md-importer.test.ts` — 70/70 assertions pass
- `npm run test:unit` — 284/284 pass, 0 failures, 0 regressions

### Slice-level verification status (S02):
- ✅ DECISIONS.md parsing with supersession detection
- ✅ REQUIREMENTS.md field extraction across all status sections (Active, Validated, Deferred, Out of Scope)
- ✅ Hierarchy artifact import for each artifact type
- ✅ Schema v1→v2 migration on existing DBs
- ✅ Idempotent re-import (double import produces identical results)
- ✅ Missing file graceful handling
- ✅ migrateFromMarkdown() orchestrator on realistic fixture tree
- ✅ Round-trip: imported field values match source markdown
- ✅ Existing tests still pass: 284/284, 0 failures
- ✅ Auto-migration in startAuto() compiles and is guarded by try/catch

All slice verification checks pass. S02 is complete.

## Diagnostics

- **Auto-migration failure:** `gsd-migrate: auto-migration failed: <message>` on stderr — auto-mode continues without DB
- **Successful migration:** `gsd-migrate: imported N decisions, N requirements, N artifacts` on stderr
- **DB presence:** `.gsd/gsd.db` appears after first auto-mode run on projects with markdown files
- **Test inspection:** `node --test src/resources/extensions/gsd/tests/md-importer.test.ts` shows all 70 assertions

## Deviations

- T01 already created `md-importer.test.ts` with 57 assertions covering most T02 requirements. T02 enhanced the file (added 13 assertions) rather than creating it from scratch.

## Known Issues

None

## Files Created/Modified

- `src/resources/extensions/gsd/tests/md-importer.test.ts` — enhanced: +13 assertions for validated section, malformed rows, deferred/out-of-scope fields, additional round-trip coverage
- `src/resources/extensions/gsd/auto.ts` — modified: auto-migration block in startAuto() with dynamic imports and try/catch guard
- `.gsd/milestones/M001/slices/S02/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
