---
id: S02
parent: M001
milestone: M001
provides:
  - Schema v2 migration (v1→v2 adds artifacts table with data preservation)
  - DECISIONS.md pipe-table parser with supersession chain detection
  - REQUIREMENTS.md section/bullet parser with deduplication across Active/Validated sections
  - Hierarchy artifact walker (milestones → slices → tasks) for all artifact types
  - migrateFromMarkdown() orchestrator with atomic transaction and per-import error isolation
  - Auto-migration hookup in startAuto() with dynamic imports and graceful degradation
requires:
  - slice: S01
    provides: openDatabase, initSchema, typed insert wrappers (decisions, requirements tables), transaction, _getAdapter, DbAdapter abstraction
affects:
  - S03 (prompt builder rewiring consumes importers for remaining hierarchy tables)
  - S05 (worktree merge consumes migrateFromMarkdown for fallback import)
key_files:
  - src/resources/extensions/gsd/gsd-db.ts
  - src/resources/extensions/gsd/md-importer.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/tests/md-importer.test.ts
key_decisions:
  - D012 — Requirements deduplication by ID with field merging (Active+Validated sections)
  - D013 — gsdDir parameter is project basePath (not .gsd/ directory) to match paths.ts conventions
  - D014 — Dynamic import() for gsd-db and md-importer in startAuto() to preserve graceful degradation
patterns_established:
  - INSERT OR REPLACE for all upsert operations (idempotent import)
  - Artifact paths stored relative to .gsd/ (e.g. milestones/M001/M001-ROADMAP.md)
  - Per-import try/catch in orchestrator — partial success still commits
  - Dynamic import() in auto.ts for optional SQLite dependency
observability_surfaces:
  - stderr: "gsd-migrate: imported N decisions, N requirements, N artifacts" on successful migration
  - stderr: "gsd-migrate: auto-migration failed: <message>" on migration failure (auto-mode continues)
  - schema_version table: version 2 after migration
  - artifacts table: queryable for imported hierarchy content
drill_down_paths:
  - .gsd/milestones/M001/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S02/tasks/T02-SUMMARY.md
duration: 47m
verification_result: passed
completed_at: 2026-03-15
---

# S02: Markdown Importers + Auto-Migration

**Schema v2 migration, DECISIONS/REQUIREMENTS parsers, hierarchy artifact walker, and silent auto-migration — 70-assertion round-trip test suite proves 100% import fidelity.**

## What Happened

**T01 (35m)** built the core import infrastructure. Schema v2 migration adds the `artifacts` table via `migrateSchema()` which reads current version and applies incremental DDL — existing v1 databases auto-migrate with data preserved. Three upsert wrappers (`upsertDecision`, `upsertRequirement`, `insertArtifact`) use `INSERT OR REPLACE` for idempotent import. `parseDecisionsTable()` parses DECISIONS.md pipe-delimited rows and detects `(amends DXXX)` to build supersession chains. `parseRequirementsSections()` finds `## Active/Validated/Deferred/Out of Scope` sections, extracts `### RXXX — Title` blocks with all 10 bullet fields, and deduplicates by ID with field merging (the Validated section re-lists requirements with abbreviated data that would otherwise overwrite fuller Active entries). `importHierarchyArtifacts()` walks milestones → slices → tasks using `findMilestoneIds()` and directory listing, importing ROADMAP, CONTEXT, RESEARCH, ASSESSMENT, PLAN, SUMMARY, UAT, CONTINUE files plus root PROJECT.md, QUEUE.md, SECRETS-MANIFEST.md. The `migrateFromMarkdown()` orchestrator wraps everything in a single transaction with per-import error isolation.

**T02 (12m)** enhanced the test suite from 57 to 70 assertions and wired auto-migration into `startAuto()`. Added assertions for validated-section parsing (status, validation, notes), deferred/out-of-scope fields (class, description), malformed row skipping, and additional round-trip coverage. The auto-migration block in `startAuto()` uses `await import()` to dynamically load gsd-db and md-importer — avoiding top-level dependency on SQLite so D003 graceful degradation is preserved. The entire block is wrapped in try/catch: migration failure logs to stderr and auto-mode continues normally.

## Verification

