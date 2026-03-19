/**
 * state-git.test.ts — Unit tests for ensureStateGitRepo and ensureStateGitignore.
 *
 * Verifies idempotency, .gitignore content, and non-fatal behavior on
 * pre-initialized repos.
 */

import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { ensureStateGitRepo, ensureStateGitignore } from "../state-git.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

function dirIsGitRepo(dir: string): boolean {
  return existsSync(join(dir, ".git"));
}

function readLines(file: string): string[] {
  return readFileSync(file, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

// ── ensureStateGitRepo ──────────────────────────────────────────────────────

{
  const dir = mkdtempSync(join(tmpdir(), "state-git-test-"));

  // Fresh directory — should become a git repo
  ensureStateGitRepo(dir);
  assertTrue(dirIsGitRepo(dir), "fresh dir becomes git repo");

  // .gitignore should be written
  const gitignorePath = join(dir, ".gitignore");
  assertTrue(existsSync(gitignorePath), ".gitignore created");

  const lines = readLines(gitignorePath);
  assertTrue(lines.includes("activity/"), ".gitignore contains activity/");
  assertTrue(lines.includes("runtime/"), ".gitignore contains runtime/");
  assertTrue(lines.includes("gsd.db"), ".gitignore contains gsd.db");
  assertTrue(lines.includes("worktrees/"), ".gitignore contains worktrees/");
  assertTrue(lines.includes("auto.lock"), ".gitignore contains auto.lock");

  // Milestone artifacts must NOT be excluded so they remain trackable
  assertTrue(!lines.includes("milestones/"), "milestones/ is not ignored");

  rmSync(dir, { recursive: true, force: true });
}

// ── Idempotency ─────────────────────────────────────────────────────────────

{
  const dir = mkdtempSync(join(tmpdir(), "state-git-idem-"));

  ensureStateGitRepo(dir);
  const gitignoreBefore = readFileSync(join(dir, ".gitignore"), "utf-8");

  // Second call must not corrupt the gitignore
  ensureStateGitRepo(dir);
  const gitignoreAfter = readFileSync(join(dir, ".gitignore"), "utf-8");

  assertEq(gitignoreBefore, gitignoreAfter, "idempotent: gitignore unchanged on second call");

  rmSync(dir, { recursive: true, force: true });
}

// ── Pre-existing git repo ───────────────────────────────────────────────────

{
  const dir = mkdtempSync(join(tmpdir(), "state-git-existing-"));
  execSync("git init", { cwd: dir, stdio: "ignore" });
  execSync("git config user.email t@t.com", { cwd: dir, stdio: "ignore" });
  execSync("git config user.name T", { cwd: dir, stdio: "ignore" });

  // Should not throw; should still write .gitignore
  ensureStateGitRepo(dir);
  assertTrue(existsSync(join(dir, ".gitignore")), ".gitignore written into pre-existing repo");

  rmSync(dir, { recursive: true, force: true });
}

// ── ensureStateGitignore appends missing patterns ───────────────────────────

{
  const dir = mkdtempSync(join(tmpdir(), "state-git-gitignore-"));
  const gitignorePath = join(dir, ".gitignore");

  // Pre-populate with a subset
  writeFileSync(gitignorePath, "activity/\nruntime/\n", "utf-8");

  ensureStateGitignore(dir);

  const lines = readLines(gitignorePath);
  assertTrue(lines.includes("activity/"), "existing pattern preserved");
  assertTrue(lines.includes("runtime/"), "existing pattern preserved");
  assertTrue(lines.includes("gsd.db"), "missing pattern appended");
  assertTrue(lines.includes("auto.lock"), "missing pattern appended");

  rmSync(dir, { recursive: true, force: true });
}

// ── ensureStateGitignore preserves user-added lines ─────────────────────────

{
  const dir = mkdtempSync(join(tmpdir(), "state-git-userlines-"));
  const gitignorePath = join(dir, ".gitignore");

  writeFileSync(gitignorePath, "my-custom-file.txt\n", "utf-8");
  ensureStateGitignore(dir);

  const content = readFileSync(gitignorePath, "utf-8");
  assertTrue(content.includes("my-custom-file.txt"), "user line preserved");

  rmSync(dir, { recursive: true, force: true });
}

report("state-git");
