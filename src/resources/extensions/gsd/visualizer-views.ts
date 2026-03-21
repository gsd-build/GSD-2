// View renderers for the GSD workflow visualizer overlay.

import type { Theme } from "@gsd/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@gsd/pi-tui";
import type { VisualizerData, VisualizerMilestone, VisualizerSliceActivity, VisualizerStats } from "./visualizer-data.js";
import { formatCost, formatTokenCount, classifyUnitPhase } from "./metrics.js";
import { formatDuration, padRight, joinColumns, sparkline, STATUS_GLYPH, STATUS_COLOR } from "../shared/mod.js";
import { formatCompletionDate, sliceLabel, findVerification, shortenModel } from "./visualizer-formatters.js";
export type { ProgressFilter } from "./visualizer-progress-view.js";
export { renderProgressView, renderFeatureStats, renderDiscussionStatus, renderRiskHeatmap } from "./visualizer-progress-view.js";
export { renderDepsView, renderDataFlow, renderCriticalPath } from "./visualizer-deps-view.js";
export { renderMetricsView, renderCostProjections } from "./visualizer-metrics-view.js";
export { renderTimelineView, renderTimelineList, renderGanttView } from "./visualizer-timeline-view.js";
export { renderAgentView } from "./visualizer-agent-view.js";
export { renderChangelogView } from "./visualizer-changelog-view.js";

// ─── Export View ─────────────────────────────────────────────────────────────

export function renderExportView(
  _data: VisualizerData,
  th: Theme,
  _width: number,
  lastExportPath?: string,
): string[] {
  const lines: string[] = [];

  lines.push(th.fg("accent", th.bold("Export Options")));
  lines.push("");
  lines.push(`  ${th.fg("accent", "[m]")}  Markdown report \u2014 full project summary with tables`);
  lines.push(`  ${th.fg("accent", "[j]")}  JSON report \u2014 machine-readable project data`);
  lines.push(`  ${th.fg("accent", "[s]")}  Snapshot \u2014 current view as plain text`);

  if (lastExportPath) {
    lines.push("");
    lines.push(th.fg("dim", `Last export: ${lastExportPath}`));
  }

  return lines;
}

// ─── Knowledge View ──────────────────────────────────────────────────────────

export function renderKnowledgeView(
  data: VisualizerData,
  th: Theme,
  width: number,
): string[] {
  const lines: string[] = [];
  const knowledge = data.knowledge;

  if (!knowledge.exists) {
    lines.push(th.fg("dim", "No KNOWLEDGE.md found"));
    return lines;
  }

  if (knowledge.rules.length === 0 && knowledge.patterns.length === 0 && knowledge.lessons.length === 0) {
    lines.push(th.fg("dim", "KNOWLEDGE.md exists but is empty"));
    return lines;
  }

  // Rules section
  if (knowledge.rules.length > 0) {
    lines.push(th.fg("accent", th.bold("Rules")));
    lines.push("");
    for (const rule of knowledge.rules) {
      lines.push(truncateToWidth(
        `  ${th.fg("accent", rule.id)}  ${th.fg("dim", `[${rule.scope}]`)}  ${rule.content}`,
        width,
      ));
    }
    lines.push("");
  }

  // Patterns section
  if (knowledge.patterns.length > 0) {
    lines.push(th.fg("accent", th.bold("Patterns")));
    lines.push("");
    for (const pattern of knowledge.patterns) {
      lines.push(truncateToWidth(
        `  ${th.fg("accent", pattern.id)}  ${pattern.content}`,
        width,
      ));
    }
    lines.push("");
  }

  // Lessons section
  if (knowledge.lessons.length > 0) {
    lines.push(th.fg("accent", th.bold("Lessons Learned")));
    lines.push("");
    for (const lesson of knowledge.lessons) {
      lines.push(truncateToWidth(
        `  ${th.fg("accent", lesson.id)}  ${lesson.content}`,
        width,
      ));
    }
    lines.push("");
  }

  return lines;
}

// ─── Captures View ───────────────────────────────────────────────────────────

