/**
 * Plane Tracker Extension for GSD-2
 *
 * Exposes tools for agents to create and update Plane issues
 * as they work through milestones. The agent doing the work
 * reports its own progress — no polling, no indirect updates.
 *
 * Tools:
 *   plane_create_issue  — Create a new issue (feature, phase, task)
 *   plane_update_issue  — Update state, priority, or description
 *   plane_add_comment   — Add a progress comment to an issue
 *   plane_list_issues   — List issues in a project
 */

import { Type } from "@sinclair/typebox";
import {
  loadConfig,
  createIssue,
  updateIssue,
  addComment,
  listIssues,
} from "./plane-client.js";

import type { ExtensionAPI } from "@gsd/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Check if Plane is configured on startup
  pi.on("session_start", async (_event, ctx) => {
    const cfg = loadConfig();
    if (cfg) {
      ctx.ui.setStatus("plane", `Plane: ${cfg.workspace}`);
    }
  });

  // --- plane_create_issue ---
  pi.registerTool({
    name: "plane_create_issue",
    label: "Create Plane Issue",
    description:
      "Create a new issue in Plane to track a feature, phase, or task. " +
      "Use this when starting a new unit of work so progress is visible in the dashboard.",
    promptSnippet: "Create a Plane issue to track work progress",
    promptGuidelines: [
      "Create a Plane issue when starting a new feature, phase, or milestone",
      "Use labels to categorize: 'feature', 'phase', 'gate', or agent role names",
      "Set state to 'In Progress' when work begins, 'Done' when complete",
    ],
    parameters: Type.Object({
      project: Type.String({
        description: "Plane project name (e.g. 'arch-vision-ai')",
      }),
      name: Type.String({
        description: "Issue title (e.g. 'Phase 2: Build — Core Pages')",
      }),
      description: Type.String({
        description: "What this work involves",
      }),
      priority: Type.Optional(
        Type.String({
          description: "Priority: urgent, high, medium, low, none",
        }),
      ),
      state: Type.Optional(
        Type.String({
          description: "Initial state name (e.g. 'In Progress', 'Backlog')",
        }),
      ),
      labels: Type.Optional(
        Type.Array(Type.String(), {
          description: "Labels: feature, phase, gate, builder, qa, ops, research, director",
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const result = await createIssue(params.project, params.name, params.description, {
          priority: params.priority,
          state: params.state,
          labels: params.labels,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Created Plane issue: "${result.name}" (ID: ${result.id})`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Failed to create issue: ${err.message}` }],
          isError: true,
        };
      }
    },
  });

  // --- plane_update_issue ---
  pi.registerTool({
    name: "plane_update_issue",
    label: "Update Plane Issue",
    description:
      "Update an existing Plane issue's state, priority, or description. " +
      "Use this to mark work as 'In Progress', 'Done', or 'Cancelled'.",
    promptSnippet: "Update a Plane issue state or details",
    parameters: Type.Object({
      project: Type.String({
        description: "Plane project name",
      }),
      issue_id: Type.String({
        description: "Issue ID to update",
      }),
      state: Type.Optional(
        Type.String({
          description: "New state name (e.g. 'Done', 'In Progress', 'Cancelled')",
        }),
      ),
      priority: Type.Optional(
        Type.String({
          description: "New priority",
        }),
      ),
      name: Type.Optional(
        Type.String({
          description: "Updated issue title",
        }),
      ),
      description: Type.Optional(
        Type.String({
          description: "Updated description",
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        await updateIssue(params.project, params.issue_id, {
          state: params.state,
          priority: params.priority,
          name: params.name,
          description: params.description,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Updated issue ${params.issue_id}${params.state ? ` → ${params.state}` : ""}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Failed to update issue: ${err.message}` }],
          isError: true,
        };
      }
    },
  });

  // --- plane_add_comment ---
  pi.registerTool({
    name: "plane_add_comment",
    label: "Add Plane Comment",
    description:
      "Add a progress comment to a Plane issue. " +
      "Use this to record milestone completions, blockers, or handoff notes.",
    promptSnippet: "Add a comment to a Plane issue",
    parameters: Type.Object({
      project: Type.String({
        description: "Plane project name",
      }),
      issue_id: Type.String({
        description: "Issue ID to comment on",
      }),
      comment: Type.String({
        description: "Comment text (supports basic HTML)",
      }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        await addComment(params.project, params.issue_id, params.comment);
        return {
          content: [
            {
              type: "text" as const,
              text: `Comment added to issue ${params.issue_id}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Failed to add comment: ${err.message}` }],
          isError: true,
        };
      }
    },
  });

  // --- plane_list_issues ---
  pi.registerTool({
    name: "plane_list_issues",
    label: "List Plane Issues",
    description:
      "List recent issues in a Plane project. " +
      "Use this to check existing issues before creating duplicates.",
    promptSnippet: "List issues in a Plane project",
    parameters: Type.Object({
      project: Type.String({
        description: "Plane project name",
      }),
      limit: Type.Optional(
        Type.Number({
          description: "Max issues to return (default 20)",
          minimum: 1,
          maximum: 100,
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const issues = await listIssues(params.project, params.limit ?? 20);
        if (issues.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No issues found in this project." }],
          };
        }
        const lines = issues.map(
          (i) => `- [${i.id.slice(0, 8)}] ${i.name} (priority: ${i.priority || "none"})`,
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${issues.length} issues:\n${lines.join("\n")}`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Failed to list issues: ${err.message}` }],
          isError: true,
        };
      }
    },
  });
}
