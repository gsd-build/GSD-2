import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import {
  createWorktree,
  listWorktrees,
  removeWorktree,
  diffWorktreeGSD,
  getWorktreeGSDDiff,
  getWorktreeLog,
  worktreeBranchName,
  worktreePath,
} from "../worktree-manager.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function run(command: string, cwd: string): string {
  return execSync(command, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

// Set up a test repo
const base = mkdtempSync(join(tmpdir(), "gsd-worktree-mgr-test-"));
run("git init -b main", base);
run("git config user.name 'Pi Test'", base);
run("git config user.email 'pi@example.com'", base);

// Create initial project structure
mkdirSync(join(base, ".gsd", "milestones", "M001"), { recursive: true });
writeFileSync(join(base, "README.md"), "# Test Project\n", "utf-8");
writeFileSync(
  join(base, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
  "# M001: Demo\n\n## Slices\n- [ ] **S01: First** `risk:low` `depends:[]`\n  > After this: it works\n",
  "utf-8",
);
run("git add .", base);
run("git commit -m 'chore: init'", base);

async function main(): Promise<void> {
  console.log("\n=== worktreeBranchName ===");
  assertEq(worktreeBranchName("feature-x"), "worktree/feature-x", "branch name format");

  console.log("\n=== createWorktree ===");
  const info = createWorktree(base, "feature-x");
  assert(info.name === "feature-x", "name matches");
  assert(info.branch === "worktree/feature-x", "branch matches");
  assert(info.exists, "worktree exists");
  assert(existsSync(info.path), "worktree path exists on disk");
  assert(existsSync(join(info.path, "README.md")), "README.md copied to worktree");
  assert(existsSync(join(info.path, ".gsd", "milestones", "M001", "M001-ROADMAP.md")), ".gsd files copied");

  // Branch was created
  const branches = run("git branch", base);
  assert(branches.includes("worktree/feature-x"), "branch was created");

  console.log("\n=== createWorktree — duplicate ===");
  let duplicateError = "";
  try {
    createWorktree(base, "feature-x");
  } catch (e) {
    duplicateError = (e as Error).message;
  }
  assert(duplicateError.includes("already exists"), "duplicate creation fails");

  console.log("\n=== createWorktree — invalid name ===");
  let invalidError = "";
  try {
    createWorktree(base, "bad name!");
  } catch (e) {
    invalidError = (e as Error).message;
  }
  assert(invalidError.includes("Invalid worktree name"), "invalid name rejected");

  console.log("\n=== listWorktrees ===");
  const list = listWorktrees(base);
  assertEq(list.length, 1, "one worktree listed");
  assertEq(list[0]!.name, "feature-x", "correct name");
  assertEq(list[0]!.branch, "worktree/feature-x", "correct branch");
  assert(list[0]!.exists, "exists flag is true");

  console.log("\n=== make changes in worktree ===");
  const wtPath = worktreePath(base, "feature-x");
  // Add a new GSD artifact in the worktree
  mkdirSync(join(wtPath, ".gsd", "milestones", "M002"), { recursive: true });
  writeFileSync(
    join(wtPath, ".gsd", "milestones", "M002", "M002-ROADMAP.md"),
    "# M002: New Feature\n\n## Slices\n- [ ] **S01: Setup** `risk:low` `depends:[]`\n  > After this: new feature ready\n",
    "utf-8",
  );
  // Modify an existing artifact
  writeFileSync(
    join(wtPath, ".gsd", "milestones", "M001", "M001-ROADMAP.md"),
    "# M001: Demo (updated)\n\n## Slices\n- [x] **S01: First** `risk:low` `depends:[]`\n  > Done\n",
    "utf-8",
  );
  run("git add .", wtPath);
  run("git commit -m 'feat: add M002 and update M001'", wtPath);

  console.log("\n=== diffWorktreeGSD ===");
  const diff = diffWorktreeGSD(base, "feature-x");
  assert(diff.added.length > 0, "has added files");
  assert(diff.added.some(f => f.includes("M002")), "M002 roadmap is in added");
  assert(diff.modified.length > 0, "has modified files");
  assert(diff.modified.some(f => f.includes("M001")), "M001 roadmap is in modified");
  assertEq(diff.removed.length, 0, "no removed files");

  console.log("\n=== getWorktreeGSDDiff ===");
  const fullDiff = getWorktreeGSDDiff(base, "feature-x");
  assert(fullDiff.includes("M002"), "full diff mentions M002");
  assert(fullDiff.includes("updated"), "full diff mentions update");

  console.log("\n=== getWorktreeLog ===");
  const log = getWorktreeLog(base, "feature-x");
  assert(log.includes("add M002"), "log shows commit message");

  console.log("\n=== removeWorktree ===");
  removeWorktree(base, "feature-x", { deleteBranch: true });
  assert(!existsSync(wtPath), "worktree directory removed");
  const branchesAfter = run("git branch", base);
  assert(!branchesAfter.includes("worktree/feature-x"), "branch deleted");

  console.log("\n=== listWorktrees after removal ===");
  const listAfter = listWorktrees(base);
  assertEq(listAfter.length, 0, "no worktrees after removal");

  console.log("\n=== removeWorktree — already gone ===");
  // Should not throw
  removeWorktree(base, "feature-x", { deleteBranch: true });
  passed++;

  // Cleanup
  rmSync(base, { recursive: true, force: true });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All tests passed ✓");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
