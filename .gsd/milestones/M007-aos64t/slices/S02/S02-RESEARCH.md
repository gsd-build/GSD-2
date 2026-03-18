# Research — Research Slice S02: Live Reroute Proof Run

## Summary

The S01 deterministic fixture established a contract boundary for the fact-check runtime loop. S02 must now prove this loop in a live runtime path. The current harness verifies module exports and artifact existence but does not execute the dispatch/reroute logic live. I recommend extending the S01 harness to perform a "partial-session" injection: copy the S01 research/factcheck artifacts into the live runtime staging area, simulate a research-complete post-unit event, and observe the auto-dispatcher Reroute rule intercept the execution to reinvoke the planner.

## Recommendation

Implement a *Live Proof Runner* (harness) that:
1. Provisions the live environment state with S01 artifacts.
2. Triggers the real Fact-Check Coordinator loop (factcheck-coordinator.ts).
3. Monitors the auto-recovery/dispatcher for the plan-impacting trigger (D073/D074).
4. Captures the Reinvoked Plan inputs (or mock them if the Dispatcher can signal re-entry) to confirm the corrected evidence is ingested.

This approach provides high-fidelity proof that the "real" runtime path functions without requiring a full autonomous session startup, minimizing flake while meeting the milestone requirement for live integration coverage.

## Implementation Landscape

### Key Files

- `src/resources/extensions/gsd/auto-dispatch.ts` — Requires observation. The dispatcher needs to intercept the fact-check reroute rule based on the `FACTCHECK-STATUS.json` file.
- `src/resources/extensions/gsd/auto-recovery.ts` — The primary logic for plan-impacting reroute targets.
- `src/resources/extensions/gsd/post-unit-hooks.ts` — The post-research invocation trigger for the coordinator.
- `src/resources/extensions/gsd/tests/factcheck-runtime-live.test.ts` (New) — The test runner for S02.

### Build Order

1. **Setup Live Harness** — Create a `LiveProofRunner` to provision environment and stage artifacts.
2. **Execute Dispatch Logic** — Manually (but via real code) trigger the reroute rule.
3. **Verify Planner Evidence** — Inspect the re-invoked plan context to verify corrected evidence inclusion.

### Verification Approach

Test assertions must confirm:
- `FACTCHECK-STATUS.json` presence and validity.
- The `auto-dispatch` rule selects `plan-slice` (S01 manifest).
- Captured planner invocation prompt includes corrected value "5.2.0".

## Common Pitfalls

- **State Drift** — If the live runtime harness modifies the working tree state unexpectedly, subsequent fixture runs will flake. Must use isolated staging copies.

## Open Risks

- **Module Resolution** — Node/TS resolution failures in test contexts (noted in S01 intelligence). Will use the same source-level inspection pattern successful in S01.
