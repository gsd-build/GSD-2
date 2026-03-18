# S01: Deterministic Runtime Fixture — UAT

**Milestone:** M007-aos64t
**Written:** 2026-03-18

## UAT Type

- UAT mode: **artifact-driven**
- Why this mode is sufficient: S01 builds a deterministic fixture and harness for the fact-check runtime proof. The verification is inherently about file structure, data integrity, and code-path existence — not human UX. All assertions are automatable via Node test runner.

## Preconditions

- Node.js 22+ installed
- No external network access required (fixture uses synthetic data)
- Working directory is the milestone worktree: `.gsd/worktrees/M007-aos64t/`

## Smoke Test

```bash
node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts
```

**Expected:** All 30 tests pass in under 500ms.

---

## Test Cases

### 1. Fixture Manifest Loads Correctly

1. Run: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts --test-name-pattern "manifest"`
2. **Expected:** 5 tests pass, including:
   - `fixture: manifest exists` — FIXTURE-MANIFEST.json is readable
   - `fixture: manifest has required fields` — claimCount, refutationClaimId, correctedValue present
   - `fixture: manifest declares slice-impact refutation` — impact = "slice", planImpacting = true

### 2. Research Output Parses with Known False Claim

1. Run: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts --test-name-pattern "research"`
2. **Expected:** Tests pass showing:
   - S01-RESEARCH.md contains Unknowns Inventory
   - C001 is classified as `training-data` source
   - C001 claims version 4.1.0 (intentionally false)

### 3. Claim Annotations Are Valid

1. Run: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts --test-name-pattern "claim"`
2. **Expected:**
   - C001.json: verdict = "refuted", correctedValue = "5.2.0", impact = "slice"
   - C002.json: verdict = "confirmed"
   - C003.json: verdict = "inconclusive"

### 4. Aggregate Status Shows Plan-Impacting Refutation

1. Run: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts --test-name-pattern "status"`
2. **Expected:**
   - FACTCHECK-STATUS.json: overallStatus = "has-refutations"
   - planImpacting = true
   - rerouteTarget = "plan-slice"

### 5. Runtime Harness Executes All Stages

1. Run: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts --test-name-pattern "harness"`
2. **Expected:** Output shows `=== Runtime Harness Sequence ===` with all 5 stages:
   - fixture-load ✅
   - hook-execution ✅
   - artifact-write ✅
   - reroute-detection ✅
   - prompt-capture ✅

### 6. Source Modules Have Required Exports

1. Run: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts --test-name-pattern "source"`
2. **Expected:**
   - post-unit-hooks exports `resolveHookArtifactPath`
   - auto-recovery exports `resolveExpectedArtifactPath`
   - auto-prompts exports `buildExecuteTaskPrompt`

### 7. Failure Path Produces Structured Errors

1. Run: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts --test-name-pattern "failure"`
2. **Expected:**
   - Missing artifact produces `FixtureValidationError`
   - Error includes: `fixtureId`, `stage`, `expectedPath`, `message`
   - Error is NOT silent pass or undefined behavior

### 8. S02 Reusable Outputs Are Available

1. Run: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts --test-name-pattern "s02"`
2. **Expected:** Harness outputs:
   - `fixtureId: "factcheck-runtime-proof-v1"`
   - `rerouteTarget: "plan-slice"`
   - `planImpacting: true`
   - `correctedValue: "5.2.0"`
   - `impact: "slice"`

---

## Edge Cases

### Missing Fixture Directory

1. Temporarily rename `src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/`
2. Run: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts`
3. **Expected:** Test fails with clear error indicating fixture directory not found

### Corrupted Manifest JSON

1. Edit FIXTURE-MANIFEST.json to have invalid JSON
2. Run: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts`
3. **Expected:** Test fails with JSON parse error, not silent skip

### Missing Claim Annotation File

1. Delete `M999-PROOF/slices/S01/factcheck/claims/C001.json`
2. Run: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts --test-name-pattern "claim"`
3. **Expected:** Test fails indicating missing claim file

---

## Failure Signals

- **Test exit code != 0** — Something is broken
- **Test duration > 1000ms** — Possible hang or infinite loop
- **console.error in test output** — Unexpected error during fixture loading
- **Missing [s02-ready] tag** — Downstream outputs not exposed

---

## Not Proven By This UAT

- **Live execution of post-unit-hooks** — Harness uses source-level verification; S02 must wire live execution
- **Actual planner reroute behavior** — S02 must prove dispatcher reroutes based on fact-check results
- **Corrected evidence injection into planner prompts** — S02 must prove prompt assembly receives corrected values

These gaps are expected — S01 builds the fixture and harness; S02 proves the live execution path.

---

## Notes for Tester

- The fixture uses synthetic data (`@synthetic/lib`) — no real package exists
- TypeScript compilation warnings in `headless.ts` are pre-existing and unrelated to this slice
- All tests are fast (<500ms total) — no timeout concerns
- The `[s02-ready]` tag in test output confirms downstream contract is satisfied
