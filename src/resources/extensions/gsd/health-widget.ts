/**
 * GSD Health Widget — always-on ambient health signal rendered belowEditor.
 *
 * Shows a compact 1-2 line summary: progress score, budget, provider key
 * status, and doctor/environment issue count. Refreshes every 60 seconds.
 * Quiet when everything is healthy; turns amber/red when issues arise.
 *
 * Widget key: "gsd-health", placement: "belowEditor"
 */

import type { ExtensionContext } from "@gsd/pi-coding-agent";
import type { GSDState } from "./types.js";
import { runProviderChecks, summariseProviderIssues } from "./doctor-providers.js";
import { runEnvironmentChecks } from "./doctor-environment.js";
import { loadEffectiveGSDPreferences } from "./preferences.js";
import { loadLedgerFromDisk, getProjectTotals } from "./metrics.js";
import { describeNextUnit, estimateTimeRemaining, updateSliceProgressCache } from "./auto-dashboard.js";
import { computeProgressScore } from "./progress-score.js";
import { projectRoot } from "./commands.js";
import { deriveState, invalidateStateCache } from "./state.js";
import {
  buildHealthLines,
  detectHealthWidgetProjectState,
  type HealthWidgetData,
} from "./health-widget-core.js";

// ── Data loader ────────────────────────────────────────────────────────────────

function loadBaseHealthWidgetData(basePath: string): HealthWidgetData {
  let budgetCeiling: number | undefined;
  let budgetSpent = 0;
  let providerIssue: string | null = null;
  let environmentErrorCount = 0;
  let environmentWarningCount = 0;

  const projectState = detectHealthWidgetProjectState(basePath);

  try {
    const prefs = loadEffectiveGSDPreferences();
    budgetCeiling = prefs?.preferences?.budget_ceiling;

    const ledger = loadLedgerFromDisk(basePath);
    if (ledger) {
      const totals = getProjectTotals(ledger.units ?? []);
      budgetSpent = totals.cost;
    }
  } catch { /* non-fatal */ }

  try {
    const providerResults = runProviderChecks();
    providerIssue = summariseProviderIssues(providerResults);
  } catch { /* non-fatal */ }

  try {
    const envResults = runEnvironmentChecks(basePath);
    for (const r of envResults) {
      if (r.status === "error") environmentErrorCount++;
      else if (r.status === "warning") environmentWarningCount++;
    }
  } catch { /* non-fatal */ }

  return {
    projectState,
    budgetCeiling,
    budgetSpent,
    providerIssue,
    environmentErrorCount,
    environmentWarningCount,
    lastRefreshed: Date.now(),
  };
}

function compactText(text: string, max = 64): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function summarizeExecutionStatus(state: GSDState): string {
  if (state.phase === "blocked") return "Blocked";
  if (state.phase === "paused") return "Paused";
  if (state.phase === "complete") return "Complete";

  const score = computeProgressScore();
  return score.summary.split(" — ")[0] ?? score.summary;
}

function summarizeExecutionTarget(state: GSDState): string {
  switch (state.phase) {
    case "needs-discussion":
      return state.activeMilestone ? `Discuss ${state.activeMilestone.id}` : "Discuss milestone draft";
    case "pre-planning":
      return state.activeMilestone ? `Plan ${state.activeMilestone.id}` : "Research & plan milestone";
    case "planning":
      return state.activeSlice ? `Plan ${state.activeSlice.id}` : "Plan next slice";
    case "executing":
      return state.activeTask ? `Execute ${state.activeTask.id}` : "Execute next task";
    case "summarizing":
      return state.activeSlice ? `Complete ${state.activeSlice.id}` : "Complete current slice";
    case "validating-milestone":
      return state.activeMilestone ? `Validate ${state.activeMilestone.id}` : "Validate milestone";
    case "completing-milestone":
      return state.activeMilestone ? `Complete ${state.activeMilestone.id}` : "Complete milestone";
    case "replanning-slice":
      return state.activeSlice ? `Replan ${state.activeSlice.id}` : "Replan current slice";
    case "blocked":
      return `waiting on ${compactText(state.blockers[0] ?? state.nextAction, 56)}`;
    case "paused":
      return compactText(state.nextAction || "waiting to resume", 56);
    case "complete":
      return "All milestones complete";
    default:
      return compactText(describeNextUnit(state).label, 56);
  }
}

async function enrichHealthWidgetData(basePath: string, baseData: HealthWidgetData): Promise<HealthWidgetData> {
  if (baseData.projectState !== "active") return baseData;

  try {
    invalidateStateCache();
    const state = await deriveState(basePath);

    if (state.activeMilestone) {
      updateSliceProgressCache(basePath, state.activeMilestone.id, state.activeSlice?.id);
    }

    return {
      ...baseData,
      executionPhase: state.phase,
      executionStatus: summarizeExecutionStatus(state),
      executionTarget: summarizeExecutionTarget(state),
      nextAction: state.nextAction,
      blocker: state.blockers[0] ?? null,
      activeMilestoneId: state.activeMilestone?.id,
      activeSliceId: state.activeSlice?.id,
      activeTaskId: state.activeTask?.id,
      progress: state.progress,
      eta: state.phase === "blocked" || state.phase === "paused" || state.phase === "complete"
        ? null
        : estimateTimeRemaining(),
    };
  } catch {
    return baseData;
  }
}

// ── Widget init ────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 60_000;

/**
 * Initialize the always-on gsd-health widget (belowEditor).
 * Call once from the extension entry point after context is available.
 */
export function initHealthWidget(ctx: ExtensionContext): void {
  if (!ctx.hasUI) return;

  const basePath = projectRoot();

  // String-array fallback — used in RPC mode (factory is a no-op there)
  const initialData = loadBaseHealthWidgetData(basePath);
  ctx.ui.setWidget("gsd-health", buildHealthLines(initialData), { placement: "belowEditor" });

  // Factory-based widget for TUI mode — replaces the string-array above
  ctx.ui.setWidget("gsd-health", (_tui, _theme) => {
    let data = initialData;
    let cachedLines: string[] | undefined;
    let refreshInFlight = false;

    const refresh = async () => {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        const baseData = loadBaseHealthWidgetData(basePath);
        data = await enrichHealthWidgetData(basePath, baseData);
        cachedLines = undefined;
        _tui.requestRender();
      } catch { /* non-fatal */ }
      finally {
        refreshInFlight = false;
      }
    };

    void refresh();

    const refreshTimer = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    return {
      render(_width: number): string[] {
        if (!cachedLines) cachedLines = buildHealthLines(data);
        return cachedLines;
      },
      invalidate(): void { cachedLines = undefined; },
      dispose(): void {
        clearInterval(refreshTimer);
      },
    };
  }, { placement: "belowEditor" });
}
