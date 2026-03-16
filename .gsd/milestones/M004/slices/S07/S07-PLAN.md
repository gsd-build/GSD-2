# S07: Integration Verification + Polish

**Goal:** Prove the full M004 pipeline composes correctly end-to-end — migration → scoped queries → formatted prompts → token savings → re-import → round-trip — and promote all Active requirements to validated.
**Demo:** `integration-lifecycle.test.ts` and `integration-edge.test.ts` pass; full suite shows 0 failures; REQUIREMENTS.md has R045–R052 and R057 all validated.

## Must-Haves

- `integration-lifecycle.test.ts` ported and passing (full pipeline in one sequential flow)
- `integration-edge.test.ts` ported and passing (empty project, partial migration, fallback mode)
- R045, R047, R048, R049, R050, R051, R052, R057 promoted to validated in REQUIREMENTS.md
- Full test suite at 0 failures (pack-install.test.ts pre-existing failure unrelated and excluded)
- `npx tsc --noEmit` clean

## Proof Level

- This slice proves: final-assembly
- Real runtime required: yes (node:sqlite in-process, real temp dirs, real DB files)
- Human/UAT required: no

## Verification

- `node --experimental-sqlite --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/integration-lifecycle.test.ts` → all assertions pass
- `node --experimental-sqlite --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/integration-edge.test.ts` → all assertions pass
- `node --experimental-sqlite --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/token-savings.test.ts` → 99 passed, ≥30% savings printed to stdout
- `npm test` → 0 failures (pack-install.test.ts pre-existing failure excluded)
- `npx tsc --noEmit` → no output (zero errors)
- REQUIREMENTS.md: R045, R047, R048, R049, R050, R051, R052, R057 all status: validated

## Tasks

- [ ] **T01: Port integration tests and promote requirements** `est:30m`
  - Why: Completes the milestone's verification contract — two integration test files prove all subsystems compose correctly, then requirements are promoted to match the evidence gathered across S01–S06.
  - Files: `src/resources/extensions/gsd/tests/integration-lifecycle.test.ts`, `src/resources/extensions/gsd/tests/integration-edge.test.ts`, `.gsd/REQUIREMENTS.md`
  - Do: Copy `integration-lifecycle.test.ts` verbatim from `.gsd/worktrees/memory-db/src/resources/extensions/gsd/tests/integration-lifecycle.test.ts`. Copy `integration-edge.test.ts` verbatim from `.gsd/worktrees/memory-db/src/resources/extensions/gsd/tests/integration-edge.test.ts`. Run each file individually to confirm all assertions pass. Run `npm test`. Promote R045, R047, R048, R049, R050, R051, R052, R057 from active → validated in REQUIREMENTS.md — add Validation fields referencing the test files and assertion counts, update the traceability table.
  - Verify: Both new test files pass; full suite at 0 failures; REQUIREMENTS.md has 8 requirements promoted; `npx tsc --noEmit` clean.
  - Done when: All verification commands above pass and REQUIREMENTS.md reflects validated status for all 8 requirements.

## Files Likely Touched

- `src/resources/extensions/gsd/tests/integration-lifecycle.test.ts` (new)
- `src/resources/extensions/gsd/tests/integration-edge.test.ts` (new)
- `.gsd/REQUIREMENTS.md`
