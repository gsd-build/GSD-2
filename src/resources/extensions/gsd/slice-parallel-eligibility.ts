/**
 * GSD Slice Parallel Eligibility — Slice/task parallelism analysis.
 *
 * Combines pure analysis functions (from slice-parallel-analysis.ts) with
 * disk-based functions that read roadmap/plan files.
 *
 * Reuses patterns from parallel-eligibility.ts but operates at
 * slice/task level instead of milestone level.
 */

import { resolveMilestoneFile, resolveSliceFile } from "./paths.js";
import { parseRoadmapSlices } from "./roadmap-slices.js";
import { loadFile, parsePlan } from "./files.js";
import { readFileSync } from "node:fs";

// Re-export pure functions and types from the analysis module
export {
  buildDependencyDAG,
  computeParallelWaves,
  analyzeSliceEligibility,
  groupTasksByFileOverlap,
  formatSliceEligibilityReport,
} from "./slice-parallel-analysis.js";

export type {
  SliceParallelGroup,
  TaskParallelGroup,
  SliceEligibilityResult,
} from "./slice-parallel-analysis.js";

import { analyzeSliceEligibility } from "./slice-parallel-analysis.js";
import type { SliceEligibilityResult, TaskParallelGroup } from "./slice-parallel-analysis.js";

// ─── Disk-Based Functions ─────────────────────────────────────────────────

/**
 * Find slices within a milestone that can currently run in parallel.
 * Reads the roadmap from disk and delegates to analyzeSliceEligibility.
 */
export function findParallelSlices(
  basePath: string,
  milestoneId: string,
): SliceEligibilityResult[] {
  const roadmapPath = resolveMilestoneFile(basePath, milestoneId, "ROADMAP");
  if (!roadmapPath) return [];

  let content: string;
  try {
    content = readFileSync(roadmapPath, "utf-8").trim();
  } catch {
    return [];
  }

  const slices = parseRoadmapSlices(content);
  if (slices.length === 0) return [];

  return analyzeSliceEligibility(slices);
}

/**
 * Get only the eligible slice IDs from findParallelSlices.
 */
export function getEligibleSliceIds(
  basePath: string,
  milestoneId: string,
): string[] {
  return findParallelSlices(basePath, milestoneId)
    .filter(r => r.eligible)
    .map(r => r.sliceId);
}

/**
 * Within a single slice, identify tasks that can run in parallel.
 * Reads the slice plan from disk and delegates to groupTasksByFileOverlap.
 */
export async function findParallelTasks(
  basePath: string,
  milestoneId: string,
  sliceId: string,
): Promise<TaskParallelGroup[]> {
  const planPath = resolveSliceFile(basePath, milestoneId, sliceId, "PLAN");
  if (!planPath) return [];

  const planContent = await loadFile(planPath);
  if (!planContent) return [];

  const plan = parsePlan(planContent);
  const { groupTasksByFileOverlap } = await import("./slice-parallel-analysis.js");
  return groupTasksByFileOverlap(plan);
}

/**
 * Collect all filesLikelyTouched for a slice from its plan file.
 * Used for conflict detection before parallel spawning.
 */
export async function collectSliceFiles(
  basePath: string,
  milestoneId: string,
  sliceId: string,
): Promise<string[]> {
  const planPath = resolveSliceFile(basePath, milestoneId, sliceId, "PLAN");
  if (!planPath) return [];

  const planContent = await loadFile(planPath);
  if (!planContent) return [];

  const plan = parsePlan(planContent);
  return plan.filesLikelyTouched;
}
