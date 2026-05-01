// Delegation policy — codifies which GSD MCP tools are safe to run as
// background sub-agents while the foreground /gsd flow continues. Verdicts
// are derived from the round-1 and round-2 evaluations recorded in this
// branch's PR description; the rationale field on each entry preserves
// the reason so future changes have to revisit the analysis explicitly.
//
// Default-deny: unknown tools are never backgroundable.

export type BackgroundabilityVerdict = "good" | "risky" | "no";

export interface DelegationPolicyEntry {
  /** Canonical MCP tool name (the verb_object form, e.g. `gsd_plan_slice`). */
  toolName: string;
  /** Workflow unit type from auto-dispatch.ts, when one exists. */
  unitType?: string;
  verdict: BackgroundabilityVerdict;
  /** One-line justification grounded in the evaluation findings. */
  rationale: string;
  /**
   * Constraints the caller MUST satisfy when dispatching this unit in the
   * background. Only populated for `good` and conditional `risky` entries.
   */
  constraints?: string[];
}

const POLICY: Record<string, DelegationPolicyEntry> = {
  gsd_plan_slice: {
    toolName: "gsd_plan_slice",
    unitType: "plan-slice",
    verdict: "good",
    rationale:
      "Self-contained, no user prompts, atomic DB tx; existing slice-parallel-orchestrator pattern transfers cleanly.",
    constraints: [
      "Lock the slice from further user discussion once dispatched (context is frozen at dispatch time).",
      "Foreground must not derive state for that slice while the transaction is in flight.",
      "Foreground must await background completion before any tool reads the planned tasks/gates.",
    ],
  },
  gsd_execute: {
    toolName: "gsd_execute",
    verdict: "good",
    rationale:
      "No DB writes; UUID-isolated stdout/stderr/meta files; existing reactive-execute parallel-subagent precedent.",
  },
  gsd_validate_milestone: {
    toolName: "gsd_validate_milestone",
    unitType: "validate-milestone",
    verdict: "good",
    rationale:
      "Verdict pre-computed by parallel reviewers; atomic DB tx plus isolated VALIDATION.md write; no user interaction.",
  },
  gsd_reassess_roadmap: {
    toolName: "gsd_reassess_roadmap",
    unitType: "reassess-roadmap",
    verdict: "good",
    rationale:
      "Narrower mutation scope than plan_milestone; structural guards prevent modification of completed slices.",
  },
  gsd_doctor: {
    toolName: "gsd_doctor",
    verdict: "risky",
    rationale:
      "Diagnostic-only mode (fix=false) is safe to background; fix=true writes STATE.md/ROADMAP.md without session-lock coordination and can race the foreground flow.",
    constraints: [
      "Background only with fix=false (diagnostic-only).",
      "Apply fixes synchronously, only when no foreground unit is dispatched.",
    ],
  },
  gsd_plan_milestone: {
    toolName: "gsd_plan_milestone",
    unitType: "plan-milestone",
    verdict: "risky",
    rationale:
      "Inputs require CONTEXT.md from discuss-milestone, so initial questioning is already done by the time it can start; TOCTOU guards and projection coherence make concurrency unsafe.",
  },
  gsd_replan_slice: {
    toolName: "gsd_replan_slice",
    unitType: "replan-slice",
    verdict: "risky",
    rationale:
      "Blocks the replanning→executing state transition on a gate that waits for S##-REPLAN.md; background failure leaves the flow stuck.",
  },
  gsd_plan_task: {
    toolName: "gsd_plan_task",
    verdict: "no",
    rationale:
      "plan-slice prompt explicitly forbids calling gsd_plan_task separately; per-task granularity multiplies manifest writes and projection re-renders with no payoff.",
  },
};

// Alias map keyed on the secondary name; resolves to the canonical entry above.
// Sourced from packages/mcp-server/src/workflow-tools.ts alias registrations
// (gsd_milestone_validate, gsd_roadmap_reassess, gsd_slice_replan, gsd_task_plan).
const ALIASES: Record<string, string> = {
  gsd_milestone_validate: "gsd_validate_milestone",
  gsd_roadmap_reassess: "gsd_reassess_roadmap",
  gsd_slice_replan: "gsd_replan_slice",
  gsd_task_plan: "gsd_plan_task",
};

function resolveCanonical(name: string): string {
  return ALIASES[name] ?? name;
}

export function getDelegationVerdict(toolName: string): DelegationPolicyEntry | null {
  return POLICY[resolveCanonical(toolName)] ?? null;
}

export function isBackgroundable(toolName: string): boolean {
  const entry = getDelegationVerdict(toolName);
  return entry?.verdict === "good";
}

export function listBackgroundableTools(): string[] {
  return Object.values(POLICY)
    .filter((entry) => entry.verdict === "good")
    .map((entry) => entry.toolName)
    .sort();
}

export function getVerdictByUnitType(unitType: string): DelegationPolicyEntry | null {
  for (const entry of Object.values(POLICY)) {
    if (entry.unitType === unitType) return entry;
  }
  return null;
}
