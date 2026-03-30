# GSD Workflow — Dispatch Protocol
// GSD2 - Condensed workflow for LLM dispatch (full version: GSD-WORKFLOW.md)
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

> Condensed protocol for guided-flow dispatch. System prompt has directory structure, naming conventions, and hard rules — not repeated here.

## Quick Start

1. **`.gsd/STATE.md`** — current position + next action
2. **`M###-ROADMAP.md`** — milestone plan, slice status
3. **`M###-CONTEXT.md`** / **`S##-CONTEXT.md`** — locked decisions (if exist)
4. **`S##-PLAN.md`** — task status (if slice active)
5. **`continue.md`** — resume point (if interrupted)

Then do what STATE.md says.

## Hierarchy

Milestone (4-10 slices) → Slice (1-7 tasks) → Task (fits one context window).
**Iron rule:** A task MUST fit in one context window. If it can't, split it.

## Phases

### 1. Discuss (Optional)
Capture user decisions on gray areas → `M###-CONTEXT.md` or `S##-CONTEXT.md`.

### 2. Research (Optional)
Scout codebase, identify pitfalls and libraries → `M###-RESEARCH.md` or `S##-RESEARCH.md`.
Key sections: Don't Hand-Roll table, Common Pitfalls.

### 3. Plan
**Milestone:** Read context/research/decisions → decompose into 4-10 vertical slices → write `M###-ROADMAP.md` with boundary map.
**Slice:** Read roadmap + boundary map + context → decompose into 1-7 tasks → write `S##-PLAN.md` + `T##-PLAN.md` files.

Each task needs must-haves: **Truths** (observable behaviors), **Artifacts** (files with real implementation), **Key Links** (imports/wiring between artifacts).

### 4. Execute
Read `T##-PLAN.md` + prior summaries → execute steps → mark `[DONE:n]` → append decisions to `DECISIONS.md` if any.

### 5. Verify
Check must-haves against actual outcomes. Verification ladder: Static → Command → Behavioral → Human.
"All steps done" is NOT verification. Check actual outcomes.

### 6. Summarize
Write `T##-SUMMARY.md` with frontmatter (id, parent, milestone, provides, requires, affects, key_files, key_decisions, patterns_established, verification_result). One-liner must be substantive.
On slice completion: write `S##-SUMMARY.md` (compress tasks) + `S##-UAT.md` (non-blocking human test).

### 7. Advance
Mark task done in plan → next task or slice completion → update `STATE.md` → update `M###-SUMMARY.md` → continue to next slice.

## Continue-Here Protocol

Write `continue.md` when losing context mid-task. Include: completed work, remaining work, decisions made, context/vibes, exact next action.
Resume: read → delete → pick up from "Next Action".

## State Management

STATE.md is a **derived cache**, not source of truth. Sources: ROADMAP.md (slices), S##-PLAN.md (tasks), summaries (outcomes).

If files disagree: pause and surface to user.

## Summary Injection

Load dependency summaries from `depends:[]` in roadmap. Start with highest level (milestone summary). Stay within ~2500 tokens of injected context. Drop oldest/least-relevant first.

## Git

Branch `gsd/M001/S01` per slice. Atomic per-task commits. Squash merge to main on slice completion. Commit format: `{type}(S01/T02): <one-liner>`.
