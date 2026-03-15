# S05: Worktree Isolation + Merge Reconciliation — Research

**Date:** 2026-03-15

## Summary

S05 adds two capabilities: (1) copying `gsd.db` into new worktrees on creation, and (2) row-level merge reconciliation when a worktree merges back to main. The codebase is well-structured for this. `worktree-manager.ts` owns `createWorktree()` which is the single creation path — adding a `copyFileSync` for the DB file is a one-line addition. Merge reconciliation is more nuanced: the three DB tables have different PK strategies (`decisions.id` TEXT UNIQUE, `requirements.id` TEXT PK, `artifacts.path` TEXT PK) that determine reconciliation behavior. SQLite's `ATTACH DATABASE` works with `node:sqlite` (verified empirically), enabling direct cross-DB queries for row-level diff and merge without needing to close/reopen the module singleton.

The existing merge flow in `worktree-command.ts` handles git-level squash-merge with LLM fallback on conflicts. DB reconciliation is a separate concern — git merge handles the markdown files, but `gsd.db` is gitignored (D002) so it's invisible to git. After git merge completes, the main DB needs to absorb rows that the worktree added or modified. The simplest correct approach: ATTACH the worktree's DB, INSERT OR REPLACE all rows from it into main, then DETACH. This works because all three tables use deterministic text PKs (not auto-increment sequences for identity — `decisions.seq` is an auto-increment but `id` is the UNIQUE business key used in upsert operations).

## Recommendation

**Use ATTACH DATABASE for merge reconciliation, copyFileSync for worktree creation, and conflict detection via row-level diff before merge.**

1. **Copy on create:** In `createWorktree()`, after `git worktree add`, copy `gsd.db` from main `.gsd/` to worktree `.gsd/` if it exists. Don't copy WAL/SHM files — they're transient. If copy fails or source doesn't exist, the worktree just gets no DB (auto-migration from markdown will handle it on first `startAuto()`).

2. **Reconcile on merge:** After `mergeWorktreeToMain()` succeeds (or after LLM merge completes), ATTACH the worktree's `gsd.db` to the main DB connection, run INSERT OR REPLACE for all three tables, then DETACH. No sequence remapping needed — all upserts use text business keys.

3. **Conflict detection:** Before blind INSERT OR REPLACE, diff rows between main and worktree DBs. A "conflict" is where both DBs have a row with the same PK but different content, AND the main row has changed since the worktree was created (i.e., it's not just main's stale copy). For decisions and requirements, compare all columns. For artifacts, compare `full_content`. Report conflicts to stderr but proceed with worktree-wins strategy (the worktree had the most recent work).

4. **Integration point:** Add a `reconcileWorktreeDb()` function in `gsd-db.ts` (since it owns the adapter) that takes two paths (main DB, worktree DB). Call it from `handleMerge()` in `worktree-command.ts` after the git merge succeeds.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Cross-DB query | SQLite `ATTACH DATABASE` | Avoids opening a second connection or closing/reopening the singleton. Single SQL statement copies rows between databases. Verified working with `node:sqlite` `DatabaseSync`. |
| Idempotent upsert | `INSERT OR REPLACE` (already used in `upsertDecision`, `upsertRequirement`, `insertArtifact`) | All three tables already have INSERT OR REPLACE wrappers. Merge reconciliation uses the same pattern. |
| Worktree DB path resolution | `worktreePath()` from `worktree-manager.ts` + `join(wtPath, '.gsd', 'gsd.db')` | Path helpers already exist. No new path logic needed. |
| File copy | `node:fs.copyFileSync` | Built-in, synchronous, handles the simple copy-on-create case. |

## Existing Code and Patterns

- `src/resources/extensions/gsd/gsd-db.ts` — Module singleton with `openDatabase()`/`closeDatabase()`, `_getAdapter()` for raw access. ATTACH needs the adapter's `exec()` method. `upsertDecision`, `upsertRequirement`, `insertArtifact` already use INSERT OR REPLACE — merge reconciliation follows the same pattern. The `transaction()` wrapper can wrap the entire merge for atomicity.
- `src/resources/extensions/gsd/worktree-manager.ts` — `createWorktree()` is the single creation path. Returns `WorktreeInfo` with `.path`. The DB copy goes right after the `git worktree add` call and before the return. `mergeWorktreeToMain()` does the git squash merge — reconciliation hooks after this succeeds.
- `src/resources/extensions/gsd/worktree-command.ts` — `handleMerge()` orchestrates the merge UI flow. After `mergeWorktreeToMain()` succeeds (line ~676) or after LLM merge dispatch, this is where `reconcileWorktreeDb()` gets called. Also handles the `handleCreate()` path which calls `createWorktree()` — DB copy could go there instead of in `createWorktree()` itself, but putting it in `createWorktree()` is cleaner since all creation paths go through it.
- `src/resources/extensions/gsd/md-importer.ts` — `migrateFromMarkdown()` is the fallback: if the worktree has no `gsd.db` but has markdown files, auto-migration in `startAuto()` rebuilds the DB. This means DB copy failure is recoverable.
- `src/resources/extensions/gsd/auto.ts` (lines 635-663) — Auto-migration and DB open logic in `startAuto()`. This already handles the "DB doesn't exist but markdown does" case, so worktree creation doesn't strictly *need* to copy the DB — but copying avoids re-import overhead and preserves worktree-specific state that markdown might not capture (e.g., `seq` ordering, `imported_at` timestamps).

