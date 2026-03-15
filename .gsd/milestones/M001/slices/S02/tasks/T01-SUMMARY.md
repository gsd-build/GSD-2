---
id: T01
parent: S02
milestone: M001
provides:
  - Schema v2 migration (v1→v2 adds artifacts table)
  - upsertDecision / upsertRequirement / insertArtifact DB functions
  - parseDecisionsTable / parseRequirementsSections markdown parsers
  - importHierarchyArtifacts walker for milestones/slices/tasks
  - migrateFromMarkdown() orchestrator
key_files:
  - src/resources/extensions/gsd/gsd-db.ts
  - src/resources/extensions/gsd/md-importer.ts
  - src/resources/extensions/gsd/tests/md-importer.test.ts
key_decisions:
  - Requirements deduplication by ID with field merging (Active+Validated sections)
  - gsdDir parameter is project basePath (not .gsd/ directory) to match paths.ts conventions
patterns_established:
  - INSERT OR REPLACE for all upsert operations
  - Artifact paths stored relative to .gsd/ (e.g. milestones/M001/M001-ROADMAP.md)
  - Per-import try/catch in orchestrator — partial success still commits
observability_surfaces:
  - stderr: gsd-migrate one-line summary with counts
  - schema_version table: version 2 after migration
  - artifacts table: queryable for imported hierarchy content
duration: 35m
verification_result: passed
completed_at: 2026-03-15
blocker_discovered: false
---

# T01: Schema v2 migration + all markdown importers + orchestrator

**Added schema v2 migration, DECISIONS/REQUIREMENTS parsers, hierarchy artifact walker, and migrateFromMarkdown() orchestrator with full test coverage.**

## What Happened

1. **Schema v2 migration** — Bumped SCHEMA_VERSION to 2. `initSchema()` now creates the `artifacts` table alongside decisions/requirements. Added `migrateSchema()` that checks current version and applies incremental DDL. Existing v1 databases auto-migrate on open with data preserved. All schema_version inserts use named `:param` style.

2. **Upsert wrappers** — Added `upsertDecision()`, `upsertRequirement()`, and `insertArtifact()` to gsd-db.ts. All use `INSERT OR REPLACE INTO` for idempotent import. All use named colon-prefixed parameters.

3. **DECISIONS.md parser** — `parseDecisionsTable()` parses pipe-delimited table rows, skipping headers and separator rows. Detects `(amends DXXX)` in the Decision column and builds supersession chains (D020 amends D010 amends D001 → D001.superseded_by=D010, D010.superseded_by=D020).

4. **REQUIREMENTS.md parser** — `parseRequirementsSections()` finds `## Active`, `## Validated`, `## Deferred`, `## Out of Scope` sections. Extracts `### RXXX — Title` blocks with all 10 bullet fields. Status from bullet takes precedence over section heading. Handles Validated section's abbreviated format (Validated by/Proof bullets). Deduplicates by ID with field merging to preserve full data from Active section when same requirement appears in Validated.

5. **Hierarchy artifact walker** — `importHierarchyArtifacts()` walks milestones → slices → tasks using `findMilestoneIds()`, directory listing for `S\d+` dirs, and `resolveTaskFiles` for tasks. Imports ROADMAP, CONTEXT, RESEARCH, ASSESSMENT, PLAN, SUMMARY, UAT, CONTINUE files plus root PROJECT.md, QUEUE.md, SECRETS-MANIFEST.md. Paths stored relative to .gsd/.

6. **Orchestrator** — `migrateFromMarkdown(gsdDir)` opens DB if needed, wraps all imports in a single `transaction()`, catches errors per import type (graceful skip), and logs a one-line summary to stderr.

7. **Tests** — Created md-importer.test.ts with 57 assertions covering all required scenarios. Updated gsd-db.test.ts schema version assertion from 1 to 2.

## Verification

- `npx tsc --noEmit` — clean compilation
- `npm run test:unit` — 284/284 pass, 0 failures
- `md-importer.test.ts` — 57/57 assertions pass covering:
  - DECISIONS.md parsing with supersession chain (D001→D010→D020)
  - REQUIREMENTS.md field extraction across Active, Validated, Deferred, Out of Scope sections
  - Hierarchy artifact import for ROADMAP, CONTEXT, PLAN, SUMMARY, task files
  - Schema v1→v2 migration (new DB gets v2; v1 DB auto-migrates with data preserved)
  - Idempotent re-import (double import produces identical row counts)
  - Missing file graceful handling (empty .gsd/ → zero counts, no errors)
  - `migrateFromMarkdown()` orchestrator on fixture tree
  - Round-trip fidelity (imported field values match source markdown)
- Manual v1→v2 migration verified: created v1 DB with data, opened via `openDatabase()`, confirmed version=2, artifacts table exists, existing data survived

## Diagnostics

- **Runtime signal:** `gsd-migrate: imported N decisions, N requirements, N artifacts` on stderr
- **Schema inspection:** `SELECT MAX(version) as v FROM schema_version` → should return 2
- **Artifact queries:** `SELECT * FROM artifacts WHERE milestone_id = 'M001'` etc.
- **Decision supersession:** `SELECT * FROM decisions WHERE superseded_by IS NOT NULL` shows superseded rows
- **Migration failures:** Per-import errors logged as `gsd-migrate: skipping <type> import: <message>` — transaction still commits partial results

## Deviations

- Requirements parser deduplicates by ID with field merging — the Validated section re-lists requirements with abbreviated data, which would overwrite the fuller Active section entries via `INSERT OR REPLACE`. Added dedup logic to keep fuller data and merge non-empty fields from later entries. This wasn't in the plan but was necessary for data fidelity.
- Updated existing gsd-db.test.ts to expect schema version 2 instead of 1 — necessary consequence of bumping SCHEMA_VERSION.

## Known Issues

- None

## Files Created/Modified

- `src/resources/extensions/gsd/gsd-db.ts` — Schema v2 migration, artifacts table DDL, upsertDecision/upsertRequirement/insertArtifact exports
- `src/resources/extensions/gsd/md-importer.ts` — New: all parsers and migrateFromMarkdown orchestrator
- `src/resources/extensions/gsd/tests/md-importer.test.ts` — New: 57-assertion test suite
- `src/resources/extensions/gsd/tests/gsd-db.test.ts` — Updated schema version assertion to 2
- `.gsd/milestones/M001/slices/S02/tasks/T01-PLAN.md` — Added Observability Impact section
