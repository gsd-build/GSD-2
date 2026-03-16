/**
 * CI check: verify all committed GSD milestones use the unique naming convention.
 *
 * Milestone IDs must follow the format M001-abc123 (with a 6-char random suffix)
 * instead of bare M001. This prevents milestone directory collisions when
 * multiple team members work on different milestones simultaneously.
 *
 * Uses findMilestoneIds() and parseMilestoneId() from GSD's own guided-flow.ts
 * so the check stays in sync with any future changes to ID parsing or format.
 *
 * Exit 0 = all milestones use the unique naming convention (or no milestones exist).
 * Exit 1 = one or more milestones use the old bare naming convention.
 */

import { findMilestoneIds, parseMilestoneId } from "../guided-flow.js";

const basePath = process.cwd();
const milestoneIds = findMilestoneIds(basePath);

if (milestoneIds.length === 0) {
  console.log("✓ No GSD milestones found — nothing to check.");
  process.exit(0);
}

const bare = milestoneIds.filter((id) => !parseMilestoneId(id).suffix);

if (bare.length === 0) {
  console.log(
    `✓ All ${milestoneIds.length} GSD milestone(s) use the unique naming convention.`,
  );
  process.exit(0);
}

console.error(
  `✗ ${bare.length} of ${milestoneIds.length} milestone(s) use the old bare naming convention:\n`,
);
for (const id of bare) {
  console.error(`  ${id}  →  should be: ${id}-<6chars> (e.g. ${id}-a1b2c3)`);
}

console.error(`
This project requires unique milestone IDs (e.g. M001-a1b2c3 instead of M001)
to prevent collisions when multiple people work on milestones simultaneously.

To fix this, follow the migration guide:
  https://github.com/gsd-build/gsd-2#migrating-an-existing-git-ignored-gsd-folder

Quick steps:
  1. Ensure you are not in the middle of any milestones (clean state)
  2. Ensure .gsd/preferences.md contains unique_milestone_ids: true
  3. Run this prompt in GSD to rename all existing milestones:

     I have turned on unique milestone ids, please update all old milestone
     ids to use this new format e.g. M001-abc123 where abc123 is a random
     6 char lowercase alpha numeric string. Update all references in all
     .gsd file contents, file names and directory names. Validate your work
     once done to ensure referential integrity.

  4. Commit the renamed milestones to git`);

process.exit(1);
