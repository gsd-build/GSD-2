---
phase: 03-event-reconciliation-mandatory-tools
plan: "04"
subsystem: event-log-compaction
tags: [event-log, compaction, tdd, milestone-completion]
dependency_graph:
  requires: [3-01]
  provides: [EVT-03]
  affects: [workflow-events.ts, workflow-commands.ts, workflow-engine.ts]
tech_stack:
  added: []
  patterns: [compaction-on-milestone-complete, non-fatal-side-effects]
key_files:
  created:
    - src/resources/extensions/gsd/engine/compaction.test.ts
  modified:
    - src/resources/extensions/gsd/workflow-events.ts
    - src/resources/extensions/gsd/workflow-commands.ts
    - src/resources/extensions/gsd/workflow-engine.ts
decisions:
  - "3-04: Compaction wired in WorkflowEngine.completeSlice (not workflow-commands.ts) — engine has basePath, commands layer does not"
  - "3-04: _milestoneProgress exported from workflow-commands.ts for reuse — returns { total, done, pct } for milestone slice completion"
  - "3-04: Static import of atomicWriteSync in workflow-events.ts — no circular dependency risk (atomic-write has no deps on workflow-*)"
metrics:
  duration: "~4 min"
  completed: "2026-03-22"
  tasks_completed: 2
  files_modified: 3
  files_created: 1
requirements: [EVT-03]
---

# Phase 3 Plan 04: Event Log Compaction Summary

**One-liner:** Event log compaction archives milestone events to `.jsonl.archived` on milestone completion, keeping active log bounded via `atomicWriteSync` crash-safe writes.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 RED | TDD: failing tests for compactMilestoneEvents() | 975156c3 | compaction.test.ts (created) |
| 1 GREEN | Implement compactMilestoneEvents() | 91929ed0 | workflow-events.ts |
| 2 | Wire compaction into milestone completion path | 6e2b691f | workflow-commands.ts, workflow-engine.ts |

## What Was Built

### compactMilestoneEvents() (workflow-events.ts)

Filters the active `event-log.jsonl` to separate events by `params.milestoneId`:
- Events matching the target milestone go to `event-log-{milestoneId}.jsonl.archived`
- Events from other milestones remain in `event-log.jsonl`
- Both writes use `atomicWriteSync` for crash safety
- Returns `{ archived: number }` — 0 if nothing matched, no archive file created in that case

### _milestoneProgress() (workflow-commands.ts)

New exported helper that counts done/total slices for a milestone and computes `pct` (0–100). Used by the engine as the compaction trigger check.

### WorkflowEngine.completeSlice() wiring (workflow-engine.ts)

After `_completeSlice` and `afterCommand`, calls `_milestoneProgress(this.db, params.milestoneId)`. When `pct === 100`, calls `compactMilestoneEvents(this.basePath, params.milestoneId)`. Failure is non-fatal — stderr warning, slice completion is not blocked.

## Verification

- All 7 compaction tests pass (Test 1–7)
- All 160 engine tests pass (no regressions)
- `grep compactMilestoneEvents workflow-events.ts` — 2+ lines (export + implementation)
- `grep compactMilestoneEvents workflow-engine.ts` — import + call site

## Deviations from Plan

### Architecture Adjustment (not a rule violation)

**Issue:** Plan suggested wiring compaction into `workflow-commands.ts` with `_completeSlice`. However, `workflow-commands.ts` functions receive only `db: DbAdapter`, not `basePath`. DbAdapter has no filename property.

**Resolution:** Wired compaction at the `WorkflowEngine.completeSlice()` level in `workflow-engine.ts`, where `this.basePath` is already available. Added `_milestoneProgress` as an exported helper from `workflow-commands.ts` for the pct check. This matches the plan's option (a) spirit without requiring a new `basePath` parameter thread through the command layer.

**Outcome:** Cleaner separation — command handlers remain DB-only, engine handles all side effects (projections, manifest, events, compaction). All acceptance criteria satisfied.

## Self-Check: PASSED

- compaction.test.ts: FOUND
- workflow-events.ts: FOUND
- Commit 975156c3 (RED): FOUND
- Commit 91929ed0 (GREEN): FOUND
- Commit 6e2b691f (Task 2): FOUND
