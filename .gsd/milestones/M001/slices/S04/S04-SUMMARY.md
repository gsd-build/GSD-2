---
id: S04
parent: M001
milestone: M001
provides:
  - promptCharCount and baselineCharCount fields on UnitMetrics for per-dispatch token measurement
  - DB-backed content loading in deriveState() with fallback chain (DB → native batch parse → disk)
  - Fixture-proven ≥30% character savings on planning/research prompts (52.2% plan-slice, 66.3% decisions-only)
requires:
  - slice: S03
    provides: Rewired prompt builders using DB-scoped queries, context-store query layer, dual-write infrastructure
  - slice: S01
    provides: gsd-db adapter, isDbAvailable(), schema with artifacts table
  - slice: S02
    provides: migrateFromMarkdown, parseDecisionsTable, parseRequirementsSections for fixture data import
affects:
  - S07
key_files:
  - src/resources/extensions/gsd/metrics.ts
  - src/resources/extensions/gsd/auto.ts
  - src/resources/extensions/gsd/state.ts
  - src/resources/extensions/gsd/tests/derive-state-db.test.ts
  - src/resources/extensions/gsd/tests/token-savings.test.ts
key_decisions:
  - Module-scoped lastPromptCharCount/lastBaselineCharCount in auto.ts with reset per dispatch — avoids threading measurement through 13 call sites
  - DB content replaces only the content-reading step in deriveState, not file discovery — resolveMilestoneFile/resolveSliceFile still require files on disk for path resolution
  - Baseline computed via inlineGsdRootFile (full-markdown path) only when isDbAvailable() is true — when DB is off, savings=0 by definition
patterns_established:
  - Optional opts bag on snapshotUnitMetrics for extensible metric fields
  - DB-first content loading with native-batch-parse fallback in _deriveStateImpl
  - Fixture generators for realistic DECISIONS.md and REQUIREMENTS.md content with configurable count and distribution
  - Savings validation pattern: DB-scoped formatted output vs raw markdown file size
observability_surfaces:
  - promptCharCount and baselineCharCount fields in metrics.json unit records
  - derive-state-db test suite (51 assertions) validates DB/file path equivalence
  - token-savings test suite (99 assertions) proves ≥30% savings with concrete percentages logged to stderr
drill_down_paths:
  - .gsd/milestones/M001/slices/S04/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S04/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S04/tasks/T03-SUMMARY.md
duration: 47m
verification_result: passed
completed_at: 2025-03-15
---

# S04: Token Measurement + State Derivation from DB

**Prompt character measurement wired into dispatch path, deriveState() reads from DB with fallback, and ≥30% savings proven (52.2% plan-slice, 66.3% decisions-only) with 150-assertion test suite**

## What Happened

**T01** extended `UnitMetrics` with `promptCharCount` and `baselineCharCount` optional fields and wired measurement into all 13 `snapshotUnitMetrics` call sites in the dispatch path. After `finalPrompt` is fully assembled (including recovery/retry/repair injections), `finalPrompt.length` is captured. When DB is active, the baseline is computed by summing the full contents of decisions.md, requirements.md, and project.md via `inlineGsdRootFile`. Values reset at the top of `dispatchNextUnit` to prevent stale data across dispatches.

**T02** modified `_deriveStateImpl()` in state.ts to query `SELECT path, full_content FROM artifacts` when `isDbAvailable()` is true, populating the `fileContentCache` from DB rows instead of native batch file parsing. Key design: DB only replaces the content-reading step — file discovery (`findMilestoneIds`, `resolveMilestoneFile`, `resolveSliceFile`) still relies on disk. Falls back silently to native batch parse when DB is unavailable or empty. 51-assertion test suite validates field-by-field equality between DB-backed and file-backed derived state across 7 scenarios.

**T03** created a fixture-based savings validation test with 24 decisions across 3 milestones and 21 requirements across 5 slices. Measured DB-scoped query output vs full-markdown file sizes:
- Plan-slice (M001 decisions + S01 requirements): **52.2% savings** (10,996 vs 23,016 chars)
- Decisions-only (M001-scoped): **66.3% savings** (3,455 vs 10,262 chars)
- Research-milestone composite: **32.2% savings** (15,608 vs 23,016 chars)

All exceed the ≥30% threshold. Quality validation confirms correct scoping with no cross-contamination.

## Verification

- `npx tsc --noEmit` — clean compilation, zero errors
- `npm run test:unit` — 287 tests pass, 0 failures (2 new test files added)
- `npm run test:unit -- --test-name-pattern "derive-state-db"` — 51 assertions pass across 7 test groups
- `npm run test:unit -- --test-name-pattern "token-savings"` — 99 assertions pass, savings logged to stderr
- `grep -c "promptCharCount\|baselineCharCount" src/resources/extensions/gsd/metrics.ts` → 5
- Plan-slice savings: 52.2% ≥ 30% ✓
- Decisions savings: 66.3% ≥ 30% ✓
- Research composite savings: 32.2% ≥ 30% ✓

## Requirements Advanced

