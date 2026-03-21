// GSD Visualizer - Agent activity view renderer

import type { Theme } from "@gsd/pi-coding-agent";
import { truncateToWidth } from "@gsd/pi-tui";
import type { VisualizerData } from "./visualizer-data.js";
import { formatCost, formatTokenCount } from "./metrics.js";
import { formatDuration, padRight, joinColumns, STATUS_GLYPH, STATUS_COLOR } from "../shared/mod.js";

export function renderAgentView(
  data: VisualizerData,
  th: Theme,
  width: number,
): string[] {
  const lines: string[] = [];
  const activity = data.agentActivity;

  if (!activity) {
    lines.push(th.fg("dim", "No agent activity data."));
    return lines;
  }

  // Status line
  const agentStatus = activity.active ? "active" : "pending";
  const statusDot = th.fg(STATUS_COLOR[agentStatus], STATUS_GLYPH[agentStatus]);
  const statusText = activity.active ? "ACTIVE" : "IDLE";
  const elapsedStr = activity.active ? formatDuration(activity.elapsed) : "\u2014";

  lines.push(
    joinColumns(
      `Status: ${statusDot} ${statusText}`,
      `Elapsed: ${elapsedStr}`,
      width,
    ),
  );

  if (activity.currentUnit) {
    lines.push(`Current: ${th.fg("accent", `${activity.currentUnit.type} ${activity.currentUnit.id}`)}`);
  } else {
    lines.push(th.fg("dim", "Not in auto mode"));
  }

  lines.push("");

  // Progress bar
  const completed = activity.completedUnits;
  const total = Math.max(completed, activity.totalSlices);
  if (total > 0) {
    const pct = Math.min(1, completed / total);
    const barW = Math.max(10, Math.min(30, width - 30));
    const fillLen = Math.round(pct * barW);
    const bar =
      th.fg("accent", "\u2588".repeat(fillLen)) +
      th.fg("dim", "\u2591".repeat(barW - fillLen));
    lines.push(`Progress ${bar} ${completed}/${total} slices`);
  }

  // Rate and session stats
  const rateStr = activity.completionRate > 0
    ? `${activity.completionRate.toFixed(1)} units/hr`
    : "\u2014";
  lines.push(
    `Rate: ${th.fg("text", rateStr)}    ` +
    `Session: ${th.fg("text", formatCost(activity.sessionCost))}  ` +
    `${th.fg("text", formatTokenCount(activity.sessionTokens))} tokens`,
  );

  lines.push("");

  // Budget pressure
  const health = data.health;
  const truncColor = health.truncationRate < 10 ? "success" : health.truncationRate < 30 ? "warning" : "error";
  const contColor = health.continueHereRate < 10 ? "success" : health.continueHereRate < 30 ? "warning" : "error";
  lines.push(th.fg("accent", th.bold("Pressure")));
  lines.push(`  Truncation rate: ${th.fg(truncColor, `${health.truncationRate.toFixed(1)}%`)}`);
  lines.push(`  Continue-here rate: ${th.fg(contColor, `${health.continueHereRate.toFixed(1)}%`)}`);

  // Pending captures
  if (data.captures.pendingCount > 0) {
    lines.push(`  Pending captures: ${th.fg("warning", String(data.captures.pendingCount))}`);
  }

  lines.push("");

  // Recent completed units (last 5)
  const recentUnits = data.units.filter(u => u.finishedAt > 0).slice(-5).reverse();
  if (recentUnits.length > 0) {
    lines.push(th.fg("accent", th.bold("Recent (last 5):")));
    for (const u of recentUnits) {
      const dt = new Date(u.startedAt);
      const hh = String(dt.getHours()).padStart(2, "0");
      const mm = String(dt.getMinutes()).padStart(2, "0");
      const dur = formatDuration(u.finishedAt - u.startedAt);
      const cost = formatCost(u.cost);
      const typeLabel = padRight(u.type, 16);
      lines.push(
        truncateToWidth(
          `  ${hh}:${mm}  ${th.fg(STATUS_COLOR.done, STATUS_GLYPH.done)} ${typeLabel} ${padRight(u.id, 16)} ${dur}  ${cost}`,
          width,
        ),
      );
    }
  } else {
    lines.push(th.fg("dim", "No completed units yet."));
  }

  return lines;
}
