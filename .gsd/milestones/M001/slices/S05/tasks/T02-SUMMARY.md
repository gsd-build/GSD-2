---
id: T02
parent: S05
milestone: M001
provides:
  - copyWorktreeDb wired into createWorktree lifecycle
  - reconcileWorktreeDb wired into both deterministic and LLM merge paths
key_files:
  - src/resources/extensions/gsd/worktree-manager.ts
  - src/resources/extensions/gsd/worktree-command.ts
key_decisions:
  - Made createWorktree async to support dynamic import of gsd-db.js (D003/D014 graceful degradation pattern)
  - Reconciliation results shown in deterministic merge notification but not LLM fallback (LLM path dispatches immediately)
patterns_established:
  - Dynamic import try/catch for optional gsd-db.js dependency in worktree lifecycle
observability_surfaces:
  - stderr "gsd-db: worktree DB copy skipped" on copy failure during worktree create
  - stderr "gsd-db: worktree DB reconciliation skipped" on reconciliation failure during merge
  - Merge notification includes "db: reconciled N rows (N conflicts)" when rows merged in deterministic path
duration: 12m
verification_result: passed
completed_at: 2025-03-15
blocker_discovered: false
---

# T02: Wire DB copy into createWorktree and reconciliation into handleMerge

**Wired copyWorktreeDb into createWorktree() and reconcileWorktreeDb into both merge paths with dynamic import graceful degradation**

## What Happened

Added `copyWorktreeDb` call to `createWorktree()` in `worktree-manager.ts` — after `git worktree add` succeeds, the main DB is copied to the new worktree's `.gsd/gsd.db`. Used `await import("./gsd-db.js")` which required making `createWorktree` async (signature changed from `WorktreeInfo` to `Promise<WorktreeInfo>`). Updated the single call site in `worktree-command.ts` and both test files (`worktree-manager.test.ts`, `worktree-integration.test.ts`) to await the async result.

Wired `reconcileWorktreeDb` into two locations in `worktree-command.ts`:
1. **Deterministic merge path** — after `mergeWorktreeToMain` succeeds, before the success notification. Reconciliation results are included in the notification when rows were merged.
2. **LLM fallback path** — before `pi.sendMessage()` dispatch. DB reconciliation runs independently of code conflict resolution.

Both reconciliation sites use dynamic `await import("./gsd-db.js")` in try/catch blocks, preserving the D003/D014 graceful degradation pattern. All DB operations are non-fatal — worktree creation and merge proceed regardless of DB failures.

## Verification

- `npx tsc --noEmit` — 0 errors
- `npm run test:unit` — 288 passed, 0 failed (full suite, no regressions)
- `grep -n "copyWorktreeDb" worktree-manager.ts` — 2 matches (import + call)
- `grep -n "reconcileWorktreeDb" worktree-command.ts` — 4 matches (2 imports + 2 calls, deterministic + LLM paths)
- `npm run test:unit -- --test-name-pattern "worktree-db"` — 36 worktree-db assertions pass

### Slice-level verification status (T02 of S05):
- ✅ `npm run test:unit -- --test-name-pattern "worktree-db"` — passes
- ✅ `npx tsc --noEmit` — clean
- ✅ `npm run test:unit` — full suite passes, no regressions

## Diagnostics

- **Copy failure on create:** stderr `"gsd-db: worktree DB copy skipped: <message>"` — worktree still created successfully
- **Reconciliation failure on merge:** stderr `"gsd-db: worktree DB reconciliation skipped: <message>"` — merge proceeds normally
- **Successful reconciliation:** deterministic merge notification includes `db: reconciled N rows (N conflicts)` line
- **Inspection:** `ls .gsd/worktrees/<name>/.gsd/gsd.db` after create; query main `.gsd/gsd.db` after merge to confirm reconciled rows

## Deviations

- `createWorktree` changed from sync to async — required to use `await import()` for D003 graceful degradation. Updated call site in `worktree-command.ts` and 3 `await` additions across 2 test files (`worktree-manager.test.ts`, `worktree-integration.test.ts`).

## Known Issues

None

## Files Created/Modified

- `src/resources/extensions/gsd/worktree-manager.ts` — added async `copyWorktreeDb` call in `createWorktree()`, changed function to async
- `src/resources/extensions/gsd/worktree-command.ts` — added `reconcileWorktreeDb` in deterministic merge path (with notification integration) and LLM fallback path; updated `createWorktree` call to await
- `src/resources/extensions/gsd/tests/worktree-manager.test.ts` — added await to 3 `createWorktree` calls for async signature
- `src/resources/extensions/gsd/tests/worktree-integration.test.ts` — added await to 2 `createWorktree` calls for async signature
