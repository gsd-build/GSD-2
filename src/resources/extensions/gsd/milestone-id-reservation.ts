import { isDbAvailable, getAllMilestones } from "./gsd-db.js";
import {
  getReservedMilestoneIds,
  milestoneIdSort,
  nextMilestoneId,
  reserveMilestoneId,
} from "./milestone-ids.js";
import { isReusableGhostMilestone } from "./state.js";

function getDatabaseMilestoneIds(): string[] {
  if (!isDbAvailable()) return [];
  return getAllMilestones().map((milestone) => milestone.id);
}

/**
 * Generate the next milestone ID, accounting for DB rows and in-process
 * reservations, and reserve it.
 */
export function nextMilestoneIdReserved(
  existingIds: string[],
  uniqueEnabled: boolean,
  basePath?: string,
): string {
  const reservedIds = getReservedMilestoneIds();
  const allIds = [
    ...new Set([
      ...existingIds,
      ...reservedIds,
      ...getDatabaseMilestoneIds(),
    ]),
  ];

  if (basePath) {
    const sorted = [...allIds].sort(milestoneIdSort);
    for (const candidate of sorted) {
      if (reservedIds.has(candidate)) continue;
      if (isReusableGhostMilestone(basePath, candidate)) {
        reserveMilestoneId(candidate);
        return candidate;
      }
    }
  }

  const id = nextMilestoneId(allIds, uniqueEnabled);
  reserveMilestoneId(id);
  return id;
}
