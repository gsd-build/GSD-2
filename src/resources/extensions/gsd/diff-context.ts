/**
 * Diff-aware context module — prioritizes recently-changed files when building
 * context for the AI agent. Uses git diff/status to discover changes, then
 * provides ranking utilities for context-window budget allocation.
 *
 * Standalone module: only imports node:child_process and node:path.
 */

import { execFileSync, execFile } from "node:child_process";
import { resolve } from "node:path";
import { GSDError, GSD_PARSE_ERROR } from "./errors.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChangedFileInfo {
  path: string;
  changeType: "modified" | "added" | "deleted" | "staged";
  linesChanged?: number;
}

export interface RecentFilesOptions {
  /** Maximum number of files to return (default 20) */
  maxFiles?: number;
  /** Only consider commits within this many days (default 7) */
  sinceDays?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const EXEC_OPTS = {
  encoding: "utf-8" as const,
  timeout: 5000,
  stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
};

/** Synchronous git — used where sequential control flow is required (fallback paths). */
function gitSync(args: string[], cwd: string): string {
  return execFileSync("git", args, { ...EXEC_OPTS, cwd }).trim();
}

/** Async git — returns stdout on success, empty string on any error. */
function gitAsync(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { encoding: "utf-8", timeout: 5000, cwd },
      (err, stdout) => resolve(err ? "" : stdout.trim()),
    );
  });
}

function splitLines(output: string): string[] {
  return output
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns recently-changed file paths, deduplicated and sorted by recency
 * (most recent first). Combines committed diffs, staged changes, and
 * unstaged/untracked files from `git status`.
 *
 * The three git queries (log, diff --cached, status) run concurrently.
 */
export async function getRecentlyChangedFiles(
  cwd: string,
  options?: RecentFilesOptions,
): Promise<string[]> {
  const maxFiles = options?.maxFiles ?? 20;
  const sinceDays = options?.sinceDays ?? 7;
  const dir = resolve(cwd);

  try {
    const days = Math.max(1, Math.floor(Number(sinceDays)));
    if (!Number.isFinite(days)) throw new GSDError(GSD_PARSE_ERROR, "invalid sinceDays");

    // Run all three queries concurrently — they read independent git state
    const [logRaw, stagedRaw, statusRaw] = await Promise.all([
      // 1. Committed changes since N days ago (fallback to HEAD~10 on error)
      gitAsync(["log", "--diff-filter=ACMR", "--name-only", "--pretty=format:", `--since=${days} days ago`], dir)
        .then((out) => out || gitAsync(["diff", "--name-only", "HEAD~10"], dir)),
      // 2. Staged changes
      gitAsync(["diff", "--cached", "--name-only"], dir),
      // 3. Unstaged / untracked
      gitAsync(["status", "--porcelain"], dir),
    ]);

    const committedFiles = splitLines(logRaw);
    const stagedFiles = splitLines(stagedRaw);
    const statusFiles = splitLines(statusRaw).map((line) => line.slice(3)); // strip XY + space

    // Deduplicate, preserving insertion order (most-recent-first: status → staged → committed)
    const seen = new Set<string>();
    const result: string[] = [];
    for (const file of [...statusFiles, ...stagedFiles, ...committedFiles]) {
      if (!seen.has(file)) {
        seen.add(file);
        result.push(file);
      }
    }

    return result.slice(0, maxFiles);
  } catch {
    // Non-git directory or git unavailable — graceful fallback
    return [];
  }
}

/**
 * Returns richer change metadata: change type and approximate line counts.
 *
 * The three git queries (diff --cached --numstat, diff --numstat, status --porcelain)
 * run concurrently — they read independent git state.
 */
export async function getChangedFilesWithContext(
  cwd: string,
): Promise<ChangedFileInfo[]> {
  const dir = resolve(cwd);

  try {
    // Run all three queries concurrently
    const [cachedNumstat, unstagedNumstat, statusRaw] = await Promise.all([
      gitAsync(["diff", "--cached", "--numstat"], dir),
      gitAsync(["diff", "--numstat"], dir),
      gitAsync(["status", "--porcelain"], dir),
    ]);

    const result: ChangedFileInfo[] = [];
    const seen = new Set<string>();

    const add = (info: ChangedFileInfo) => {
      if (!seen.has(info.path)) {
        seen.add(info.path);
        result.push(info);
      }
    };

    // 1. Staged files with numstat
    for (const line of splitLines(cachedNumstat)) {
      const [added, deleted, filePath] = line.split("\t");
      if (!filePath) continue;
      const lines =
        added === "-" || deleted === "-"
          ? undefined
          : Number(added) + Number(deleted);
      add({ path: filePath, changeType: "staged", linesChanged: lines });
    }

    // 2. Unstaged modifications with numstat
    for (const line of splitLines(unstagedNumstat)) {
      const [added, deleted, filePath] = line.split("\t");
      if (!filePath) continue;
      const lines =
        added === "-" || deleted === "-"
          ? undefined
          : Number(added) + Number(deleted);
      add({ path: filePath, changeType: "modified", linesChanged: lines });
    }

    // 3. Untracked / deleted from porcelain status
    for (const line of splitLines(statusRaw)) {
      const code = line.slice(0, 2);
      const filePath = line.slice(3);
      if (seen.has(filePath)) continue;

      if (code.includes("?")) {
        add({ path: filePath, changeType: "added" });
      } else if (code.includes("D")) {
        add({ path: filePath, changeType: "deleted" });
      } else if (code.includes("A")) {
        add({ path: filePath, changeType: "added" });
      } else {
        add({ path: filePath, changeType: "modified" });
      }
    }

    return result;
  } catch {
    return [];
  }
}

/**
 * Ranks a file list so that recently-changed files appear first.
 * Files present in `changedFiles` are placed at the front (in their
 * original changedFiles order), followed by unchanged files in their
 * original order.
 */
export function rankFilesByRelevance(
  files: string[],
  changedFiles: string[],
): string[] {
  const changedSet = new Set(changedFiles);
  const changed: string[] = [];
  const rest: string[] = [];

  for (const f of files) {
    if (changedSet.has(f)) {
      changed.push(f);
    } else {
      rest.push(f);
    }
  }

  // Maintain changedFiles priority order within the changed group
  const changedOrder = new Map(changedFiles.map((f, i) => [f, i]));
  changed.sort((a, b) => (changedOrder.get(a) ?? 0) - (changedOrder.get(b) ?? 0));

  return [...changed, ...rest];
}