- R010 — promptCharCount and baselineCharCount fields added to UnitMetrics; measurement wired into all dispatch path call sites; persisted in metrics.json
- R011 — deriveState() queries artifacts table from DB when available, falls back to filesystem; produces identical GSDState output verified by 51-assertion test suite
- R016 — ≥30% character savings proven with fixture data: 52.2% (plan-slice), 66.3% (decisions), 32.2% (research composite)

## Requirements Validated

- R010 — promptCharCount/baselineCharCount fields exist in UnitMetrics, measurement wired into dispatch path, values persist in metrics.json ledger. Proof: 5 grep matches in metrics.ts, clean compilation, all 287 tests pass.
- R011 — deriveState() loads from DB when available, falls back to filesystem, produces identical GSDState. Proof: 51-assertion derive-state-db test suite covering DB path, fallback, empty DB, partial DB, multi-milestone, cache invalidation.
- R016 — ≥30% character savings on planning/research prompts with 20+ decision, 20+ requirement fixtures. Proof: 99-assertion token-savings test suite; 52.2% plan-slice, 66.3% decisions-only, 32.2% research composite. All exceed 30% threshold.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- T03 used context-store `queryDecisions`/`queryRequirements` + `formatDecisionsForPrompt`/`formatRequirementsForPrompt` directly instead of auto.ts module-private helpers (`inlineDecisionsFromDb`/`inlineRequirementsFromDb`). Same code path, cleaner test boundary.
- T02 discovered that DB only replaces content reads, not file discovery — `resolveMilestoneFile`/`resolveSliceFile` still require files on disk. This is correct design but wasn't explicit in the plan. Test fixtures were adjusted to write both DB rows and disk files.

## Known Limitations

- Baseline measurement computed at prompt assembly time via `inlineGsdRootFile` adds a small overhead (reads 3 markdown files) — only runs when DB is active, so it's measuring the savings scenario.
- deriveState() DB loading queries all artifacts rows into memory at once — fine for current project sizes but would need pagination for very large projects (thousands of artifacts).
- R019 (no output quality regression) advanced but not fully validated — requires S07 full auto-mode cycle on a real project to confirm.

## Follow-ups

- S07 should run a full auto-mode dispatch and verify metrics.json contains promptCharCount/baselineCharCount with ≥30% savings on a real project (not just fixture data).
- S07 should verify R019 (output quality) by comparing auto-mode output quality between DB-backed and markdown-backed paths.

## Files Created/Modified

- `src/resources/extensions/gsd/metrics.ts` — Added promptCharCount/baselineCharCount to UnitMetrics; added opts param to snapshotUnitMetrics
- `src/resources/extensions/gsd/auto.ts` — Module-scoped measurement vars, prompt measurement after finalPrompt assembly, opts passed to all 13 snapshotUnitMetrics call sites
- `src/resources/extensions/gsd/state.ts` — DB-first content loading in _deriveStateImpl with native-batch fallback
- `src/resources/extensions/gsd/tests/derive-state-db.test.ts` — New: 7 test groups, 51 assertions for DB/file path equivalence
- `src/resources/extensions/gsd/tests/token-savings.test.ts` — New: 4 test groups, 99 assertions proving ≥30% character savings

## Forward Intelligence

### What the next slice should know
- The `promptCharCount`/`baselineCharCount` fields in metrics.json are optional — they'll be `undefined` when DB is unavailable (D003 fallback). S07 integration tests should handle this.
- deriveState() DB path queries ALL rows from the artifacts table. If the schema changes (e.g., adding columns or renaming `full_content`), state.ts will break silently by returning empty content. The query is at line ~140 in state.ts.
- Token savings vary by fixture data distribution. The 52.2%/66.3%/32.2% numbers come from 24 decisions round-robin across 3 milestones and 21 requirements across 5 slices. Real project distributions may differ.

### What's fragile
- The module-scoped `lastPromptCharCount`/`lastBaselineCharCount` vars in auto.ts rely on being reset at the top of `dispatchNextUnit`. If a new dispatch entry point is added that skips the reset, stale data from the previous dispatch leaks into metrics.
- derive-state-db tests create temp directories AND in-memory DB rows — both must agree on paths. If `gsdDir` path resolution changes in state.ts, these tests will fail with "file not found" even though DB has the content.

### Authoritative diagnostics
- `npm run test:unit -- --test-name-pattern "token-savings"` — stderr output logs exact savings percentages. If savings drop below 30%, this test fails.
- `npm run test:unit -- --test-name-pattern "derive-state-db"` — 51 assertions that comprehensively validate DB/file equivalence.
- `jq '.units[-1] | {promptCharCount, baselineCharCount}' .gsd/metrics.json` — inspect per-unit measurement after a live dispatch.

### What assumptions changed
- Plan assumed `inlineDecisionsFromDb`/`inlineRequirementsFromDb` from auto.ts would be used in T03 tests — these are module-private. Using context-store functions directly works identically and is cleaner.
- Plan assumed DB replaces all content loading in deriveState — actually only replaces the batch-parse step. File discovery (milestone IDs, path resolution) still requires disk.
