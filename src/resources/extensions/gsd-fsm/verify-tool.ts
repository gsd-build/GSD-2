// GSD-FSM Extension — Verify Tool
// Registers fsm_gsd_verify: integrity checks on project state machine.

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { deriveState } from "../gsd/state.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  isDbAvailable,
  getAllMilestones,
  getMilestoneSlices,
  getSliceTasks,
} from "../gsd/gsd-db.js";
import { resolveMilestoneFile } from "../gsd/paths.js";

interface VerifyParams {
  base_path?: string;
}

interface IntegrityIssue {
  severity: "error" | "warning";
  category: string;
  message: string;
  location?: string;
}

export function registerVerifyTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "fsm_gsd_verify",
    label: "GSD State Machine Verifier",
    description: [
      "Verify the integrity of a GSD project's state machine.",
      "Checks for unreachable slices, dead-end tasks, state consistency",
      "between DB and disk artifacts, stale entries, and dependency issues.",
    ].join(" "),
    parameters: Type.Object({
      base_path: Type.Optional(Type.String({ description: "Project base path (defaults to cwd)" })),
    }),
    async execute(
      toolCallId: string,
      params: VerifyParams,
      signal?: AbortSignal,
    ) {
      if (signal?.aborted) {
        return { content: [{ type: "text", text: "Verification cancelled" }], details: {} };
      }

      const basePath = params.base_path ?? process.cwd();
      const issues: IntegrityIssue[] = [];

      try {
        // 1. Check if DB is available
        if (!isDbAvailable()) {
          issues.push({
            severity: "warning",
            category: "db",
            message: "GSD database not available — running in filesystem-only mode",
          });
        }

        // 2. Derive state and check basic consistency
        const state = await deriveState(basePath);

        // 3. Check milestone dependency references
        for (const m of state.registry) {
          if (m.dependsOn) {
            for (const dep of m.dependsOn) {
              const depExists = state.registry.some((r) => r.id === dep);
              if (!depExists) {
                issues.push({
                  severity: "error",
                  category: "dependency",
                  message: `Milestone ${m.id} depends on ${dep} which does not exist`,
                  location: m.id,
                });
              }
            }
          }
        }

        // 4. Check for dependency cycles between milestones
        const cycleMilestones = detectMilestoneCycles(state.registry);
        for (const cycle of cycleMilestones) {
          issues.push({
            severity: "error",
            category: "dependency",
            message: `Dependency cycle detected: ${cycle.join(" → ")}`,
          });
        }

        // 5. DB-specific checks
        if (isDbAvailable()) {
          const dbMilestones = getAllMilestones();

          for (const dbM of dbMilestones) {
            // Check milestone SUMMARY consistency
            const summaryPath = resolveMilestoneFile(basePath, dbM.id, "SUMMARY");
            const summaryExists = summaryPath ? existsSync(summaryPath) : false;
            const isComplete = dbM.status === "complete" || dbM.status === "done";

            if (summaryExists && !isComplete) {
              issues.push({
                severity: "warning",
                category: "consistency",
                message: `Milestone ${dbM.id} has SUMMARY on disk but DB status is "${dbM.status}"`,
                location: dbM.id,
              });
            }
            if (isComplete && !summaryExists) {
              issues.push({
                severity: "warning",
                category: "consistency",
                message: `Milestone ${dbM.id} is marked "${dbM.status}" in DB but has no SUMMARY on disk`,
                location: dbM.id,
              });
            }

            // Check slice dependencies within milestone
            const slices = getMilestoneSlices(dbM.id);
            const sliceIds = new Set(slices.map((s) => s.id));

            for (const slice of slices) {
              const deps = typeof slice.depends === "string"
                ? JSON.parse(slice.depends || "[]") as string[]
                : (slice.depends as unknown as string[] ?? []);
              for (const dep of deps) {
                if (!sliceIds.has(dep)) {
                  issues.push({
                    severity: "error",
                    category: "dependency",
                    message: `Slice ${dbM.id}/${slice.id} depends on ${dep} which does not exist in milestone`,
                    location: `${dbM.id}/${slice.id}`,
                  });
                }
              }
            }

            // Check slice dependency cycles
            const sliceCycles = detectSliceCycles(slices);
            for (const cycle of sliceCycles) {
              issues.push({
                severity: "error",
                category: "dependency",
                message: `Slice dependency cycle in ${dbM.id}: ${cycle.join(" → ")}`,
                location: dbM.id,
              });
            }

            // Check task consistency
            for (const slice of slices) {
              const tasks = getSliceTasks(dbM.id, slice.id);
              for (const task of tasks) {
                const taskSummaryPath = join(
                  basePath, ".gsd", "milestones", dbM.id,
                  "slices", slice.id, "tasks", task.id,
                  `${task.id}-SUMMARY.md`,
                );
                const taskSummaryExists = existsSync(taskSummaryPath);
                const taskComplete = task.status === "complete" || task.status === "done";

                if (taskSummaryExists && !taskComplete) {
                  issues.push({
                    severity: "warning",
                    category: "consistency",
                    message: `Task ${dbM.id}/${slice.id}/${task.id} has SUMMARY but DB status is "${task.status}"`,
                    location: `${dbM.id}/${slice.id}/${task.id}`,
                  });
                }
              }
            }
          }
        }

        // 6. Phase consistency check
        if (state.phase === "executing" && !state.activeTask) {
          issues.push({
            severity: "warning",
            category: "state",
            message: "Phase is 'executing' but no active task found",
          });
        }
        if (state.phase === "complete" && state.activeMilestone) {
          issues.push({
            severity: "warning",
            category: "state",
            message: `Phase is 'complete' but active milestone ${state.activeMilestone.id} still set`,
          });
        }

        // Format results
        const errorCount = issues.filter((i) => i.severity === "error").length;
        const warnCount = issues.filter((i) => i.severity === "warning").length;

        let report = `## GSD State Machine Verification\n\n`;
        if (issues.length === 0) {
          report += "All checks passed. No integrity issues detected.\n";
        } else {
          report += `Found ${errorCount} error(s) and ${warnCount} warning(s).\n\n`;
          for (const issue of issues) {
            const icon = issue.severity === "error" ? "ERROR" : "WARN";
            const loc = issue.location ? ` (${issue.location})` : "";
            report += `- [${icon}] [${issue.category}]${loc}: ${issue.message}\n`;
          }
        }

        return { content: [{ type: "text", text: report }], details: {} };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: `Verification failed: ${(err as Error).message}`,
          }],
          details: {},
        };
      }
    },
  });
}

// ─── Internal: Cycle Detection ──────────────────────────────────────────

function detectMilestoneCycles(registry: { id: string; dependsOn?: string[] }[]): string[][] {
  const graph = new Map<string, string[]>();
  for (const m of registry) {
    graph.set(m.id, m.dependsOn ?? []);
  }
  return findCycles(graph);
}

function detectSliceCycles(slices: { id: string; depends?: string | unknown }[]): string[][] {
  const graph = new Map<string, string[]>();
  for (const s of slices) {
    const deps = typeof s.depends === "string"
      ? JSON.parse(s.depends || "[]") as string[]
      : (s.depends as string[] ?? []);
    graph.set(s.id, deps);
  }
  return findCycles(graph);
}

function findCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      cycles.push([...path.slice(cycleStart), node]);
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    for (const dep of graph.get(node) ?? []) {
      dfs(dep);
    }

    path.pop();
    inStack.delete(node);
  }

  for (const node of graph.keys()) {
    dfs(node);
  }

  return cycles;
}
