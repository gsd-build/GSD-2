import { readdirSync } from "node:fs";

import { milestonesDir } from "./paths.js";

/** Matches both classic `M001` and unique `M001-abc123` formats (anchored). */
export const MILESTONE_ID_RE = /^M\d{3}(?:-[a-z0-9]{6})?$/;

/** Extract the trailing sequential number from a milestone ID. Returns 0 for non-matches. */
export function extractMilestoneSeq(id: string): number {
  const match = id.match(/^M(\d{3})(?:-[a-z0-9]{6})?$/);
  return match ? parseInt(match[1], 10) : 0;
}

/** Comparator for sorting milestone IDs by sequential number. */
export function milestoneIdSort(a: string, b: string): number {
  return extractMilestoneSeq(a) - extractMilestoneSeq(b);
}

export function findMilestoneIds(basePath: string): string[] {
  const dir = milestonesDir(basePath);
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const match = entry.name.match(/^(M\d+(?:-[a-z0-9]{6})?)/);
        return match ? match[1] : entry.name;
      })
      .sort(milestoneIdSort);
  } catch {
    return [];
  }
}
