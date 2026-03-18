# S03 — Research: Durable Validation and Closeout

## Summary

The runtime proof path (fact-check coordinator → dispatcher reroute → prompt assembly) is already verified in S02. S03 needs to formalize this into a durable milestone-level audit. We will synthesize S02's transient integration artifacts (`reroute-action.json` and `prompt-excerpt.txt`) into a standard milestone validation artifact, `M007-VALIDATION-REPORT.json`, and verify this report is sufficient for machine-based milestone closeout.

## Recommendation

Implement a validation harness that runs the S02 integration tests, captures the transient `proof-output/` files, and generates a structured `M007-VALIDATION-REPORT.json` file in the milestone root. This report will provide the immutable evidence needed to satisfy the milestone completion criteria without manual inspection. We will not change the runtime path itself — it is already production-ready — but we will wrap it in a verification gate.

## Implementation Landscape

### Key Files

- `src/resources/extensions/gsd/tests/factcheck-runtime-live.test.ts` — The existing runtime proof loop.
- `src/resources/extensions/gsd/tests/validate-milestone.test.ts` — The standard test used for milestone verification.
- `.gsd/milestones/M007-aos64t/M007-VALIDATION-REPORT.json` — The new durable audit artifact.

### Build Order

1. Extend `factcheck-runtime-live.test.ts` (or add a separate `S03` verification unit) to write the validation report *as part of the execution flow*.
2. Add a verification step to the milestone closeout workflow that checks for the existence and structural validity of `M007-VALIDATION-REPORT.json`.

### Verification Approach

Create a new test within `src/resources/extensions/gsd/tests/` (e.g., `factcheck-final-audit.test.ts`) that:
- Executes the S02 integration proof sequence.
- Verifies the JSON artifact contains correctly serialized evidence (REFUTED claim count, reroute target, and prompt content).
- Asserts that this report artifact fulfills the "durable diagnostics" success criterion.

## Constraints

- The validation report must be generated without adding manual inspection steps for future agents; all findings must be in the JSON schema.
- The proof artifacts must remain durable across test executions in the worktree, even if individual integration tests run in temp directories.

## Open Risks

- S02 integration tests rely on `/tmp` directory isolation. Capturing the state back into the `worktree` for durability will need a persistent target path (e.g., `gsd-artifacts/`).

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Test Harness | `bash-testing` | available |
| Audit/Validation | `validation-protocol` | available |
