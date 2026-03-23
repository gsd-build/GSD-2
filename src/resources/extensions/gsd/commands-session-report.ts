/**
 * GSD Command — /gsd session-report
 *
 * Summarizes the current session: tasks completed, cost, tokens,
 * duration, model usage breakdown.
 */

import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getLedger, getProjectTotals, aggregateByModel, formatCost, formatTokenCount, loadLedgerFromDisk } from "./metrics.js";
import type { UnitMetrics } from "./metrics.js";
import { gsdRoot } from "./paths.js";
import { formatDuration } from "../shared/format-utils.js";

function formatSessionReport(units: UnitMetrics[]): string {
  const totals = getProjectTotals(units);
  const byModel = aggregateByModel(units);

  const lines: string[] = [];
  lines.push("╭─ Session Report ──────────────────────────────────────╮");

  if (totals.totalDuration > 0) {
    lines.push(`│ Duration:    ${formatDuration(totals.totalDuration).padEnd(40)}│`);
  }
  lines.push(`│ Units:       ${String(units.length).padEnd(40)}│`);
  lines.push(`│ Cost:        ${formatCost(totals.totalCost).padEnd(40)}│`);
  lines.push(`│ Tokens:      ${`${formatTokenCount(totals.totalInput)} in / ${formatTokenCount(totals.totalOutput)} out`.padEnd(40)}│`);
  lines.push("│                                                       │");

  // Work completed
  if (units.length > 0) {
    lines.push("│ Work Completed:                                       │");
    for (const unit of units) {
      const status = unit.status === "completed" ? "✓" : unit.status === "skipped" ? "⊘" : "•";
      const label = `  ${status} ${unit.unitId ?? "unknown"}`;
      lines.push(`│ ${label.padEnd(53)}│`);
    }
    lines.push("│                                                       │");
  }

  // Model usage
  if (byModel.length > 0) {
    lines.push("│ Model Usage:                                          │");
    for (const m of byModel) {
      const label = `  ${m.model}: ${m.count} units (${formatCost(m.cost)})`;
      lines.push(`│ ${label.padEnd(53)}│`);
    }
  }

  lines.push("╰───────────────────────────────────────────────────────╯");
  return lines.join("\n");
}

export async function handleSessionReport(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const basePath = process.cwd();

  // Get units from in-memory ledger or disk
  const ledger = getLedger();
  let units: UnitMetrics[];

  if (ledger && ledger.units.length > 0) {
    units = ledger.units;
  } else {
    const diskLedger = loadLedgerFromDisk(basePath);
    if (!diskLedger || diskLedger.units.length === 0) {
      ctx.ui.notify("No session data — no units have been executed yet.", "info");
      return;
    }
    units = diskLedger.units;
  }

  // JSON output
  if (args.includes("--json")) {
    const totals = getProjectTotals(units);
    const byModel = aggregateByModel(units);
    ctx.ui.notify(JSON.stringify({ units: units.length, totals, byModel }, null, 2), "info");
    return;
  }

  // Save to file
  if (args.includes("--save")) {
    const report = formatSessionReport(units);
    const reportsDir = join(gsdRoot(basePath), "reports");
    mkdirSync(reportsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const outPath = join(reportsDir, `session-${timestamp}.md`);
    writeFileSync(outPath, `\`\`\`\n${report}\n\`\`\`\n`, "utf-8");
    ctx.ui.notify(`Report saved: ${outPath}`, "success");
    return;
  }

  // Display
  ctx.ui.notify(formatSessionReport(units), "info");
}