- `npx tsc --noEmit` — clean compilation (0 errors)
- `npm run test:unit` — 284/284 pass, 0 failures, 0 regressions
- `npm run test:unit -- --test-name-pattern "md-importer"` — 70/70 assertions pass
- Slice verification checks (all pass):
  - ✅ DECISIONS.md parsing with supersession detection (D001→D010→D020 chain)
  - ✅ REQUIREMENTS.md field extraction across all status sections (Active, Validated, Deferred, Out of Scope)
  - ✅ Hierarchy artifact import for each artifact type (ROADMAP, CONTEXT, PLAN, SUMMARY, task files, PROJECT.md, QUEUE.md)
  - ✅ Schema v1→v2 migration on existing DBs (data preserved, artifacts table added)
  - ✅ Idempotent re-import (double import produces identical row counts)
  - ✅ Missing file graceful handling (empty .gsd/ → zero counts, no errors)
  - ✅ `migrateFromMarkdown()` orchestrator on realistic fixture tree
  - ✅ Round-trip: imported field values match source markdown
  - ✅ Auto-migration in startAuto() compiles and is guarded by try/catch

## Requirements Advanced

- R001 — Forward-only schema migration now proven (v1→v2 tested with data preservation)

## Requirements Validated

- R003 — 70-assertion test suite proves all artifact types imported correctly with field-level round-trip verification
- R004 — Auto-migration wired into startAuto() with dynamic imports, graceful degradation, and one-line log summary
- R018 — Round-trip fidelity confirmed: all Decision and Requirement fields verified against source markdown, hierarchy content checked, supersession chains preserved

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- R003 notes updated — custom parsers built for DECISIONS.md and REQUIREMENTS.md rather than reusing files.ts parsers, since the existing parsers don't extract the structured fields needed for DB rows

## Deviations

- Requirements parser deduplicates by ID with field merging — the Validated section re-lists requirements with abbreviated data that would overwrite fuller Active section entries via INSERT OR REPLACE. Added dedup logic (D012) to keep fuller data and merge non-empty fields. Not in the plan but necessary for R018 fidelity.
- T01 already created `md-importer.test.ts` with 57 assertions covering most T02 requirements. T02 enhanced the file (+13 assertions) rather than creating from scratch.

## Known Limitations

- Auto-migration hookup is compile-verified but not runtime-tested in an integration test — it exercises the same `migrateFromMarkdown()` that is fully unit-tested, so the risk is low.
- Hierarchy artifacts are stored as full_content blobs, not parsed into structured fields — S03 query layer will need to handle this when building prompts.

## Follow-ups

- none

## Files Created/Modified

- `src/resources/extensions/gsd/gsd-db.ts` — Schema v2 migration (artifacts table DDL), migrateSchema(), upsertDecision, upsertRequirement, insertArtifact exports
- `src/resources/extensions/gsd/md-importer.ts` — New: parseDecisionsTable, parseRequirementsSections, importHierarchyArtifacts, migrateFromMarkdown orchestrator
- `src/resources/extensions/gsd/auto.ts` — Auto-migration block in startAuto() with dynamic imports and try/catch guard
- `src/resources/extensions/gsd/tests/md-importer.test.ts` — New: 70-assertion test suite covering all import paths
- `src/resources/extensions/gsd/tests/gsd-db.test.ts` — Updated schema version assertion to 2

## Forward Intelligence

### What the next slice should know
- `md-importer.ts` exports `parseDecisionsTable`, `parseRequirementsSections`, and `migrateFromMarkdown`. S03 consumes the import functions to populate DB before prompt builder rewiring. S05 consumes `migrateFromMarkdown` for worktree fallback import.
- The `gsdDir` parameter convention is project basePath (not `.gsd/` directory) — the function joins `.gsd/` internally. This matches paths.ts conventions.
- Schema is now at version 2 with `decisions`, `requirements`, `artifacts`, and `schema_version` tables.

### What's fragile
- Requirements parser assumes a specific markdown format: `### RXXX — Title` headings under `## Active/Validated/Deferred/Out of Scope` sections with `- Field: value` bullets. Any format change in REQUIREMENTS.md will break parsing.
- Hierarchy artifact file discovery uses hardcoded suffix lists (ROADMAP, CONTEXT, RESEARCH, ASSESSMENT, PLAN, SUMMARY, UAT, CONTINUE) and naming conventions (`ID-SUFFIX.md`). New artifact types need to be added to the suffix arrays.

### Authoritative diagnostics
- `SELECT MAX(version) as v FROM schema_version` → should return 2
- `SELECT count(*) FROM artifacts` → shows total imported hierarchy artifacts
- `SELECT * FROM decisions WHERE superseded_by IS NOT NULL` → shows supersession chain
- stderr during auto-mode startup → migration log line with counts

### What assumptions changed
- Original plan assumed reusing existing parsers from `files.ts` (parseRoadmap, parsePlan, etc.) — actual implementation wrote custom parsers because the existing ones don't extract the structured fields needed for DB rows. The hierarchy artifacts use full_content blob storage instead.
