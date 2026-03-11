/**
 * GSD Worktree Manager
 *
 * Creates and manages git worktrees under .gsd/worktrees/<name>/.
 * Each worktree gets its own branch (worktree/<name>) and a full
 * working copy of the project, enabling parallel work streams.
 *
 * The merge helper compares .gsd/ artifacts between a worktree and
 * the main branch, then dispatches an LLM-guided merge flow.
 *
 * Flow:
 *   1. create()  — git worktree add .gsd/worktrees/<name> -b worktree/<name>
 *   2. user works in the worktree (new plans, milestones, etc.)
 *   3. merge()   — LLM-guided reconciliation of .gsd/ artifacts back to main
 *   4. remove()  — git worktree remove + branch cleanup
 */

import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, relative, resolve } from "node:path";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string;
  exists: boolean;
}

export interface WorktreeDiffSummary {
  /** Files only in the worktree .gsd/ (new artifacts) */
  added: string[];
  /** Files in both but with different content */
  modified: string[];
  /** Files only in main .gsd/ (deleted in worktree) */
  removed: string[];
}

// ─── Git Helpers ───────────────────────────────────────────────────────────

function runGit(cwd: string, args: string[], opts: { allowFailure?: boolean } = {}): string {
  try {
    return execSync(`git ${args.join(" ")}`, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    }).trim();
  } catch (error) {
    if (opts.allowFailure) return "";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${message}`);
  }
}

export function getMainBranch(basePath: string): string {
  const symbolic = runGit(basePath, ["symbolic-ref", "refs/remotes/origin/HEAD"], { allowFailure: true });
  if (symbolic) {
    const match = symbolic.match(/refs\/remotes\/origin\/(.+)$/);
    if (match) return match[1]!;
  }
  if (runGit(basePath, ["show-ref", "--verify", "refs/heads/main"], { allowFailure: true })) return "main";
  if (runGit(basePath, ["show-ref", "--verify", "refs/heads/master"], { allowFailure: true })) return "master";
  return runGit(basePath, ["branch", "--show-current"]);
}

// ─── Path Helpers ──────────────────────────────────────────────────────────

export function worktreesDir(basePath: string): string {
  return join(basePath, ".gsd", "worktrees");
}

export function worktreePath(basePath: string, name: string): string {
  return join(worktreesDir(basePath), name);
}

export function worktreeBranchName(name: string): string {
  return `worktree/${name}`;
}

// ─── Core Operations ───────────────────────────────────────────────────────

/**
 * Create a new git worktree under .gsd/worktrees/<name>/ with branch worktree/<name>.
 * The branch is created from the current HEAD of the main branch.
 */
export function createWorktree(basePath: string, name: string): WorktreeInfo {
  // Validate name: alphanumeric, hyphens, underscores only
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid worktree name "${name}". Use only letters, numbers, hyphens, and underscores.`);
  }

  const wtPath = worktreePath(basePath, name);
  const branch = worktreeBranchName(name);

  if (existsSync(wtPath)) {
    throw new Error(`Worktree "${name}" already exists at ${wtPath}`);
  }

  // Ensure the .gsd/worktrees/ directory exists
  const wtDir = worktreesDir(basePath);
  mkdirSync(wtDir, { recursive: true });

  // Prune any stale worktree entries from a previous removal
  runGit(basePath, ["worktree", "prune"], { allowFailure: true });

  // Check if the branch already exists (leftover from a previous worktree)
  const branchExists = runGit(basePath, ["show-ref", "--verify", `refs/heads/${branch}`], { allowFailure: true });
  const mainBranch = getMainBranch(basePath);

  if (branchExists) {
    // Reset the stale branch to current main, then attach worktree to it
    runGit(basePath, ["branch", "-f", branch, mainBranch]);
    runGit(basePath, ["worktree", "add", wtPath, branch]);
  } else {
    runGit(basePath, ["worktree", "add", "-b", branch, wtPath, mainBranch]);
  }

  return {
    name,
    path: wtPath,
    branch,
    exists: true,
  };
}

/**
 * List all GSD-managed worktrees.
 * Parses `git worktree list` and filters to those under .gsd/worktrees/.
 */
export function listWorktrees(basePath: string): WorktreeInfo[] {
  // Resolve real paths to handle symlinks (e.g. /tmp → /private/tmp on macOS)
  const resolvedBase = existsSync(basePath) ? realpathSync(basePath) : resolve(basePath);
  const wtDir = join(resolvedBase, ".gsd", "worktrees");
  const rawList = runGit(basePath, ["worktree", "list", "--porcelain"]);

  if (!rawList.trim()) return [];

  const worktrees: WorktreeInfo[] = [];
  const entries = rawList.split("\n\n").filter(Boolean);

  for (const entry of entries) {
    const lines = entry.split("\n");
    const wtLine = lines.find(l => l.startsWith("worktree "));
    const branchLine = lines.find(l => l.startsWith("branch "));

    if (!wtLine || !branchLine) continue;

    const entryPath = wtLine.replace("worktree ", "");
    const branch = branchLine.replace("branch refs/heads/", "");

    // Only include worktrees under .gsd/worktrees/
    if (!entryPath.startsWith(wtDir)) continue;

    const name = relative(wtDir, entryPath);
    // Skip nested paths — only direct children
    if (name.includes("/") || name.includes("\\")) continue;

    worktrees.push({
      name,
      path: entryPath,
      branch,
      exists: existsSync(entryPath),
    });
  }

  return worktrees;
}

