/**
 * Tests for quick-task branch lifecycle:
 * - Branch creation → merge-back → cleanup
 * - Cross-session recovery via disk-persisted state
 * - captureIntegrationBranch guard against quick-task branches
 *
 * Relates to #1269, #1293.
 */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { createTestContext } from './test-helpers.ts';
import { captureIntegrationBranch, getCurrentBranch } from "../worktree.ts";
import { readIntegrationBranch, QUICK_BRANCH_RE } from "../git-service.ts";

const { assertEq, assertTrue, report } = createTestContext();

function run(command: string, cwd: string): string {
  return execSync(command, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

function createTestRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "gsd-quick-lifecycle-"));
  run("git init -b main", repo);
  run(`git config user.name "GSD Test"`, repo);
  run(`git config user.email "test@gsd.dev"`, repo);
  mkdirSync(join(repo, ".gsd", "runtime"), { recursive: true });
  mkdirSync(join(repo, ".gsd", "milestones", "M001"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "init\n");
  run("git add -A", repo);
  run(`git commit -m "init"`, repo);
  return repo;
}

async function main(): Promise<void> {

  // ═══════════════════════════════════════════════════════════════════════
  // QUICK_BRANCH_RE
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== QUICK_BRANCH_RE: matches quick-task branches ===");

  assertTrue(QUICK_BRANCH_RE.test("gsd/quick/1-fix-typo"), "matches standard quick branch");
  assertTrue(QUICK_BRANCH_RE.test("gsd/quick/42-some-long-slug-name"), "matches multi-digit quick branch");
  assertTrue(!QUICK_BRANCH_RE.test("main"), "rejects main");
  assertTrue(!QUICK_BRANCH_RE.test("gsd/M001/S01"), "rejects slice branch");
  assertTrue(!QUICK_BRANCH_RE.test("gsd/quickly-something"), "rejects non-quick prefix");
  assertTrue(!QUICK_BRANCH_RE.test("feature/gsd/quick/1"), "rejects nested prefix");

  // ═══════════════════════════════════════════════════════════════════════
  // captureIntegrationBranch: guard against quick-task branches
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== captureIntegrationBranch: skips quick-task branches ===");

  {
    const repo = createTestRepo();

    // Create and checkout a quick-task branch
    run("git checkout -b gsd/quick/1-fix-typo", repo);
    assertEq(getCurrentBranch(repo), "gsd/quick/1-fix-typo", "on quick branch");

    captureIntegrationBranch(repo, "M001");

    assertEq(readIntegrationBranch(repo, "M001"), null,
      "captureIntegrationBranch is a no-op on quick-task branches");

    rmSync(repo, { recursive: true, force: true });
  }

  // ─── Verify main is still recorded correctly ─────────────────────────

  console.log("\n=== captureIntegrationBranch: records main correctly ===");

  {
    const repo = createTestRepo();

    // Capture from main — should work normally
    captureIntegrationBranch(repo, "M001");
    assertEq(readIntegrationBranch(repo, "M001"), "main",
      "main is recorded as integration branch");

    // Switch to quick branch — capture should be no-op (doesn't overwrite main)
    run("git checkout -b gsd/quick/1-fix-typo", repo);
    captureIntegrationBranch(repo, "M001");
    assertEq(readIntegrationBranch(repo, "M001"), "main",
      "quick branch does not overwrite existing integration branch");

    rmSync(repo, { recursive: true, force: true });
  }

  // ─── Sequence: main → quick → back to main → capture ────────────────

  console.log("\n=== captureIntegrationBranch: correct after quick branch round-trip ===");

  {
    const repo = createTestRepo();

    // Simulate quick-task lifecycle: branch off, do work, return to main
    run("git checkout -b gsd/quick/1-fix-typo", repo);
    writeFileSync(join(repo, "fix.txt"), "fixed\n");
    run("git add -A", repo);
    run(`git commit -m "quick-fix"`, repo);
    run("git checkout main", repo);
    run("git merge --squash gsd/quick/1-fix-typo", repo);
    run(`git commit -m "quick(Q1): fix-typo"`, repo);
    run("git branch -D gsd/quick/1-fix-typo", repo);

    // Now capture — should get main, not the deleted quick branch
    captureIntegrationBranch(repo, "M002");
    assertEq(readIntegrationBranch(repo, "M002"), "main",
      "after quick round-trip, main is captured correctly");

    rmSync(repo, { recursive: true, force: true });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // cleanupQuickBranch: in-memory path (same session)
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== cleanupQuickBranch: merges back and cleans up (same session) ===");

  {
    const repo = createTestRepo();
    const origCwd = process.cwd();

    // Simulate what handleQuick does: create branch, set pending state
    run("git checkout -b gsd/quick/1-fix-typo", repo);
    writeFileSync(join(repo, "fix.txt"), "fixed\n");
    run("git add -A", repo);
    run(`git commit -m "quick-fix"`, repo);

    // Write the disk state (simulating handleQuick's persistPendingReturn)
    const returnState = {
      basePath: repo,
      originalBranch: "main",
      quickBranch: "gsd/quick/1-fix-typo",
      taskNum: 1,
      slug: "fix-typo",
      description: "fix typo",
    };
    const runtimeDir = join(repo, ".gsd", "runtime");
    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(join(runtimeDir, "quick-return.json"), JSON.stringify(returnState) + "\n");

    // Switch cwd to repo so cleanupQuickBranch finds the disk state
    process.chdir(repo);

    // Import and call cleanupQuickBranch
    // Use dynamic import to get a fresh module scope — the in-memory state
    // won't be set, so it will fall through to disk recovery
    const { cleanupQuickBranch } = await import("../quick.ts");
    const result = cleanupQuickBranch();

    assertTrue(result, "cleanupQuickBranch returns true");
    assertEq(getCurrentBranch(repo), "main", "back on main after cleanup");

    // Verify merge happened — fix.txt should exist on main
    assertTrue(existsSync(join(repo, "fix.txt")), "fix.txt merged to main");

    // Verify quick branch deleted
    const branches = run("git branch", repo);
    assertTrue(!branches.includes("gsd/quick/1-fix-typo"), "quick branch deleted");

    // Verify disk state cleaned up
    assertTrue(!existsSync(join(runtimeDir, "quick-return.json")), "quick-return.json removed");

    process.chdir(origCwd);
    rmSync(repo, { recursive: true, force: true });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // cleanupQuickBranch: cross-session recovery from disk
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== cleanupQuickBranch: recovers from disk state (cross-session) ===");

  {
    const repo = createTestRepo();
    const origCwd = process.cwd();

    // Simulate a crashed session: branch exists with work, disk state persisted,
    // but in-memory state is gone (new process)
    run("git checkout -b gsd/quick/2-add-docs", repo);
    writeFileSync(join(repo, "docs.md"), "# Docs\n");
    run("git add -A", repo);
    run(`git commit -m "add-docs"`, repo);

    // Write disk state manually (simulates what handleQuick would persist)
    const runtimeDir = join(repo, ".gsd", "runtime");
    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(join(runtimeDir, "quick-return.json"), JSON.stringify({
      basePath: repo,
      originalBranch: "main",
      quickBranch: "gsd/quick/2-add-docs",
      taskNum: 2,
      slug: "add-docs",
      description: "add docs",
    }) + "\n");

    process.chdir(repo);

    const { cleanupQuickBranch } = await import("../quick.ts");
    const result = cleanupQuickBranch();

    assertTrue(result, "cross-session recovery returns true");
    assertEq(getCurrentBranch(repo), "main", "back on main after cross-session recovery");
    assertTrue(existsSync(join(repo, "docs.md")), "docs.md merged to main");
    assertTrue(!existsSync(join(runtimeDir, "quick-return.json")), "disk state cleaned up");

    process.chdir(origCwd);
    rmSync(repo, { recursive: true, force: true });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // cleanupQuickBranch: no-op when no pending state
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== cleanupQuickBranch: no-op without pending state ===");

  {
    const repo = createTestRepo();
    const origCwd = process.cwd();
    process.chdir(repo);

    const { cleanupQuickBranch } = await import("../quick.ts");
    const result = cleanupQuickBranch();

    assertTrue(!result, "returns false when no pending state");
    assertEq(getCurrentBranch(repo), "main", "stays on main");

    process.chdir(origCwd);
    rmSync(repo, { recursive: true, force: true });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // End-to-end: quick branch does NOT contaminate integration branch
  // ═══════════════════════════════════════════════════════════════════════

  console.log("\n=== E2E: quick branch does not contaminate integration branch ===");

  {
    const repo = createTestRepo();

    // 1. Record main as integration branch for M001
    captureIntegrationBranch(repo, "M001");
    assertEq(readIntegrationBranch(repo, "M001"), "main", "M001 integration = main");

    // 2. Start a quick task (branch off)
    run("git checkout -b gsd/quick/1-fix-typo", repo);

    // 3. Try to capture integration branch for M002 while on quick branch
    captureIntegrationBranch(repo, "M002");
    assertEq(readIntegrationBranch(repo, "M002"), null,
      "M002 integration NOT recorded from quick branch");

    // 4. Return to main (simulate cleanupQuickBranch)
    run("git checkout main", repo);

    // 5. Now capture M002 from main — should work
    captureIntegrationBranch(repo, "M002");
    assertEq(readIntegrationBranch(repo, "M002"), "main",
      "M002 integration = main after returning from quick branch");

    // 6. Verify M001 still intact
    assertEq(readIntegrationBranch(repo, "M001"), "main",
      "M001 integration unchanged");

    rmSync(repo, { recursive: true, force: true });
  }

  report();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
