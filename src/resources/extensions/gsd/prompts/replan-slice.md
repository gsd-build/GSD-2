You are executing GSD auto-mode.

## UNIT: Replan Slice {{sliceId}} ("{{sliceTitle}}") — Milestone {{milestoneId}}

## Working Directory

Your working directory is `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` to any other directory.

A completed task surfaced required follow-up that must be propagated before work continues. The trigger may be a hard `blocker_discovered` finding or a carry-forward `Pending actions:` list from the latest completed task. Your job is to rewrite the remaining tasks in the slice plan so that no required work is silently dropped.

All relevant context has been preloaded below — the roadmap, current slice plan, the trigger task summary, pending carry-forward actions when present, and decisions are inlined. Start working immediately without re-reading these files.

{{inlinedContext}}

## Pending Action Context

{{pendingActionContext}}

Treat these items as required unfinished work. If they fit cleanly into existing incomplete tasks, absorb them there. If they do not, add one or more new tasks instead of letting the slice complete with hidden leftovers.

## Capture Context

The following user-captured thoughts triggered or informed this replan:

{{captureContext}}

Consider these captures when rewriting the remaining tasks — they represent the user's real-time insights about what needs to change.

## Hard Constraints

- **Do NOT renumber or remove completed tasks.** All `[x]` tasks and their IDs must remain exactly as they are in the plan.
- **Do NOT change completed task descriptions, estimates, or metadata.** They are historical records.
- **Preserve completed task summaries.** Do not modify any `T0x-SUMMARY.md` files for completed tasks.
- Only modify `[ ]` (incomplete) tasks. You may rewrite, reorder, add, or remove incomplete tasks as needed to absorb the trigger work.
- New tasks must follow the existing ID numbering sequence (e.g., if T01–T03 exist, new tasks start at T04 or continue from the highest existing ID).

## Instructions

1. Read the trigger task summary carefully. Understand what remains unresolved and why the current plan no longer closes cleanly.
2. Analyze the remaining `[ ]` tasks in the slice plan. Determine which are still valid, which need modification, and which should be replaced.
3. If there are no incomplete tasks left but `Pending Action Context` is not `(none)`, create one or more new tasks so the leftover work is explicitly planned instead of jumping to slice completion.
4. **Persist replan state through `gsd_replan_slice`.** Call it with: `milestoneId`, `sliceId`, `blockerTaskId`, `blockerDescription`, `whatChanged`, `updatedTasks` (array of task objects with taskId, title, description, estimate, files, verify, inputs, expectedOutput), `removedTaskIds` (array of task ID strings). Use the triggering completed task ID for `blockerTaskId` even when this replan was caused by carry-forward pending actions rather than a hard blocker. The tool structurally enforces preservation of completed tasks, writes replan history to the DB, re-renders `{{planPath}}`, and renders `{{replanPath}}`. Preserve or update the Threat Surface and Requirement Impact sections if the replan changes the slice's security posture or requirement coverage.
5. If any incomplete task had a `T0x-PLAN.md`, remove or rewrite it to match the new task description.
6. Do not commit manually — the system auto-commits your changes after this unit completes.

When done, say: "Slice {{sliceId}} replanned."
