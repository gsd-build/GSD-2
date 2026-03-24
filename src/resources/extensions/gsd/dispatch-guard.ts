// GSD Dispatch Guard — prevents out-of-order slice dispatch
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { resolveMilestoneFile, milestonesDir } from "./paths.js";
import { parseRoadmapSlices } from "./roadmap-slices.js";
import { extractMilestoneSeq, milestoneIdSort, findMilestoneIds } from "./guided-flow.js";
import type { RoadmapSliceEntry } from "./types.js";

/** Parse a unit ID string (e.g. "M1/S1/T1") into its milestone, slice, and task components. */
function parseUnitId(unitId: string): { milestone: string; slice?: string; task?: string } {
  const [milestone, slice, task] = unitId.split("/");
  return { milestone: milestone!, slice, task };
}

const SLICE_DISPATCH_TYPES = new Set([
  "research-slice",
  "plan-slice",
  "replan-slice",
  "execute-task",
  "complete-slice",
]);

/**
 * Read a roadmap file from disk (working tree) rather than from a git branch.
 *
 * Prior implementation used `git show <branch>:<path>` which read committed
 * state on a specific branch. This caused false-positive blockers when work
 * was committed on a milestone/worktree branch but the integration branch
 * (main) hadn't been updated yet — the guard would see prior slices as
 * incomplete on main even though they were done in the working tree (#530).
 *
 * Reading from disk always reflects the latest state, regardless of which
 * branch is checked out or whether changes have been committed.
 */
function readRoadmapFromDisk(base: string, milestoneId: string): string | null {
  try {
    const absPath = resolveMilestoneFile(base, milestoneId, "ROADMAP");
    if (!absPath) return null;
    return readFileSync(absPath, "utf-8").trim();
  } catch {
    return null;
  }
}

/**
 * Dependency-aware slice blocker for parallel execution mode.
 *
 * When slice_parallel is enabled, a slice is only blocked if its explicit
 * `depends` entries are not yet complete — NOT by all prior slices.
 * This allows independent slices to run concurrently.
 *
 * Cross-milestone blocking still applies: all slices in prior milestones
 * must be complete before any slice in the current milestone can start.
 */
export function getSliceDependencyBlocker(
  base: string,
  _mainBranch: string,
  unitType: string,
  unitId: string,
): string | null {
  if (!SLICE_DISPATCH_TYPES.has(unitType)) return null;

  const { milestone: targetMid, slice: targetSid } = parseUnitId(unitId);
  if (!targetMid || !targetSid) return null;

  const allIds = findMilestoneIds(base);
  const targetIdx = allIds.indexOf(targetMid);
  if (targetIdx < 0) return null;

  // Cross-milestone blocking: prior milestones must be complete
  const priorMilestones = allIds.slice(0, targetIdx);
  for (const mid of priorMilestones) {
    const parkedFile = resolveMilestoneFile(base, mid, "PARKED");
    if (parkedFile) continue;

    const roadmapContent = readRoadmapFromDisk(base, mid);
    if (!roadmapContent) continue;

    const slices = parseRoadmapSlices(roadmapContent);
    const incomplete = slices.find(slice => !slice.done);
    if (incomplete) {
      return `Cannot dispatch ${unitType} ${unitId}: earlier slice ${mid}/${incomplete.id} is not complete.`;
    }
  }

  // Within the target milestone: only check explicit dependencies
  const roadmapContent = readRoadmapFromDisk(base, targetMid);
  if (!roadmapContent) return null;

  const slices = parseRoadmapSlices(roadmapContent);
  const targetSlice = slices.find(s => s.id === targetSid);
  if (!targetSlice) return null;

  // Build a lookup for quick status checks
  const sliceMap = new Map<string, RoadmapSliceEntry>();
  for (const s of slices) sliceMap.set(s.id, s);

  // Check each explicit dependency
  for (const depId of targetSlice.depends) {
    const dep = sliceMap.get(depId);
    if (dep && !dep.done) {
      return `Cannot dispatch ${unitType} ${unitId}: dependency ${targetMid}/${depId} is not complete.`;
    }
  }

  return null;
}

export function getPriorSliceCompletionBlocker(base: string, _mainBranch: string, unitType: string, unitId: string): string | null {
  if (!SLICE_DISPATCH_TYPES.has(unitType)) return null;

  const [targetMid, targetSid] = unitId.split("/");
  if (!targetMid || !targetSid) return null;

  const targetSeq = extractMilestoneSeq(targetMid);
  if (targetSeq === 0) return null;

  // Scan actual milestone directories instead of iterating by number
  let milestoneIds: string[];
  try {
    milestoneIds = readdirSync(milestonesDir(base), { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const match = d.name.match(/^(M\d+(?:-[a-z0-9]{6})?)/);
        return match ? match[1] : null;
      })
      .filter((id): id is string => id !== null)
      .sort(milestoneIdSort)
      .filter(id => extractMilestoneSeq(id) <= targetSeq);
  } catch {
    return null;
  }

  for (const mid of milestoneIds) {
    // Read from disk (working tree) — always has the latest state
    const roadmapContent = readRoadmapFromDisk(base, mid);
    if (!roadmapContent) continue;

    const slices = parseRoadmapSlices(roadmapContent);
    if (mid !== targetMid) {
      const incomplete = slices.find(slice => !slice.done);
      if (incomplete) {
        return `Cannot dispatch ${unitType} ${unitId}: earlier slice ${mid}/${incomplete.id} is not complete.`;
      }
      continue;
    }

    const targetIndex = slices.findIndex(slice => slice.id === targetSid);
    if (targetIndex === -1) return null;

    const incomplete = slices.slice(0, targetIndex).find(slice => !slice.done);
    if (incomplete) {
      return `Cannot dispatch ${unitType} ${unitId}: earlier slice ${targetMid}/${incomplete.id} is not complete.`;
    }
  }

  return null;
}
