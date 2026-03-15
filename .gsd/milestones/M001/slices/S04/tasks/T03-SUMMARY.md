---
id: T03
parent: S04
milestone: M001
provides:
  - Fixture-based test proving ≥30% character savings on DB-scoped vs full-markdown prompts
  - Evidence for R016 (≥30% savings) and R019 (no quality regression)
key_files:
  - src/resources/extensions/gsd/tests/token-savings.test.ts
key_decisions:
  - Test uses context-store query+format functions directly rather than module-private auto.ts helpers — validates the same code path without import gymnastics
  - Requirements use supporting_slices for cross-slice references to test OR-based query filtering
patterns_established:
  - Fixture generators for realistic DECISIONS.md and REQUIREMENTS.md content with configurable count and distribution
  - Savings validation pattern: DB-scoped formatted output size vs raw markdown file size
observability_surfaces:
  - Test stderr output logs concrete savings percentages (e.g., "Plan-slice savings: 52.2%") during test run
duration: 12m
verification_result: passed
completed_at: 2025-03-15
blocker_discovered: false
---

# T03: Fixture-based savings validation test

**Created token-savings.test.ts proving 52.2% character savings on plan-slice prompts and 66.3% on milestone-scoped decisions with 24-decision, 21-requirement fixture data**

## What Happened

Built `token-savings.test.ts` with four test groups and 99 assertions:

1. **Fixture generators** — `generateDecisionsMarkdown(count, milestones)` produces a realistic DECISIONS.md table with round-robin milestone assignment. `generateRequirementsMarkdown(count, sliceAssignments)` produces structured H3 requirement sections with primary_owner and supporting_slices fields. 24 decisions across M001/M002/M003, 21 requirements across S01-S05 in M001/M002.

2. **Plan-slice savings** — DB-scoped content (M001 decisions + S01 requirements) measured 10,996 chars vs full-markdown 23,016 chars → **52.2% savings** (threshold: ≥30%). Asserts DB total < 70% of markdown total.

3. **Research-milestone savings** — M001-scoped decisions (8 of 24) showed **66.3% savings**. Composite (M001 decisions + all requirements) showed **32.2% savings**. Decisions-only savings confirmed ≥30%.

4. **Quality validation** — Verified correct scoping (M001 decisions contain only M001 when_context, S01 requirements only include S01-owned items), no cross-contamination (M002 decisions don't leak M001/M003 items), formatted output is well-formed (table headers, requirement headings), and decision counts partition correctly (8+8+8=24 across three milestones).

## Verification

- `npm run test:unit -- --test-name-pattern "token-savings"` — 99 assertions pass, 0 failures
- `npm run test:unit` — all 287 tests pass, no regressions
- `npx tsc --noEmit` — clean compilation
- `grep -c "promptCharCount\|baselineCharCount" src/resources/extensions/gsd/metrics.ts` → 5 (fields exist)
- Plan-slice savings: 52.2% (≥30% ✓)
- Research decisions savings: 66.3% (≥30% ✓)

### Slice Verification Status (T03 is final task)

| Check | Status |
|-------|--------|
| `npm run test:unit -- --test-name-pattern "derive-state-db"` | ✅ pass |
| `npm run test:unit -- --test-name-pattern "token-savings"` | ✅ pass |
| `npx tsc --noEmit` | ✅ clean |
| `npm run test:unit` — all 285+ tests pass | ✅ 287 pass |
| `grep -c "promptCharCount\|baselineCharCount" src/resources/extensions/gsd/metrics.ts` | ✅ 5 |

All slice-level verification checks pass.

## Diagnostics

- Run `npm run test:unit -- --test-name-pattern "token-savings"` — stderr logs savings percentages for each test group
- If savings drop below 30% after changes to query logic or fixture data, the test will fail with the actual percentage in the assertion message
- Test uses `:memory:` DB — no cleanup required, no disk artifacts left behind

## Deviations

- Task plan suggested calling `inlineDecisionsFromDb`/`inlineRequirementsFromDb`/`inlineGsdRootFile` from auto.ts — these are module-private. Instead used context-store `queryDecisions`/`queryRequirements` + `formatDecisionsForPrompt`/`formatRequirementsForPrompt` directly (same code path, no import workaround needed). For baseline comparison, read the raw markdown files directly with `readFileSync` (equivalent to what `inlineGsdRootFile` returns minus the wrapper header).

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/tests/token-savings.test.ts` — new test file (99 assertions) proving ≥30% character savings with fixture data
- `.gsd/milestones/M001/slices/S04/tasks/T03-PLAN.md` — added Observability Impact section (pre-flight fix)
- `.gsd/milestones/M001/slices/S04/S04-PLAN.md` — marked T03 as [x]
