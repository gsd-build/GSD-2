---
estimated_steps: 5
estimated_files: 1
---

# T03: Fixture-based savings validation test

**Slice:** S04 — Token Measurement + State Derivation from DB
**Milestone:** M001

## Description

Create a test that proves ≥30% character savings on planning/research prompt types using realistic fixture data. The test populates a DB with 20+ decisions across 3 milestones and 20+ requirements across 5 slices, then compares DB-scoped content size against full-markdown content size. This retires R016 (≥30% savings target) and provides evidence for R019 (no quality regression — scoped content is non-empty and contains expected items).

## Steps

1. Create `token-savings.test.ts` with fixture generators: `generateDecisionsMarkdown(count, milestones)` and `generateRequirementsMarkdown(count, slices)` that produce realistic DECISIONS.md and REQUIREMENTS.md content
2. Write test setup: create temp dir with generated DECISIONS.md (24 decisions across M001/M002/M003), REQUIREMENTS.md (21 requirements across S01-S05 in M001/M002), and PROJECT.md. Open `:memory:` DB, import via `migrateFromMarkdown`.
3. Test plan-slice savings: call `inlineDecisionsFromDb(base, 'M001')` + `inlineRequirementsFromDb(base, 'S01')` for DB-scoped content. Call `inlineGsdRootFile` for full-markdown equivalents. Assert DB total < 70% of markdown total (≥30% savings).
4. Test research-milestone savings: call `inlineDecisionsFromDb(base, 'M001')` + `inlineRequirementsFromDb(base)` (all requirements). Decisions should still show savings (8 of 24 vs all 24). Assert meaningful savings.
5. Assert quality: DB-scoped content is non-empty, contains expected decision/requirement IDs for the scoped milestone/slice, does not contain items from other milestones/slices.

## Must-Haves

- [ ] Fixture data is realistic: 20+ decisions, 20+ requirements, spread across multiple milestones/slices
- [ ] plan-slice prompt type shows ≥30% character savings
- [ ] DB-scoped content is non-empty and contains expected items
- [ ] DB-scoped content does not contain items from unrelated milestones/slices
- [ ] Test uses `:memory:` DB for isolation

## Verification

- `npm run test:unit -- --test-name-pattern "token-savings"` — all assertions pass
- `npm run test:unit` — no regressions

## Inputs

- `src/resources/extensions/gsd/context-store.ts` — queryDecisions, queryRequirements, format functions
- `src/resources/extensions/gsd/gsd-db.ts` — openDatabase, closeDatabase for `:memory:` DB
- `src/resources/extensions/gsd/md-importer.ts` — migrateFromMarkdown for fixture import
- `src/resources/extensions/gsd/auto.ts` — inlineDecisionsFromDb, inlineRequirementsFromDb, inlineGsdRootFile (these are module-private — test will use context-store query+format functions directly and inlineGsdRootFile equivalent via resolveGsdRootFile + loadFile)
- T01 output — UnitMetrics with char count fields (T03 validates the savings ratio that those fields would capture)

## Observability Impact

- **Signals changed:** None — this is a test-only task producing no runtime signals.
- **Inspection:** Test output logs concrete savings percentages (e.g., `Plan-slice savings: 52.2%`) to stderr during `npm run test:unit -- --test-name-pattern "token-savings"`. These are human-readable and show actual vs expected savings.
- **Failure visibility:** Test failure exit code + assertion failure messages identifying which savings threshold or quality check failed. If savings drop below 30% due to fixture or query changes, the test will fail with the actual percentage.

## Expected Output

- `src/resources/extensions/gsd/tests/token-savings.test.ts` — new test proving ≥30% savings with fixture data