## Constraints

- **Module singleton:** `gsd-db.ts` holds exactly one open DB connection (`currentDb`). ATTACH works within this connection — no need for a second. But ATTACH cannot be called inside a transaction (SQLite limitation) — the ATTACH must happen before `BEGIN`, then the INSERT OR REPLACE work happens inside a transaction, then DETACH after COMMIT.
- **WAL mode files:** `gsd.db-wal` and `gsd.db-shm` are transient WAL files. They should NOT be copied — copying mid-write can corrupt. Only copy `gsd.db` itself. SQLite handles WAL recovery on open.
- **gitignored DB:** `gsd.db` is in `.gitignore` (S01 added patterns). Git merge doesn't touch it. The worktree's `.gsd/gsd.db` survives the git merge — it's still at the worktree path. But after `removeWorktree()`, the worktree directory is deleted, so reconciliation must happen BEFORE worktree removal.
- **Named parameters:** All SQL uses colon-prefixed named parameters (`:id`, `:path`) for `node:sqlite` compatibility (D011 constraint from S01). ATTACH syntax doesn't use named params — it's a raw `exec()` call with the path string-interpolated (safe since paths come from our own `join()` calls, not user input).
- **`node:sqlite` ATTACH works:** Empirically verified that `DatabaseSync` supports `ATTACH DATABASE '/path/to/db' AS alias` and `SELECT * FROM alias.table`. Cross-DB INSERT INTO...SELECT FROM also works.

## Common Pitfalls

- **Copying WAL/SHM files** — Only copy `gsd.db`, never `-wal` or `-shm`. Copying WAL files from a running database can produce a corrupted copy. SQLite automatically checkpoints WAL data on next open.
- **ATTACH inside a transaction** — SQLite does not allow `ATTACH DATABASE` inside a `BEGIN...COMMIT` block. ATTACH first, then BEGIN, then do the work, then COMMIT, then DETACH.
- **Worktree removal before reconciliation** — `handleMerge()` currently asks the user about removal at the end. DB reconciliation must happen after git merge but before worktree removal, since the worktree's `gsd.db` lives in the worktree directory.
- **Race with open DB** — If the main tree's `gsd.db` is currently open when copy happens (during `createWorktree()`), `copyFileSync` reads committed state which is fine. WAL mode ensures readers don't block the copy. But if the worktree's `gsd.db` is open during merge reconciliation, we need to ensure the worktree DB was properly closed or checkpointed. Since merge runs from the main tree (worktree process should be stopped), this is naturally satisfied.
- **Path injection in ATTACH** — The DB path is interpolated into the SQL string. Must ensure no single quotes in the path. Use the path from `join()` which won't contain quotes. Could add a safety check.
- **seq column during merge** — `decisions.seq` is AUTOINCREMENT. When using INSERT OR REPLACE with the `id` UNIQUE constraint, the seq may change. This is acceptable — `seq` is ordering metadata, not a stable identifier. The `id` (e.g., "D001") is the stable PK for business logic.

## Open Risks

- **Divergent schema versions** — If the main tree has migrated to schema v3 (from future S06/S07 work) but the worktree DB is still at v2, ATTACH would expose tables with different column sets. Mitigation: run `migrateSchema()` on the attached DB before reconciliation, or only copy columns that exist in both. Low risk since this slice doesn't add schema changes.
- **Large DB merge performance** — ATTACH + INSERT OR REPLACE for thousands of rows should still be sub-second for SQLite, but untested at scale. The current project size (16 decisions, 21 requirements, ~50 artifacts) is trivially fast.
- **LLM merge path timing** — In the deterministic merge path, reconciliation hooks cleanly after `mergeWorktreeToMain()`. In the LLM fallback path, reconciliation timing is ambiguous — the LLM is dispatched asynchronously via `sendMessage()`. May need to reconcile DB before LLM dispatch (the DB state is independent of code merge conflicts anyway).

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| SQLite | `martinholovsky/claude-skills-generator@sqlite database expert` | available (554 installs) — generic SQLite skill, not specific to this use case |
| better-sqlite3 | — | none found |
| git worktrees | — | none found |

No skills are directly relevant enough to warrant installation. The SQLite operations (ATTACH, INSERT OR REPLACE) are well-documented standard SQL and the existing codebase patterns are sufficient.

## Sources

- `ATTACH DATABASE` syntax and cross-DB queries verified by running `node:sqlite` `DatabaseSync` with ATTACH/SELECT/DETACH in a test script (local empirical test)
- Existing codebase patterns in `gsd-db.ts` (upsert wrappers), `worktree-manager.ts` (creation/merge lifecycle), `worktree-command.ts` (merge UI flow)
- S01 Forward Intelligence: named parameter convention, `DbAdapter` null-prototype normalization
- S02 Forward Intelligence: `migrateFromMarkdown()` as fallback import path, `gsdDir` parameter convention (project basePath, not `.gsd/` dir)
