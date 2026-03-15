# S04: Token Measurement + State Derivation from DB

**Goal:** Token counts logged per dispatch unit showing DB-scoped vs markdown-full savings. deriveState() reads artifact content from DB. Savings ≥30% confirmed on planning/research units with fixture data.
**Demo:** Test suite proves ≥30% character savings on planning/research prompts with a 20+ decision, 20+ requirement fixture. deriveState() produces identical GSDState from DB vs filesystem. Prompt char counts tracked in UnitMetrics.

## Must-Haves

- UnitMetrics extended with prompt char counts (DB-scoped actual vs full-markdown baseline)
- Prompt character measurement wired into dispatch path (after finalPrompt assembly)
- deriveState() loads artifact content from DB when available, falls back to filesystem
- deriveState() from DB produces identical GSDState output as filesystem path
- Fixture-based test proves ≥30% character savings on planning/research prompt types
- All existing tests continue to pass (285 currently)

## Proof Level

- This slice proves: contract + integration
- Real runtime required: no (fixture data sufficient for savings proof; runtime dispatch wiring verified by compilation + existing test suite)
- Human/UAT required: no (quantitative measurement — either ≥30% or not)

## Verification

- `npm run test:unit -- --test-name-pattern "derive-state-db"` — DB-backed deriveState produces identical GSDState
- `npm run test:unit -- --test-name-pattern "token-savings"` — ≥30% character savings proven with fixture data
- `npx tsc --noEmit` — clean compilation
- `npm run test:unit` — all 285+ tests pass, no regressions
- `grep -c "promptCharCount\|baselineCharCount" src/resources/extensions/gsd/metrics.ts` — fields exist in UnitMetrics
- Verify `metrics.json` schema: when `promptCharCount` or `baselineCharCount` are provided, they appear as numeric fields in persisted unit records (inspectable via `jq '.units[-1] | {promptCharCount, baselineCharCount}' .gsd/metrics.json`). Missing fields indicate measurement not wired at the call site.

## Observability / Diagnostics

- Runtime signals: `promptCharCount` and `baselineCharCount` fields in `UnitMetrics` — written to `metrics.json` on every dispatch
- Inspection surfaces: `metrics.json` ledger on disk; savings percentage derivable from `(baseline - actual) / baseline * 100`
- Failure visibility: Missing fields in UnitMetrics indicate measurement not wired; deriveState falls back silently to filesystem when DB unavailable (existing D003 pattern)
- Redaction constraints: none (no secrets in metric data)

## Integration Closure

- Upstream surfaces consumed: `auto.ts` prompt dispatch path (finalPrompt at line ~2107), `state.ts` deriveState, `context-store.ts` query layer, `gsd-db.ts` adapter
- New wiring introduced in this slice: prompt char measurement in dispatch path, DB content loading in deriveState
- What remains before the milestone is truly usable end-to-end: S05 (worktree), S06 (structured tools + inspect), S07 (full integration cycle)

## Tasks

- [x] **T01: Add prompt char measurement to UnitMetrics and dispatch path** `est:30m`
  - Why: R010 requires built-in token measurement. Currently UnitMetrics tracks runtime LLM usage but not prompt size. Need to measure the actual prompt string length and compare against what the full-markdown path would produce.
  - Files: `src/resources/extensions/gsd/metrics.ts`, `src/resources/extensions/gsd/auto.ts`
  - Do: Add `promptCharCount` and `baselineCharCount` optional fields to `UnitMetrics`. After `finalPrompt` is assembled (line ~2107), measure `finalPrompt.length` as `promptCharCount`. For baseline, compute the total size of full DECISIONS.md + REQUIREMENTS.md + PROJECT.md files (via `inlineGsdRootFile`) at measurement time and store as `baselineCharCount`. Pass both values to `snapshotUnitMetrics()` so they persist in the ledger. Only compute baseline when DB is available (when DB is off, both paths are identical so savings = 0).
  - Verify: `npx tsc --noEmit` compiles clean. Existing `npm run test:unit` passes. `grep "promptCharCount" src/resources/extensions/gsd/metrics.ts` confirms field exists.
  - Done when: UnitMetrics type has promptCharCount and baselineCharCount fields, dispatch path measures finalPrompt.length and passes it through to snapshotUnitMetrics.

