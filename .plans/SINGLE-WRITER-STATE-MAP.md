# Single-Writer State Architecture — Tool Call Map

## Overview

The single-writer architecture ensures all GSD workflow state transitions go through
typed tool calls backed by atomic SQLite transactions. Agents never write state files
directly — the engine writes authoritative markdown projections from DB state.

## Tool Call Inventory (17 tools)

### Existing (7 — shipped in initial PR)

| Tool | Command | DB Tables | Projection |
|---|---|---|---|
| `gsd_complete_task` | completeTask | tasks, verification_evidence | PLAN.md |
| `gsd_complete_slice` | completeSlice | slices | ROADMAP.md |
| `gsd_plan_slice` | planSlice | tasks (batch insert) | PLAN.md |
| `gsd_start_task` | startTask | tasks | PLAN.md |
| `gsd_record_verification` | recordVerification | verification_evidence | PLAN.md |
| `gsd_report_blocker` | reportBlocker | tasks | PLAN.md |
| `gsd_engine_save_decision` | saveDecision | decisions | DECISIONS.md |

### New (10 — added to complete the pipeline)

| Tool | Command | DB Tables | Projection |
|---|---|---|---|
| `gsd_create_milestone` | createMilestone | milestones | — |
| `gsd_plan_milestone` | planMilestone | slices (batch insert) | ROADMAP.md |
| `gsd_complete_milestone` | completeMilestone | milestones | — |
| `gsd_validate_milestone` | validateMilestone | slices (remediation inserts) | ROADMAP.md |
| `gsd_update_roadmap` | updateRoadmap | slices (add/remove/reorder) | ROADMAP.md |
| `gsd_save_context` | saveContext | — (pass-through) | CONTEXT.md |
| `gsd_save_research` | saveResearch | — (pass-through) | RESEARCH.md |
| `gsd_save_requirements` | saveRequirements | requirements (upsert) | REQUIREMENTS.md |
| `gsd_save_uat_result` | saveUatResult | slices (uat_result) | UAT-RESULT.md |
| `gsd_save_knowledge` | saveKnowledge | — (pass-through) | KNOWLEDGE.md |

## Dispatch Unit → Tool Call Mapping

Every auto-mode dispatch unit type now has a corresponding tool call:

| Dispatch Unit | Phase Trigger | Tool Call(s) Agent Should Use |
|---|---|---|
| discuss-milestone | needs-discussion / pre-planning | `gsd_create_milestone`, `gsd_save_context`, `gsd_save_requirements` |
| research-milestone | pre-planning (no research) | `gsd_save_research` |
| plan-milestone | pre-planning (has research) | `gsd_plan_milestone`, `gsd_engine_save_decision` |
| research-slice | planning (no slice research) | `gsd_save_research(slice_id)` |
| plan-slice | planning | `gsd_plan_slice` |
| replan-slice | replanning-slice | `gsd_update_roadmap`, `gsd_plan_slice` |
| execute-task | executing | `gsd_start_task`, `gsd_record_verification`, `gsd_complete_task` |
| reactive-execute | executing (multi-task) | `gsd_start_task` + `gsd_complete_task` (per task) |
| complete-slice | summarizing | `gsd_complete_slice` |
| run-uat | post-completion | `gsd_save_uat_result` |
| reassess-roadmap | post-completion | `gsd_update_roadmap`, `gsd_engine_save_decision` |
| validate-milestone | validating-milestone | `gsd_validate_milestone` |
| complete-milestone | completing-milestone | `gsd_complete_milestone`, `gsd_save_knowledge` |
| rewrite-docs | override gate | `gsd_update_roadmap`, `gsd_engine_save_decision` |

## Architecture Invariants

1. **Single writer** — Only the engine writes state files (ROADMAP.md, PLAN.md, STATE.md).
   Agents call tool APIs; engine renders projections from DB state.
2. **Atomic transactions** — All commands use `transaction()` wrapper (all-or-nothing).
3. **Idempotent where possible** — `completeTask`, `createMilestone` safe to call twice.
4. **Event sourcing** — Every command appends to `event-log.jsonl` for cross-worktree sync.
5. **Non-fatal projections** — If rendering fails, the command succeeds anyway.
6. **Auto-promotion** — `deriveState()` promotes first eligible pending slice to active.
7. **Post-write validation** — `plan-milestone` artifacts are parsed to verify slice count > 0.

## Files Modified

### Commands (workflow-commands.ts)
- 17 exported command functions (7 original + 10 new)
- Each: pure function `(db: DbAdapter, params) => Result`
- All use `transaction()` for atomicity

### Engine (workflow-engine.ts)
- 17 methods on `WorkflowEngine` class
- Each wraps command + calls `afterCommand()` (projections, manifest, event log)
- All 17 in `replay()` handler map for cross-worktree reconciliation

### Tools (bootstrap/workflow-tools.ts)
- 17 registered tools via `pi.registerTool()`
- Each: ensureDbOpen guard, engine method call, structured response

### Bug Fixes (this session)
- `write-intercept.ts` — Only STATE.md blocked (agents need to write other files during transition)
- `auto/phases.ts` — .gsd counts as valid project in worktree health check
- `state.ts` — Silence "database is not open" during early init
- `workflow-engine.ts` — Auto-promote next pending slice when current is done
- `auto-post-unit.ts` — Validate plan-milestone produces parseable roadmap (>0 slices)

## Phase Graph

```
pre-planning
  → discuss-milestone   [gsd_create_milestone, gsd_save_context, gsd_save_requirements]
  → research-milestone  [gsd_save_research]
  → plan-milestone      [gsd_plan_milestone]

planning
  → research-slice      [gsd_save_research]
  → plan-slice          [gsd_plan_slice]

replanning-slice
  → replan-slice        [gsd_update_roadmap, gsd_plan_slice]

executing
  → execute-task        [gsd_start_task → gsd_record_verification → gsd_complete_task]
  → reactive-execute    [gsd_start_task + gsd_complete_task per task]

summarizing
  → complete-slice      [gsd_complete_slice]
  → run-uat             [gsd_save_uat_result]
  → reassess-roadmap    [gsd_update_roadmap]

validating-milestone
  → validate-milestone  [gsd_validate_milestone]

completing-milestone
  → complete-milestone  [gsd_complete_milestone, gsd_save_knowledge]

complete → STOP
```
