// Delegation policy — codifies which GSD MCP tools are safe to run as
// background sub-agents while the foreground /gsd flow continues. Verdicts
// are derived from the round-1 and round-2 evaluations recorded in this
// branch's PR description; the rationale field on each entry preserves
// the reason so future changes have to revisit the analysis explicitly.
//
// Default-deny: unknown tools are never backgroundable.
//
// ─── Tool-name vs unit-type namespaces ───────────────────────────────────
// Entries are keyed by canonical MCP tool name (`gsd_*`). The optional
// `unitType` field is a *secondary* index for the dispatcher's convenience
// — it bridges this policy to `auto-dispatch.ts`' `DispatchAction.unitType`
// values. The two namespaces are not 1:1:
//
//   - Some tools have no corresponding unit type (e.g. `gsd_doctor`,
//     `gsd_plan_task`) and intentionally omit `unitType`.
//   - Some unit types share a tool — e.g. `execute-task`, `execute-task-simple`,
//     and `reactive-execute` all invoke `gsd_execute`. The current shape
//     allows only one `unitType` per entry, so those units fall through to
//     `getVerdictByUnitType() === null` (→ `backgroundable: false`) even
//     though `gsd_execute` itself is GOOD. This is the intended default-deny
//     posture until a future PR wires actual background dispatch and
//     decides whether each unit-level orchestration is safe — the unit
//     wraps a prompt, harness setup, and post-processing on top of the
//     tool, and the tool's safety doesn't transfer automatically.
//
// Auto-dispatch produces 20 distinct unit types; only 5 are explicitly
// classified here. The other 15 default-deny:
//   complete-milestone, complete-slice, discuss-milestone, discuss-project,
//   discuss-requirements, execute-task, execute-task-simple, gate-evaluate,
//   reactive-execute, refine-slice, research-decision, research-milestone,
//   research-project, research-slice, rewrite-docs, run-uat
//
// Adding a `unitType` mapping (or a future `unitTypes: string[]`) to an
// existing entry is the place to lift any of these out of default-deny
// when the analysis has been done.

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
    // No `unitType` set on purpose — the underlying tool is safe, but the
    // unit-level orchestrations that invoke it (`execute-task`,
    // `execute-task-simple`, `reactive-execute`) wrap additional prompt and
    // harness work whose safety is a separate analysis. Default-deny those
    // units until that analysis is recorded; adding `unitType` here would
    // promote them silently.
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

/**
 * Minimal shape of a dispatch action that the annotator needs to operate on.
 * Matches the `dispatch` and non-dispatch variants of auto-dispatch.ts'
 * DispatchAction without depending on it (so this module stays free of
 * workspace-package transitive imports).
 */
export type AnnotatableDispatchAction =
  | { action: "dispatch"; unitType: string; backgroundable?: boolean; [k: string]: unknown }
  | { action: "stop"; [k: string]: unknown }
  | { action: "skip"; [k: string]: unknown };

/**
 * Annotates a dispatch action in place with `backgroundable: true` when its
 * unitType has a `good` verdict in the policy. Stop/skip actions pass through
 * unchanged. Default-deny: unknown unit types resolve to `false`.
 *
 * **Mutation contract.** The `backgroundable` field is written directly onto
 * the passed action object. This is intentional — every dispatch path in
 * `auto-dispatch.ts` constructs a fresh action object per `where(ctx)` /
 * `evaluateDispatch(ctx)` invocation, so in-place mutation cannot leak across
 * dispatch cycles. Future dispatch rules MUST follow that convention: never
 * cache or share `DispatchAction` objects across calls. If you need to cache,
 * either freeze the cached object (`Object.freeze`) and clone on read, or
 * stop calling `annotateBackgroundable` on the shared instance. The annotator
 * always recomputes from the policy on every call (no internal cache), so
 * repeated invocations on the same object will overwrite stale values
 * deterministically — see the `annotateBackgroundable recomputes on each call`
 * test for the contract pin.
 */
export function annotateBackgroundable<T extends AnnotatableDispatchAction>(action: T): T {
  if (action.action !== "dispatch") return action;
  const verdict = getVerdictByUnitType(action.unitType);
  action.backgroundable = verdict?.verdict === "good";
  return action;
}
