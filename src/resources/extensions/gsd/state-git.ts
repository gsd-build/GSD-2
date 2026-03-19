/**
 * GSD State Git — per-project git repo in external state directory.
 *
 * Initializes a git repository inside `~/.gsd/projects/<hash>/` so that
 * users can track, commit, and push their GSD project state independently
 * of the main project repo. Runtime-only files are excluded via a managed
 * `.gitignore`; milestone artifacts (ROADMAP, CONTEXT, PLAN, etc.) are
 * left trackable.
 *
 * Usage after setup:
 *   cd ~/.gsd/projects/<hash>
 *   git add .
 *   git commit -m "snapshot"
 *   git remote add origin <url> && git push -u origin main
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// Runtime files that should never be committed to the state repo.
// Milestone artifacts (ROADMAP, CONTEXT, PLAN, SUMMARY, etc.) are intentionally
// absent from this list so they remain git-trackable.
const STATE_GITIGNORE_PATTERNS = [
  "activity/",
  "forensics/",
  "runtime/",
  "worktrees/",
  "parallel/",
  "auto.lock",
  "metrics.json",
  "completed-units.json",
  "gsd.db",
  "DISCUSSION-MANIFEST.json",
  "milestones/**/*-CONTINUE.md",
  "milestones/**/continue.md",
  "*.lock",
  "*.tmp",
];

const STATE_GITIGNORE_HEADER = "# GSD state repo — runtime files excluded from tracking\n";

/**
 * Ensure the external state directory is a git repository.
 *
 * Idempotent: no-op if `.git/` already exists.
 * Non-fatal: if git is unavailable or init fails, the error is swallowed
 * so callers are never blocked by state-git failures.
 *
 * Does NOT create commits — that remains the user's responsibility.
 */
export function ensureStateGitRepo(externalPath: string): void {
  const gitDir = join(externalPath, ".git");
  if (existsSync(gitDir)) {
    // Already a git repo — ensure .gitignore is up to date
    ensureStateGitignore(externalPath);
    return;
  }

  try {
    // Try with --initial-branch first (git >= 2.28)
    try {
      execFileSync("git", ["init", "--initial-branch=main"], {
        cwd: externalPath,
        stdio: "ignore",
        timeout: 10_000,
      });
    } catch {
      // Fallback for older git
      execFileSync("git", ["init"], {
        cwd: externalPath,
        stdio: "ignore",
        timeout: 10_000,
      });
    }
  } catch {
    // git unavailable or init failed — non-fatal
    return;
  }

  ensureStateGitignore(externalPath);
}

/**
 * Ensure the state repo has a `.gitignore` covering all runtime paths.
 * Appends any missing patterns; never removes user-added lines.
 */
export function ensureStateGitignore(externalPath: string): void {
  const gitignorePath = join(externalPath, ".gitignore");

  let existing = "";
  if (existsSync(gitignorePath)) {
    existing = readFileSync(gitignorePath, "utf-8");
  }

  const existingLines = new Set(
    existing
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#")),
  );

  const missing = STATE_GITIGNORE_PATTERNS.filter((p) => !existingLines.has(p));
  if (missing.length === 0) return;

  const block = [
    "",
    STATE_GITIGNORE_HEADER.trimEnd(),
    ...missing,
    "",
  ].join("\n");

  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(gitignorePath, existing + prefix + block, "utf-8");
}