export function renderCapturesView(
  data: VisualizerData,
  th: Theme,
  width: number,
): string[] {
  const lines: string[] = [];
  const captures = data.captures;

  // Summary line
  const resolved = captures.entries.filter(e => e.status === "resolved").length;
  lines.push(
    `${th.fg("text", String(captures.totalCount))} total \u00b7 ` +
    `${th.fg("warning", String(captures.pendingCount))} pending \u00b7 ` +
    `${th.fg("dim", String(resolved))} resolved`,
  );
  lines.push("");

  if (captures.entries.length === 0) {
    lines.push(th.fg("dim", "No captures recorded."));
    return lines;
  }

  // Group by status: pending first, then triaged, then resolved
  const statusOrder: Record<string, number> = { pending: 0, triaged: 1, resolved: 2 };
  const sorted = [...captures.entries].sort((a, b) =>
    (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3),
  );

  for (const entry of sorted) {
    const statusColor =
      entry.status === "pending" ? "warning" :
      entry.status === "triaged" ? "accent" :
      "dim";

    const classColor =
      entry.classification === "inject" ? "warning" :
      entry.classification === "quick-task" ? "accent" :
      entry.classification === "replan" ? "error" :
      entry.classification === "defer" ? "text" :
      "dim";

    const classBadge = entry.classification
      ? th.fg(classColor, `(${entry.classification})`)
      : "";

    const statusBadge = th.fg(statusColor, `[${entry.status}]`);
    const textPreview = truncateToWidth(entry.text, Math.max(20, width - 50));

    lines.push(`  ${th.fg("accent", entry.id)} ${statusBadge} ${textPreview} ${classBadge}`);
    if (entry.timestamp) {
      lines.push(`    ${th.fg("dim", entry.timestamp)}`);
    }
  }

  return lines;
}

// ─── Health View ─────────────────────────────────────────────────────────────

