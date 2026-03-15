/**
 * Worktree Integration Tests
 *
 * Tests the full lifecycle of GSD operations inside a worktree:
 * - Branch namespacing (gsd/<wt>/<M>/<S> instead of gsd/<M>/<S>)
 * - getMainBranch returns worktree/<name> inside a worktree
 * - switchToMain goes to worktree/<name>, not main
 * - mergeSliceToMain merges into worktree/<name>
 * - Parallel worktrees don't conflict on branch names
 * - State derivation works correctly inside worktrees
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import {
  createWorktree,
  listWorktrees,
  removeWorktree,
  worktreePath,
  worktreeBranchName,
} from "../worktree-manager.ts";

import {
  detectWorktreeName,
  ensureSliceBranch,
  getActiveSliceBranch,
  getCurrentBranch,
  getMainBranch,
  getSliceBranchName,
  isOnSliceBranch,
  mergeSliceToMain,
  switchToMain,
  autoCommitCurrentBranch,
} from "../worktree.ts";

import { deriveState } from "../state.ts";
import { createTestContext } from './test-helpers.ts';

const { assertEq, assertTrue, report } = createTestContext();
function run(command: string, cwd: string): string {
  return execSync(command, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

// ─── Test repo setup ──────────────────────────────────────────────────────────

const base = mkdtempSync(join(tmpdir(), "gsd-wt-integration-"));
run("git init -b main", base);
run("git config user.name 'Pi Test'", base);
run("git config user.email 'pi@example.com'", base);

// Create a project with one milestone and two slices
mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S01", "tasks"), { recursive: true });
mkdirSync(join(base, ".gsd", "milestones", "M001", "slices", "S02", "tasks"), { recursive: true });
writeFileSync(join(base, "README.md"), "# Test Project\n", "utf-8");
writeFileSync(
  join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
  [
    "# M001: Demo",
    "",
    "## Slices",
    "- [ ] **S01: First** `risk:low` `depends:[]`",
    "  > After this: part one works",
    "- [ ] **S02: Second** `risk:low` `depends:[]`",
    "  > After this: part two works",
  ].join("\n") + "\n",
  "utf-8",
);
writeFileSync(
  join(base, ".gsd", "milestones", "M001", "slices", "S01", "S01-PLAN.md"),
  "# S01: First\n\n**Goal:** Demo\n**Demo:** Demo\n\n## Must-Haves\n- done\n\n## Tasks\n- [ ] **T01: Implement** `est:10m`\n  do it\n",
  "utf-8",
);
writeFileSync(
  join(base, ".gsd", "milestones", "M001", "slices", "S02", "S02-PLAN.md"),
  "# S02: Second\n\n**Goal:** Demo\n**Demo:** Demo\n\n## Must-Haves\n- done\n\n## Tasks\n- [ ] **T01: Implement** `est:10m`\n  do it\n",
  "utf-8",
);
run("git add .", base);
run('git commit -m "chore: init"', base);

async function main(): Promise<void> {
  // ── Verify main tree baseline ──────────────────────────────────────────────

  console.log("\n=== Main tree baseline ===");
  assertEq(getMainBranch(base), "main", "main tree getMainBranch returns main");
  assertEq(detectWorktreeName(base), null, "main tree not detected as worktree");

  // ── Create worktree and verify detection ───────────────────────────────────

  console.log("\n=== Create worktree ===");
  const wt = await createWorktree(base, "alpha");
  assertTrue(existsSync(wt.path), "worktree created on disk");
  assertEq(wt.branch, "worktree/alpha", "worktree branch name");

  console.log("\n=== Worktree detection ===");
  assertEq(detectWorktreeName(wt.path), "alpha", "detectWorktreeName inside worktree");
  assertEq(getMainBranch(wt.path), "worktree/alpha", "getMainBranch returns worktree branch inside worktree");

  // ── Verify current branch inside worktree ──────────────────────────────────

  console.log("\n=== Worktree initial branch ===");
  assertEq(getCurrentBranch(wt.path), "worktree/alpha", "worktree starts on its own branch");

  // ── ensureSliceBranch inside worktree ──────────────────────────────────────

  console.log("\n=== ensureSliceBranch in worktree ===");
  const created = ensureSliceBranch(wt.path, "M001", "S01");
  assertTrue(created, "slice branch created");
  assertEq(getCurrentBranch(wt.path), "gsd/alpha/M001/S01", "worktree-namespaced slice branch");
  assertTrue(isOnSliceBranch(wt.path), "isOnSliceBranch returns true");
  assertEq(getActiveSliceBranch(wt.path), "gsd/alpha/M001/S01", "getActiveSliceBranch returns namespaced branch");

  // ── Verify branch name helper ──────────────────────────────────────────────

  console.log("\n=== getSliceBranchName with worktree ===");
  assertEq(getSliceBranchName("M001", "S01", "alpha"), "gsd/alpha/M001/S01", "explicit worktree param");
  assertEq(getSliceBranchName("M001", "S01"), "gsd/M001/S01", "no worktree param = plain branch");

  // ── Do work on slice branch, then merge to worktree branch ─────────────────

  console.log("\n=== Work and merge slice in worktree ===");
  writeFileSync(join(wt.path, "feature.txt"), "new feature\n", "utf-8");
  run("git add .", wt.path);
  run('git commit -m "feat: add feature"', wt.path);

  // switchToMain should go to worktree/alpha, NOT main
  switchToMain(wt.path);
  assertEq(getCurrentBranch(wt.path), "worktree/alpha", "switchToMain goes to worktree branch, not main");

  // mergeSliceToMain should merge into worktree/alpha
  const merge = mergeSliceToMain(wt.path, "M001", "S01", "First");
  assertEq(merge.branch, "gsd/alpha/M001/S01", "merged the namespaced branch");
  assertTrue(merge.deletedBranch, "slice branch deleted after merge");
  assertEq(getCurrentBranch(wt.path), "worktree/alpha", "still on worktree branch after merge");
  assertTrue(readFileSync(join(wt.path, "feature.txt"), "utf-8").includes("new feature"), "merge brought feature to worktree branch");

  // Verify slice branch is gone
  const branches = run("git branch", base);
  assertTrue(!branches.includes("gsd/alpha/M001/S01"), "slice branch cleaned up");

  // ── Second slice in same worktree ──────────────────────────────────────────

  console.log("\n=== Second slice in worktree ===");
  const created2 = ensureSliceBranch(wt.path, "M001", "S02");
  assertTrue(created2, "S02 branch created");
  assertEq(getCurrentBranch(wt.path), "gsd/alpha/M001/S02", "on S02 namespaced branch");

  writeFileSync(join(wt.path, "feature2.txt"), "second feature\n", "utf-8");
  run("git add .", wt.path);
  run('git commit -m "feat: add feature 2"', wt.path);

  switchToMain(wt.path);
  const merge2 = mergeSliceToMain(wt.path, "M001", "S02", "Second");
  assertEq(merge2.branch, "gsd/alpha/M001/S02", "S02 merge correct");
  assertEq(getCurrentBranch(wt.path), "worktree/alpha", "back on worktree branch");

  // ── Main tree can still do its own slice work independently ────────────────

  console.log("\n=== Main tree independent slice work ===");
  assertEq(getCurrentBranch(base), "main", "main tree still on main");
  const mainCreated = ensureSliceBranch(base, "M001", "S01");
  assertTrue(mainCreated, "main tree can create S01 branch (no conflict with worktree)");
  assertEq(getCurrentBranch(base), "gsd/M001/S01", "main tree on plain branch name");

  writeFileSync(join(base, "main-feature.txt"), "main work\n", "utf-8");
  run("git add .", base);
  run('git commit -m "feat: main work"', base);

  switchToMain(base);
  assertEq(getCurrentBranch(base), "main", "main tree switchToMain goes to main");
  const mainMerge = mergeSliceToMain(base, "M001", "S01", "First");
  assertEq(mainMerge.branch, "gsd/M001/S01", "main tree merge uses plain branch");

  // ── Parallel worktrees don't conflict ──────────────────────────────────────

  console.log("\n=== Parallel worktrees ===");
  const wt2 = await createWorktree(base, "beta");
  assertEq(getMainBranch(wt2.path), "worktree/beta", "second worktree has its own base branch");

  // Both worktrees can create S01 branches without conflict
  const betaCreated = ensureSliceBranch(wt2.path, "M001", "S01");
  assertTrue(betaCreated, "beta worktree can create S01");
  assertEq(getCurrentBranch(wt2.path), "gsd/beta/M001/S01", "beta has its own namespaced branch");

  // Alpha worktree can re-create S01 too (it was already merged+deleted earlier)
  const alphaReCreated = ensureSliceBranch(wt.path, "M001", "S01");
  assertTrue(alphaReCreated, "alpha worktree can re-create S01");
  assertEq(getCurrentBranch(wt.path), "gsd/alpha/M001/S01", "alpha re-created S01");

  // Both exist simultaneously
  const allBranches = run("git branch", base);
  assertTrue(allBranches.includes("gsd/alpha/M001/S01"), "alpha S01 branch exists");
  assertTrue(allBranches.includes("gsd/beta/M001/S01"), "beta S01 branch exists");

  // ── State derivation in worktree ───────────────────────────────────────────

  console.log("\n=== State derivation in worktree ===");
  // Switch alpha back to its base so deriveState sees milestone files
  switchToMain(wt.path);
  const state = await deriveState(wt.path);
  assertTrue(state.activeMilestone !== null, "worktree has active milestone");
  assertEq(state.activeMilestone?.id, "M001", "correct milestone");

  // ── autoCommitCurrentBranch in worktree ────────────────────────────────────

  console.log("\n=== autoCommitCurrentBranch in worktree ===");
  ensureSliceBranch(wt2.path, "M001", "S01"); // re-checkout if needed
  writeFileSync(join(wt2.path, "dirty.txt"), "uncommitted\n", "utf-8");
  const commitMsg = autoCommitCurrentBranch(wt2.path, "execute-task", "M001/S01/T01");
  assertTrue(commitMsg !== null, "auto-commit works in worktree");
  assertEq(run("git status --short", wt2.path), "", "worktree clean after auto-commit");

  // ── Cleanup ────────────────────────────────────────────────────────────────

  console.log("\n=== Cleanup ===");
  // Switch worktrees back to their base branches before removal
  switchToMain(wt.path);
  switchToMain(wt2.path);
  removeWorktree(base, "alpha", { deleteBranch: true });
  removeWorktree(base, "beta", { deleteBranch: true });
  assertEq(listWorktrees(base).length, 0, "all worktrees removed");

  rmSync(base, { recursive: true, force: true });

  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
