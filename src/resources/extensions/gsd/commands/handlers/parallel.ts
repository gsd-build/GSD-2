import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import {
  getOrchestratorState,
  getWorkerStatuses,
  isParallelActive,
  pauseWorker,
  prepareParallelStart,
  resumeWorker,
  startParallel,
  stopParallel,
} from "../../parallel-orchestrator.js";
import { formatEligibilityReport } from "../../parallel-eligibility.js";
import { formatMergeResults, mergeAllCompleted, mergeCompletedMilestone } from "../../parallel-merge.js";
import { loadEffectiveGSDPreferences, resolveParallelConfig } from "../../preferences.js";
import { projectRoot } from "../context.js";

export async function handleParallelCommand(trimmed: string, _ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<boolean> {
  if (!trimmed.startsWith("parallel")) return false;

  const parallelArgs = trimmed.slice("parallel".length).trim();
  const [subcommand = "", ...restParts] = parallelArgs.split(/\s+/);
  const rest = restParts.join(" ");

  if (subcommand === "start" || subcommand === "") {
    const loaded = loadEffectiveGSDPreferences();
    const config = resolveParallelConfig(loaded?.preferences);
    if (!config.enabled) {
      pi.sendMessage({
        customType: "gsd-parallel",
        content: "Parallel mode is not enabled. Set `parallel.enabled: true` in your preferences.",
        display: false,
      });
      return true;
    }
    const candidates = await prepareParallelStart(projectRoot(), loaded?.preferences);
    const report = formatEligibilityReport(candidates);
    if (candidates.eligible.length === 0) {
      pi.sendMessage({ customType: "gsd-parallel", content: `${report}\n\nNo milestones are eligible for parallel execution.`, display: false });
      return true;
    }
    const result = await startParallel(
      projectRoot(),
      candidates.eligible.map((candidate) => candidate.milestoneId),
      loaded?.preferences,
    );
    const lines = ["Parallel orchestration started.", `Workers: ${result.started.join(", ")}`];
    if (result.errors.length > 0) {
      lines.push(`Errors: ${result.errors.map((entry) => `${entry.mid}: ${entry.error}`).join("; ")}`);
    }
    pi.sendMessage({ customType: "gsd-parallel", content: `${report}\n\n${lines.join("\n")}`, display: false });
    return true;
  }

  if (subcommand === "status") {
    if (!isParallelActive()) {
      pi.sendMessage({ customType: "gsd-parallel", content: "No parallel orchestration is currently active.", display: false });
      return true;
    }
    const workers = getWorkerStatuses();
    const lines = ["# Parallel Workers\n"];
    for (const worker of workers) {
      lines.push(`- **${worker.milestoneId}** (${worker.title}) — ${worker.state} — ${worker.completedUnits} units — $${worker.cost.toFixed(2)}`);
    }
    const state = getOrchestratorState();
    if (state) {
      lines.push(`\nTotal cost: $${state.totalCost.toFixed(2)}`);
    }
    pi.sendMessage({ customType: "gsd-parallel", content: lines.join("\n"), display: false });
    return true;
  }

  if (subcommand === "stop") {
    const milestoneId = rest.trim() || undefined;
    await stopParallel(projectRoot(), milestoneId);
    pi.sendMessage({ customType: "gsd-parallel", content: milestoneId ? `Stopped worker for ${milestoneId}.` : "All parallel workers stopped.", display: false });
    return true;
  }

  if (subcommand === "pause") {
    const milestoneId = rest.trim() || undefined;
    pauseWorker(projectRoot(), milestoneId);
    pi.sendMessage({ customType: "gsd-parallel", content: milestoneId ? `Paused worker for ${milestoneId}.` : "All parallel workers paused.", display: false });
    return true;
  }

  if (subcommand === "resume") {
    const milestoneId = rest.trim() || undefined;
    resumeWorker(projectRoot(), milestoneId);
    pi.sendMessage({ customType: "gsd-parallel", content: milestoneId ? `Resumed worker for ${milestoneId}.` : "All parallel workers resumed.", display: false });
    return true;
  }

  if (subcommand === "merge") {
    const milestoneId = rest.trim() || undefined;
    if (milestoneId) {
      const result = await mergeCompletedMilestone(projectRoot(), milestoneId);
      pi.sendMessage({ customType: "gsd-parallel", content: formatMergeResults([result]), display: false });
      return true;
    }
    const workers = getWorkerStatuses();
    if (workers.length === 0) {
      pi.sendMessage({ customType: "gsd-parallel", content: "No parallel workers to merge.", display: false });
      return true;
    }
    const results = await mergeAllCompleted(projectRoot(), workers);
    pi.sendMessage({ customType: "gsd-parallel", content: formatMergeResults(results), display: false });
    return true;
  }

  pi.sendMessage({
    customType: "gsd-parallel",
    content: `Unknown parallel subcommand "${subcommand}". Usage: /gsd parallel [start|status|stop|pause|resume|merge]`,
    display: false,
  });
  return true;
}