export function renderHealthView(
  data: VisualizerData,
  th: Theme,
  width: number,
): string[] {
  const lines: string[] = [];
  const health = data.health;

  // Budget section
  lines.push(th.fg("accent", th.bold("Budget")));
  lines.push("");
  if (health.budgetCeiling !== undefined) {
    const currentSpend = data.totals?.cost ?? 0;
    const pct = health.budgetCeiling > 0 ? Math.min(1, currentSpend / health.budgetCeiling) : 0;
    const barW = Math.max(10, Math.min(30, width - 40));
    const fillLen = Math.round(pct * barW);
    const budgetColor = pct < 0.7 ? "success" : pct < 0.9 ? "warning" : "error";
    const bar =
      th.fg(budgetColor, "\u2588".repeat(fillLen)) +
      th.fg("dim", "\u2591".repeat(barW - fillLen));
    lines.push(`  Ceiling: ${th.fg("text", formatCost(health.budgetCeiling))}`);
    lines.push(`  Spend:   ${bar} ${formatCost(currentSpend)} (${(pct * 100).toFixed(1)}%)`);
  } else {
    lines.push(th.fg("dim", "  No budget ceiling set"));
  }
  lines.push(`  Token profile: ${th.fg("text", health.tokenProfile)}`);
  lines.push("");

  // Pressure section
  lines.push(th.fg("accent", th.bold("Pressure")));
  lines.push("");
  const truncColor = health.truncationRate < 10 ? "success" : health.truncationRate < 30 ? "warning" : "error";
  const contColor = health.continueHereRate < 10 ? "success" : health.continueHereRate < 30 ? "warning" : "error";
  const pressBarW = Math.max(10, Math.min(20, width - 50));

  const truncFill = Math.round((Math.min(health.truncationRate, 100) / 100) * pressBarW);
  const truncBar = th.fg(truncColor, "\u2588".repeat(truncFill)) + th.fg("dim", "\u2591".repeat(pressBarW - truncFill));
  lines.push(`  Truncation:    ${truncBar} ${health.truncationRate.toFixed(1)}%`);

  const contFill = Math.round((Math.min(health.continueHereRate, 100) / 100) * pressBarW);
  const contBar = th.fg(contColor, "\u2588".repeat(contFill)) + th.fg("dim", "\u2591".repeat(pressBarW - contFill));
  lines.push(`  Continue-here: ${contBar} ${health.continueHereRate.toFixed(1)}%`);
  lines.push("");

  // Routing section
  if (health.tierBreakdown.length > 0) {
    lines.push(th.fg("accent", th.bold("Routing")));
    lines.push("");
    for (const tier of health.tierBreakdown) {
      const downTag = tier.downgraded > 0 ? th.fg("warning", ` (${tier.downgraded} downgraded)`) : "";
      lines.push(`  ${padRight(tier.tier, 12)} ${tier.units} units  ${formatCost(tier.cost)}${downTag}`);
    }
    if (health.tierSavingsLine) {
      lines.push(`  ${th.fg("success", health.tierSavingsLine)}`);
    }
    lines.push("");
  }

  // Session section
  lines.push(th.fg("accent", th.bold("Session")));
  lines.push("");
  lines.push(`  Tool calls: ${th.fg("text", String(health.toolCalls))}`);
  lines.push(`  Messages: ${th.fg("text", String(health.assistantMessages))} sent / ${th.fg("text", String(health.userMessages))} received`);

  // Environment section — issues only (from doctor-environment.ts, #1221)
  if (health.environmentIssues?.length > 0) {
    lines.push("");
    lines.push(th.fg("accent", th.bold("Environment")));
    lines.push("");
    for (const r of health.environmentIssues) {
      const icon = r.status === "error" ? th.fg("error", "✗") : th.fg("warning", "⚠");
      lines.push(`  ${icon} ${th.fg("text", r.message)}`);
      if (r.detail) lines.push(`    ${th.fg("dim", r.detail)}`);
    }
  }

  // Providers section
  if (health.providers?.length > 0) {
    lines.push("");
    lines.push(th.fg("accent", th.bold("Providers")));
    lines.push("");
    const categoryOrder = ["llm", "remote", "search", "tool"];
    const categoryLabels: Record<string, string> = { llm: "LLM", remote: "Notifications", search: "Search", tool: "Tools" };
    const grouped = new Map<string, typeof health.providers>();
    for (const p of health.providers) {
      const cat = p.category;
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(p);
    }
    for (const cat of categoryOrder) {
      const items = grouped.get(cat);
      if (!items || items.length === 0) continue;
      lines.push(`  ${th.fg("dim", categoryLabels[cat] ?? cat)}`);
      for (const p of items) {
        const icon = p.ok ? th.fg("success", "✓") : th.fg("error", "✗");
        const msg = p.ok ? th.fg("dim", p.message) : th.fg("text", p.message);
        lines.push(`    ${icon} ${msg}`);
      }
    }
  }

  // Progress score section — current traffic light status
  if (health.progressScore) {
    lines.push("");
    lines.push(th.fg("accent", th.bold("Progress Score")));
    lines.push("");
    const ps = health.progressScore;
    const scoreColor = ps.level === "green" ? "success" : ps.level === "yellow" ? "warning" : "error";
    const scoreIcon = ps.level === "green" ? "●" : ps.level === "yellow" ? "◐" : "○";
    lines.push(`  ${th.fg(scoreColor, scoreIcon)} ${th.fg(scoreColor, ps.summary)}`);
    for (const signal of ps.signals) {
      const prefix = signal.kind === "positive" ? th.fg("success", "  ✓")
        : signal.kind === "negative" ? th.fg("error", "  ✗")
          : th.fg("dim", "  ·");
      lines.push(`  ${prefix} ${th.fg("dim", signal.label)}`);
    }
  }

  // Doctor history section — persisted across sessions
  const doctorHistory = health.doctorHistory ?? [];
  if (doctorHistory.length > 0) {
    lines.push("");
    lines.push(th.fg("accent", th.bold("Doctor History")));
    lines.push("");

    for (const entry of doctorHistory.slice(0, 10)) {
      const icon = entry.ok ? th.fg("success", "✓") : th.fg("error", "✗");
      const ts = entry.ts.replace("T", " ").slice(0, 19);
      const scopeTag = entry.scope ? th.fg("accent", ` [${entry.scope}]`) : "";
      // Prefer human-readable summary, fall back to counts
      const detail = entry.summary
        ? th.fg("text", entry.summary)
        : th.fg("text", `${entry.errors} errors, ${entry.warnings} warnings, ${entry.fixes} fixes`);
      lines.push(`  ${icon} ${th.fg("dim", ts)}${scopeTag}  ${detail}`);

      // Show issue details if available
      if (entry.issues && entry.issues.length > 0) {
        for (const issue of entry.issues.slice(0, 3)) {
          const issuePfx = issue.severity === "error" ? th.fg("error", "    ✗") : th.fg("warning", "    ⚠");
          lines.push(`  ${issuePfx} ${th.fg("dim", truncateToWidth(issue.message, width - 12))}`);
        }
        if (entry.issues.length > 3) {
          lines.push(`    ${th.fg("dim", `+${entry.issues.length - 3} more`)}`);
        }
      }

      // Show fixes if available
      if (entry.fixDescriptions && entry.fixDescriptions.length > 0) {
        for (const fix of entry.fixDescriptions.slice(0, 2)) {
          lines.push(`    ${th.fg("success", "↳")} ${th.fg("dim", truncateToWidth(fix, width - 12))}`);
        }
      }
    }

    if (doctorHistory.length > 10) {
      lines.push(`  ${th.fg("dim", `...${doctorHistory.length - 10} older entries`)}`);
    }
  }

  // Skills section
  if (health.skillSummary?.total > 0) {
    lines.push("");
    lines.push(th.fg("accent", th.bold("Skills")));
    lines.push("");
    const { total, warningCount, criticalCount, topIssue } = health.skillSummary;
    const issueColor = criticalCount > 0 ? "error" : warningCount > 0 ? "warning" : "success";
    const issueTag = criticalCount > 0
      ? `${criticalCount} critical`
      : warningCount > 0
        ? `${warningCount} warning${warningCount > 1 ? "s" : ""}`
        : "all healthy";
    lines.push(`  ${th.fg("text", String(total))} skills tracked  ·  ${th.fg(issueColor, issueTag)}`);
    if (topIssue) lines.push(`  ${th.fg("warning", "⚠")} ${th.fg("dim", topIssue)}`);
    lines.push(`  ${th.fg("dim", "→ /gsd skill-health for full report")}`);
  }

  return lines;
}
