/**
 * GSD Slice Parallel Analysis — Pure functions for dependency DAG and task grouping.
 *
 * These functions operate on in-memory data structures without disk I/O,
 * making them independently testable.
 */

import type { RoadmapSliceEntry, SlicePlan } from "./types.js";

// ─── Types ────────────────────────────────────────────────────────────────

export interface SliceParallelGroup {
  /** Wave number (0-based). Slices in the same wave can run concurrently. */
  wave: number;
  /** Slice IDs in this wave. */
  sliceIds: string[];
}

export interface TaskParallelGroup {
  /** Group number (0-based). Tasks in the same group can run concurrently. */
  group: number;
  /** Task IDs in this group. */
  taskIds: string[];
}

export interface SliceEligibilityResult {
  sliceId: string;
  title: string;
  eligible: boolean;
  reason: string;
}

// ─── Dependency DAG ───────────────────────────────────────────────────────

/**
 * Build a dependency DAG from roadmap slice entries.
 * Returns a map of sliceId → set of sliceIds it depends on.
 */
export function buildDependencyDAG(
  slices: RoadmapSliceEntry[],
): Map<string, Set<string>> {
  const dag = new Map<string, Set<string>>();
  for (const slice of slices) {
    dag.set(slice.id, new Set(slice.depends));
  }
  return dag;
}

/**
 * Topological sort of slices into parallel waves.
 * Each wave contains slices whose dependencies are all satisfied by
 * previous waves. Slices within a wave can run concurrently.
 */
export function computeParallelWaves(
  slices: RoadmapSliceEntry[],
): SliceParallelGroup[] {
  const dag = buildDependencyDAG(slices);
  const assigned = new Set<string>();
  const waves: SliceParallelGroup[] = [];

  // Skip already-done slices from the start
  for (const s of slices) {
    if (s.done) assigned.add(s.id);
  }

  let wave = 0;
  let remaining = slices.filter(s => !s.done);

  while (remaining.length > 0) {
    const ready: string[] = [];
    for (const s of remaining) {
      const deps = dag.get(s.id) ?? new Set();
      const allDepsSatisfied = [...deps].every(d => assigned.has(d));
      if (allDepsSatisfied) {
        ready.push(s.id);
      }
    }

    if (ready.length === 0) break; // circular dependency or all blocked

    waves.push({ wave, sliceIds: ready });
    for (const id of ready) assigned.add(id);
    remaining = remaining.filter(s => !assigned.has(s.id));
    wave++;
  }

  return waves;
}

/**
 * Analyze slice eligibility from in-memory slice data.
 * Returns eligibility results for each slice.
 */
export function analyzeSliceEligibility(
  slices: RoadmapSliceEntry[],
): SliceEligibilityResult[] {
  const dag = buildDependencyDAG(slices);
  const doneSet = new Set(slices.filter(s => s.done).map(s => s.id));
  const results: SliceEligibilityResult[] = [];

  for (const slice of slices) {
    if (slice.done) {
      results.push({
        sliceId: slice.id, title: slice.title,
        eligible: false, reason: "Already complete.",
      });
      continue;
    }

    const deps = dag.get(slice.id) ?? new Set();
    const unsatisfied = [...deps].filter(d => !doneSet.has(d));

    if (unsatisfied.length > 0) {
      results.push({
        sliceId: slice.id, title: slice.title,
        eligible: false,
        reason: `Blocked by incomplete dependencies: ${unsatisfied.join(", ")}.`,
      });
    } else {
      results.push({
        sliceId: slice.id, title: slice.title,
        eligible: true, reason: "All dependencies satisfied.",
      });
    }
  }

  return results;
}

// ─── Task-Level Parallelism ───────────────────────────────────────────────

/**
 * Group tasks within a slice plan by file overlap.
 * Tasks with no file annotations are placed in their own sequential group.
 */
export function groupTasksByFileOverlap(plan: SlicePlan): TaskParallelGroup[] {
  const tasks = plan.tasks.filter(t => !t.done);
  if (tasks.length === 0) return [];

  const annotated = tasks.filter(t => t.files && t.files.length > 0);
  const unannotated = tasks.filter(t => !t.files || t.files.length === 0);

  // Build file → task mapping
  const fileToTasks = new Map<string, Set<string>>();
  for (const task of annotated) {
    for (const file of task.files!) {
      if (!fileToTasks.has(file)) fileToTasks.set(file, new Set());
      fileToTasks.get(file)!.add(task.id);
    }
  }

  // Build conflict graph
  const conflicts = new Map<string, Set<string>>();
  for (const task of annotated) {
    conflicts.set(task.id, new Set());
  }
  for (const [, taskIds] of fileToTasks) {
    const ids = [...taskIds];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        conflicts.get(ids[i])!.add(ids[j]);
        conflicts.get(ids[j])!.add(ids[i]);
      }
    }
  }

  // Greedy coloring
  const groups: TaskParallelGroup[] = [];
  const assignedTasks = new Set<string>();
  const remainingIds = [...annotated.map(t => t.id)];
  let groupIdx = 0;

  while (remainingIds.length > 0) {
    const group: string[] = [];
    const groupConflicts = new Set<string>();

    for (const id of remainingIds) {
      if (!groupConflicts.has(id)) {
        group.push(id);
        assignedTasks.add(id);
        for (const conflict of conflicts.get(id) ?? []) {
          groupConflicts.add(conflict);
        }
      }
    }

    if (group.length > 0) {
      groups.push({ group: groupIdx++, taskIds: group });
    }

    remainingIds.splice(0, remainingIds.length, ...remainingIds.filter(id => !assignedTasks.has(id)));
  }

  // Unannotated tasks get individual groups (conservative)
  for (const task of unannotated) {
    groups.push({ group: groupIdx++, taskIds: [task.id] });
  }

  return groups;
}

// ─── Formatting ───────────────────────────────────────────────────────────

export function formatSliceEligibilityReport(
  milestoneId: string,
  results: SliceEligibilityResult[],
): string {
  const eligible = results.filter(r => r.eligible);
  const ineligible = results.filter(r => !r.eligible);
  const lines: string[] = [];

  lines.push(`# Slice Parallel Eligibility — ${milestoneId}`);
  lines.push("");
  lines.push(`## Eligible for Parallel Execution (${eligible.length})`);
  lines.push("");
  if (eligible.length === 0) {
    lines.push("No slices are currently eligible for parallel execution.");
  } else {
    for (const e of eligible) {
      lines.push(`- **${e.sliceId}** — ${e.title}: ${e.reason}`);
    }
  }
  lines.push("");

  if (ineligible.length > 0) {
    lines.push(`## Not Eligible (${ineligible.length})`);
    lines.push("");
    for (const e of ineligible) {
      lines.push(`- **${e.sliceId}** — ${e.title}: ${e.reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
