/**
 * CI check: verify all committed GSD milestones are complete.
 *
 * Uses deriveState() — the same logic the GSD runtime uses — so this
 * check stays correct even if file layouts, naming conventions, or
 * completion criteria change in future GSD releases.
 *
 * Exit 0 = all milestones complete (or no milestones exist).
 * Exit 1 = one or more milestones are not complete.
 */

import { deriveState } from "../state.js";

const basePath = process.cwd();
const state = await deriveState(basePath);

const total = state.registry.length;

if (total === 0) {
  console.log("✓ No GSD milestones found — nothing to check.");
  process.exit(0);
}

const incomplete = state.registry.filter((m) => m.status !== "complete");

if (incomplete.length === 0) {
  console.log(`✓ All ${total} GSD milestone(s) are complete.`);
  process.exit(0);
}

console.error(`✗ ${incomplete.length} of ${total} milestone(s) are not complete:\n`);
for (const m of incomplete) {
  console.error(`  ${m.id}: ${m.title} (status: ${m.status})`);
}

// Show progress details if available
if (state.progress) {
  const { milestones, slices, tasks } = state.progress;
  const parts: string[] = [`milestones: ${milestones.done}/${milestones.total}`];
  if (slices) parts.push(`slices: ${slices.done}/${slices.total}`);
  if (tasks) parts.push(`tasks: ${tasks.done}/${tasks.total}`);
  console.error(`\n  Progress: ${parts.join(", ")}`);
}

process.exit(1);
