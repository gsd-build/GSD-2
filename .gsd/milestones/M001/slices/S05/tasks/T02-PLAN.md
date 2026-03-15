---
estimated_steps: 5
estimated_files: 2
---

# T02: Wire DB copy into createWorktree and reconciliation into handleMerge

**Slice:** S05 — Worktree Isolation + Merge Reconciliation
**Milestone:** M001

## Description

Wire the T01-built `copyWorktreeDb` and `reconcileWorktreeDb` functions into the actual worktree lifecycle. DB copy happens in `createWorktree()` after `git worktree add`. DB reconciliation happens in `handleMerge()` after both the deterministic merge path and before the LLM fallback dispatch. Uses dynamic import to preserve graceful degradation (D003/D014 pattern).

## Steps

1. In `worktree-manager.ts`, import `copyWorktreeDb` from `gsd-db.ts` and call it in `createWorktree()`:
   - After the `git worktree add` succeeds and before the `return` statement
   - Source: `join(basePath, '.gsd', 'gsd.db')`
   - Dest: `join(wtPath, '.gsd', 'gsd.db')`
   - Wrap in try/catch — copy failure must not prevent worktree creation
   - The `.gsd/` directory in the worktree is created by git (it's tracked content), so no need to mkdir

2. In `worktree-command.ts`, wire `reconcileWorktreeDb` into the deterministic merge path:
   - After `mergeWorktreeToMain(basePath, name, commitMessage)` succeeds (line ~676)
   - Before the success notification and `return`
   - Use dynamic `await import('../gsd-db.js')` inside a try/catch to load the function (preserves D003 graceful degradation)
   - Main DB path: `join(basePath, '.gsd', 'gsd.db')`
   - Worktree DB path: `join(worktreePath(basePath, name), '.gsd', 'gsd.db')`
   - Log reconciliation results in the success notification if rows were merged

3. In `worktree-command.ts`, wire `reconcileWorktreeDb` into the LLM fallback path:
   - Before the `pi.sendMessage()` dispatch (DB reconciliation is independent of code merge conflicts)
   - Same dynamic import pattern as step 2
   - Wrap in try/catch — reconciliation failure must not block the LLM merge

4. Run `npx tsc --noEmit` to verify clean compilation.

5. Run `npm run test:unit` — full suite passes with no regressions. Grep to confirm call sites:
   - `grep -n "copyWorktreeDb" src/resources/extensions/gsd/worktree-manager.ts` — at least 1 match
   - `grep -n "reconcileWorktreeDb" src/resources/extensions/gsd/worktree-command.ts` — at least 2 matches (deterministic + LLM paths)

## Must-Haves

- [ ] `copyWorktreeDb` called in `createWorktree()` after git worktree add
- [ ] `reconcileWorktreeDb` called in deterministic merge path after `mergeWorktreeToMain`
- [ ] `reconcileWorktreeDb` called in LLM fallback path before `pi.sendMessage`
- [ ] Dynamic import preserves graceful degradation (D003/D014)
- [ ] All failures non-fatal — worktree creation and merge never blocked by DB operations

## Verification

- `npx tsc --noEmit` — 0 errors
- `npm run test:unit` — full suite passes
- `grep -n "copyWorktreeDb" src/resources/extensions/gsd/worktree-manager.ts` — confirms wiring
- `grep -n "reconcileWorktreeDb" src/resources/extensions/gsd/worktree-command.ts` — confirms both paths

## Inputs

- `src/resources/extensions/gsd/gsd-db.ts` — T01 output with `copyWorktreeDb` and `reconcileWorktreeDb` exports
- `src/resources/extensions/gsd/worktree-manager.ts` — `createWorktree()` function (line 126)
- `src/resources/extensions/gsd/worktree-command.ts` — `handleMerge()` function (line 576), deterministic path (~676), LLM fallback path (~720)
- D014 pattern — dynamic `await import()` for optional SQLite dependency in auto.ts

## Expected Output

- `src/resources/extensions/gsd/worktree-manager.ts` — augmented with `copyWorktreeDb` call in `createWorktree()`
- `src/resources/extensions/gsd/worktree-command.ts` — augmented with `reconcileWorktreeDb` calls in both merge paths

## Observability Impact

- **DB copy on worktree create:** stderr `"gsd-db: worktree DB copy skipped: <message>"` if copy fails (non-fatal). No output on success — `copyWorktreeDb` already logs its own failure via `"gsd-db: failed to copy DB to worktree: <message>"`.
- **Reconciliation on deterministic merge:** success notification includes `db: reconciled N rows (N conflicts)` line when rows were merged. stderr `"gsd-db: worktree DB reconciliation skipped: <message>"` if dynamic import or reconciliation fails.
- **Reconciliation on LLM fallback merge:** stderr `"gsd-db: worktree DB reconciliation skipped: <message>"` on failure. Reconciliation results logged to stderr by `reconcileWorktreeDb` itself.
- **Inspection:** After worktree create, `ls .gsd/worktrees/<name>/.gsd/gsd.db` confirms copy. After merge, main `.gsd/gsd.db` contains rows from both DBs.
