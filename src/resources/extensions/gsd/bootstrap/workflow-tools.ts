// GSD Extension — Workflow Engine Agent Tools
// Registers 7 agent-callable tools that delegate to WorkflowEngine commands.
// Each tool follows the same pattern as db-tools.ts: ensureDbOpen guard,
// engine command call, rich response with progress context per D-04.
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { ensureDbOpen } from "./dynamic-tools.js";

export function registerWorkflowTools(pi: ExtensionAPI): void {
  // ── Tool 1: gsd_complete_task (CMD-01) ──────────────────────────────────
  pi.registerTool({
    name: "gsd_complete_task",
    label: "Complete Task",
    description:
      "Mark a task as complete with summary and optional verification evidence. " +
      "Updates PLAN.md projection automatically.",
    promptSnippet:
      "Mark a GSD task complete (updates DB, renders PLAN.md, records evidence)",
    promptGuidelines: [
      "Use gsd_complete_task when a task is finished — do NOT manually edit PLAN.md checkboxes.",
      "Provide milestone_id, slice_id, task_id, and a summary of what was accomplished.",
      "Optionally include evidence array with verification results.",
      "The tool is idempotent — calling it twice for the same task is safe.",
    ],
    parameters: Type.Object({
      milestone_id: Type.String({ description: "Milestone ID (e.g. M001)" }),
      slice_id: Type.String({ description: "Slice ID (e.g. S01)" }),
      task_id: Type.String({ description: "Task ID (e.g. T01)" }),
      summary: Type.String({ description: "Summary of what was accomplished" }),
      evidence: Type.Optional(
        Type.Array(Type.String(), {
          description: "Optional array of verification evidence strings",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "complete_task", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.completeTask({
          milestoneId: params.milestone_id,
          sliceId: params.slice_id,
          taskId: params.task_id,
          summary: params.summary,
          evidence: params.evidence,
        });
        const nextHint = result.nextTask
          ? `Next: ${result.nextTask} — ${result.nextTaskTitle}`
          : "Next: slice complete";
        return {
          content: [
            {
              type: "text" as const,
              text: `Task ${result.taskId} marked complete. ${result.progress}. ${nextHint}`,
            },
          ],
          details: { operation: "complete_task", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`workflow-tools: gsd_complete_task failed: ${msg}\n`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "complete_task", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 2: gsd_complete_slice (CMD-02) ─────────────────────────────────
  pi.registerTool({
    name: "gsd_complete_slice",
    label: "Complete Slice",
    description:
      "Mark a slice as complete with summary and optional UAT result. " +
      "Updates ROADMAP.md projection automatically.",
    promptSnippet:
      "Mark a GSD slice complete (updates DB, renders ROADMAP.md)",
    promptGuidelines: [
      "Use gsd_complete_slice when all tasks in a slice are done.",
      "Provide milestone_id, slice_id, and a summary of the slice outcome.",
      "Optionally include uat_result with validation/testing evidence.",
    ],
    parameters: Type.Object({
      milestone_id: Type.String({ description: "Milestone ID (e.g. M001)" }),
      slice_id: Type.String({ description: "Slice ID (e.g. S01)" }),
      summary: Type.String({ description: "Summary of the slice outcome" }),
      uat_result: Type.Optional(
        Type.String({ description: "Optional UAT/validation result" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "complete_slice", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.completeSlice({
          milestoneId: params.milestone_id,
          sliceId: params.slice_id,
          summary: params.summary,
          uatResult: params.uat_result,
        });
        const nextHint = result.nextSlice
          ? `Next: slice ${result.nextSlice}`
          : "Next: milestone complete";
        return {
          content: [
            {
              type: "text" as const,
              text: `Slice ${result.sliceId} marked complete. ${result.progress}. ${nextHint}`,
            },
          ],
          details: { operation: "complete_slice", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`workflow-tools: gsd_complete_slice failed: ${msg}\n`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "complete_slice", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 3: gsd_plan_slice (CMD-03) ─────────────────────────────────────
  pi.registerTool({
    name: "gsd_plan_slice",
    label: "Plan Slice",
    description:
      "Create tasks for a slice in a single atomic operation. " +
      "Each task gets an ID, title, description, and optional metadata.",
    promptSnippet:
      "Create tasks for a GSD slice (atomic batch insert)",
    promptGuidelines: [
      "Use gsd_plan_slice to define tasks for a slice — do NOT manually create task files.",
      "Provide an array of task objects with id, title, and description.",
      "Optional fields: estimate, files (array), verify (command).",
      "Throws if the slice already has tasks — plan once, execute many.",
    ],
    parameters: Type.Object({
      milestone_id: Type.String({ description: "Milestone ID (e.g. M001)" }),
      slice_id: Type.String({ description: "Slice ID (e.g. S01)" }),
      tasks: Type.Array(
        Type.Object({
          id: Type.String({ description: "Task ID (e.g. T01)" }),
          title: Type.String({ description: "Task title" }),
          description: Type.String({ description: "Task description" }),
          estimate: Type.Optional(Type.String({ description: "Time estimate (e.g. '30min')" })),
          files: Type.Optional(
            Type.Array(Type.String(), { description: "Files this task will touch" }),
          ),
          verify: Type.Optional(Type.String({ description: "Verification command" })),
        }),
        { description: "Array of task definitions" },
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "plan_slice", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.planSlice({
          milestoneId: params.milestone_id,
          sliceId: params.slice_id,
          tasks: params.tasks,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Created ${result.taskCount} tasks for slice ${result.sliceId}: ${result.taskIds.join(", ")}`,
            },
          ],
          details: { operation: "plan_slice", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`workflow-tools: gsd_plan_slice failed: ${msg}\n`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "plan_slice", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 4: gsd_start_task (CMD-05) ─────────────────────────────────────
  pi.registerTool({
    name: "gsd_start_task",
    label: "Start Task",
    description:
      "Mark a task as in-progress with a timestamp. " +
      "Call this before beginning work on a task.",
    promptSnippet:
      "Start a GSD task (sets status to in-progress with timestamp)",
    promptGuidelines: [
      "Use gsd_start_task before beginning work on a task.",
      "Throws if the task is already done — cannot re-start completed tasks.",
      "After starting, execute the task and call gsd_complete_task when done.",
    ],
    parameters: Type.Object({
      milestone_id: Type.String({ description: "Milestone ID (e.g. M001)" }),
      slice_id: Type.String({ description: "Slice ID (e.g. S01)" }),
      task_id: Type.String({ description: "Task ID (e.g. T01)" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "start_task", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.startTask({
          milestoneId: params.milestone_id,
          sliceId: params.slice_id,
          taskId: params.task_id,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Task ${result.taskId} started at ${result.startedAt}. Next: execute the task and call gsd_complete_task when done.`,
            },
          ],
          details: { operation: "start_task", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`workflow-tools: gsd_start_task failed: ${msg}\n`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "start_task", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 5: gsd_record_verification (CMD-06) ───────────────────────────
  pi.registerTool({
    name: "gsd_record_verification",
    label: "Record Verification",
    description:
      "Store verification evidence (command output) against a task. " +
      "Records exit code, stdout, stderr, and duration.",
    promptSnippet:
      "Record verification evidence for a GSD task (command, exit code, output)",
    promptGuidelines: [
      "Use gsd_record_verification after running a verification command.",
      "Provide the command string, exit code, stdout, stderr, and duration in ms.",
      "If exit_code is 0, verification passed — complete the task.",
      "If exit_code is non-zero, fix issues and re-verify.",
    ],
    parameters: Type.Object({
      milestone_id: Type.String({ description: "Milestone ID (e.g. M001)" }),
      slice_id: Type.String({ description: "Slice ID (e.g. S01)" }),
      task_id: Type.String({ description: "Task ID (e.g. T01)" }),
      command: Type.String({ description: "The verification command that was run" }),
      exit_code: Type.Integer({ description: "Exit code of the command" }),
      stdout: Type.String({ description: "Standard output" }),
      stderr: Type.String({ description: "Standard error" }),
      duration_ms: Type.Integer({ description: "Duration in milliseconds" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "record_verification", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.recordVerification({
          milestoneId: params.milestone_id,
          sliceId: params.slice_id,
          taskId: params.task_id,
          command: params.command,
          exitCode: params.exit_code,
          stdout: params.stdout,
          stderr: params.stderr,
          durationMs: params.duration_ms,
        });
        const nextHint = params.exit_code === 0
          ? "verification passed — complete the task"
          : "fix issues and re-verify";
        return {
          content: [
            {
              type: "text" as const,
              text: `Recorded verification for ${result.taskId}: ${params.command} exited ${params.exit_code}. Next: ${nextHint}`,
            },
          ],
          details: { operation: "record_verification", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`workflow-tools: gsd_record_verification failed: ${msg}\n`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "record_verification", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 6: gsd_report_blocker (CMD-07) ─────────────────────────────────
  pi.registerTool({
    name: "gsd_report_blocker",
    label: "Report Blocker",
    description:
      "Mark a task as blocked with a description of the blocker. " +
      "The task status changes to 'blocked' and the blocker text is recorded.",
    promptSnippet:
      "Report a blocker on a GSD task (sets status to blocked)",
    promptGuidelines: [
      "Use gsd_report_blocker when a task cannot proceed due to an external dependency or issue.",
      "Provide a clear description of what is blocking progress.",
      "To resume, resolve the blocker and call gsd_start_task.",
    ],
    parameters: Type.Object({
      milestone_id: Type.String({ description: "Milestone ID (e.g. M001)" }),
      slice_id: Type.String({ description: "Slice ID (e.g. S01)" }),
      task_id: Type.String({ description: "Task ID (e.g. T01)" }),
      description: Type.String({ description: "Description of the blocker" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "report_blocker", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.reportBlocker({
          milestoneId: params.milestone_id,
          sliceId: params.slice_id,
          taskId: params.task_id,
          description: params.description,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Task ${result.taskId} blocked: ${params.description}. Next: resolve blocker and call gsd_start_task to resume.`,
            },
          ],
          details: { operation: "report_blocker", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`workflow-tools: gsd_report_blocker failed: ${msg}\n`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "report_blocker", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 7: gsd_engine_save_decision (CMD-04) ──────────────────────────
  // Engine-backed version. Coexists with gsd_save_decision (legacy path)
  // during dual-write transition.
  pi.registerTool({
    name: "gsd_engine_save_decision",
    label: "Save Decision (Engine)",
    description:
      "Record a decision via the workflow engine (engine-backed, includes event log). " +
      "Coexists with gsd_save_decision during dual-write transition.",
    promptSnippet:
      "Record a project decision via the workflow engine (engine-backed)",
    promptGuidelines: [
      "Use gsd_engine_save_decision to record decisions via the workflow engine.",
      "This coexists with gsd_save_decision — both work during dual-write.",
      "Decision IDs are auto-assigned (D001, D002, ...) — never provide an ID.",
      "Set made_by to 'human', 'agent' (default), or 'collaborative'.",
    ],
    parameters: Type.Object({
      scope: Type.String({ description: "Scope of the decision (e.g. 'architecture', 'library')" }),
      decision: Type.String({ description: "What is being decided" }),
      choice: Type.String({ description: "The choice made" }),
      rationale: Type.String({ description: "Why this choice was made" }),
      revisable: Type.Optional(Type.String({ description: "Whether this can be revisited (default: 'Yes')" })),
      when_context: Type.Optional(Type.String({ description: "When/context for the decision" })),
      made_by: Type.Optional(
        Type.Union(
          [
            Type.Literal("human"),
            Type.Literal("agent"),
            Type.Literal("collaborative"),
          ],
          { description: "Who made this decision: 'human', 'agent' (default), or 'collaborative'" },
        ),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "engine_save_decision", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.saveDecision({
          scope: params.scope,
          decision: params.decision,
          choice: params.choice,
          rationale: params.rationale,
          revisable: params.revisable,
          whenContext: params.when_context,
          madeBy: params.made_by,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Saved decision ${result.id} via engine. Next: continue current task.`,
            },
          ],
          details: { operation: "engine_save_decision", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`workflow-tools: gsd_engine_save_decision failed: ${msg}\n`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "engine_save_decision", error: msg } as any,
        };
      }
    },
  });
}
