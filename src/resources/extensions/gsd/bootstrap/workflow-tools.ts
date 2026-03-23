// GSD Extension — Workflow Engine Agent Tools
// Registers 17 agent-callable tools that delegate to WorkflowEngine commands.
// Each tool follows the same pattern as db-tools.ts: ensureDbOpen guard,
// engine command call, rich response with progress context per D-04.

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { ensureDbOpen } from "./dynamic-tools.js";
import { logError } from "../workflow-logger.js";

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
        logError("tool", `gsd_complete_task failed: ${msg}`);
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
        logError("tool", `gsd_complete_slice failed: ${msg}`);
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
        logError("tool", `gsd_plan_slice failed: ${msg}`);
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
        logError("tool", `gsd_start_task failed: ${msg}`);
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
        logError("tool", `gsd_record_verification failed: ${msg}`);
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
        logError("tool", `gsd_report_blocker failed: ${msg}`);
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
        logError("tool", `gsd_engine_save_decision failed: ${msg}`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "engine_save_decision", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 8: gsd_create_milestone ──────────────────────────────────────
  pi.registerTool({
    name: "gsd_create_milestone",
    label: "Create Milestone",
    description:
      "Create a new milestone with an ID and title. " +
      "The milestone starts in 'active' status.",
    promptSnippet:
      "Create a new GSD milestone (inserts into DB, sets status active)",
    promptGuidelines: [
      "Use gsd_create_milestone to create a new milestone.",
      "Provide a milestone_id (e.g. M001) and a descriptive title.",
      "Optionally include context text for the milestone.",
    ],
    parameters: Type.Object({
      milestone_id: Type.String({ description: "Milestone ID (e.g. M001)" }),
      title: Type.String({ description: "Milestone title" }),
      context: Type.Optional(Type.String({ description: "Optional context for the milestone" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "create_milestone", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.createMilestone({
          milestoneId: params.milestone_id,
          title: params.title,
          context: params.context,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Created milestone ${result.milestoneId}: ${result.title}. Next: plan slices with gsd_plan_milestone.`,
            },
          ],
          details: { operation: "create_milestone", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError("tool", `gsd_create_milestone failed: ${msg}`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "create_milestone", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 9: gsd_plan_milestone ────────────────────────────────────────
  pi.registerTool({
    name: "gsd_plan_milestone",
    label: "Plan Milestone",
    description:
      "Define slices for a milestone (creates ROADMAP). " +
      "Each slice gets an ID, title, risk level, dependencies, and demo criteria.",
    promptSnippet:
      "Define roadmap slices for a GSD milestone (atomic batch insert)",
    promptGuidelines: [
      "Use gsd_plan_milestone to define the roadmap slices — do NOT manually write ROADMAP.md.",
      "Provide an array of slice objects with id, title, risk, depends, and demo.",
      "Optional: set done to true for slices that are already complete.",
    ],
    parameters: Type.Object({
      milestone_id: Type.String({ description: "Milestone ID (e.g. M001)" }),
      title: Type.String({ description: "Milestone title" }),
      vision: Type.String({ description: "Vision statement for the milestone" }),
      slices: Type.Array(
        Type.Object({
          id: Type.String({ description: "Slice ID (e.g. S01)" }),
          title: Type.String({ description: "Slice title" }),
          risk: Type.String({ description: "Risk level (low/medium/high)" }),
          depends: Type.Array(Type.String(), { description: "IDs of slices this depends on" }),
          demo: Type.String({ description: "Demo/acceptance criteria" }),
          done: Type.Optional(Type.Boolean({ description: "Whether the slice is already done" })),
        }),
        { description: "Array of slice definitions" },
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "plan_milestone", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.planMilestone({
          milestoneId: params.milestone_id,
          title: params.title,
          vision: params.vision,
          slices: params.slices,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Planned ${result.sliceCount} slices for milestone ${result.milestoneId}: ${result.sliceIds.join(", ")}`,
            },
          ],
          details: { operation: "plan_milestone", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError("tool", `gsd_plan_milestone failed: ${msg}`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "plan_milestone", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 10: gsd_complete_milestone ───────────────────────────────────
  pi.registerTool({
    name: "gsd_complete_milestone",
    label: "Complete Milestone",
    description:
      "Mark a milestone as complete with a summary. " +
      "Sets status to 'complete' with a completion timestamp.",
    promptSnippet:
      "Mark a GSD milestone complete (updates DB, sets status complete)",
    promptGuidelines: [
      "Use gsd_complete_milestone when all slices in a milestone are done.",
      "Provide milestone_id and a summary of the milestone outcome.",
    ],
    parameters: Type.Object({
      milestone_id: Type.String({ description: "Milestone ID (e.g. M001)" }),
      summary: Type.String({ description: "Summary of the milestone outcome" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "complete_milestone", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.completeMilestone({
          milestoneId: params.milestone_id,
          summary: params.summary,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Milestone ${result.milestoneId} marked complete. ${result.summary}`,
            },
          ],
          details: { operation: "complete_milestone", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError("tool", `gsd_complete_milestone failed: ${msg}`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "complete_milestone", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 11: gsd_validate_milestone ───────────────────────────────────
  pi.registerTool({
    name: "gsd_validate_milestone",
    label: "Validate Milestone",
    description:
      "Record a milestone validation verdict (pass, needs-attention, or needs-remediation). " +
      "Optionally includes remediation slices for issues found.",
    promptSnippet:
      "Record a validation verdict for a GSD milestone",
    promptGuidelines: [
      "Use gsd_validate_milestone after reviewing a completed milestone.",
      "Verdict must be 'pass', 'needs-attention', or 'needs-remediation'.",
      "For needs-remediation, provide remediation_slices with fix descriptions.",
    ],
    parameters: Type.Object({
      milestone_id: Type.String({ description: "Milestone ID (e.g. M001)" }),
      verdict: Type.Union(
        [
          Type.Literal("pass"),
          Type.Literal("needs-attention"),
          Type.Literal("needs-remediation"),
        ],
        { description: "Validation verdict" },
      ),
      summary: Type.String({ description: "Summary of validation findings" }),
      remediation_slices: Type.Optional(
        Type.Array(Type.String(), {
          description: "Optional array of remediation slice descriptions",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "validate_milestone", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.validateMilestone({
          milestoneId: params.milestone_id,
          verdict: params.verdict,
          summary: params.summary,
          remediationSlices: params.remediation_slices,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Milestone ${result.milestoneId} validated: ${result.verdict}. ${result.summary}`,
            },
          ],
          details: { operation: "validate_milestone", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError("tool", `gsd_validate_milestone failed: ${msg}`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "validate_milestone", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 12: gsd_update_roadmap ───────────────────────────────────────
  pi.registerTool({
    name: "gsd_update_roadmap",
    label: "Update Roadmap",
    description:
      "Add, remove, or reorder slices in a milestone's roadmap. " +
      "Updates the ROADMAP.md projection automatically.",
    promptSnippet:
      "Add/remove/reorder slices in a GSD milestone roadmap",
    promptGuidelines: [
      "Use gsd_update_roadmap to modify slices — do NOT manually edit ROADMAP.md.",
      "Provide add_slices to add new slices, remove_slice_ids to remove, reorder_slice_ids to reorder.",
      "At least one of add_slices, remove_slice_ids, or reorder_slice_ids must be provided.",
    ],
    parameters: Type.Object({
      milestone_id: Type.String({ description: "Milestone ID (e.g. M001)" }),
      add_slices: Type.Optional(
        Type.Array(
          Type.Object({
            id: Type.String({ description: "Slice ID (e.g. S01)" }),
            title: Type.String({ description: "Slice title" }),
            risk: Type.String({ description: "Risk level (low/medium/high)" }),
            depends: Type.Array(Type.String(), { description: "IDs of slices this depends on" }),
            demo: Type.String({ description: "Demo/acceptance criteria" }),
          }),
          { description: "Slices to add" },
        ),
      ),
      remove_slice_ids: Type.Optional(
        Type.Array(Type.String(), { description: "Slice IDs to remove" }),
      ),
      reorder_slice_ids: Type.Optional(
        Type.Array(Type.String(), { description: "Slice IDs in desired order" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "update_roadmap", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.updateRoadmap({
          milestoneId: params.milestone_id,
          addSlices: params.add_slices,
          removeSliceIds: params.remove_slice_ids,
          reorderSliceIds: params.reorder_slice_ids,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Roadmap updated for milestone ${result.milestoneId}. Added: ${result.added}, removed: ${result.removed}, reordered: ${result.reordered}.`,
            },
          ],
          details: { operation: "update_roadmap", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError("tool", `gsd_update_roadmap failed: ${msg}`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "update_roadmap", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 13: gsd_save_context ─────────────────────────────────────────
  pi.registerTool({
    name: "gsd_save_context",
    label: "Save Context",
    description:
      "Save milestone context content. " +
      "Updates the CONTEXT.md projection automatically.",
    promptSnippet:
      "Save context for a GSD milestone (updates DB, renders CONTEXT.md)",
    promptGuidelines: [
      "Use gsd_save_context to store milestone context — do NOT manually write CONTEXT.md.",
      "Provide milestone_id and the full context content.",
    ],
    parameters: Type.Object({
      milestone_id: Type.String({ description: "Milestone ID (e.g. M001)" }),
      content: Type.String({ description: "Context content to save" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "save_context", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.saveContext({
          milestoneId: params.milestone_id,
          content: params.content,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Context saved for milestone ${result.milestoneId}. Next: continue planning or execution.`,
            },
          ],
          details: { operation: "save_context", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError("tool", `gsd_save_context failed: ${msg}`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "save_context", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 14: gsd_save_research ────────────────────────────────────────
  pi.registerTool({
    name: "gsd_save_research",
    label: "Save Research",
    description:
      "Save research findings for a milestone. " +
      "Updates the RESEARCH.md projection automatically.",
    promptSnippet:
      "Save research findings for a GSD milestone (updates DB, renders RESEARCH.md)",
    promptGuidelines: [
      "Use gsd_save_research to store research — do NOT manually write RESEARCH.md.",
      "Provide milestone_id and the research content.",
      "Optionally scope to a specific slice with slice_id.",
    ],
    parameters: Type.Object({
      milestone_id: Type.String({ description: "Milestone ID (e.g. M001)" }),
      content: Type.String({ description: "Research content to save" }),
      slice_id: Type.Optional(Type.String({ description: "Optional slice ID to scope research" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "save_research", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.saveResearch({
          milestoneId: params.milestone_id,
          content: params.content,
          sliceId: params.slice_id,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Research saved for milestone ${result.milestoneId}. Next: continue planning or execution.`,
            },
          ],
          details: { operation: "save_research", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError("tool", `gsd_save_research failed: ${msg}`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "save_research", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 15: gsd_save_requirements ────────────────────────────────────
  pi.registerTool({
    name: "gsd_save_requirements",
    label: "Save Requirements",
    description:
      "Add or update requirements for a milestone. " +
      "Each requirement has an ID, title, status, and optional metadata.",
    promptSnippet:
      "Save requirements for a GSD milestone (batch upsert)",
    promptGuidelines: [
      "Use gsd_save_requirements to add or update milestone requirements.",
      "Provide an array of requirement objects with id, title, and status.",
      "Optional fields: owner, source.",
    ],
    parameters: Type.Object({
      milestone_id: Type.String({ description: "Milestone ID (e.g. M001)" }),
      requirements: Type.Array(
        Type.Object({
          id: Type.String({ description: "Requirement ID (e.g. R01)" }),
          title: Type.String({ description: "Requirement title" }),
          status: Type.String({ description: "Requirement status (e.g. draft, approved, implemented)" }),
          owner: Type.Optional(Type.String({ description: "Owner of the requirement" })),
          source: Type.Optional(Type.String({ description: "Source of the requirement" })),
        }),
        { description: "Array of requirement definitions" },
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "save_requirements", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.saveRequirements({
          milestoneId: params.milestone_id,
          requirements: params.requirements,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Saved ${result.count} requirements for milestone ${result.milestoneId}.`,
            },
          ],
          details: { operation: "save_requirements", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError("tool", `gsd_save_requirements failed: ${msg}`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "save_requirements", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 16: gsd_save_uat_result ──────────────────────────────────────
  pi.registerTool({
    name: "gsd_save_uat_result",
    label: "Save UAT Result",
    description:
      "Record UAT (User Acceptance Testing) results for a slice. " +
      "Includes a verdict and individual check results.",
    promptSnippet:
      "Record UAT results for a GSD slice (verdict + checks)",
    promptGuidelines: [
      "Use gsd_save_uat_result after running acceptance tests on a slice.",
      "Verdict must be 'pass', 'fail', or 'partial'.",
      "Provide an array of checks with name, passed (boolean), and optional notes.",
    ],
    parameters: Type.Object({
      milestone_id: Type.String({ description: "Milestone ID (e.g. M001)" }),
      slice_id: Type.String({ description: "Slice ID (e.g. S01)" }),
      verdict: Type.Union(
        [
          Type.Literal("pass"),
          Type.Literal("fail"),
          Type.Literal("partial"),
        ],
        { description: "UAT verdict" },
      ),
      checks: Type.Array(
        Type.Object({
          name: Type.String({ description: "Check name" }),
          passed: Type.Boolean({ description: "Whether the check passed" }),
          notes: Type.Optional(Type.String({ description: "Optional notes for the check" })),
        }),
        { description: "Array of UAT check results" },
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "save_uat_result", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.saveUatResult({
          milestoneId: params.milestone_id,
          sliceId: params.slice_id,
          verdict: params.verdict,
          checks: params.checks,
        });
        const passedCount = params.checks.filter(c => c.passed).length;
        return {
          content: [
            {
              type: "text" as const,
              text: `UAT result recorded for ${result.milestoneId}/${result.sliceId}: ${result.verdict} (${passedCount}/${params.checks.length} checks passed).`,
            },
          ],
          details: { operation: "save_uat_result", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError("tool", `gsd_save_uat_result failed: ${msg}`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "save_uat_result", error: msg } as any,
        };
      }
    },
  });

  // ── Tool 17: gsd_save_knowledge ───────────────────────────────────────
  pi.registerTool({
    name: "gsd_save_knowledge",
    label: "Save Knowledge",
    description:
      "Append a knowledge entry (lesson learned, pattern, insight). " +
      "Updates the KNOWLEDGE.md projection automatically.",
    promptSnippet:
      "Record a knowledge entry for the GSD project (updates DB, renders KNOWLEDGE.md)",
    promptGuidelines: [
      "Use gsd_save_knowledge to record lessons learned — do NOT manually write KNOWLEDGE.md.",
      "Provide the knowledge content and optionally a category and source.",
    ],
    parameters: Type.Object({
      content: Type.String({ description: "Knowledge content to record" }),
      category: Type.Optional(Type.String({ description: "Optional category (e.g. 'architecture', 'testing')" })),
      source: Type.Optional(Type.String({ description: "Optional source (e.g. milestone ID, slice ID)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const dbAvailable = await ensureDbOpen();
      if (!dbAvailable) {
        return {
          content: [{ type: "text" as const, text: "Error: GSD database is not available." }],
          details: { operation: "save_knowledge", error: "db_unavailable" } as any,
        };
      }
      try {
        const { getEngine } = await import("../workflow-engine.js");
        const engine = getEngine(process.cwd());
        const result = engine.saveKnowledge({
          content: params.content,
          category: params.category,
          source: params.source,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Knowledge entry saved: ${result.id}. Next: continue current task.`,
            },
          ],
          details: { operation: "save_knowledge", ...result } as any,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError("tool", `gsd_save_knowledge failed: ${msg}`);
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}` }],
          details: { operation: "save_knowledge", error: msg } as any,
        };
      }
    },
  });
}
