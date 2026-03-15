---
estimated_steps: 5
estimated_files: 2
---

# T02: Wire deriveState() to load artifact content from DB

**Slice:** S04 — Token Measurement + State Derivation from DB
**Milestone:** M001

## Description

Add a DB-backed content loading path to `_deriveStateImpl()` in `state.ts`. When `isDbAvailable()` is true, populate the `fileContentCache` by querying the artifacts table instead of calling `nativeBatchParseGsdFiles`. Keep directory scanning via `findMilestoneIds()` as the canonical source for milestone IDs. The DB path is a content-loading optimization — replaces O(N) file I/O with indexed SELECT queries. Must produce identical `GSDState` output for the same underlying data.

## Steps

1. Add static import of `isDbAvailable` and `_getAdapter` from `gsd-db.ts` in `state.ts`
2. In `_deriveStateImpl()`, before the `nativeBatchParseGsdFiles` call, check `isDbAvailable()`. If true, query `SELECT path, full_content FROM artifacts` and populate `fileContentCache` by resolving each relative path against `gsdDir`. Skip the native batch parse when DB content is available.
3. Keep `cachedLoadFile()` fallback to `loadFile()` for any path not in the cache — handles files created after last DB import
4. Create `derive-state-db.test.ts` that: (a) creates a temp directory with milestone dirs, roadmaps, plans; (b) opens a `:memory:` DB and inserts matching artifacts; (c) calls deriveState and asserts field-by-field equality against expected GSDState; (d) tests fallback when DB unavailable produces same result as file-only path
5. Test edge cases: empty DB (falls back to file), partial DB content (fills gaps from disk), requirements counting from DB content

## Must-Haves

- [ ] deriveState uses DB artifacts table for content loading when available
- [ ] Directory scanning for milestone IDs remains unchanged
- [ ] cachedLoadFile falls back to disk for missing DB entries
- [ ] Identical GSDState output from DB path vs file path
- [ ] Graceful fallback when DB unavailable (D003)
- [ ] Cache invalidation works identically for both paths

## Verification

- `npm run test:unit -- --test-name-pattern "derive-state-db"` — all new assertions pass
- `npm run test:unit -- --test-name-pattern "derive-state"` — existing tests pass
- `npm run test:unit` — no regressions
- `npx tsc --noEmit` — clean compilation

## Inputs

- `src/resources/extensions/gsd/state.ts` — existing `_deriveStateImpl()` with `fileContentCache` + `nativeBatchParseGsdFiles` pattern
- `src/resources/extensions/gsd/gsd-db.ts` — `isDbAvailable()`, `_getAdapter()`, artifacts table schema
- `src/resources/extensions/gsd/tests/derive-state.test.ts` — existing test patterns (fixture helpers, assertEq/assertTrue)
- S03 summary — `isDbAvailable()` is a lightweight static import; DB content stored as full_content blobs

## Expected Output

- `src/resources/extensions/gsd/state.ts` — DB-backed content loading in `_deriveStateImpl`
- `src/resources/extensions/gsd/tests/derive-state-db.test.ts` — new test file proving identical GSDState output

## Observability Impact

- **What changes:** `_deriveStateImpl()` now checks `isDbAvailable()` before content loading. When DB is active, artifact content is loaded via `SELECT path, full_content FROM artifacts` instead of native batch file parsing or sequential disk reads.
- **How to inspect:** DB-backed state derivation is transparent — produces identical `GSDState` output. Verify via `derive-state-db` tests comparing DB vs file path results field-by-field. The `dbContentLoaded` local boolean controls whether the native batch parse fallback runs.
- **Failure visibility:** If DB query fails, the function silently falls back to the native batch parser / disk reads (existing D003 pattern). No error is surfaced because this is an optimization — correctness is preserved by the fallback chain. `cachedLoadFile()` always falls back to disk for paths not in the cache.
