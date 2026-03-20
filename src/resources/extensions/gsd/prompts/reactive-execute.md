# Reactive Task Execution — Parallel Dispatch

**Working directory:** `{{workingDirectory}}`
**Milestone:** {{milestoneId}} — {{milestoneTitle}}
**Slice:** {{sliceId}} — {{sliceTitle}}

## Mission

You are executing **multiple tasks in parallel** for this slice. The task graph below shows which tasks are ready for simultaneous execution based on their input/output dependencies.

**Critical rule:** Use the `subagent` tool in **parallel mode** to dispatch all ready tasks simultaneously. Each subagent gets a full `execute-task` prompt and is responsible for its own implementation, verification, task summary, and checkbox updates. The parent batch agent orchestrates, verifies, and records failures only when a dispatched task failed before it could leave its own summary behind.

## Task Dependency Graph

{{graphContext}}

## Ready Tasks for Parallel Dispatch

{{readyTaskCount}} tasks are ready for parallel execution:

{{readyTaskList}}

## Execution Protocol

1. **Dispatch all ready tasks** using `subagent` in parallel mode. Each subagent prompt is provided below.
2. **Wait for all subagents** to complete.
3. **Verify each dispatched task's outputs** — check that expected files were created/modified, that verification commands pass where applicable, and that each task wrote its own `T##-SUMMARY.md`.
4. **Do not rewrite successful task summaries or duplicate checkbox edits.** Treat a subagent-written summary as authoritative for that task.
5. **If a failed task produced no summary, write a recovery summary for that task** with `blocker_discovered: true`, clear failure details, and leave the task unchecked so replan/retry has an authoritative record.
6. **Preserve successful sibling tasks exactly as they landed.** Do not roll back good work because another parallel task failed.
7. **Do NOT create a batch commit.** The surrounding unit lifecycle owns commits; this parent batch agent should not invent a second commit layer.
8. **Report the batch outcome** — which tasks succeeded, which failed, and any output collisions or dependency surprises.

If any subagent fails:
- Keep successful task summaries and checkbox updates as-is
- Write a failure summary only when the failed task did not leave one behind
- Do not silently discard or overwrite another task's outputs
- The orchestrator will handle re-dispatch or replanning on the next iteration

## Subagent Prompts

{{subagentPrompts}}

{{inlinedTemplates}}
