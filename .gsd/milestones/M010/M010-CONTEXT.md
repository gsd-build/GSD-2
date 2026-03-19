---
depends_on: [M009]
---

# M010: Recovery and Doctor State Regression Hardening

**Gathered:** 2026-03-18
**Status:** Queued from incident brief

## Project Description

Fix the state-recovery and doctor flows so repairing damaged `.gsd/` state cannot fabricate or promote earlier milestone IDs, cannot regress the active milestone away from the real branch/worktree lineage, and cannot harden that regression into `STATE.md`.

## Why This Milestone

A real live-use incident showed that damaged state plus doctor/recovery flows can fabricate earlier milestone arcs and redirect `/gsd auto` away from the user's actual in-flight sequence. This is a structural trust problem: recovery must preserve real lineage rather than inventing a plausible but wrong project state.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Run doctor/recovery on damaged `.gsd/` state without losing the real active arc.
- Resume `/gsd auto` on the intended milestone after recovery instead of being redirected into fabricated earlier milestones.
- Inspect explicit diagnostics for ghost or metadata-only milestones rather than discovering the regression by surprise.

### Entry point / environment

- Entry point: doctor, recovery, state derivation, auto resume
- Environment: local dev, damaged or partial `.gsd/` state, branch/worktree lineage metadata
- Live dependencies involved: `deriveState()`, doctor repair flow, queue order, milestone discovery, worktree/branch metadata

## Completion Class

- Contract complete means: eligibility rules for active milestones and doctor guardrails are explicit and testable.
- Integration complete means: damaged-state recovery preserves the intended active arc through doctor and auto resume.
- Operational complete means: ghost milestone regressions are detectable, explainable, and fixable without manual surgery.

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- Metadata-only or repair-skeleton milestone directories do not become active milestones.
- Doctor can rebuild state without regressing to fabricated earlier milestones.
- Auto resume follows real branch/worktree/integration-branch lineage after recovery.
- Regression tests reproduce the user incident and prove it stays fixed.

## Scope

### In Scope

- Incident fixture and regression harness for fabricated milestone takeover
- Milestone discovery hardening in `findMilestoneIds()` / `deriveState()` eligibility rules
- Doctor guardrails against milestone regression during repair
- Ghost milestone diagnostics and stale queue-order interactions
- Active-lineage-aware recovery precedence rules
- End-to-end verification for doctor -> auto resume on damaged state

### Out of Scope / Non-Goals

- Redesigning the entire milestone model
- Queue UX enhancements unrelated to recovery correctness
- Experiment/telemetry work already covered by M007–M009

## Technical Constraints

- Recovery must favor real lineage signals over sequence-only reconstruction.
- Fixes should produce durable diagnostics instead of silently rewriting state.
- Regression coverage must model the observed failure path, not just synthetic happy paths.

## Integration Points

- `deriveState()` and milestone discovery helpers
- Doctor repair flows and `STATE.md` rebuild logic
- Queue order and milestone directory scanning
- Worktree/branch integration-branch metadata
- Auto resume/start paths that consume derived state

## Open Questions

- Which lineage signals should have highest precedence when they conflict?
- How should doctor represent ghost milestones in diagnostics without making the normal path noisy?
- Should metadata-only milestone directories be ignored entirely or surfaced as warnings first?
