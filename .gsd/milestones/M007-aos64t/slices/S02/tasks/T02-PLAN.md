---
estimated_steps: 5
estimated_files: 1
---

# T02: Write live integration test proving dispatch reroute and corrected-evidence prompt

**Slice:** S02 — Live Reroute Proof Run
**Milestone:** M007-aos64t

## Description

Create the live integration test that proves the T01 production code works with S01's deterministic fixture data. This is the core proof artifact for the milestone — it exercises real dispatch rules and real prompt builders (not mocks) to confirm reroute and evidence injection.

**S01 Forward Intelligence:** The harness uses source-level verification because .ts files importing other .ts files with .js extensions fails at runtime. For this test, import the dispatch rule and prompt builder functions directly — they are the real production code, not stubs. Use `node --test` runner (same as S01). Use FixtureValidationError shape for structured failures.

## Steps

1. Create `src/resources/extensions/gsd/tests/factcheck-runtime-live.test.ts` with node:test and node:assert/strict.

2. **Setup helper:** Create a function that copies S01 fixture data into an isolated temp directory structured as a real .gsd/ project layout:
   - Create `{tmpDir}/.gsd/milestones/M999-PROOF/slices/S01/factcheck/` with FACTCHECK-STATUS.json and claims/
   - Create a minimal S01-RESEARCH.md and roadmap file so buildPlanSlicePrompt can load them
   - Use cpSync from S01 fixture root

3. **Test: dispatch rule matches on planImpacting=true.** Import the factcheck-reroute dispatch rule (or the full DISPATCH_RULES array) from auto-dispatch.ts. Construct a DispatchContext with phase "planning", activeSlice pointing at S01, and basePath set to the temp dir. Call the rule's match function. Assert it returns `{ action: "dispatch", unitType: "plan-slice" }`.

4. **Test: prompt contains corrected evidence.** Call `buildPlanSlicePrompt("M999-PROOF", "Proof Milestone", "S01", "Proof Slice", tmpDir)`. Assert the returned string contains "5.2.0" (corrected value) and a fact-check evidence marker (e.g. "Fact-Check Evidence" or "REFUTED"). This proves corrected evidence reaches the planner.

5. **Test: negative case — no reroute without FACTCHECK-STATUS.json.** Remove FACTCHECK-STATUS.json from the temp dir. Run the dispatch rule again. Assert it returns null (falls through to normal planning rule).

6. **Test: proof artifacts.** Write two files to `{tmpDir}/proof-output/`:
   - `reroute-action.json` — the dispatch action returned by the rule
   - `prompt-excerpt.txt` — the section of the generated prompt containing fact-check evidence
   Assert both files exist and contain expected content.

7. Cleanup: rmSync the temp dir in test teardown.

## Must-Haves

- [ ] Test file exists at `src/resources/extensions/gsd/tests/factcheck-runtime-live.test.ts`
- [ ] Dispatch reroute test passes with real dispatch rule code
- [ ] Prompt evidence test passes with real buildPlanSlicePrompt code
- [ ] Negative case test passes (no reroute when no factcheck status)
- [ ] Proof artifacts written to disk (reroute-action.json, prompt-excerpt.txt)
- [ ] All tests use synthetic S01 fixture data, no network calls
- [ ] FixtureValidationError shape used for structured failures

## Verification

- `node --test src/resources/extensions/gsd/tests/factcheck-runtime-live.test.ts` exits 0 with all tests passing
- S01 fixture tests still pass: `node --test src/resources/extensions/gsd/tests/factcheck-runtime-fixture.test.ts`

## Inputs

- `src/resources/extensions/gsd/auto-dispatch.ts` — T01 modified with factcheck-reroute rule (exports DISPATCH_RULES or the rule is accessible)
- `src/resources/extensions/gsd/auto-prompts.ts` — T01 modified with fact-check evidence injection
- `src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/` — S01 fixture data
- `src/resources/extensions/gsd/tests/fixtures/factcheck-runtime/FIXTURE-MANIFEST.json` — expected values: expectedRefutationClaimId="C001", expectedCorrectedValue="5.2.0", expectedImpact="slice"
- S01 Forward Intelligence: ESM resolution fragile — use source-level imports matching existing test patterns

## Expected Output

- `src/resources/extensions/gsd/tests/factcheck-runtime-live.test.ts` — live integration test with 4+ test cases
- Test produces proof artifacts in temp dir (reroute-action.json, prompt-excerpt.txt) for S03 consumption
