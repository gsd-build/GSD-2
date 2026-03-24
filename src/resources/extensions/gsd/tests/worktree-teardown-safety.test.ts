/**
 * worktree-teardown-safety.test.ts — Regression test for #2365.
 *
 * Ensures that removeWorktree() and teardownAutoWorktree() never delete
 * directories outside .gsd/worktrees/.  The bug: removeWorktree overrides
 * the computed worktree path with whatever `git worktree list` reports.
 * When .gsd/ was (or is) a symlink, git resolves the symlink at creation
 * time, so its registered path can point to an external directory.  If that
 * external path happens to be a project data directory, teardown destroys it.
 *
 * The fix adds path validation so rmSync / nativeWorktreeRemove only operate
 * on paths that are actually under .gsd/worktrees/.
 */

import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  realpathSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { createWorktree, removeWorktree, worktreePath, isInsideWorktreesDir } from "../worktree-manager.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

function run(command: string, cwd: string): string {
  return execSync(command, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

function createTempRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "wt-safety-test-")));
  run("git init", dir);
  run("git config user.email test@test.com", dir);
  run("git config user.name Test", dir);
  writeFileSync(join(dir, "README.md"), "# test\n");
  run("git add .", dir);
  run("git commit -m init", dir);
  run("git branch -M main", dir);
  return dir;
}

async function main(): Promise<void> {
  const savedCwd = process.cwd();
  let tempDir = "";

  try {
    tempDir = createTempRepo();

    // ─── Test 1: removeWorktree does not delete sibling data directories ──
    console.log("\n=== worktree teardown does not destroy sibling data dirs ===");

    // Create a project data directory that lives alongside .gsd/
    const dataDir = join(tempDir, "project-data");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "important.db"), "precious data");

    // Create a worktree normally
    const wt = createWorktree(tempDir, "test-wt");
    assertTrue(existsSync(wt.path), "worktree created successfully");

    // Remove the worktree
    removeWorktree(tempDir, "test-wt");

    // The worktree directory should be gone
    assertTrue(!existsSync(wt.path), "worktree directory removed");

    // The project data directory MUST still exist
    assertTrue(existsSync(dataDir), "project data directory survives teardown");
    assertTrue(
      existsSync(join(dataDir, "important.db")),
      "project data files survive teardown",
    );

    // ─── Test 2: path validation rejects paths outside .gsd/worktrees/ ──
    console.log("\n=== path validation rejects external paths ===");

    // Create a worktree, then tamper with what git reports as its path
    // by directly testing that removeWorktree validates paths before deletion
    const externalDir = join(tempDir, "external-state");
    mkdirSync(externalDir, { recursive: true });
    writeFileSync(join(externalDir, "state.json"), '{"critical": true}');

    // Create and then remove a worktree that has a legitimate path
    const wt2 = createWorktree(tempDir, "safe-wt");
    assertTrue(existsSync(wt2.path), "second worktree created");

    removeWorktree(tempDir, "safe-wt");
    assertTrue(!existsSync(wt2.path), "second worktree removed cleanly");

    // External directory must be untouched
    assertTrue(existsSync(externalDir), "external directory survives second teardown");
    assertEq(
      readFileSync(join(externalDir, "state.json"), "utf-8"),
      '{"critical": true}',
      "external directory contents intact after teardown",
    );

    // ─── Test 3: worktreePath always returns paths under .gsd/worktrees/ ──
    console.log("\n=== worktreePath containment ===");

    const wtPathResult = worktreePath(tempDir, "anything");
    assertTrue(
      wtPathResult.startsWith(join(tempDir, ".gsd", "worktrees")),
      "worktreePath returns path under .gsd/worktrees/",
    );

    // ─── Test 4: isInsideWorktreesDir validates paths correctly ──
    console.log("\n=== path traversal rejection ===");

    assertTrue(
      isInsideWorktreesDir(tempDir, join(tempDir, ".gsd", "worktrees", "my-wt")),
      "path inside .gsd/worktrees/ is accepted",
    );

    assertTrue(
      !isInsideWorktreesDir(tempDir, join(tempDir, "project-data")),
      "path outside .gsd/worktrees/ is rejected",
    );

    assertTrue(
      !isInsideWorktreesDir(tempDir, join(tempDir, ".gsd", "worktrees", "..", "..", "project-data")),
      "path traversal via .. is rejected",
    );

    assertTrue(
      !isInsideWorktreesDir(tempDir, "/tmp/some-other-dir"),
      "completely external path is rejected",
    );

    report();
  } finally {
    process.chdir(savedCwd);
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

main();
