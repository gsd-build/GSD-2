/**
 * Worktree Health — lifecycle status helpers for GSD-managed worktrees.
 *
 * Used by doctor-checks.ts for health audits and by worktree-command.ts
 * for the enhanced `/worktree list` display.
 *
 * Only inspects worktrees under .gsd/worktrees/ — GSD owns what GSD creates.
 */

import { existsSync } from "node:fs";
import {
  nativeDetectMainBranch,
  nativeHasChanges,
  nativeIsAncestor,
  nativeLastCommitEpoch,
  nativeUnpushedCount,
  nativeWorkingTreeStatus,
} from "./native-git-bridge.js";
import { listWorktrees, type WorktreeInfo } from "./worktree-manager.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WorktreeHealthStatus {
  /** The worktree info from worktree-manager */
  worktree: WorktreeInfo;
  /** Whether the worktree branch is fully merged into main */
  mergedIntoMain: boolean;
  /** Whether the worktree has uncommitted changes (staged or unstaged) */
  dirty: boolean;
  /** Number of dirty files (0 if clean) */
  dirtyFileCount: number;
  /** Number of commits on the branch not pushed to any remote */
  unpushedCommits: number;
  /** Unix epoch (seconds) of the last commit on the branch. 0 if unknown. */
  lastCommitEpoch: number;
  /** Age of the last commit in days (fractional). -1 if unknown. */
  lastCommitAgeDays: number;
  /** Whether we consider this worktree stale (no commits in staleDays, not merged) */
  stale: boolean;
  /** Whether this worktree is safe to auto-remove (merged, clean, no unpushed) */
  safeToRemove: boolean;
}

// ─── Configuration ─────────────────────────────────────────────────────────

/** Default number of days without commits before a worktree is considered stale. */
const DEFAULT_STALE_DAYS = 14;

// ─── Core ──────────────────────────────────────────────────────────────────

/**
 * Compute the health status for a single worktree.
 *
 * @param basePath — the main project root (not the worktree path)
 * @param wt — worktree info from listWorktrees()
 * @param staleDays — days without commits to consider stale (default: 14)
 */
export function getWorktreeHealth(
  basePath: string,
  wt: WorktreeInfo,
  staleDays = DEFAULT_STALE_DAYS,
): WorktreeHealthStatus {
  const mainBranch = nativeDetectMainBranch(basePath);

  // Merge status: is the worktree branch fully contained in main?
  let mergedIntoMain = false;
  try {
    mergedIntoMain = nativeIsAncestor(basePath, wt.branch, mainBranch);
  } catch { /* default false */ }

  // Dirty status: check from inside the worktree itself
  let dirty = false;
  let dirtyFileCount = 0;
  if (wt.exists && existsSync(wt.path)) {
    try {
      dirty = nativeHasChanges(wt.path);
      if (dirty) {
        const status = nativeWorkingTreeStatus(wt.path);
        dirtyFileCount = status.split("\n").filter(l => l.trim()).length;
      }
    } catch { /* default clean */ }
  }

  // Unpushed commits
  let unpushedCommits = 0;
  try {
    const count = nativeUnpushedCount(basePath, wt.branch);
    unpushedCommits = count >= 0 ? count : 0;
  } catch { /* default 0 */ }

  // Last commit age
  let lastCommitEpoch = 0;
  try {
    lastCommitEpoch = nativeLastCommitEpoch(basePath, wt.branch);
  } catch { /* default 0 */ }

  const nowEpoch = Math.floor(Date.now() / 1000);
  const lastCommitAgeDays = lastCommitEpoch > 0
    ? (nowEpoch - lastCommitEpoch) / 86400
    : -1;

  // Stale: old, not merged
  const stale = !mergedIntoMain
    && lastCommitAgeDays >= staleDays;

  // Safe to remove: merged into main and no dirty files.
  // Unpushed commits don't matter when the branch is merged — the work is already in main.
  const safeToRemove = mergedIntoMain && !dirty;

  return {
    worktree: wt,
    mergedIntoMain,
    dirty,
    dirtyFileCount,
    unpushedCommits,
    lastCommitEpoch,
    lastCommitAgeDays,
    stale,
    safeToRemove,
  };
}

/**
 * Compute health status for all GSD-managed worktrees.
 *
 * @param basePath — the main project root
 * @param staleDays — days without commits to consider stale (default: 14)
 */
export function getAllWorktreeHealth(
  basePath: string,
  staleDays = DEFAULT_STALE_DAYS,
): WorktreeHealthStatus[] {
  const worktrees = listWorktrees(basePath);
  return worktrees.map(wt => getWorktreeHealth(basePath, wt, staleDays));
}

/**
 * Format a human-readable status line for a worktree health entry.
 * Used by `/worktree list` for inline status display.
 */
export function formatWorktreeStatusLine(health: WorktreeHealthStatus): string {
  const parts: string[] = [];

  if (health.mergedIntoMain) {
    parts.push("✓ merged into main");
    if (health.safeToRemove) {
      parts.push("safe to remove");
    }
  }

  if (health.dirty) {
    parts.push(`${health.dirtyFileCount} uncommitted file${health.dirtyFileCount === 1 ? "" : "s"}`);
  }

  if (health.unpushedCommits > 0) {
    parts.push(`${health.unpushedCommits} unpushed commit${health.unpushedCommits === 1 ? "" : "s"}`);
  }

  if (health.stale) {
    const days = Math.floor(health.lastCommitAgeDays);
    parts.push(`no commits in ${days} day${days === 1 ? "" : "s"}`);
  } else if (health.lastCommitAgeDays >= 0 && !health.mergedIntoMain) {
    const age = health.lastCommitAgeDays;
    if (age < 1) {
      const hours = Math.floor(age * 24);
      parts.push(`last commit ${hours}h ago`);
    } else {
      const days = Math.floor(age);
      parts.push(`last commit ${days}d ago`);
    }
  }

  if (parts.length === 0) {
    return "clean";
  }

  return parts.join(" · ");
}
