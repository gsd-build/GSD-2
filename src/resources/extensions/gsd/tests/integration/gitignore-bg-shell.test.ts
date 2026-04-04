/**
 * gitignore-bg-shell.test.ts — Regression test for .bg-shell/ gitignore coverage.
 *
 * Verifies that ensureGitignore() includes .bg-shell/ in baseline patterns,
 * so freshly initialized projects ignore the bg-shell process manifest directory.
 *
 * Uses real temporary git repos — no mocks.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { ensureGitignore } from "../../gitignore.ts";

// ─── Helpers ─────────────────────────────────────────────────────────

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, stdio: "pipe", encoding: "utf-8" }).trim();
}

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "gsd-bg-shell-gitignore-"));
  git(dir, "init");
  git(dir, "config", "user.email", "test@test.com");
  git(dir, "config", "user.name", "Test");
  writeFileSync(join(dir, "README.md"), "# init\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-m", "init");
  git(dir, "branch", "-M", "main");
  return dir;
}

// ─── Tests ───────────────────────────────────────────────────────────

test("ensureGitignore includes .bg-shell/ in baseline patterns", (t) => {
  const dir = makeTempRepo();
  t.after(() => { rmSync(dir, { recursive: true, force: true }); });

  ensureGitignore(dir);

  const gitignore = readFileSync(join(dir, ".gitignore"), "utf-8");
  const lines = gitignore.split("\n").map((l) => l.trim());
  assert.ok(
    lines.includes(".bg-shell/"),
    `Expected .bg-shell/ in .gitignore baseline patterns, but it's missing:\n${gitignore}`,
  );
});

test("ensureGitignore does not duplicate .bg-shell/ if already present", (t) => {
  const dir = makeTempRepo();
  t.after(() => { rmSync(dir, { recursive: true, force: true }); });

  // Pre-populate with .bg-shell/ already present
  writeFileSync(join(dir, ".gitignore"), ".bg-shell/\nnode_modules/\n");

  ensureGitignore(dir);

  const gitignore = readFileSync(join(dir, ".gitignore"), "utf-8");
  const occurrences = gitignore.split("\n").filter((l) => l.trim() === ".bg-shell/");
  assert.equal(
    occurrences.length,
    1,
    `Expected exactly one .bg-shell/ entry, found ${occurrences.length}:\n${gitignore}`,
  );
});
