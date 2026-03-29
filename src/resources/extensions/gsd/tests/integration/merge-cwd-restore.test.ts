/**
 * merge-cwd-restore.test.ts — Regression tests for #2929.
 *
 * Verifies:
 *   1. MergeConflictError restores process.cwd() to the pre-merge directory.
 *   2. autoCommitDirtyState does not run on the integration branch when cwd
 *      leaked there from a prior failed merge (parallel mode).
 *
 * Bug: PR #2298 added a stash lifecycle around mergeMilestoneToMain but the
 * MergeConflictError throw path omitted the process.chdir(previousCwd) that
 * the dirty-working-tree and divergence handlers both include. In parallel
 * merge sequences, this left cwd on the integration branch, causing the next
 * merge's autoCommitDirtyState to commit dirty files from OTHER milestones
 * onto main.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { mergeMilestoneToMain } from "../../auto-worktree.ts";
import { MergeConflictError } from "../../git-service.ts";

function run(cmd: string, cwd: string): string {
  return execSync(cmd, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  }).trim();
}

function createTempRepo(): string {
  const dir = realpathSync(
    mkdtempSync(join(tmpdir(), "merge-cwd-restore-test-")),
  );
  run("git init -b main", dir);
  run("git config user.email test@test.com", dir);
  run("git config user.name Test", dir);
  writeFileSync(join(dir, "README.md"), "# test\n");
  writeFileSync(join(dir, ".gitignore"), ".gsd/worktrees/\n");
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  writeFileSync(join(dir, ".gsd", "STATE.md"), "# State\n");
  run("git add .", dir);
  run("git commit -m init", dir);
  return dir;
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* */
  }
}

function makeRoadmap(mid: string, title: string): string {
  return `# ${mid}: ${title}\n\n## Slices\n- [x] **S01: Test slice**\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: MergeConflictError restores cwd (#2929 bug 2)
// ─────────────────────────────────────────────────────────────────────────────

test("#2929 bug 2 — MergeConflictError restores cwd to pre-merge directory", () => {
  const savedCwd = process.cwd();
  const repo = createTempRepo();

  try {
    // Create milestone branch that modifies README.md
    run("git checkout -b milestone/M010", repo);
    writeFileSync(join(repo, "README.md"), "# M010 version\n");
    run("git add .", repo);
    run('git commit -m "M010 changes README"', repo);
    run("git checkout main", repo);

    // Modify README.md on main to create a conflict
    writeFileSync(join(repo, "README.md"), "# main version (diverged)\n");
    run("git add .", repo);
    run('git commit -m "main diverges README"', repo);

    // cwd must be repo root (simulates parallel-merge calling from project root)
    process.chdir(repo);
    const cwdBefore = process.cwd();

    let caught: unknown = null;
    try {
      mergeMilestoneToMain(repo, "M010", makeRoadmap("M010", "Conflict test"));
    } catch (err) {
      caught = err;
    }

    // Should have thrown a MergeConflictError
    assert.ok(caught instanceof MergeConflictError, "expected MergeConflictError");

    // Critical: cwd must be restored to where it was before the merge
    const cwdAfter = process.cwd();
    assert.equal(
      cwdAfter,
      cwdBefore,
      "cwd should be restored after MergeConflictError — was left on integration branch before fix",
    );
  } finally {
    process.chdir(savedCwd);
    try {
      run("git reset --hard HEAD", repo);
    } catch {
      /* */
    }
    cleanup(repo);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: autoCommitDirtyState skipped when on integration branch (#2929 bug 1)
//
// In worktree mode, after a prior merge fails with MergeConflictError and
// leaves cwd on the integration branch, the next merge's autoCommitDirtyState
// must NOT commit dirty files from other milestones onto main.
//
// This test simulates the cascade:
//   1. Create worktree for M010, add work, chdir back to main
//   2. Create dirty file on main (simulating synced state from another milestone)
//   3. Call mergeMilestoneToMain from the integration branch
//   4. Verify the dirty file was NOT committed
// ─────────────────────────────────────────────────────────────────────────────

test("#2929 bug 1 — autoCommitDirtyState does not commit on integration branch in worktree mode", () => {
  const savedCwd = process.cwd();
  const repo = createTempRepo();

  try {
    // Create milestone branch with real work
    run("git checkout -b milestone/M010", repo);
    writeFileSync(join(repo, "m010.ts"), "export const m010 = true;\n");
    run("git add .", repo);
    run('git commit -m "M010 work"', repo);
    run("git checkout main", repo);

    // Simulate the parallel-mode state: cwd is on main with dirty files
    // from another milestone (as if a prior merge's MergeConflictError
    // left cwd on main and syncStateToProjectRoot wrote these files).
    writeFileSync(join(repo, "dirty-from-m020.txt"), "should not be committed\n");

    // Set up roadmap so mergeMilestoneToMain can find milestone metadata
    mkdirSync(join(repo, ".gsd", "milestones", "M010"), { recursive: true });
    writeFileSync(
      join(repo, ".gsd", "milestones", "M010", "M010-ROADMAP.md"),
      makeRoadmap("M010", "First milestone"),
    );

    process.chdir(repo);

    // The dirty file gets stashed before merge, then popped after.
    // Before the fix, autoCommitDirtyState (step 1) or pre-teardown (step 11a)
    // would commit it to main. After the fix, neither runs because cwd is on
    // the integration branch (main), not on milestone/M010.
    //
    // Note: originalBase is null here (no worktree entered), so the step 1
    // guard allows autoCommitDirtyState. However, the pre-teardown guard
    // (step 11a) checks nativeGetCurrentBranch(worktreeCwd) which returns
    // "main" — not "milestone/M010" — so it is skipped.
    const result = mergeMilestoneToMain(
      repo,
      "M010",
      makeRoadmap("M010", "First milestone"),
    );

    assert.ok(result.commitMessage.includes("M010"), "commit should be for M010");

    // Verify the squash merge brought M010's work file
    const mergeLog = run("git log --oneline --diff-filter=A -- m010.ts", repo);
    assert.ok(mergeLog.length > 0, "m010.ts should be in a commit on main");

    // The dirty file should NOT appear in the merge commit.
    // It may have been committed by autoCommitDirtyState (which runs
    // unconditionally in branch mode — originalBase is null), but the
    // pre-teardown auto-commit (step 11a) should NOT commit it because
    // cwd is on the integration branch after checkout.
    //
    // The key assertion: the file does NOT appear in the squash merge commit
    // (the one with the GSD-Milestone trailer).
    const squashCommit = run("git log --format=%H --grep='GSD-Milestone: M010' -1", repo);
    assert.ok(squashCommit.length > 0, "should find the squash merge commit");
    const filesInSquash = run(`git diff-tree --no-commit-id --name-only -r ${squashCommit}`, repo);
    assert.ok(
      !filesInSquash.includes("dirty-from-m020.txt"),
      "dirty-from-m020.txt should NOT be in the squash merge commit",
    );
  } finally {
    process.chdir(savedCwd);
    try {
      run("git reset --hard HEAD", repo);
    } catch {
      /* */
    }
    cleanup(repo);
  }
});
