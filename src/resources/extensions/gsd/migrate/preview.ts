// GSD Migration Preview — Pre-write statistics
// Pure function, no I/O. Computes counts from a GSDProject.

import type { GSDProject } from './types.js';
import type { MigrationPreview } from './writer.js';

/**
 * Compute pre-write statistics from a GSDProject without performing I/O.
 * Used to show the user what a migration will produce before writing anything.
 */
export function generatePreview(project: GSDProject): MigrationPreview {
  let totalSlices = 0;
  let totalTasks = 0;
  let doneSlices = 0;
  let doneTasks = 0;

  for (const milestone of project.milestones) {
    for (const slice of milestone.slices) {
      totalSlices++;
      if (slice.done) doneSlices++;
      for (const task of slice.tasks) {
        totalTasks++;
        if (task.done) doneTasks++;
      }
    }
  }

  const reqCounts = { active: 0, validated: 0, deferred: 0, outOfScope: 0, total: 0 };
  for (const req of project.requirements) {
    const status = req.status.toLowerCase();
    if (status === 'active') reqCounts.active++;
    else if (status === 'validated') reqCounts.validated++;
    else if (status === 'deferred') reqCounts.deferred++;
    else if (status === 'out-of-scope') reqCounts.outOfScope++;
    reqCounts.total++;
  }

  return {
    milestoneCount: project.milestones.length,
    totalSlices,
    totalTasks,
    doneSlices,
    doneTasks,
    sliceCompletionPct: totalSlices > 0 ? Math.round((doneSlices / totalSlices) * 100) : 0,
    taskCompletionPct: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
    requirements: reqCounts,
  };
}
