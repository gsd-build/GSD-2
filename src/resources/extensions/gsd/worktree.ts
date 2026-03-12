/**
 * GSD Slice Branch Management
 *
 * Simple branch-per-slice workflow. No worktrees, no registry.
 * Runtime state (metrics, activity, lock, STATE.md) is gitignored
 * so branch switches are clean.
 *
 * Flow:
 *   1. ensureSliceBranch() — create + checkout slice branch
 *   2. agent does work, commits
 *   3. mergeSliceToMain() — checkout main, squash-merge, delete branch
 */

import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { sep } from "node:path";

export interface MergeSliceResult {
  branch: string;
  mergedCommitMessage: string;
  deletedBranch: boolean;
}

function runGit(basePath: string, args: string[], options: { allowFailure?: boolean } = {}): string {
  try {
    return execSync(`git ${args.join(" ")}`, {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    }).trim();
  } catch (error) {
    if (options.allowFailure) return "";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`git ${args.join(" ")} failed in ${basePath}: ${message}`);
  }
}

/**
 * Detect the active worktree name from the current working directory.
 * Returns null if not inside a GSD worktree (.gsd/worktrees/<name>/).
 */
export function detectWorktreeName(basePath: string): string | null {
  const marker = `${sep}.gsd${sep}worktrees${sep}`;
  const idx = basePath.indexOf(marker);
  if (idx === -1) return null;
  const afterMarker = basePath.slice(idx + marker.length);
  const name = afterMarker.split(sep)[0] ?? afterMarker.split("/")[0];
  return name || null;
}

/**
 * Get the slice branch name, namespaced by worktree when inside one.
 *
 * In the main tree:     gsd/<milestoneId>/<sliceId>
 * In a worktree:        gsd/<worktreeName>/<milestoneId>/<sliceId>
 *
 * This prevents branch conflicts when multiple worktrees work on the
 * same milestone/slice IDs — git doesn't allow a branch to be checked
 * out in more than one worktree simultaneously.
 */
export function getSliceBranchName(milestoneId: string, sliceId: string, worktreeName?: string | null): string {
  if (worktreeName) {
    return `gsd/${worktreeName}/${milestoneId}/${sliceId}`;
  }
  return `gsd/${milestoneId}/${sliceId}`;
}

/** Regex that matches both plain and worktree-namespaced slice branches. */
export const SLICE_BRANCH_RE = /^gsd\/(?:([a-zA-Z0-9_-]+)\/)?(M\d+)\/(S\d+)$/;

/**
 * Parse a slice branch name into its components.
 * Handles both `gsd/M001/S01` and `gsd/myworktree/M001/S01`.
 */
export function parseSliceBranch(branchName: string): {
  worktreeName: string | null;
  milestoneId: string;
  sliceId: string;
} | null {
  const match = branchName.match(SLICE_BRANCH_RE);
  if (!match) return null;
  return {
    worktreeName: match[1] ?? null,
    milestoneId: match[2]!,
    sliceId: match[3]!,
  };
}

/**
 * Get the "main" branch for GSD slice operations.
 *
 * In the main working tree: returns main/master (the repo's default branch).
 * In a worktree: returns worktree/<name> — the worktree's own base branch.
 *
 * This is critical because git doesn't allow a branch to be checked out
 * in more than one worktree. Slice branches merge into the worktree's base
 * branch, and the worktree branch later merges into the real main via
 * /worktree merge.
 */
export function getMainBranch(basePath: string): string {
  // When inside a worktree, slice branches should merge into the worktree's
  // own branch (worktree/<name>), not main — main is checked out by the
  // parent working tree and git would refuse the checkout.
  const wtName = detectWorktreeName(basePath);
  if (wtName) {
    const wtBranch = `worktree/${wtName}`;
    // Verify the branch exists (it should — createWorktree made it)
    const exists = runGit(basePath, ["show-ref", "--verify", `refs/heads/${wtBranch}`], { allowFailure: true });
    if (exists) return wtBranch;
    // Worktree branch is gone — return current branch rather than falling
    // through to main/master which would cause a checkout conflict
    return runGit(basePath, ["branch", "--show-current"]);
  }

  const symbolic = runGit(basePath, ["symbolic-ref", "refs/remotes/origin/HEAD"], { allowFailure: true });
  if (symbolic) {
    const match = symbolic.match(/refs\/remotes\/origin\/(.+)$/);
    if (match) return match[1]!;
  }

  const mainExists = runGit(basePath, ["show-ref", "--verify", "refs/heads/main"], { allowFailure: true });
  if (mainExists) return "main";

  const masterExists = runGit(basePath, ["show-ref", "--verify", "refs/heads/master"], { allowFailure: true });
  if (masterExists) return "master";

  return runGit(basePath, ["branch", "--show-current"]);
}

export function getCurrentBranch(basePath: string): string {
  return runGit(basePath, ["branch", "--show-current"]);
}

