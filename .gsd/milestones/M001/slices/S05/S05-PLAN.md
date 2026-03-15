# S05: Worktree Isolation + Merge Reconciliation

**Goal:** Each GSD worktree gets its own isolated `gsd.db` on creation, and worktree merges reconcile DB rows back to main with conflict detection.
**Demo:** Create a worktree → verify it has its own `gsd.db`. Make DB changes in the worktree. Merge back → verify rows from the worktree appear in main's DB with conflict report for divergent modifications.

## Must-Haves

- `gsd.db` is copied (not WAL/SHM files) from main `.gsd/` to worktree `.gsd/` on creation
- If source DB doesn't exist, worktree creation still succeeds (auto-migration handles it later)
- `reconcileWorktreeDb()` uses ATTACH DATABASE to merge rows from worktree DB into main DB
- All three tables (decisions, requirements, artifacts) are reconciled via INSERT OR REPLACE
- Conflict detection: rows modified in both main and worktree since fork are reported to stderr
- ATTACH happens outside transaction, INSERT OR REPLACE inside transaction, DETACH after commit
- Reconciliation runs after git merge but before worktree removal
- Both deterministic merge and LLM fallback paths trigger reconciliation
- Path safety: no single quotes in DB path passed to ATTACH SQL

## Proof Level

- This slice proves: contract + integration
- Real runtime required: yes (SQLite ATTACH, file copy, git worktree lifecycle)
- Human/UAT required: no

## Verification

- `npm run test:unit -- --test-name-pattern "worktree-db"` — new test file with assertions for:
  - DB copy on create (file exists, data queryable)
  - Copy skips WAL/SHM files
  - Copy failure is non-fatal (worktree still created)
  - Reconciliation merges new rows from worktree into main
  - Reconciliation updates existing rows (worktree-wins)
  - Conflict detection reports divergent modifications to stderr
  - ATTACH/DETACH lifecycle works correctly
  - Path with spaces handled safely
  - Missing worktree DB is handled gracefully (no-op reconciliation)
- `npx tsc --noEmit` — clean compilation
- `npm run test:unit` — full suite passes, no regressions

## Observability / Diagnostics

- Runtime signals: stderr message on reconciliation with counts: "gsd-db: reconciled N decisions, N requirements, N artifacts (N conflicts)"
- Inspection surfaces: `isDbAvailable()` returns true after worktree DB opens; `schema_version` table queryable in worktree DB
- Failure visibility: stderr message if copy fails ("gsd-db: failed to copy DB to worktree: <message>"), stderr if reconciliation fails ("gsd-db: worktree DB reconciliation failed: <message>")
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `gsd-db.ts` (openDatabase, _getAdapter, transaction, upsert wrappers), `worktree-manager.ts` (createWorktree, worktreePath), `worktree-command.ts` (handleMerge deterministic + LLM paths), `md-importer.ts` (migrateFromMarkdown as fallback)
- New wiring introduced in this slice: `copyWorktreeDb()` called from `createWorktree()`, `reconcileWorktreeDb()` called from `handleMerge()` after git merge
- What remains before the milestone is truly usable end-to-end: S06 (structured LLM tools, /gsd inspect), S07 (integration verification)

## Tasks

- [x] **T01: Implement copyWorktreeDb and reconcileWorktreeDb with test suite** `est:45m`
  - Why: Core logic for both R012 (DB copy) and R013 (merge reconciliation) — must be testable independently before wiring into the worktree lifecycle
  - Files: `src/resources/extensions/gsd/gsd-db.ts`, `src/resources/extensions/gsd/tests/worktree-db.test.ts`
  - Do: Add `copyWorktreeDb(srcDbPath, destDbPath)` — copies gsd.db via copyFileSync, skips WAL/SHM, non-fatal on failure. Add `reconcileWorktreeDb(mainDbPath, worktreeDbPath)` — ATTACHes worktree DB, diffs rows for conflict detection, runs INSERT OR REPLACE for all 3 tables inside transaction, reports conflicts to stderr, DETACHes. Write comprehensive test file exercising copy, reconciliation, conflicts, edge cases.
  - Verify: `npm run test:unit -- --test-name-pattern "worktree-db"` passes all assertions; `npx tsc --noEmit` clean
  - Done when: Both functions exported, tested with ≥20 assertions covering copy, reconciliation, conflict detection, and error handling

- [x] **T02: Wire DB copy into createWorktree and reconciliation into handleMerge** `est:20m`
  - Why: Integration wiring — connects the tested core functions to the actual worktree lifecycle so DB isolation and merge reconciliation happen automatically
  - Files: `src/resources/extensions/gsd/worktree-manager.ts`, `src/resources/extensions/gsd/worktree-command.ts`
  - Do: In `createWorktree()`, after `git worktree add`, call `copyWorktreeDb()` from main `.gsd/gsd.db` to worktree `.gsd/gsd.db`. In `handleMerge()`, after deterministic `mergeWorktreeToMain()` succeeds (before the return), call `reconcileWorktreeDb()`. In the LLM fallback path, call `reconcileWorktreeDb()` before dispatching the LLM (DB state is independent of code conflicts). Import gsd-db dynamically in worktree-command.ts to preserve graceful degradation.
  - Verify: `npx tsc --noEmit` clean; `npm run test:unit` full suite passes; grep confirms `copyWorktreeDb` called in createWorktree and `reconcileWorktreeDb` called in handleMerge
  - Done when: Both call sites wired, compilation clean, no test regressions

## Files Likely Touched

- `src/resources/extensions/gsd/gsd-db.ts`
- `src/resources/extensions/gsd/worktree-manager.ts`
- `src/resources/extensions/gsd/worktree-command.ts`
- `src/resources/extensions/gsd/tests/worktree-db.test.ts`
