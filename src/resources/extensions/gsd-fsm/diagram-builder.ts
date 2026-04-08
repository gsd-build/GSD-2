// GSD-FSM Extension — Diagram Builder
// Generates Mermaid stateDiagram-v2 from GSD FSM snapshots.

import type { GSDFSMSnapshot, FSMTransition } from "./state-extractor.js";
import type { Phase, MilestoneRegistryEntry } from "../gsd/types.js";

// ─── Types ──────────────────────────────────────────────────────────────

export interface DiagramOptions {
  /** Layout direction (default: TB) */
  direction?: "TB" | "LR";
  /** Whether to highlight current phase (default: true) */
  highlightCurrent?: boolean;
  /** Whether to include milestone status sidebar (default: true) */
  includeMilestones?: boolean;
  /** Optional title override */
  title?: string;
}

// ─── Phase Display Names ────────────────────────────────────────────────

const PHASE_LABELS: Record<string, string> = {
  "pre-planning": "Pre-Planning",
  "needs-discussion": "Needs Discussion",
  "discussing": "Discussing",
  "researching": "Researching",
  "planning": "Planning",
  "evaluating-gates": "Evaluating Gates",
  "executing": "Executing",
  "replanning-slice": "Replanning Slice",
  "summarizing": "Summarizing",
  "advancing": "Advancing",
  "validating-milestone": "Validating Milestone",
  "completing-milestone": "Completing Milestone",
  "complete": "Complete",
  "blocked": "Blocked",
  "paused": "Paused",
  "verifying": "Verifying",
};

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Build a Mermaid stateDiagram-v2 from a GSD FSM snapshot.
 * Highlights the current phase and annotates with milestone progress.
 */
export function buildPhaseDiagram(
  snapshot: GSDFSMSnapshot,
  opts: DiagramOptions = {},
): string {
  const { direction = "TB", highlightCurrent = true, title } = opts;
  const lines: string[] = [];

  lines.push("```mermaid");
  lines.push("stateDiagram-v2");
  if (title) {
    lines.push(`    title: ${title}`);
  }
  lines.push(`    direction ${direction}`);
  lines.push("");

  // Define states with labels
  for (const phase of snapshot.states) {
    const safeId = sanitizeId(phase);
    const label = PHASE_LABELS[phase] ?? phase;
    lines.push(`    ${safeId} : ${label}`);
  }
  lines.push("");

  // Start marker
  lines.push(`    [*] --> ${sanitizeId("pre-planning")}`);

  // End marker
  lines.push(`    ${sanitizeId("complete")} --> [*]`);
  lines.push("");

  // Transitions
  for (const t of snapshot.transitions) {
    const from = sanitizeId(t.from);
    const to = sanitizeId(t.to);
    const label = t.event ? ` : ${t.event}` : "";
    lines.push(`    ${from} --> ${to}${label}`);
  }
  lines.push("");

  // Highlight current phase
  if (highlightCurrent && snapshot.currentPhase) {
    const currentId = sanitizeId(snapshot.currentPhase);
    lines.push(`    classDef active fill:#4CAF50,color:#fff,stroke:#333,stroke-width:2px`);
    lines.push(`    class ${currentId} active`);
  }

  lines.push("```");

  return lines.join("\n");
}

/**
 * Build a milestone progress diagram showing milestone states and dependencies.
 */
export function buildMilestoneDiagram(
  milestones: MilestoneRegistryEntry[],
  activeMilestoneId: string | null,
): string {
  if (milestones.length === 0) {
    return "No milestones found.";
  }

  const lines: string[] = [];
  lines.push("```mermaid");
  lines.push("stateDiagram-v2");
  lines.push("    direction LR");
  lines.push("");

  // Define milestone states
  for (const m of milestones) {
    const safeId = sanitizeId(m.id);
    const statusIcon = milestoneStatusIcon(m.status);
    lines.push(`    ${safeId} : ${m.id} ${statusIcon} ${m.title}`);
  }
  lines.push("");

  // Start → first milestone
  if (milestones.length > 0) {
    lines.push(`    [*] --> ${sanitizeId(milestones[0].id)}`);
  }

  // Dependencies and sequential flow
  for (const m of milestones) {
    if (m.dependsOn && m.dependsOn.length > 0) {
      for (const dep of m.dependsOn) {
        lines.push(`    ${sanitizeId(dep)} --> ${sanitizeId(m.id)} : depends`);
      }
    }
  }

  // Last complete → end
  const lastComplete = [...milestones].reverse().find((m) => m.status === "complete");
  if (lastComplete) {
    lines.push(`    ${sanitizeId(lastComplete.id)} --> [*]`);
  }
  lines.push("");

  // Style classes
  lines.push(`    classDef active fill:#4CAF50,color:#fff,stroke:#333,stroke-width:2px`);
  lines.push(`    classDef complete fill:#2196F3,color:#fff,stroke:#333`);
  lines.push(`    classDef pending fill:#FFC107,color:#000,stroke:#333`);
  lines.push(`    classDef parked fill:#9E9E9E,color:#fff,stroke:#333`);

  for (const m of milestones) {
    const safeId = sanitizeId(m.id);
    if (m.id === activeMilestoneId) {
      lines.push(`    class ${safeId} active`);
    } else if (m.status === "complete") {
      lines.push(`    class ${safeId} complete`);
    } else if (m.status === "parked") {
      lines.push(`    class ${safeId} parked`);
    } else if (m.status === "pending") {
      lines.push(`    class ${safeId} pending`);
    }
  }

  lines.push("```");

  return lines.join("\n");
}

/**
 * Build a plain-text status summary from a GSD FSM snapshot.
 */
export function buildStatusSummary(snapshot: GSDFSMSnapshot): string {
  const lines: string[] = [];

  lines.push("## GSD State Machine Status");
  lines.push("");
  lines.push(`**Phase:** ${PHASE_LABELS[snapshot.currentPhase] ?? snapshot.currentPhase}`);

  if (snapshot.activeMilestone) {
    lines.push(`**Active Milestone:** ${snapshot.activeMilestone}`);
  }
  if (snapshot.activeSlice) {
    lines.push(`**Active Slice:** ${snapshot.activeSlice}`);
  }
  if (snapshot.activeTask) {
    lines.push(`**Active Task:** ${snapshot.activeTask}`);
  }

  if (snapshot.progress) {
    lines.push("");
    lines.push("### Progress");
    const p = snapshot.progress;
    lines.push(`- Milestones: ${p.milestones.done}/${p.milestones.total}`);
    if (p.slices) {
      lines.push(`- Slices: ${p.slices.done}/${p.slices.total}`);
    }
    if (p.tasks) {
      lines.push(`- Tasks: ${p.tasks.done}/${p.tasks.total}`);
    }
  }

  if (snapshot.blockers.length > 0) {
    lines.push("");
    lines.push("### Blockers");
    for (const b of snapshot.blockers) {
      lines.push(`- ${b}`);
    }
  }

  if (snapshot.milestones.length > 0) {
    lines.push("");
    lines.push("### Milestones");
    for (const m of snapshot.milestones) {
      const icon = milestoneStatusIcon(m.status);
      lines.push(`- ${icon} **${m.id}** ${m.title} (${m.status})`);
    }
  }

  return lines.join("\n");
}

// ─── Internal ───────────────────────────────────────────────────────────

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function milestoneStatusIcon(status: string): string {
  switch (status) {
    case "complete": return "[done]";
    case "active": return "[>>>]";
    case "pending": return "[...]";
    case "parked": return "[parked]";
    default: return `[${status}]`;
  }
}
