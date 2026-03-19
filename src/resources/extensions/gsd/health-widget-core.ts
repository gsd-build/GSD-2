/**
 * Pure GSD health widget logic.
 *
 * Separates project-state detection and line rendering from the widget's
 * runtime integrations so the regressions can be tested directly.
 */

import { existsSync } from "node:fs";
import { detectProjectState } from "./detection.js";
import { gsdRoot } from "./paths.js";
import type { GSDState, Phase } from "./types.js";

export type HealthWidgetProjectState = "none" | "initialized" | "active";

export interface HealthWidgetData {
  projectState: HealthWidgetProjectState;
  budgetCeiling: number | undefined;
  budgetSpent: number;
  providerIssue: string | null;
  environmentErrorCount: number;
  environmentWarningCount: number;
  lastRefreshed: number;
  executionPhase?: Phase;
  executionStatus?: string;
  executionTarget?: string;
  nextAction?: string;
  blocker?: string | null;
  activeMilestoneId?: string;
  activeSliceId?: string;
  activeTaskId?: string;
  progress?: GSDState["progress"];
  eta?: string | null;
}

export function detectHealthWidgetProjectState(basePath: string): HealthWidgetProjectState {
  if (!existsSync(gsdRoot(basePath))) return "none";

  const { state } = detectProjectState(basePath);
  return state === "v2-gsd" ? "active" : "initialized";
}

function formatCost(n: number): string {
  return n >= 1 ? `$${n.toFixed(2)}` : `${(n * 100).toFixed(1)}¢`;
}

function formatProgress(progress?: GSDState["progress"]): string | null {
  if (!progress) return null;

  const parts: string[] = [];
  parts.push(`M ${progress.milestones.done}/${progress.milestones.total}`);
  if (progress.slices) parts.push(`S ${progress.slices.done}/${progress.slices.total}`);
  if (progress.tasks) parts.push(`T ${progress.tasks.done}/${progress.tasks.total}`);
  return parts.length > 0 ? `Progress: ${parts.join(" · ")}` : null;
}

function formatEnvironmentSummary(errorCount: number, warningCount: number): string | null {
  if (errorCount <= 0 && warningCount <= 0) return null;

  const parts: string[] = [];
  if (errorCount > 0) parts.push(`${errorCount} error${errorCount > 1 ? "s" : ""}`);
  if (warningCount > 0) parts.push(`${warningCount} warning${warningCount > 1 ? "s" : ""}`);
  return `Env: ${parts.join(", ")}`;
}

function formatBudgetSummary(data: HealthWidgetData): string | null {
  if (data.budgetCeiling !== undefined && data.budgetCeiling > 0) {
    const pct = Math.min(100, (data.budgetSpent / data.budgetCeiling) * 100);
    return `Budget: ${formatCost(data.budgetSpent)}/${formatCost(data.budgetCeiling)} (${pct.toFixed(0)}%)`;
  }
  if (data.budgetSpent > 0) {
    return `Spent: ${formatCost(data.budgetSpent)}`;
  }
  return null;
}

function buildExecutionHeadline(data: HealthWidgetData): string {
  const status = data.executionStatus ?? "Active project";
  const target = data.executionTarget ?? data.blocker ?? "loading status…";
  return `  GSD  ${status}${target ? ` — ${target}` : ""}`;
}

/**
 * Build compact health lines for the widget.
 * Returns a string array suitable for setWidget().
 */
export function buildHealthLines(data: HealthWidgetData): string[] {
  if (data.projectState === "none") {
    return ["  GSD  No project loaded — run /gsd to start"];
  }

  if (data.projectState === "initialized") {
    return ["  GSD  Project initialized — run /gsd to continue setup"];
  }

  const lines = [buildExecutionHeadline(data)];
  const details: string[] = [];

  const progress = formatProgress(data.progress);
  if (progress) details.push(progress);

  if (data.providerIssue) details.push(data.providerIssue);

  const environment = formatEnvironmentSummary(
    data.environmentErrorCount,
    data.environmentWarningCount,
  );
  if (environment) details.push(environment);

  const budget = formatBudgetSummary(data);
  if (budget) details.push(budget);

  if (data.eta) details.push(data.eta);

  if (details.length > 0) {
    lines.push(`  ${details.join("  │  ")}`);
  }

  return lines;
}
