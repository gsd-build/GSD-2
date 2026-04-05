// GSD-FSM Extension — State Extractor
// Bridges GSD state (deriveState, DB, event log) into FSM-compatible structures.

import type { GSDState, Phase, MilestoneRegistryEntry } from "../gsd/types.js";
import { readEvents } from "../gsd/workflow-events.js";
import type { WorkflowEvent } from "../gsd/workflow-events.js";
import { join } from "node:path";

// ─── Types ──────────────────────────────────────────────────────────────

export interface FSMTransition {
  from: string;
  to: string;
  event?: string;
}

export interface GSDFSMSnapshot {
  /** All known GSD phases */
  states: string[];
  /** Valid transitions between phases */
  transitions: FSMTransition[];
  /** Current phase from deriveState */
  currentPhase: Phase;
  /** Milestone registry from deriveState */
  milestones: MilestoneRegistryEntry[];
  /** Active refs */
  activeMilestone: string | null;
  activeSlice: string | null;
  activeTask: string | null;
  /** Progress counters */
  progress: GSDState["progress"] | undefined;
  /** Blockers list */
  blockers: string[];
}

export interface EventTimelineEntry {
  ts: string;
  cmd: string;
  phase?: string;
  milestoneId?: string;
  sliceId?: string;
  taskId?: string;
  sessionId: string;
  dwellMs?: number;
}

// ─── Known GSD Phase Transition Map ─────────────────────────────────────
// Derived from auto-dispatch.ts DISPATCH_RULES analysis.
// This is the canonical set of valid phase transitions in GSD.

const GSD_PHASES: Phase[] = [
  "pre-planning",
  "needs-discussion",
  "discussing",
  "researching",
  "planning",
  "evaluating-gates",
  "executing",
  "replanning-slice",
  "summarizing",
  "advancing",
  "validating-milestone",
  "completing-milestone",
  "complete",
  "blocked",
  "paused",
  "verifying",
];

const GSD_TRANSITIONS: FSMTransition[] = [
  { from: "pre-planning", to: "needs-discussion", event: "CONTEXT_DRAFT" },
  { from: "pre-planning", to: "researching", event: "no_research" },
  { from: "pre-planning", to: "planning", event: "CONTEXT_ready" },
  { from: "needs-discussion", to: "discussing", event: "discuss_start" },
  { from: "discussing", to: "researching", event: "discuss_complete" },
  { from: "researching", to: "planning", event: "research_complete" },
  { from: "planning", to: "evaluating-gates", event: "gates_pending" },
  { from: "planning", to: "executing", event: "PLAN_ready" },
  { from: "evaluating-gates", to: "executing", event: "gates_pass" },
  { from: "executing", to: "replanning-slice", event: "blocker_discovered" },
  { from: "executing", to: "summarizing", event: "all_tasks_complete" },
  { from: "replanning-slice", to: "executing", event: "replan_complete" },
  { from: "summarizing", to: "advancing", event: "slice_SUMMARY" },
  { from: "advancing", to: "planning", event: "next_slice" },
  { from: "advancing", to: "validating-milestone", event: "all_slices_complete" },
  { from: "validating-milestone", to: "completing-milestone", event: "validation_terminal" },
  { from: "completing-milestone", to: "complete", event: "milestone_SUMMARY" },
  // Any phase can transition to blocked/paused
  { from: "planning", to: "blocked", event: "deps_unmet" },
  { from: "executing", to: "blocked", event: "deps_unmet" },
  { from: "blocked", to: "planning", event: "deps_resolved" },
];

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Extract FSM snapshot from a live GSDState.
 * No I/O — operates on an already-derived state object.
 */
export function extractFSMSnapshot(state: GSDState): GSDFSMSnapshot {
  return {
    states: [...GSD_PHASES],
    transitions: [...GSD_TRANSITIONS],
    currentPhase: state.phase,
    milestones: state.registry,
    activeMilestone: state.activeMilestone?.id ?? null,
    activeSlice: state.activeSlice?.id ?? null,
    activeTask: state.activeTask?.id ?? null,
    progress: state.progress,
    blockers: state.blockers,
  };
}

/**
 * Get the known GSD phases (for diagram generation without live state).
 */
export function getGSDPhases(): Phase[] {
  return [...GSD_PHASES];
}

/**
 * Get the known GSD transitions (for diagram generation without live state).
 */
export function getGSDTransitions(): FSMTransition[] {
  return [...GSD_TRANSITIONS];
}

/**
 * Parse event log into a timeline with dwell-time calculations.
 * Events are sorted by timestamp. Dwell time is the gap between consecutive events.
 */
export function buildEventTimeline(
  basePath: string,
  opts?: { milestoneId?: string; limit?: number },
): EventTimelineEntry[] {
  const logPath = join(basePath, ".gsd", "event-log.jsonl");
  const events = readEvents(logPath);

  let filtered = events;
  if (opts?.milestoneId) {
    filtered = events.filter(
      (e) => (e.params as Record<string, unknown>).milestoneId === opts.milestoneId,
    );
  }

  // Sort by timestamp
  filtered.sort((a, b) => a.ts.localeCompare(b.ts));

  const timeline: EventTimelineEntry[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const e = filtered[i];
    const params = e.params as Record<string, unknown>;
    const entry: EventTimelineEntry = {
      ts: e.ts,
      cmd: e.cmd,
      phase: params.phase as string | undefined,
      milestoneId: params.milestoneId as string | undefined,
      sliceId: params.sliceId as string | undefined,
      taskId: params.taskId as string | undefined,
      sessionId: e.session_id,
    };

    // Calculate dwell time from previous event
    if (i > 0) {
      const prev = new Date(filtered[i - 1].ts).getTime();
      const curr = new Date(e.ts).getTime();
      entry.dwellMs = curr - prev;
    }

    timeline.push(entry);
  }

  if (opts?.limit && timeline.length > opts.limit) {
    return timeline.slice(-opts.limit);
  }

  return timeline;
}

/**
 * Detect anomalies in the event timeline.
 */
export function detectAnomalies(
  timeline: EventTimelineEntry[],
  opts?: { dwellThresholdMs?: number },
): string[] {
  const threshold = opts?.dwellThresholdMs ?? 300_000; // 5 minutes default
  const anomalies: string[] = [];

  // Long dwell times
  for (const entry of timeline) {
    if (entry.dwellMs && entry.dwellMs > threshold) {
      const mins = Math.round(entry.dwellMs / 60_000);
      anomalies.push(`Long dwell: ${mins}m before ${entry.cmd} at ${entry.ts}`);
    }
  }

  // Replan loops — same slice replanned more than once
  const replanCounts = new Map<string, number>();
  for (const entry of timeline) {
    if (entry.cmd === "replan_slice" && entry.sliceId) {
      const key = `${entry.milestoneId}/${entry.sliceId}`;
      replanCounts.set(key, (replanCounts.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of replanCounts) {
    if (count > 1) {
      anomalies.push(`Replan loop: ${key} replanned ${count} times`);
    }
  }

  // Repeated failures — same command failing consecutively
  const consecutiveFailures = new Map<string, number>();
  let lastCmd = "";
  for (const entry of timeline) {
    if (entry.cmd === lastCmd) {
      consecutiveFailures.set(entry.cmd, (consecutiveFailures.get(entry.cmd) ?? 1) + 1);
    } else {
      lastCmd = entry.cmd;
    }
  }
  for (const [cmd, count] of consecutiveFailures) {
    if (count >= 3) {
      anomalies.push(`Repeated: ${cmd} appeared ${count} consecutive times`);
    }
  }

  return anomalies;
}
