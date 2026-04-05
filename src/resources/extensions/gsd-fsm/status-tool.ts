// GSD-FSM Extension — Status Tool
// Registers fsm_gsd_status: live state → highlighted Mermaid diagram + summary.

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { deriveState } from "../gsd/state.js";
import { extractFSMSnapshot } from "./state-extractor.js";
import { buildPhaseDiagram, buildMilestoneDiagram, buildStatusSummary } from "./diagram-builder.js";

interface StatusParams {
  base_path?: string;
  level?: "overview" | "milestone" | "phase";
}

export function registerStatusTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "fsm_gsd_status",
    label: "GSD State Machine Status",
    description: [
      "Show the current GSD project state machine status as a Mermaid diagram.",
      "Displays the phase transition graph with the current phase highlighted,",
      "milestone progress, active slice/task, and any blockers.",
      "Use level='overview' for full phase diagram, 'milestone' for milestone map,",
      "or 'phase' for current phase context only.",
    ].join(" "),
    parameters: Type.Object({
      base_path: Type.Optional(Type.String({ description: "Project base path (defaults to cwd)" })),
      level: Type.Optional(Type.Union([
        Type.Literal("overview"),
        Type.Literal("milestone"),
        Type.Literal("phase"),
      ], { description: "Detail level: overview (default), milestone, or phase" })),
    }),
    async execute(
      toolCallId: string,
      params: StatusParams,
      signal?: AbortSignal,
    ) {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Status check cancelled" }], details: {} };
      }

      const basePath = params.base_path ?? process.cwd();
      const level = params.level ?? "overview";

      try {
        const state = await deriveState(basePath);
        const snapshot = extractFSMSnapshot(state);
        const parts: string[] = [];

        if (level === "overview" || level === "phase") {
          parts.push(buildPhaseDiagram(snapshot, {
            title: "GSD Phase State Machine",
            highlightCurrent: true,
          }));
          parts.push("");
        }

        if (level === "overview" || level === "milestone") {
          parts.push(buildMilestoneDiagram(
            snapshot.milestones,
            snapshot.activeMilestone,
          ));
          parts.push("");
        }

        parts.push(buildStatusSummary(snapshot));

        return {
          content: [{ type: "text", text: parts.join("\n") }],
          details: {},
        };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `Failed to derive GSD state: ${(err as Error).message}`,
          }],
          details: {},
        };
      }
    },
  });
}
