---
depends_on: [M006-tbhsp8]
---

# M007: Telemetry, Metrics, and Experiment Fixtures

**Gathered:** 2026-03-18
**Status:** Queued from M005 plan

## Project Description

Add instrumentation to GSD's dispatch loop that captures per-unit metrics, and design reproducible concept fixtures for controlled comparison between baseline and evidence-grounded GSD.

## Why This Milestone

Without measurement, the evidence-grounded pipeline remains theory. This milestone creates the observation surface and fixture material needed for later controlled comparison. It builds directly on the now-validated runtime proof substrate from M007-aos64t.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Run a fixture and get metrics showing tokens, interventions, fact-check activity, and time broken down by unit type.
- Compare baseline and treatment runs using durable telemetry artifacts instead of anecdotal impressions.

### Entry point / environment

- Entry point: `/gsd auto` runtime path plus metrics/fixture tooling
- Environment: local dev, auto-mode runtime, filesystem-backed `.gsd/` state, activity logs
- Live dependencies involved: dispatch loop, metrics ledger, activity artifact writing, fixture definitions

## Completion Class

- Contract complete means: telemetry schema, fixture contracts, and metrics summary outputs are defined and durable.
- Integration complete means: GSD writes the intended metrics during real execution and fixtures can be run end-to-end through the system.
- Operational complete means: the measurement path is repeatable and cheap enough to support M008 experiment runs.

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- Dispatch/runtime telemetry records the core measurements needed for comparison: token usage, interventions, unit counts, fact-check counts, and wall-clock duration.
- Concept fixtures exist with clear success criteria and can be rerun through GSD without reconstructing setup by hand.
- Metrics output is durable and comparable across runs.

## Scope

### In Scope

- Token counter per dispatch unit (input/output)
- Human intervention counter and classifier (blocker / correction / redirect)
- Dispatch unit count per slice with wall-clock duration
- Fact-check metrics: claims checked, VERIFIED/REFUTED/INCONCLUSIVE counts, scout token usage
- Structured metrics JSONL schema written to `.gsd/activity/`
- Metrics summary script producing comparison tables
- 2-3 concept fixtures with known claim mixes and success criteria
- Fixture documentation sufficient for repeatable later experiments

### Out of Scope / Non-Goals

- Running the baseline/treatment comparisons themselves (M008)
- Publication/reporting work (M009)
- Broader recovery/doctor hardening unrelated to telemetry capture

## Technical Constraints

- Metrics must come from the real dispatch/runtime path, not only synthetic test helpers.
- Fixture definitions must be stable enough for later comparison work.
- The measurement surface should not introduce enough overhead to distort the runs it is measuring.

## Integration Points

- Auto-mode dispatch/runtime (`auto.ts`, `auto-dispatch.ts`)
- Fact-check loop artifacts and counters from M006/M007-aos64t
- Activity/metrics persistence under `.gsd/activity/`
- Export/reporting utilities that summarize metrics for later experiment work

## Open Questions

- Which metrics belong in the always-on dispatch path versus a fixture-only path?
- What fixture shape best distinguishes low-unknown, high-unknown, and mixed scenarios?
- How should human fidelity scoring be recorded so M008 can consume it cleanly?