/**
 * Remove a worktree and optionally delete its branch.
 * If the process is currently inside the worktree, chdir out first.
 */
export function removeWorktree(
  basePath: string,
  name: string,
  opts: { deleteBranch?: boolean; force?: boolean } = {},
): void {
  const wtPath = worktreePath(basePath, name);
  const resolvedWtPath = existsSync(wtPath) ? realpathSync(wtPath) : wtPath;
  const branch = worktreeBranchName(name);
  const { deleteBranch = true, force = false } = opts;

  // If we're inside the worktree, move out first — git can't remove an in-use directory
  const cwd = process.cwd();
  const resolvedCwd = existsSync(cwd) ? realpathSync(cwd) : cwd;
  if (resolvedCwd === resolvedWtPath || resolvedCwd.startsWith(resolvedWtPath + "/")) {
    process.chdir(basePath);
  }

  if (!existsSync(wtPath)) {
    runGit(basePath, ["worktree", "prune"], { allowFailure: true });
    if (deleteBranch) {
      runGit(basePath, ["branch", "-D", branch], { allowFailure: true });
    }
    return;
  }

  // Force-remove to handle dirty worktrees
  runGit(basePath, ["worktree", "remove", "--force", wtPath], { allowFailure: true });

  // If the directory is still there (e.g. locked), try harder
  if (existsSync(wtPath)) {
    runGit(basePath, ["worktree", "remove", "--force", "--force", wtPath], { allowFailure: true });
  }

  // Prune stale entries so git knows the worktree is gone
  runGit(basePath, ["worktree", "prune"], { allowFailure: true });

  if (deleteBranch) {
    runGit(basePath, ["branch", "-D", branch], { allowFailure: true });
  }
}

/**
 * Diff the .gsd/ directory between the worktree branch and main branch.
 * Returns a summary of added, modified, and removed GSD artifacts.
 */
export function diffWorktreeGSD(basePath: string, name: string): WorktreeDiffSummary {
  const branch = worktreeBranchName(name);
  const mainBranch = getMainBranch(basePath);

  // Use git diff to compare .gsd/ between branches
  const diffOutput = runGit(basePath, [
    "diff", "--name-status", `${mainBranch}...${branch}`, "--", ".gsd/",
  ], { allowFailure: true });

  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  if (!diffOutput.trim()) return { added, modified, removed };

  for (const line of diffOutput.split("\n").filter(Boolean)) {
    const [status, ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t");

    // Skip worktree-internal paths (e.g. .gsd/worktrees/, .gsd/runtime/)
    if (filePath.startsWith(".gsd/worktrees/") || filePath.startsWith(".gsd/runtime/")) continue;
    // Skip gitignored runtime files
    if (filePath === ".gsd/STATE.md" || filePath === ".gsd/auto.lock" || filePath === ".gsd/metrics.json") continue;
    if (filePath.startsWith(".gsd/activity/")) continue;

    switch (status) {
      case "A": added.push(filePath); break;
      case "M": modified.push(filePath); break;
      case "D": removed.push(filePath); break;
      default:
        // Renames, copies — treat as modified
        if (status?.startsWith("R") || status?.startsWith("C")) {
          modified.push(filePath);
        }
    }
  }

  return { added, modified, removed };
}

/**
 * Get the full diff content for .gsd/ between the worktree branch and main.
 * Returns the raw unified diff for LLM consumption.
 */
export function getWorktreeGSDDiff(basePath: string, name: string): string {
  const branch = worktreeBranchName(name);
  const mainBranch = getMainBranch(basePath);

  return runGit(basePath, [
    "diff", `${mainBranch}...${branch}`, "--", ".gsd/",
  ], { allowFailure: true });
}

/**
 * Get commit log for the worktree branch since it diverged from main.
 */
export function getWorktreeLog(basePath: string, name: string): string {
  const branch = worktreeBranchName(name);
  const mainBranch = getMainBranch(basePath);

  return runGit(basePath, [
    "log", "--oneline", `${mainBranch}..${branch}`,
  ], { allowFailure: true });
}

/**
 * Merge the worktree branch into main using squash merge.
 * Must be called from the main working tree (not the worktree itself).
 * Returns the merge commit message.
 */
export function mergeWorktreeToMain(basePath: string, name: string, commitMessage: string): string {
  const branch = worktreeBranchName(name);
  const mainBranch = getMainBranch(basePath);
  const current = runGit(basePath, ["branch", "--show-current"]);

  if (current !== mainBranch) {
    throw new Error(`Must be on ${mainBranch} to merge. Currently on ${current}.`);
  }

  runGit(basePath, ["merge", "--squash", branch]);
  runGit(basePath, ["commit", "-m", commitMessage]);

  return commitMessage;
}