- [x] **T02: Wire deriveState() to load artifact content from DB** `est:45m`
  - Why: R011 requires deriveState to read from DB instead of scanning files. The DB's artifacts table stores full_content for all hierarchy artifacts. Replace the batch file cache with DB queries when available, keeping directory scanning for milestone ID discovery.
  - Files: `src/resources/extensions/gsd/state.ts`, `src/resources/extensions/gsd/tests/derive-state-db.test.ts`
  - Do: In `_deriveStateImpl()`, when `isDbAvailable()` is true, populate `fileContentCache` from DB artifacts table instead of using `nativeBatchParseGsdFiles`. Query `SELECT path, full_content FROM artifacts` and map each row's path (relative) to absolute path via `resolve(gsdDir, path)`. Keep `findMilestoneIds()` directory scanning as-is (canonical source for milestone IDs per research). Keep `cachedLoadFile()` fallback to disk for any path missing from DB (handles newly created files not yet imported). Import `isDbAvailable` and `_getAdapter` statically (same pattern as auto.ts). Create `derive-state-db.test.ts` that populates a `:memory:` DB with fixture artifacts, creates matching temp directory structure, and asserts field-by-field equality between DB-backed and file-backed deriveState results.
  - Verify: `npm run test:unit -- --test-name-pattern "derive-state-db"` — all assertions pass. `npm run test:unit` — no regressions.
  - Done when: deriveState loads content from DB when available, falls back to filesystem, and produces identical GSDState output verified by test.

- [x] **T03: Fixture-based savings validation test** `est:30m`
  - Why: R016 requires proving ≥30% token savings on planning/research prompts. R019 requires no regression in output quality. A fixture-based test creates a realistic project (20+ decisions across 3 milestones, 20+ requirements across 5 slices), builds prompts via both DB-scoped and full-markdown paths, and asserts savings.
  - Files: `src/resources/extensions/gsd/tests/token-savings.test.ts`
  - Do: Create test that: (1) sets up a temp directory with DECISIONS.md (20+ decisions), REQUIREMENTS.md (20+ requirements across 3 milestones/5 slices), and PROJECT.md; (2) opens a `:memory:` DB and imports via `migrateFromMarkdown`; (3) calls `inlineDecisionsFromDb(base, 'M001')` and `inlineRequirementsFromDb(base, 'S01')` to get DB-scoped content; (4) calls `inlineGsdRootFile(base, 'decisions.md', 'Decisions')` and `inlineGsdRootFile(base, 'requirements.md', 'Requirements')` to get full-markdown content; (5) asserts DB-scoped total chars < 70% of full-markdown total chars (i.e., ≥30% savings). Also assert DB-scoped content is non-empty (quality check — scoped content actually contains relevant items). Test multiple prompt types: research-milestone (milestone-scoped decisions + all requirements) and plan-slice (milestone decisions + slice requirements) to verify both show savings.
  - Verify: `npm run test:unit -- --test-name-pattern "token-savings"` — all assertions pass including ≥30% savings threshold.
  - Done when: Test proves ≥30% savings on planning/research prompt types with fixture data. R016 and R019 evidence established.

## Files Likely Touched

- `src/resources/extensions/gsd/metrics.ts` — UnitMetrics type extension
- `src/resources/extensions/gsd/auto.ts` — prompt char measurement in dispatch path
- `src/resources/extensions/gsd/state.ts` — DB-backed content loading in deriveState
- `src/resources/extensions/gsd/tests/derive-state-db.test.ts` — new test file
- `src/resources/extensions/gsd/tests/token-savings.test.ts` — new test file