function branchExists(basePath: string, branch: string): boolean {
  try {
    runGit(basePath, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the slice branch exists and is checked out.
 * Creates the branch from the current branch if it's not a slice branch,
 * otherwise from main. This preserves planning artifacts (CONTEXT, ROADMAP,
 * etc.) that were committed on the working branch — which may differ from
 * the repo's default branch (e.g. `developer` vs `main`).
 * When inside a worktree, the branch is namespaced to avoid conflicts.
 * Returns true if the branch was newly created.
 */
export function ensureSliceBranch(basePath: string, milestoneId: string, sliceId: string): boolean {
  const wtName = detectWorktreeName(basePath);
  const branch = getSliceBranchName(milestoneId, sliceId, wtName);
  const current = getCurrentBranch(basePath);

  if (current === branch) return false;

  const mainBranch = getMainBranch(basePath);
  let created = false;

  if (!branchExists(basePath, branch)) {
    // Branch from the current branch when it's a normal working branch
    // (not itself a slice branch). This ensures the new slice branch
    // inherits planning artifacts that may only exist on the working
    // branch and haven't been merged to main yet.
    // If we're already on a slice branch (e.g. creating S02 while S01
    // wasn't merged yet), fall back to main to avoid chaining slice branches.
    const base = SLICE_BRANCH_RE.test(current) ? mainBranch : current;
    runGit(basePath, ["branch", branch, base]);
    created = true;
  }

  // Auto-commit dirty files before checkout to prevent "would be overwritten" errors.
  // This handles cases where doctor, STATE.md rebuild, or agent work left uncommitted changes.
  const status = runGit(basePath, ["status", "--short"]);
  if (status.trim()) {
    runGit(basePath, ["add", "-A"]);
    const staged = runGit(basePath, ["diff", "--cached", "--stat"]);
    if (staged.trim()) {
      runGit(basePath, ["commit", "-m", `"chore: auto-commit before switching to ${branch}"`]);
    }
  }

  runGit(basePath, ["checkout", branch]);
  return created;
}

/**
 * Auto-commit any dirty files in the current working tree.
 * Returns the commit message used, or null if already clean.
 */
export function autoCommitCurrentBranch(
  basePath: string, unitType: string, unitId: string,
): string | null {
  const status = runGit(basePath, ["status", "--short"]);
  if (!status.trim()) return null;

  runGit(basePath, ["add", "-A"]);

  const staged = runGit(basePath, ["diff", "--cached", "--stat"]);
  if (!staged.trim()) return null;

  const message = `chore(${unitId}): auto-commit after ${unitType}`;
  runGit(basePath, ["commit", "-m", JSON.stringify(message)]);
  return message;
}

/**
 * Switch to main, auto-committing any dirty files on the current branch first.
 */
export function switchToMain(basePath: string): void {
  const mainBranch = getMainBranch(basePath);
  const current = getCurrentBranch(basePath);
  if (current === mainBranch) return;

  // Auto-commit if dirty
  autoCommitCurrentBranch(basePath, "pre-switch", current);

  runGit(basePath, ["checkout", mainBranch]);
}

/**
 * Squash-merge a completed slice branch to main.
 * Expects to already be on main (call switchToMain first).
 * Deletes the branch after merge.
 */
export function mergeSliceToMain(
  basePath: string, milestoneId: string, sliceId: string, sliceTitle: string,
): MergeSliceResult {
  const wtName = detectWorktreeName(basePath);
  const branch = getSliceBranchName(milestoneId, sliceId, wtName);
  const mainBranch = getMainBranch(basePath);

  const current = getCurrentBranch(basePath);
  if (current !== mainBranch) {
    throw new Error(`Expected to be on ${mainBranch}, found ${current}`);
  }

  if (!branchExists(basePath, branch)) {
    throw new Error(`Slice branch ${branch} does not exist`);
  }

  const ahead = runGit(basePath, ["rev-list", "--count", `${mainBranch}..${branch}`]);
  if (Number(ahead) <= 0) {
    throw new Error(`Slice branch ${branch} has no commits ahead of ${mainBranch}`);
  }

  runGit(basePath, ["merge", "--squash", branch]);
  const mergedCommitMessage = `feat(${milestoneId}/${sliceId}): ${sliceTitle}`;
  runGit(basePath, ["commit", "-m", JSON.stringify(mergedCommitMessage)]);
  runGit(basePath, ["branch", "-D", branch]);

  return {
    branch,
    mergedCommitMessage,
    deletedBranch: true,
  };
}

/**
 * Check if we're currently on a slice branch (not main).
 * Handles both plain (gsd/M001/S01) and worktree-namespaced (gsd/wt/M001/S01) branches.
 */
export function isOnSliceBranch(basePath: string): boolean {
  const current = getCurrentBranch(basePath);
  return SLICE_BRANCH_RE.test(current);
}

/**
 * Get the active slice branch name, or null if on main.
 * Handles both plain and worktree-namespaced branch patterns.
 */
export function getActiveSliceBranch(basePath: string): string | null {
  try {
    const current = getCurrentBranch(basePath);
    return SLICE_BRANCH_RE.test(current) ? current : null;
  } catch {
    return null;
  }
}
