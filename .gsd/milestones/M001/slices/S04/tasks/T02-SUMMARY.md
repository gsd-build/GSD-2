---
id: T02
parent: S04
milestone: M001
provides:
  - DB-backed content loading in deriveState() via artifacts table
  - Fallback chain: DB → native batch parse → sequential disk reads
  - 51-assertion test suite proving DB/file path equivalence
key_files:
  - src/resources/extensions/gsd/state.ts
  - src/resources/extensions/gsd/tests/derive-state-db.test.ts
key_decisions:
  - DB content only replaces the content-reading step, not file discovery — resolveMilestoneFile / resolveSliceFile still require files on disk for path resolution
  - dbContentLoaded flag set only when DB returns rows (empty DB triggers native batch fallback, not a broken empty-cache state)
  - Silent fallback on DB query failure — optimization path, not correctness path
patterns_established:
  - DB-first content loading with native-batch-parse fallback in _deriveStateImpl
  - Tests create both disk fixtures AND DB rows, comparing derived state field-by-field
observability_surfaces:
  - derive-state-db test suite (51 assertions) validates DB/file equivalence
  - Silent fallback — no runtime log when DB query fails (D003 pattern)
duration: 20m
verification_result: passed
completed_at: 2025-03-15
blocker_discovered: false
---

# T02: Wire deriveState() to load artifact content from DB

**Added DB-backed content loading path to _deriveStateImpl() — queries artifacts table when DB is available, falls back to native batch parse / disk reads**

## What Happened

Modified `_deriveStateImpl()` in `state.ts` to check `isDbAvailable()` before content loading. When DB is active:
1. Queries `SELECT path, full_content FROM artifacts` via `_getAdapter()`
2. Populates `fileContentCache` by resolving relative paths against `gsdDir`
3. Sets `dbContentLoaded = true` only if rows were returned (empty DB falls through)

When DB is unavailable or empty, the existing native batch parse path runs unchanged. `cachedLoadFile()` fallback to `loadFile()` handles any path not in the cache regardless of source.

Created `derive-state-db.test.ts` with 7 test groups (51 assertions):
- DB path vs file path field-by-field equality (phase, milestone, slice, task, registry, requirements, progress)
- Fallback when DB unavailable
- Empty DB falls back to file reads
- Partial DB content fills gaps from disk
- Requirements counting from DB content
- Multi-milestone registry from DB
- Cache invalidation works identically for both paths

## Verification

- `npx tsc --noEmit` — ✅ clean compilation
- `npm run test:unit -- --test-name-pattern "derive-state-db"` — ✅ 51 assertions pass
- `npm run test:unit -- --test-name-pattern "derive-state"` — ✅ all derive-state tests pass
- `npm run test:unit` — ✅ 286 tests pass, 0 failures

### Slice-level verification status (T02 is intermediate — partial passes expected):
- `npm run test:unit -- --test-name-pattern "derive-state-db"` — ✅ passes
- `npm run test:unit -- --test-name-pattern "token-savings"` — no matching tests yet (T03 creates this)
- `npx tsc --noEmit` — ✅ passes
- `npm run test:unit` — ✅ 286 pass
- `grep -c "promptCharCount\|baselineCharCount" src/resources/extensions/gsd/metrics.ts` — ✅ returns 5

## Diagnostics

- DB-backed state derivation is transparent — produces identical GSDState output as file path
- `derive-state-db` test suite validates equivalence across 7 scenarios
- If DB query fails at runtime, state derivation silently falls back to native batch parse (D003 pattern)
- `cachedLoadFile()` always falls back to disk for any path not in the DB cache

## Deviations

- Test 6 (multi-milestone from DB) initially failed because roadmap files weren't written to disk. Discovery: DB only provides content, but `resolveMilestoneFile` still checks file existence on disk for path resolution. This is correct design per plan ("Keep directory scanning via `findMilestoneIds()` as the canonical source"). Fixed test to write files to disk alongside DB rows.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/state.ts` — Added `isDbAvailable`/`_getAdapter` imports; replaced batch-parse cache block with DB-first content loading + native-batch fallback
- `src/resources/extensions/gsd/tests/derive-state-db.test.ts` — New test file with 7 test groups, 51 assertions proving DB/file path equivalence
- `.gsd/milestones/M001/slices/S04/tasks/T02-PLAN.md` — Added Observability Impact section (pre-flight fix)
- `.gsd/milestones/M001/slices/S04/S04-PLAN.md` — Marked T02 done
