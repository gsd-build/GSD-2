# Plan: gsd-fsm Extension

## Goal

Build a `gsd-fsm` extension that gives agents and users visual + analytical
tools for understanding GSD project state machines. Consumes existing GSD
APIs (deriveState, DB, event log) — no core changes.

## Architecture

```
src/resources/extensions/gsd-fsm/
├── extension-manifest.json     # tier: bundled, tools: [fsm_gsd_status, fsm_gsd_verify, fsm_gsd_history]
├── index.ts                    # Extension entry — registers 3 tools
├── status-tool.ts              # Live state → highlighted Mermaid diagram
├── verify-tool.ts              # Integrity checks on project FSM
├── history-tool.ts             # Event log → transition timeline
├── state-extractor.ts          # Shared: reads deriveState + DB → FSM params
├── diagram-builder.ts          # Shared: Mermaid generation (reuses fsm-diagram logic)
└── tests/
    ├── status-tool.test.ts
    ├── verify-tool.test.ts
    ├── history-tool.test.ts
    └── state-extractor.test.ts
```

Standalone `fsm-verifier.ts` and `fsm-diagram.ts` remain as generic tools.
This extension imports their logic where useful but adds GSD-specific context.

## Tools

### 1. fsm_gsd_status

**Input:** `{ basePath?: string, level?: "milestone" | "slice" | "task" }`
**Output:** Mermaid diagram with current state highlighted + summary table

- Calls `deriveState(basePath)` to get live GSDState
- Queries DB for milestone registry, slice statuses, task statuses
- Builds a Mermaid stateDiagram-v2 with:
  - Phase transition graph (the known GSD phases)
  - Current phase node styled with `:::active`
  - Milestone/slice/task progress annotations
- Appends a text summary: active milestone, active slice, active task,
  phase, progress counts, blockers

### 2. fsm_gsd_verify

**Input:** `{ basePath?: string }`
**Output:** Structured report of integrity issues

Checks:
- **Unreachable slices:** dependency cycles or orphan `depends` references
- **Dead-end tasks:** tasks with no path to completion (missing PLAN entries)
- **State consistency:** DB status vs disk artifacts (SUMMARY exists but
  status != complete, or vice versa)
- **Stale state:** tasks marked complete in DB but no SUMMARY on disk
- **Blocked detection:** milestones with `depends_on` pointing to
  nonexistent milestones
- **Gate orphans:** quality gates referencing deleted tasks/slices

### 3. fsm_gsd_history

**Input:** `{ basePath?: string, milestoneId?: string, limit?: number }`
**Output:** Timeline of state transitions from event-log.jsonl

- Reads `.gsd/event-log.jsonl` via `readEvents()`
- Groups events by session_id
- Computes dwell time per phase (time between transitions)
- Flags anomalies: replan loops, long dwell times, repeated failures
- Optionally filters to a specific milestone

## Shared: state-extractor.ts

Bridges GSD state → generic FSM params:

```typescript
interface GSDFSMParams {
  states: string[];           // Phase enum values
  transitions: Transition[];  // Known valid transitions from DISPATCH_RULES
  currentState: string;       // From deriveState().phase
  milestones: MilestoneNode[];
  slices: SliceNode[];
  tasks: TaskNode[];
}
```

The known transition map is hardcoded from DISPATCH_RULES analysis:
- pre-planning → needs-discussion, researching, planning
- needs-discussion → discussing
- discussing → researching
- researching → planning
- planning → evaluating-gates, executing
- evaluating-gates → executing
- executing → replanning-slice, summarizing
- replanning-slice → executing
- summarizing → advancing
- advancing → validating-milestone
- validating-milestone → completing-milestone
- completing-milestone → complete
- Any → blocked, paused

## Build order

1. state-extractor.ts + tests (foundation)
2. diagram-builder.ts (Mermaid generation, adapted from fsm-diagram.ts)
3. status-tool.ts + tests
4. verify-tool.ts + tests
5. history-tool.ts + tests
6. index.ts + extension-manifest.json
7. Verify typecheck + all tests pass

## Testing strategy

- Mock `deriveState` and DB queries — no real .gsd/ directories needed
- Use fixture data for event-log.jsonl parsing
- Test Mermaid output contains expected markers (:::active, transitions)
- Test verify catches each integrity issue type
