# S02: Markdown Importers + Auto-Migration — UAT

**Milestone:** M001
**Written:** 2026-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All functionality is exercised through unit tests with filesystem fixtures and in-memory DB. Auto-migration hookup is compile-verified and uses the same `migrateFromMarkdown()` that is fully unit-tested. No live runtime or human judgment needed.

## Preconditions

- Node.js 22+ installed (for node:sqlite provider)
- Repository cloned with dependencies installed (`npm install`)
- Working directory is the project root

## Smoke Test

Run `npm run test:unit -- --test-name-pattern "md-importer"` — all tests pass, output includes sections for parseDecisionsTable, supersession detection, parseRequirementsSections, orchestrator, idempotent re-import, missing file handling, schema migration, and round-trip fidelity.

## Test Cases

### 1. DECISIONS.md parsing with supersession

1. Create a temp directory with a `.gsd/DECISIONS.md` containing a pipe-delimited table with 4 decisions, where D020 contains `(amends D010)` and D010 contains `(amends D001)`
2. Call `parseDecisionsTable(content)`
3. **Expected:** Returns 4 Decision objects. D001 has `superseded_by: 'D010'`, D010 has `superseded_by: 'D020'`, D020 has `superseded_by: null`. All fields (id, when_context, scope, decision, choice, rationale, revisable) populated correctly.

### 2. REQUIREMENTS.md parsing across all sections

1. Create a REQUIREMENTS.md with `## Active` (containing R001, R002), `## Validated` (containing R017 with abbreviated format), `## Deferred` (containing R030), and `## Out of Scope` (containing R040)
2. Call `parseRequirementsSections(content)`
3. **Expected:** Returns 5 Requirement objects. R001 has `status: 'active'`, full field extraction (class, description, why, source, primary_owner, supporting_slices, validation, notes). R017 has `status: 'validated'`, validation and notes fields populated from `Validated by:` and `Proof:` bullets. R030 has `status: 'deferred'`. R040 has `status: 'out-of-scope'`.

### 3. Requirements deduplication (Active + Validated overlap)

1. Create a REQUIREMENTS.md where R017 appears in both `## Active` (with full fields) and `## Validated` (with abbreviated fields)
2. Call `parseRequirementsSections(content)`
3. **Expected:** Returns one R017 entry (not two). Fuller Active fields preserved, non-empty Validated fields (like `Proof:`) merged in.

### 4. Hierarchy artifact import

1. Create a `.gsd/` tree with `PROJECT.md`, `milestones/M001/M001-ROADMAP.md`, `milestones/M001/M001-CONTEXT.md`, `milestones/M001/slices/S01/S01-PLAN.md`, `milestones/M001/slices/S01/S01-SUMMARY.md`, `milestones/M001/slices/S01/tasks/T01-SUMMARY.md`
2. Open an in-memory DB, call `migrateFromMarkdown(basePath)`
3. Query `SELECT * FROM artifacts WHERE milestone_id = 'M001'`
4. **Expected:** Rows exist for ROADMAP, CONTEXT, PLAN, SUMMARY artifacts. `full_content` contains the original file content. Paths are relative to `.gsd/` (e.g. `milestones/M001/M001-ROADMAP.md`).

### 5. Schema v1→v2 migration

1. Create a DB at schema version 1 (decisions + requirements tables, no artifacts table)
2. Insert some test data into decisions and requirements
3. Call `openDatabase(dbPath)` (which triggers `initSchema` → `migrateSchema`)
4. **Expected:** `schema_version` table shows version 2. `artifacts` table exists and is queryable. Original decisions and requirements data is intact.

### 6. Idempotent re-import

1. Create a `.gsd/` tree with DECISIONS.md (4 decisions), REQUIREMENTS.md (5 requirements), and hierarchy artifacts
2. Call `migrateFromMarkdown(basePath)` twice
3. **Expected:** Second import produces identical row counts. No duplicate rows. `INSERT OR REPLACE` prevents accumulation.

### 7. Full migrateFromMarkdown orchestrator

1. Create a realistic `.gsd/` tree with all artifact types
2. Call `migrateFromMarkdown(basePath)`
3. **Expected:** Returns `{ decisions: N, requirements: N, artifacts: N }` with correct counts. All data queryable from DB. stderr shows `gsd-migrate: imported N decisions, N requirements, N artifacts`.

### 8. Auto-migration compiles in startAuto()

1. Run `npx tsc --noEmit`
2. **Expected:** Zero errors. The auto-migration block in `auto.ts` compiles cleanly with dynamic imports.

## Edge Cases

### Malformed DECISIONS.md rows

1. Include rows with fewer than 7 pipe-separated cells, rows without D-prefix IDs, and separator rows
2. Call `parseDecisionsTable(content)`
3. **Expected:** Malformed rows silently skipped. Valid rows still parsed correctly. No errors thrown.

### Empty .gsd/ directory (no markdown files)

1. Create an empty `.gsd/` directory with no markdown files and no milestones
2. Call `migrateFromMarkdown(basePath)`
3. **Expected:** Returns `{ decisions: 0, requirements: 0, artifacts: 0 }`. No errors. DB is valid with empty tables.

### Missing individual files

1. Create a `.gsd/` tree with only DECISIONS.md (no REQUIREMENTS.md, no milestones)
2. Call `migrateFromMarkdown(basePath)`
3. **Expected:** Decisions imported. Requirements count is 0. Artifacts count is 0. No errors for missing files.

### Auto-migration failure path

1. The auto-migration block in `startAuto()` wraps the import in try/catch
2. If `openDatabase` or `migrateFromMarkdown` throws, the error is caught
3. **Expected:** stderr shows `gsd-migrate: auto-migration failed: <message>`. Auto-mode continues normally without DB.

## Failure Signals

- `npm run test:unit` shows any test failures (currently 284/284 pass)
- `npx tsc --noEmit` shows compilation errors
- `SELECT MAX(version) as v FROM schema_version` returns something other than 2
- `SELECT count(*) FROM artifacts` returns 0 after migration of a populated `.gsd/` tree
- stderr shows `gsd-migrate: skipping <type> import:` indicating a partial failure
- Auto-mode crashes on startup when SQLite is unavailable (should degrade gracefully)

## Requirements Proved By This UAT

- R003 — All artifact types (DECISIONS.md, REQUIREMENTS.md, roadmaps, plans, summaries, contexts, research, assessments, UATs, continues, PROJECT.md, QUEUE.md, SECRETS-MANIFEST.md) imported into DB
- R004 — Silent auto-migration wired into startAuto() with zero user interaction
- R018 — Round-trip fidelity: imported field values match source markdown for every field of every artifact type

## Not Proven By This UAT

- R004 runtime behavior — auto-migration is compile-verified, not tested via an actual `startAuto()` call in an integration test. The `migrateFromMarkdown()` it calls is fully unit-tested.
- Runtime performance of migration on large projects — tested with small fixtures only
- Auto-migration behavior when `node:sqlite` and `better-sqlite3` are both unavailable — tested via D003/D014 dynamic import pattern, but not exercised in a real missing-provider scenario

## Notes for Tester

- All test cases above are already covered by the 70-assertion md-importer.test.ts suite. The UAT describes what those tests verify in human-readable form.
- The standalone command `node --test src/resources/extensions/gsd/tests/md-importer.test.ts` will fail with a module resolution error — this is expected because it needs the `--import ./src/resources/extensions/gsd/tests/resolve-ts.mjs` loader. Use `npm run test:unit -- --test-name-pattern "md-importer"` instead.
