---
phase: 12-gsd-2-compatibility-pass
plan: "02"
subsystem: state-pipeline
tags: [gsd2, state-deriver, types, migration]
dependency_graph:
  requires: ["12-01"]
  provides: ["GSD2State", "buildFullState-gsd2", "needsMigration"]
  affects: ["differ.ts", "pipeline.ts", "usePlanningState.ts", "ws-server.test.ts"]
tech_stack:
  added: []
  patterns: ["GSD2State type alias", "multi-block YAML frontmatter parsing", "dynamic ID resolution", "null-on-missing file reads"]
key_files:
  created: []
  modified:
    - packages/mission-control/src/server/types.ts
    - packages/mission-control/src/server/state-deriver.ts
    - packages/mission-control/src/hooks/usePlanningState.ts
    - packages/mission-control/src/server/differ.ts
    - packages/mission-control/src/server/pipeline.ts
    - packages/mission-control/tests/state-deriver.test.ts
    - packages/mission-control/tests/state-deriver-extended.test.ts
    - packages/mission-control/tests/state-deriver-phase5.test.ts
    - packages/mission-control/tests/ws-server.test.ts
    - packages/mission-control/tests/pipeline-config-bridge.test.ts
    - packages/mission-control/tests/pipeline-perf.test.ts
decisions:
  - "PlanningState aliased to GSD2State (not removed) so all 20+ import sites continue to compile in Phase 12"
  - "v1 types (ProjectState, PhaseState, ConfigState, etc.) kept as deprecated stubs to prevent UI component breakage; to be removed in Phases 13-14"
  - "differ.ts TOP_LEVEL_KEYS updated to GSD2State keys: projectState, roadmap, activePlan, activeTask, decisions, preferences, project, milestoneContext, needsMigration"
  - "pipeline.ts skip_permissions hardcoded to true, worktree_enabled to false — config.json is gone in GSD2; TODO Phase 13"
  - "parseGSD2State splits on \\n---\\n to find all YAML blocks and uses the LAST one with valid GSD2 fields"
metrics:
  duration: "45 minutes"
  completed_date: "2026-03-12"
  tasks_completed: 2
  files_changed: 11
---

# Phase 12 Plan 02: GSD 2 State Types and Deriver Summary

GSD2State type system and buildFullState() rewritten to read .gsd/ flat schema with dynamic milestone/slice/task ID resolution from STATE.md active pointers.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rewrite types.ts — GSD2State and sub-interfaces | f54b8ed | types.ts |
| 2 | Rewrite state-deriver.ts — buildFullState() for GSD 2 schema | b56e832 | state-deriver.ts, usePlanningState.ts, differ.ts, pipeline.ts, 6 test files |

## What Was Built

**types.ts** now exports:
- `GSD2State` — top-level state with 9 fields: projectState, roadmap, activePlan, activeTask, decisions, preferences, project, milestoneContext, needsMigration
- `GSD2ProjectState` — STATE.md frontmatter (active_milestone, active_slice, active_task, auto_mode, cost, tokens, etc.)
- `GSD2Preferences` — preferences.md frontmatter (research/planning/execution/completion model, budget_ceiling, skill_discovery)
- `GSD2RoadmapState`, `GSD2SlicePlan`, `GSD2TaskSummary` — stub interfaces (Phase 14 adds full parsers)
- `PlanningState = GSD2State` — backward compat alias
- Deprecated v1 types kept as stubs with @deprecated JSDoc

**state-deriver.ts** now:
- `buildFullState(gsdDir)` reads .gsd/ flat schema
- Phase 1: reads STATE.md → `parseGSD2State()` → extracts active_milestone, active_slice, active_task
- Phase 2: parallel read of 7 derived files using dynamic paths (M{NNN}-ROADMAP.md, S{NN}-PLAN.md, etc.)
- Phase 3: parses preferences.md with gray-matter
- Phase 4: `checkMigrationNeeded()` detects .planning/ exists without .gsd/
- `parseGSD2State()` handles multi-block YAML frontmatter — splits on `\n---\n`, uses LAST block

**differ.ts** updated: TOP_LEVEL_KEYS now uses GSD2State field names.

**pipeline.ts** fixed: config.json references replaced with GSD2 defaults.

**usePlanningState.ts** updated: `PlanningState` type → `GSD2State`.

## Test Results

- state-deriver.test.ts: 15/15 pass (GSD2 fixture suite)
- state-deriver-extended.test.ts: 3/3 pass
- state-deriver-phase5.test.ts: 4/4 pass
- migration-banner.test.ts: 4/4 pass (GREEN — needsMigration correctly derived)
- ws-server.test.ts: 9/9 pass (updated to GSD2State shape)
- pipeline-perf.test.ts: 5/5 pass (updated to .gsd/ schema)
- pipeline-config-bridge.test.ts: 2/2 pass (updated to GSD2 defaults)

Overall: 519 pass / 23 fail (pre-existing: 5 TaskExecuting, 3 ClaudeProcessManager, 1 workspace, 1 ChatView, 13 Wave 0 RED stubs COMPAT-04/05/07)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed differ.ts using v1 state keys**
- Found during: Task 2 (cascade from PlanningState → GSD2State alias)
- Issue: TOP_LEVEL_KEYS referenced "roadmap", "state", "config", "phases", "requirements" which don't exist on GSD2State
- Fix: Updated TOP_LEVEL_KEYS to GSD2State keys
- Files modified: differ.ts
- Commit: b56e832

**2. [Rule 1 - Bug] Fixed pipeline.ts accessing currentState.config.skip_permissions**
- Found during: Task 2 (pipeline tests crashed with "undefined is not an object")
- Issue: pipeline.ts read config.json-derived settings that no longer exist in GSD2State
- Fix: Hardcoded skipPermissions=true, worktreeEnabled=false with TODO Phase 13 comment
- Files modified: pipeline.ts
- Commit: b56e832

**3. [Rule 1 - Bug] Updated test files broken by GSD2State shape change**
- state-deriver-extended.test.ts: accessed state.state.branch, state.phases — now GSD2-shaped
- state-deriver-phase5.test.ts: accessed state.phases — now GSD2-shaped
- ws-server.test.ts: makePlanningState() used v1 shape, computeDiff tests used v1 keys
- pipeline-perf.test.ts: used .planning/ dir, accessed msg.state.state.milestone
- pipeline-config-bridge.test.ts: expected config.json-derived behavior; updated for GSD2 defaults
- Files modified: 5 test files
- Commit: b56e832

## Self-Check: PASSED

All key files verified present:
- packages/mission-control/src/server/types.ts: FOUND
- packages/mission-control/src/server/state-deriver.ts: FOUND
- packages/mission-control/src/hooks/usePlanningState.ts: FOUND
- packages/mission-control/src/server/differ.ts: FOUND
- packages/mission-control/src/server/pipeline.ts: FOUND

All task commits verified in git history:
- f54b8ed: feat(12-02): rewrite types.ts — GSD2State and sub-interfaces: FOUND
- b56e832: feat(12-02): rewrite state-deriver.ts — buildFullState() for GSD 2 schema: FOUND
