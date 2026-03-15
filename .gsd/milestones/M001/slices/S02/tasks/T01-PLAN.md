---
estimated_steps: 8
estimated_files: 3
---

# T01: Schema v2 migration + all markdown importers + orchestrator

**Slice:** S02 — Markdown Importers + Auto-Migration
**Milestone:** M001

## Description

Build the complete import pipeline: schema v2 migration (adding `artifacts` table), upsert wrappers for idempotent decisions/requirements import, DECISIONS.md table parser, REQUIREMENTS.md section parser, hierarchy artifact walker, and the `migrateFromMarkdown()` orchestrator that ties it all together.

## Steps

1. Add `migrateSchema()` to `gsd-db.ts` that reads `schema_version` table, applies incremental DDL (v1→v2 adds `artifacts` table with path/artifact_type/milestone_id/slice_id/task_id/full_content/imported_at columns). Wire it into `initSchema()` flow — if version < 2, run migration DDL and insert new version row. Use named `:param` style for all SQL.

2. Add `upsertDecision()` and `upsertRequirement()` functions to `gsd-db.ts` using `INSERT OR REPLACE INTO` for idempotent import. Also add `insertArtifact()` with INSERT OR REPLACE on the `path` UNIQUE key. Export all three.

3. Create `md-importer.ts`. Implement `parseDecisionsTable(content: string): Omit<Decision, 'seq'>[]` — parse DECISIONS.md markdown table. Skip header and separator rows. Split on `|` (strip leading/trailing). Extract fields: id, when_context, scope, decision, choice, rationale, revisable. Detect `(amends DXXX)` in the Decision column → two-pass: first insert all rows, then set `superseded_by` on amended decisions.

4. Implement `parseRequirementsSections(content: string): Requirement[]` — parse REQUIREMENTS.md. Find `## Active`, `## Validated`, `## Deferred`, `## Out of Scope` sections. Within each section, find `### RXXX — Title` blocks. Extract `- Field: value` bullets for class, status, description, why, source, primary_owner, supporting_slices, validation, notes. Capture full_content as the raw text from `###` to next `###` or section end. Status from bullet takes precedence over section heading.

5. Implement `importDecisions(db, gsdDir)` and `importRequirements(db, gsdDir)` — read the root files, parse, upsert rows. Handle supersession chains (if D020 amends D010 which amends D001, chain must propagate).

6. Implement `importHierarchyArtifacts(db, gsdDir)` — walk milestones → slices → tasks using `findMilestoneIds()`, directory listing for slices (S\d+), `resolveTaskFiles` for tasks. For each level, check for ROADMAP, PLAN, SUMMARY, CONTINUE, CONTEXT, RESEARCH, ASSESSMENT, UAT, SECRETS files. Also handle root-level PROJECT.md and QUEUE.md. Insert into `artifacts` table with path relative to .gsd/, artifact_type derived from suffix, and milestone_id/slice_id/task_id from directory position.

7. Implement `migrateFromMarkdown(gsdDir: string): { decisions: number, requirements: number, artifacts: number }` — the orchestrator. Opens DB if not already open. Wraps all imports in a `transaction()`. Returns counts for the log line. Handles missing files gracefully (try/catch per import, log skipped).

8. Export `migrateFromMarkdown`, `parseDecisionsTable`, `parseRequirementsSections` for testing. Keep internal helpers unexported.

## Must-Haves

- [ ] Schema v2 migration works on existing v1 databases without data loss
- [ ] `artifacts` table has UNIQUE constraint on `path` for idempotent import
- [ ] DECISIONS.md parser handles supersession chains (amends DXXX)
- [ ] REQUIREMENTS.md parser extracts all 10 bullet fields per requirement
- [ ] Missing files produce zero errors (graceful skip)
- [ ] All SQL uses named colon-prefixed parameters (`:param`)
- [ ] Entire migration wrapped in a single transaction

## Verification

- Compiles with no TypeScript errors
- Imported decisions queryable via existing `getDecisionById()` / `getActiveDecisions()`
- Imported requirements queryable via existing `getRequirementById()` / `getActiveRequirements()`
- Imported artifacts queryable via raw SQL on `artifacts` table

## Inputs

- `src/resources/extensions/gsd/gsd-db.ts` — S01 foundation: openDatabase, initSchema, insertDecision, insertRequirement, transaction, _getAdapter
- `src/resources/extensions/gsd/types.ts` — Decision and Requirement interfaces
- `src/resources/extensions/gsd/paths.ts` — GSD_ROOT_FILES, resolveGsdRootFile, resolveMilestoneFile, resolveSliceFile, resolveTaskFile, resolveTaskFiles, milestonesDir
- `src/resources/extensions/gsd/guided-flow.ts` — findMilestoneIds for milestone directory discovery
- S01 forward intelligence: named params with colon prefix, null-prototype normalization via adapter, all access through adapter

## Expected Output

- `src/resources/extensions/gsd/gsd-db.ts` — modified: SCHEMA_VERSION bumped to 2, migrateSchema() added, upsertDecision/upsertRequirement/insertArtifact exported
- `src/resources/extensions/gsd/md-importer.ts` — new: parseDecisionsTable, parseRequirementsSections, importDecisions, importRequirements, importHierarchyArtifacts, migrateFromMarkdown

## Observability Impact

- **New runtime signal:** `migrateFromMarkdown()` writes a one-line stderr message on completion: `gsd-migrate: imported N decisions, N requirements, N artifacts`. On per-import failure, writes `gsd-migrate: skipping <type> import: <error>`.
- **New inspection surface:** `schema_version` table shows version 2 after migration. `artifacts` table is queryable via `_getAdapter()` for imported content (path, artifact_type, milestone_id, slice_id, task_id, full_content).
- **Failure visibility:** If `migrateSchema()` fails, the transaction rolls back and the DB stays at version 1. Per-import errors in the orchestrator are caught and logged to stderr without crashing — the transaction still commits whatever succeeded.
