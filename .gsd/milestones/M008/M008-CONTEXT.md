---
depends_on: [M007]
---

# M008: Controlled Experiment and Iteration

**Gathered:** 2026-03-18
**Status:** Queued from M005 plan

## Project Description

Run concept fixtures through baseline GSD and evidence-grounded GSD, analyze the results, revise targeted weak points, and rerun within a bounded iteration loop.

## Why This Milestone

M007 creates the observation surface and fixture definitions. This milestone uses that substrate to produce measured baseline-versus-treatment evidence rather than opinion about whether the evidence-grounded pipeline reduces intervention and rework.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Run the prepared fixtures through baseline and treatment paths with the same model and environment.
- Inspect comparison outputs showing interventions, tokens, fact-check activity, time, and fidelity side by side.
- Iterate on the largest observed gap with bounded revision rather than open-ended tuning.

### Entry point / environment

- Entry point: fixture execution and analysis workflow built on M007 telemetry
- Environment: local dev, baseline Docker image plus current treatment branch, repeatable fixture runs
- Live dependencies involved: metrics artifacts, fixture definitions, summary/comparison scripts, human fidelity rubric capture

## Completion Class

- Contract complete means: experiment protocol, scoring rubric, and iteration bound are explicit and durable.
- Integration complete means: baseline and treatment runs can be executed and compared on the same fixtures using M007 telemetry.
- Operational complete means: the loop can produce a stable conclusion or bounded non-convergence result without wandering indefinitely.

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- Each fixture can be executed through baseline and treatment using the same model and environment assumptions.
- Comparison output captures intervention counts, token usage, fact-check activity, time, and human fidelity scoring.
- The iteration loop is bounded and records what changed between runs.

## Scope

### In Scope

- Baseline vs treatment run protocol
- Fixture execution workflow for 2-3 prepared fixtures
- Human fidelity scoring capture
- Side-by-side comparison tables and summaries
- Bounded iteration protocol (max 3 iterations, one targeted change per iteration)
- Convergence / non-convergence recording

### Out of Scope / Non-Goals

- Public-facing reporting or polished publication assets (M009)
- New telemetry surfaces beyond what M007 defines unless required to make comparison meaningful
- Broad architectural redesign unrelated to measured experiment findings

## Technical Constraints

- Baseline and treatment must use the same model and environment to keep the comparison honest.
- Changes between iterations must be isolated and explicitly recorded.
- The experiment harness should prefer durable artifacts over console-only evidence.

## Integration Points

- M007 telemetry outputs and fixture contracts
- Docker/tagged baseline environment
- Metrics summary and comparison tooling
- Completion artifacts that capture run results and iteration deltas

## Open Questions

- What exact fidelity rubric best balances speed and usefulness for subjective outputs?
- Which fixture should serve as the first canary for iteration?
- How should convergence be represented in durable milestone artifacts?
