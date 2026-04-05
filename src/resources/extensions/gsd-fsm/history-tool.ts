// GSD-FSM Extension — History Tool
// Registers fsm_gsd_history: event log → transition timeline.

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { buildEventTimeline, detectAnomalies } from "./state-extractor.js";

interface HistoryParams {
  base_path?: string;
  milestone_id?: string;
  limit?: number;
}

export function registerHistoryTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "fsm_gsd_history",
    label: "GSD State Machine History",
    description: [
      "Show the state transition history from the GSD event log.",
      "Reconstructs the timeline of phase transitions with dwell times,",
      "detects anomalies like replan loops and long stuck phases.",
      "Optionally filter by milestone_id.",
    ].join(" "),
    parameters: Type.Object({
      base_path: Type.Optional(Type.String({ description: "Project base path (defaults to cwd)" })),
      milestone_id: Type.Optional(Type.String({ description: "Filter to a specific milestone" })),
      limit: Type.Optional(Type.Number({ description: "Max events to show (default: 50, most recent)" })),
    }),
    async execute(
      toolCallId: string,
      params: HistoryParams,
      signal?: AbortSignal,
    ) {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "History check cancelled" }], details: {} };
      }

      const basePath = params.base_path ?? process.cwd();
      const limit = params.limit ?? 50;

      try {
        const timeline = buildEventTimeline(basePath, {
          milestoneId: params.milestone_id,
          limit,
        });

        if (timeline.length === 0) {
          return {
            content: [{ type: "text", text: "No events found in event log." }],
            details: {},
          };
        }

        const anomalies = detectAnomalies(timeline);
        const parts: string[] = [];

        parts.push("## GSD Event Timeline");
        parts.push("");

        if (params.milestone_id) {
          parts.push(`Filtered to milestone: **${params.milestone_id}**`);
          parts.push("");
        }

        parts.push(`Showing ${timeline.length} event(s):`);
        parts.push("");

        // Group by session
        const sessions = new Map<string, typeof timeline>();
        for (const entry of timeline) {
          const group = sessions.get(entry.sessionId) ?? [];
          group.push(entry);
          sessions.set(entry.sessionId, group);
        }

        for (const [sessionId, events] of sessions) {
          parts.push(`### Session ${sessionId.slice(0, 8)}`);
          parts.push("");
          parts.push("| Time | Command | Milestone | Slice | Task | Dwell |");
          parts.push("|------|---------|-----------|-------|------|-------|");

          for (const e of events) {
            const time = e.ts.replace(/T/, " ").replace(/\.\d+Z$/, "");
            const dwell = e.dwellMs != null
              ? formatDwell(e.dwellMs)
              : "—";
            parts.push(
              `| ${time} | ${e.cmd} | ${e.milestoneId ?? "—"} | ${e.sliceId ?? "—"} | ${e.taskId ?? "—"} | ${dwell} |`,
            );
          }
          parts.push("");
        }

        if (anomalies.length > 0) {
          parts.push("### Anomalies Detected");
          parts.push("");
          for (const a of anomalies) {
            parts.push(`- ${a}`);
          }
        }

        return {
          content: [{ type: "text", text: parts.join("\n") }],
          details: {},
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `History check failed: ${(err as Error).message}`,
          }],
          details: {},
        };
      }
    },
  });
}

function formatDwell(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}
