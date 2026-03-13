---
estimated_steps: 3
estimated_files: 1
---

# T02: Add comprehensive unit tests for new exports

**Slice:** S01 — ID generation and config plumbing
**Milestone:** M001

## Description

Create `unique-milestone-ids.test.ts` covering all new exports from T01. Uses the project's hand-rolled assertion pattern (`assertEq`, `assertTrue`, `assertMatch`). These tests serve as S01's boundary contract — S02 depends on these exports working correctly.

## Steps

1. Create `src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts` importing all new exports from `guided-flow.ts` and preference functions from `preferences.ts`/`commands.ts` as needed
2. Write test sections:
   - (a) `MILESTONE_ID_RE`: matches `M001`, `M-abc123-001`, rejects `M1`, `M-ABC-001`, `M-short-001`, `IM001`, empty string
   - (b) `extractMilestoneSeq`: old format → number, new format → number, invalid → 0
   - (c) `parseMilestoneId`: old format returns `{ num }`, new format returns `{ prefix, num }`, invalid returns `{ num: 0 }`
   - (d) `milestoneIdSort`: verifies ordering of mixed arrays
   - (e) `generateMilestonePrefix`: length === 6, all chars match `[a-z0-9]`, two calls produce different results (probabilistic but astronomically unlikely to fail)
   - (f) `nextMilestoneId`: `uniqueEnabled=false` → old format, `uniqueEnabled=true` → new format matching `MILESTONE_ID_RE`, correct sequential number from mixed arrays
   - (g) `maxMilestoneNum`: empty → 0, old format only, new format only, mixed formats, non-matching entries ignored
   - (h) Preferences round-trip: validate `{ unique_milestone_ids: true }` → field preserved, validate `{ unique_milestone_ids: undefined }` → field absent, merge override wins
3. Run `npm test` and verify all pass

## Must-Haves

- [ ] Every export from the S01→S02 boundary map has at least one test
- [ ] Both old and new ID formats tested in every relevant function
- [ ] Mixed-format arrays tested in `maxMilestoneNum` and `nextMilestoneId`
- [ ] Invalid/edge-case inputs tested (empty string, wrong case, wrong length prefix)
- [ ] Preferences validation and merge tested
- [ ] All existing tests still pass

## Verification

- `npm test` — full suite green, new test file included
- New test file reports pass/fail counts to stdout

## Inputs

- T01 completed — all new exports available in `guided-flow.ts` and `preferences.ts`
- `src/resources/extensions/gsd/tests/next-milestone-id.test.ts` — reference for assertion pattern and test structure

## Observability Impact

- **Test output signals:** Each test section prints its label to stdout; pass/fail counts are reported at the end. A future agent can grep for `FAIL:` in test output to identify regressions.
- **Failure inspection:** `npm test` exits non-zero if any assertion fails. Individual failures include the assertion message, expected value, and actual value.
- **Coverage visibility:** The test file is organized into labeled sections (a)–(h) matching the plan. A future agent can verify coverage by checking section headers against the S01 boundary map.
- **Diagnostic grep:** `grep -c 'assertEq\|assertTrue\|assertMatch' src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts` shows total assertion count.

## Expected Output

- `src/resources/extensions/gsd/tests/unique-milestone-ids.test.ts` — comprehensive test file covering all S01 exports
