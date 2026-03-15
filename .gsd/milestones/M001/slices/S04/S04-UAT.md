# S04: Token Measurement + State Derivation from DB — UAT

**Milestone:** M001
**Written:** 2025-03-15

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All three capabilities (prompt measurement, DB-backed deriveState, token savings) are quantitative and fully verifiable via test suites and file inspection. No runtime dispatch or human judgment needed.

## Preconditions

- Working directory is the memory-db worktree: `cd /Users/lexchristopherson/Developer/gsd-2/.gsd/worktrees/memory-db`
- Node.js available with `--experimental-strip-types` support
- All S01–S03 work merged into the branch

## Smoke Test

Run `npm run test:unit -- --test-name-pattern "token-savings"` and verify output includes savings percentages ≥30%.

## Test Cases

### 1. UnitMetrics type has prompt measurement fields

1. Open `src/resources/extensions/gsd/metrics.ts`
2. Search for `promptCharCount` in the `UnitMetrics` interface
3. Search for `baselineCharCount` in the `UnitMetrics` interface
4. Verify both are `number | undefined` optional fields
5. **Expected:** Both fields exist as optional numeric fields in the interface

### 2. snapshotUnitMetrics accepts measurement opts

1. Open `src/resources/extensions/gsd/metrics.ts`
2. Find the `snapshotUnitMetrics` function signature
3. Verify it accepts an optional `opts` parameter with `promptCharCount` and `baselineCharCount`
4. Verify the function body conditionally spreads these values onto the unit record
5. **Expected:** opts bag pattern exists; fields written to unit record when provided

### 3. Dispatch path measures prompt length

1. Open `src/resources/extensions/gsd/auto.ts`
2. Search for `lastPromptCharCount`
3. Verify it's set to `finalPrompt.length` after prompt assembly
4. Verify `lastBaselineCharCount` is computed from `inlineGsdRootFile` calls when `isDbAvailable()` is true
5. Verify both variables are reset at the top of `dispatchNextUnit`
6. **Expected:** Measurement vars set after prompt assembly, reset per dispatch, passed to all snapshotUnitMetrics calls

### 4. All snapshotUnitMetrics call sites carry measurement

1. Run: `grep -c "promptCharCount: lastPromptCharCount" src/resources/extensions/gsd/auto.ts`
2. **Expected:** 13 matches (all dispatch path call sites)

### 5. deriveState loads from DB when available

1. Open `src/resources/extensions/gsd/state.ts`
2. Find the `isDbAvailable()` check in `_deriveStateImpl`
3. Verify it queries `SELECT path, full_content FROM artifacts`
4. Verify it populates `fileContentCache` from DB rows
5. Verify fallback to native batch parse when DB unavailable or empty
6. **Expected:** DB-first content loading with silent fallback chain

### 6. derive-state-db test suite passes

1. Run: `npm run test:unit -- --test-name-pattern "derive-state-db"`
2. **Expected:** 51 assertions pass across 7 test groups:
   - DB path matches file path (field-by-field equality)
   - Fallback when DB unavailable
   - Empty DB falls back to files
   - Partial DB fills gaps from disk
   - Requirements counting from DB content
   - Multi-milestone registry from DB
   - Cache invalidation works for both paths

### 7. Token savings test proves ≥30% reduction

1. Run: `npm run test:unit -- --test-name-pattern "token-savings"`
2. Check stderr output for savings percentages
3. **Expected:**
   - Plan-slice savings ≥ 30% (actual: ~52.2%)
   - Decisions-only savings ≥ 30% (actual: ~66.3%)
   - Research composite savings ≥ 30% (actual: ~32.2%)
   - 99 assertions pass, 0 failures

### 8. Quality validation — no cross-contamination

1. In the token-savings test output, verify:
   - M001-scoped decisions contain only M001 when_context values
   - S01-scoped requirements contain only S01-owned items
   - M002 decisions don't include M001 or M003 items
2. **Expected:** Correct scoping with zero cross-contamination (verified by quality test group)

### 9. Full test suite — no regressions

1. Run: `npm run test:unit`
2. **Expected:** 287 tests pass, 0 failures, 0 skipped

### 10. Clean compilation

1. Run: `npx tsc --noEmit`
2. **Expected:** Zero errors, zero output

## Edge Cases

### Empty DB with deriveState

1. derive-state-db test group 3 covers this: `isDbAvailable()` returns true but DB has no artifact rows
2. **Expected:** deriveState falls back to native batch parse, produces same result as file-only path

### DB unavailable (D003 fallback)

1. derive-state-db test group 2 covers this: `isDbAvailable()` returns false
2. **Expected:** deriveState uses native batch parse path, identical to pre-S04 behavior

### Partial DB content

1. derive-state-db test group 4 covers this: DB has some artifacts but not all
2. **Expected:** DB-loaded content used where available, `cachedLoadFile()` falls back to disk for missing paths

### Baseline measurement when DB is off

1. In auto.ts, when `isDbAvailable()` is false, `lastBaselineCharCount` stays undefined
2. **Expected:** metrics.json records `promptCharCount` but not `baselineCharCount` — savings=0 by definition since both paths are identical

## Failure Signals

- Any test failure in `derive-state-db` or `token-savings` test patterns
- Savings percentage below 30% in token-savings test stderr output
- Missing `promptCharCount` field in UnitMetrics interface (grep returns 0)
- TypeScript compilation errors in metrics.ts, auto.ts, or state.ts
- `snapshotUnitMetrics` call sites in auto.ts that don't pass `promptCharCount` opts
- Regression in existing 285 base tests (any failures in full test suite)

## Requirements Proved By This UAT

- R010 — Built-in token measurement: promptCharCount/baselineCharCount in UnitMetrics, wired into dispatch path, persisted in metrics.json
- R011 — State derivation from DB: deriveState reads artifacts table, produces identical GSDState, falls back silently
- R016 — ≥30% token reduction: 52.2% plan-slice, 66.3% decisions, 32.2% research composite — all exceed threshold

## Not Proven By This UAT

- R019 (output quality regression) — requires full auto-mode cycle on a real project (S07)
- R016 on real project data — fixture-proven only; real project validation deferred to S07
- Runtime metrics.json population — requires a live dispatch cycle to verify `jq '.units[-1] | {promptCharCount, baselineCharCount}'` returns numeric values

## Notes for Tester

- All tests use `:memory:` SQLite databases — no cleanup needed, no disk artifacts left behind
- Token-savings test logs savings percentages to stderr during test run — look for lines like "Plan-slice savings: 52.2%"
- The 287 test count includes 2 new test files (derive-state-db: 51 assertions, token-savings: 99 assertions) plus the 285 pre-existing tests that gained 2 from other suites loading
- Baseline measurement adds a small overhead (reads 3 markdown files) — this is intentional for measuring the savings that DB-scoped injection provides
