# S02: Markdown Importers + Auto-Migration

**Goal:** Existing GSD projects start up, gsd.db appears silently with all artifact types imported. Round-trip fidelity verified for every artifact type.
**Demo:** Delete gsd.db → run auto-mode → gsd.db recreated with all decisions, requirements, and hierarchy artifacts imported. Query functions return correct data.

## Must-Haves

- DECISIONS.md table parser extracts all fields including supersession chains
- REQUIREMENTS.md section parser extracts all structured fields per requirement
- Hierarchy artifacts (roadmaps, plans, summaries, continues, contexts, research, assessments, UATs, project, queue, secrets) imported as content-keyed rows in `artifacts` table
- Schema v1→v2 migration adds `artifacts` table without breaking existing v1 databases
- `INSERT OR REPLACE` for idempotent re-import (delete gsd.db → re-migrate works)
- `migrateFromMarkdown(gsdDir)` orchestrator walks file tree and imports everything atomically
- Auto-migration hooks into `startAuto()` — silent, zero user interaction, one-line log
- Missing files handled gracefully (no crash on absent QUEUE.md, SECRETS-MANIFEST.md, etc.)
- Round-trip tests prove imported data matches source for every artifact type

## Proof Level

- This slice proves: contract
- Real runtime required: no (filesystem fixtures + in-memory DB sufficient)
- Human/UAT required: no

## Verification

- `npm run test:unit -- --test-name-pattern "md-importer"` — all assertions pass covering:
  - DECISIONS.md parsing with supersession detection
  - REQUIREMENTS.md field extraction across all status sections
  - Hierarchy artifact import for each artifact type
  - Schema v1→v2 migration on existing DBs
  - Idempotent re-import (double import produces same results)
  - Missing file graceful handling
  - `migrateFromMarkdown()` orchestrator on a realistic fixture tree
  - Round-trip: imported field values match source markdown
- Existing tests still pass: `npm run test:unit` — 283+ tests, 0 failures

## Observability / Diagnostics

- Runtime signals: one-line stderr message on migration completion with artifact counts
- Inspection surfaces: `schema_version` table shows version 2 after migration; `artifacts` table queryable for imported content
- Failure visibility: migration errors rolled back atomically — DB stays at v1 if migration fails

## Integration Closure

- Upstream surfaces consumed: `gsd-db.ts` (openDatabase, initSchema, insertDecision, insertRequirement, transaction, _getAdapter), `types.ts` (Decision, Requirement interfaces), `paths.ts` (GSD_ROOT_FILES, resolveGsdRootFile, resolveMilestoneFile, resolveSliceFile, resolveTaskFile, resolveFile, resolveTaskFiles, milestonesDir), `guided-flow.ts` (findMilestoneIds)
- New wiring introduced in this slice: `md-importer.ts` module imported by auto-migration check in `startAuto()`; schema v2 DDL added to `gsd-db.ts` initSchema/migrateSchema
- What remains before the milestone is truly usable end-to-end: S03 (prompt builder rewiring), S04 (token measurement), S05 (worktree DB), S06 (structured tools), S07 (integration)

## Tasks

- [x] **T01: Schema v2 migration + all markdown importers + orchestrator** `est:1h`
  - Why: Core deliverable — the import functions that S03/S05 depend on. Schema migration is prerequisite for the `artifacts` table. Decision/requirement parsers are the hard part; hierarchy artifacts are content blobs.
  - Files: `src/resources/extensions/gsd/gsd-db.ts`, `src/resources/extensions/gsd/md-importer.ts`, `src/resources/extensions/gsd/types.ts`
  - Do: (1) Add `migrateSchema()` to gsd-db.ts that checks schema_version and applies v1→v2 DDL (artifacts table). Wire into initSchema. (2) Add `upsertDecision` and `upsertRequirement` wrappers using INSERT OR REPLACE. (3) Create md-importer.ts with: `parseDecisionsTable()` for DECISIONS.md pipe-delimited table rows with `(amends DXXX)` supersession, `parseRequirementsSections()` for REQUIREMENTS.md H3/bullet blocks, `importHierarchyArtifacts()` for walking milestones/slices/tasks and inserting full_content rows, `migrateFromMarkdown(gsdDir)` orchestrator wrapping everything in a transaction. (4) Handle missing files, empty files, idempotent re-import.
  - Verify: Unit tests in T02 cover all paths
  - Done when: `migrateFromMarkdown()` imports a realistic .gsd/ tree into an in-memory DB with all decisions, requirements, and artifacts queryable

- [x] **T02: Round-trip fidelity tests + auto-migration hookup** `est:45m`
  - Why: Proves R018 (100% migration fidelity) and delivers R004 (silent auto-migration). Without tests, we can't trust the parsers. Without the hookup, migration never fires.
  - Files: `src/resources/extensions/gsd/tests/md-importer.test.ts`, `src/resources/extensions/gsd/auto.ts`
  - Do: (1) Create md-importer.test.ts with fixture-based tests: build a temp .gsd/ tree with realistic DECISIONS.md (including supersession), REQUIREMENTS.md (all status sections), roadmap, plan, summary, continue, context, research, assessment, UAT, project.md. Run migrateFromMarkdown, then query and assert field values match source. Test idempotent re-import. Test missing files. Test schema v1→v2 migration on an existing v1 DB. (2) Hook auto-migration into startAuto() between .gsd/ bootstrap and deriveState(): if gsdDir exists + no gsd.db + has markdown files → openDatabase + migrateFromMarkdown + log summary. (3) Run full test suite to confirm no regressions.
  - Verify: `npm run test:unit -- --test-name-pattern "md-importer"` passes; `npm run test:unit` shows 0 failures
  - Done when: All round-trip assertions pass, auto-migration hookup in startAuto() compiles, existing 283+ tests still pass

## Files Likely Touched

- `src/resources/extensions/gsd/gsd-db.ts`
- `src/resources/extensions/gsd/md-importer.ts`
- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/tests/md-importer.test.ts`
