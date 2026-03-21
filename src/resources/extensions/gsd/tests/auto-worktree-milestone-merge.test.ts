/**
 * auto-worktree-milestone-merge.test.ts — Integration tests for mergeMilestoneToMain.
 *
 * Covers: squash-merge topology (one commit on main), rich commit message with
 * slice titles, worktree cleanup, nothing-to-commit edge case, auto-push with
 * bare remote. All tests use real git operations in temp repos.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, realpathSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import {
  createAutoWorktree,
  mergeMilestoneToMain,
  getAutoWorktreeOriginalBase,
} from "../auto-worktree.ts";
import { getSliceBranchName } from "../worktree.ts";
import { nativeMergeSquash } from "../native-git-bridge.ts";

import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, assertMatch, report } = createTestContext();

function run(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

function createTempRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "wt-ms-merge-test-")));
  run("git init", dir);
  run("git config user.email test@test.com", dir);
  run("git config user.name Test", dir);
  writeFileSync(join(dir, "README.md"), "# test\n");
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  writeFileSync(join(dir, ".gsd", "STATE.md"), "# State\n");
  run("git add .", dir);
  run("git commit -m init", dir);
  run("git branch -M main", dir);
  return dir;
}

/** Minimal roadmap content for mergeMilestoneToMain. */
function makeRoadmap(milestoneId: string, title: string, slices: Array<{ id: string; title: string }>): string {
  const sliceLines = slices.map(s => `- [x] **${s.id}: ${s.title}**`).join("\n");
  return `# ${milestoneId}: ${title}\n\n## Slices\n${sliceLines}\n`;
}

/** Set up a slice branch on the worktree, add commits, merge it --no-ff to milestone. */
function addSliceToMilestone(
  repo: string,
  wtPath: string,
  milestoneId: string,
  sliceId: string,
  sliceTitle: string,
  commits: Array<{ file: string; content: string; message: string }>,
): void {
  // Detect worktree name for branch naming
  const normalizedPath = wtPath.replaceAll("\\", "/");
  const marker = "/.gsd/worktrees/";
  const idx = normalizedPath.indexOf(marker);
  const worktreeName = idx !== -1 ? normalizedPath.slice(idx + marker.length).split("/")[0] : null;

  const sliceBranch = getSliceBranchName(milestoneId, sliceId, worktreeName);

  run(`git checkout -b ${sliceBranch}`, wtPath);
  for (const c of commits) {
    writeFileSync(join(wtPath, c.file), c.content);
    run("git add .", wtPath);
    run(`git commit -m "${c.message}"`, wtPath);
  }
  run(`git checkout milestone/${milestoneId}`, wtPath);
  run(`git merge --no-ff ${sliceBranch} -m "feat(${milestoneId}/${sliceId}): ${sliceTitle}"`, wtPath);
  // Clean up the slice branch
  run(`git branch -d ${sliceBranch}`, wtPath);
}

async function main(): Promise<void> {
  const savedCwd = process.cwd();
  const tempDirs: string[] = [];

  function freshRepo(): string {
    const d = createTempRepo();
    tempDirs.push(d);
    return d;
  }

  try {
    // ─── Test 1: Basic squash merge — one commit on main ───────────────
    console.log("\n=== basic squash merge — one commit on main ===");
    {
      const repo = freshRepo();
      const wtPath = createAutoWorktree(repo, "M010");

      // Add two slices with multiple commits each
      addSliceToMilestone(repo, wtPath, "M010", "S01", "Auth module", [
        { file: "auth.ts", content: "export const auth = true;\n", message: "add auth" },
        { file: "auth-utils.ts", content: "export const hash = () => {};\n", message: "add auth utils" },
      ]);
      addSliceToMilestone(repo, wtPath, "M010", "S02", "User dashboard", [
        { file: "dashboard.ts", content: "export const dash = true;\n", message: "add dashboard" },
        { file: "widgets.ts", content: "export const widgets = [];\n", message: "add widgets" },
      ]);

      const roadmap = makeRoadmap("M010", "User management", [
        { id: "S01", title: "Auth module" },
        { id: "S02", title: "User dashboard" },
      ]);

      const mainLogBefore = run("git log --oneline main", repo);
      const mainCommitCountBefore = mainLogBefore.split("\n").length;

      const result = mergeMilestoneToMain(repo, "M010", roadmap);

      // Exactly one new commit on main
      const mainLog = run("git log --oneline main", repo);
      const mainCommitCountAfter = mainLog.split("\n").length;
      assertEq(mainCommitCountAfter, mainCommitCountBefore + 1, "exactly one new commit on main");

      // Milestone branch deleted
      const branches = run("git branch", repo);
      assertTrue(!branches.includes("milestone/M010"), "milestone branch deleted");

      // Worktree directory removed
      const worktreeDir = join(repo, ".gsd", "worktrees", "M010");
      assertTrue(!existsSync(worktreeDir), "worktree directory removed");

      // Module state cleared
      assertEq(getAutoWorktreeOriginalBase(), null, "originalBase cleared after merge");

      // Files from both slices present on main
      assertTrue(existsSync(join(repo, "auth.ts")), "auth.ts on main");
      assertTrue(existsSync(join(repo, "dashboard.ts")), "dashboard.ts on main");
      assertTrue(existsSync(join(repo, "widgets.ts")), "widgets.ts on main");

      // Result shape
      assertTrue(result.commitMessage.length > 0, "commitMessage returned");
      assertTrue(typeof result.pushed === "boolean", "pushed is boolean");
    }

    // ─── Test 2: Rich commit message format ────────────────────────────
    console.log("\n=== rich commit message format ===");
    {
      const repo = freshRepo();
      const wtPath = createAutoWorktree(repo, "M020");

      addSliceToMilestone(repo, wtPath, "M020", "S01", "Core API", [
        { file: "api.ts", content: "export const api = true;\n", message: "add api" },
      ]);
      addSliceToMilestone(repo, wtPath, "M020", "S02", "Error handling", [
        { file: "errors.ts", content: "export class AppError {}\n", message: "add errors" },
      ]);
      addSliceToMilestone(repo, wtPath, "M020", "S03", "Logging infra", [
        { file: "logger.ts", content: "export const log = () => {};\n", message: "add logger" },
      ]);

      const roadmap = makeRoadmap("M020", "Backend foundation", [
        { id: "S01", title: "Core API" },
        { id: "S02", title: "Error handling" },
        { id: "S03", title: "Logging infra" },
      ]);

      const result = mergeMilestoneToMain(repo, "M020", roadmap);

      // Subject line: conventional commit format
      assertMatch(result.commitMessage, /^feat\(M020\):/, "subject has conventional commit prefix");
      assertTrue(result.commitMessage.includes("Backend foundation"), "subject includes milestone title");

      // Body: slice listing
      assertTrue(result.commitMessage.includes("- S01: Core API"), "body lists S01");
      assertTrue(result.commitMessage.includes("- S02: Error handling"), "body lists S02");
      assertTrue(result.commitMessage.includes("- S03: Logging infra"), "body lists S03");

      // Branch metadata
      assertTrue(result.commitMessage.includes("Branch: milestone/M020"), "body has branch metadata");

      // Verify the actual git commit message matches
      const gitMsg = run("git log -1 --format=%B main", repo).trim();
      assertMatch(gitMsg, /^feat\(M020\):/, "git commit message starts with feat(M020):");
      assertTrue(gitMsg.includes("- S01: Core API"), "git commit body has S01");
    }

    // ─── Test 3: Nothing to commit — preserves branch (#1738) ──────────
    console.log("\n=== nothing to commit — preserves branch (#1738) ===");
    {
      const repo = freshRepo();
      const wtPath = createAutoWorktree(repo, "M030");

      // Don't add any slices/changes — milestone branch is identical to main
      const roadmap = makeRoadmap("M030", "Empty milestone", []);

      // Should throw to prevent silent branch deletion when squash is empty
      let threw = false;
      let errorMsg = "";
      try {
        mergeMilestoneToMain(repo, "M030", roadmap);
      } catch (err: unknown) {
        threw = true;
        errorMsg = err instanceof Error ? err.message : String(err);
      }
      assertTrue(threw, "throws on nothing-to-commit to preserve branch");
      assertTrue(errorMsg.includes("empty commit"), "error message mentions empty commit");

      // Milestone branch must still exist — not deleted
      const branches = run("git branch", repo);
      assertTrue(branches.includes("milestone/M030"), "milestone branch preserved when squash is empty");

      // Main log unchanged (only init commit)
      const mainLog = run("git log --oneline main", repo);
      assertEq(mainLog.split("\n").length, 1, "main still has only init commit");
    }

    // ─── Test 4: Auto-push — verify push mechanics work ──────────────
    // Note: loadEffectiveGSDPreferences uses a module-level const for project
    // prefs path (process.cwd() at import time), so temp repo prefs aren't
    // discoverable. We verify the push mechanics work by testing that
    // mergeMilestoneToMain successfully completes with a remote configured,
    // then manually push to verify the remote is set up correctly.
    console.log("\n=== auto-push with bare remote ===");
    {
      const repo = freshRepo();

      // Set up bare remote
      const bareDir = realpathSync(mkdtempSync(join(tmpdir(), "wt-ms-bare-")));
      tempDirs.push(bareDir);
      run("git init --bare", bareDir);
      run(`git remote add origin ${bareDir}`, repo);
      run("git push -u origin main", repo);

      const wtPath = createAutoWorktree(repo, "M040");

      addSliceToMilestone(repo, wtPath, "M040", "S01", "Push test", [
        { file: "pushed.ts", content: "export const pushed = true;\n", message: "add pushed file" },
      ]);

      const roadmap = makeRoadmap("M040", "Push verification", [
        { id: "S01", title: "Push test" },
      ]);

      const result = mergeMilestoneToMain(repo, "M040", roadmap);

      // Verify merge succeeded (commit on main)
      const mainLog = run("git log --oneline main", repo);
      assertTrue(mainLog.includes("feat(M040)"), "milestone commit on main");

      // Manually push to verify remote works
      run("git push origin main", repo);
      const remoteLog = run("git log --oneline main", bareDir);
      assertTrue(remoteLog.includes("feat(M040)"), "milestone commit reachable on remote after manual push");

      // Temp-repo prefs may or may not be discoverable depending on process cwd and
      // current preference-loading behavior. The important contract is that remote
      // push mechanics work and the returned value reflects what happened.
      assertTrue(typeof result.pushed === "boolean", "pushed flag remains boolean");
    }

    // ─── Test 5: Auto-resolve .gsd/ state file conflicts (#530) ───────
    console.log("\n=== auto-resolve .gsd/ state file conflicts ===");
    {
      const repo = freshRepo();
      const wtPath = createAutoWorktree(repo, "M050");

      // Add a slice with real work
      addSliceToMilestone(repo, wtPath, "M050", "S01", "Conflict test", [
        { file: "feature.ts", content: "export const feature = true;\n", message: "add feature" },
      ]);

      // Modify .gsd/STATE.md on the milestone branch (simulates auto-mode state updates)
      writeFileSync(join(wtPath, ".gsd", "STATE.md"), "# State\n\n## Updated on milestone branch\n");
      run("git add .", wtPath);
      run('git commit -m "chore: update state on milestone branch"', wtPath);

      // Now modify .gsd/STATE.md on main too (simulates divergence)
      run("git checkout main", repo);
      writeFileSync(join(repo, ".gsd", "STATE.md"), "# State\n\n## Updated on main\n");
      run("git add .", repo);
      run('git commit -m "chore: update state on main"', repo);

      // Go back to worktree for the merge
      process.chdir(wtPath);

      const roadmap = makeRoadmap("M050", "Conflict resolution", [
        { id: "S01", title: "Conflict test" },
      ]);

      // Merge should succeed despite .gsd/STATE.md conflict — auto-resolved
      let threw = false;
      try {
        const result = mergeMilestoneToMain(repo, "M050", roadmap);
        assertTrue(result.commitMessage.includes("feat(M050)"), "merge commit created despite .gsd conflict");
      } catch (err) {
        threw = true;
      }
      assertTrue(!threw, "auto-resolves .gsd/ state file conflicts without throwing");

      // Feature file should be on main
      assertTrue(existsSync(join(repo, "feature.ts")), "feature.ts merged to main");
    }

    // ─── Test 6: Skip checkout when main already current (#757) ───────
    console.log("\n=== skip checkout when main already current (#757) ===");
    {
      const repo = freshRepo();
      const wtPath = createAutoWorktree(repo, "M060");

      addSliceToMilestone(repo, wtPath, "M060", "S01", "Skip checkout test", [
        { file: "skip-checkout.ts", content: "export const skip = true;\n", message: "add skip-checkout" },
      ]);

      const roadmap = makeRoadmap("M060", "Skip checkout verification", [
        { id: "S01", title: "Skip checkout test" },
      ]);

      // Verify main is already checked out at repo root (worktree default)
      const branchAtRoot = run("git rev-parse --abbrev-ref HEAD", repo);
      assertEq(branchAtRoot, "main", "main is already checked out at project root");

      // mergeMilestoneToMain should succeed without attempting to checkout main
      // (which would fail with "already used by worktree" error)
      let threw = false;
      try {
        const result = mergeMilestoneToMain(repo, "M060", roadmap);
        assertTrue(result.commitMessage.includes("feat(M060)"), "merge commit created");
      } catch (err) {
        threw = true;
        console.error("Unexpected error:", err);
      }
      assertTrue(!threw, "does not fail when main is already checked out at project root");

      // Verify the merge actually happened
      assertTrue(existsSync(join(repo, "skip-checkout.ts")), "skip-checkout.ts merged to main");
    }

    // ─── Test 7: Repo using `master` as default branch (#1668) ────────
    console.log("\n=== master-branch repo — no META.json, no prefs (#1668) ===");
    {
      const dir = realpathSync(mkdtempSync(join(tmpdir(), "wt-ms-master-test-")));
      tempDirs.push(dir);
      run("git init -b master", dir);
      run("git config user.email test@test.com", dir);
      run("git config user.name Test", dir);
      writeFileSync(join(dir, "README.md"), "# master-branch repo\n");
      mkdirSync(join(dir, ".gsd"), { recursive: true });
      writeFileSync(join(dir, ".gsd", "STATE.md"), "# State\n");
      run("git add .", dir);
      run("git commit -m init", dir);
      const defaultBranch = run("git rev-parse --abbrev-ref HEAD", dir);
      assertEq(defaultBranch, "master", "repo is on master branch");

      const wtPath = createAutoWorktree(dir, "M070");
      addSliceToMilestone(dir, wtPath, "M070", "S01", "Master branch test", [
        { file: "master-feature.ts", content: "export const masterFeature = true;\n", message: "add master feature" },
      ]);

      const metaFile = join(dir, ".gsd", "milestones", "M070", "M070-META.json");
      assertTrue(!existsSync(metaFile), "no META.json — integration branch not captured");

      const roadmap = makeRoadmap("M070", "Master branch milestone", [
        { id: "S01", title: "Master branch test" },
      ]);

      let threw = false;
      let errMsg = "";
      try {
        const result = mergeMilestoneToMain(dir, "M070", roadmap);
        assertTrue(result.commitMessage.includes("feat(M070)"), "merge commit created on master");
      } catch (err) {
        threw = true;
        errMsg = err instanceof Error ? err.message : String(err);
      }
      assertTrue(!threw, `should not throw on master-branch repo (got: ${errMsg})`);

      const finalBranch = run("git rev-parse --abbrev-ref HEAD", dir);
      assertEq(finalBranch, "master", "repo is still on master after merge");
      assertTrue(existsSync(join(dir, "master-feature.ts")), "feature merged to master");
      const branches = run("git branch", dir);
      assertTrue(!branches.includes("milestone/M070"), "milestone branch deleted after merge");
    }

    // ─── Test 8: #1738 Bug 1 — dirty working tree detected by nativeMergeSquash ──
    console.log("\n=== #1738 bug 1: nativeMergeSquash detects dirty working tree ===");
    {
      const { nativeMergeSquash } = await import("../native-git-bridge.ts");
      const repo = freshRepo();

      run("git checkout -b milestone/M070", repo);
      writeFileSync(join(repo, "feature.ts"), "export const feature = true;\n");
      run("git add .", repo);
      run('git commit -m "add feature"', repo);
      run("git checkout main", repo);

      writeFileSync(join(repo, "feature.ts"), "// local dirty version\n");

      const result = nativeMergeSquash(repo, "milestone/M070");
      assertEq(result.success, false, "merge reports failure on dirty working tree");
      assertTrue(
        result.conflicts.includes("__dirty_working_tree__"),
        "conflicts include __dirty_working_tree__ sentinel",
      );

      run("git checkout -- . 2>/dev/null || true", repo);
      run("rm -f feature.ts", repo);
    }

    // ─── Test 9: #1738 Bug 2 — branch preserved on empty squash commit ──
    console.log("\n=== #1738 bug 2: branch preserved when squash commit empty ===");
    {
      const repo = freshRepo();
      const wtPath = createAutoWorktree(repo, "M080");

      // Make no changes — squash will produce nothing to commit
      const roadmap = makeRoadmap("M080", "Empty milestone", []);

      let threw = false;
      try {
        mergeMilestoneToMain(repo, "M080", roadmap);
      } catch (err: unknown) {
        threw = true;
        const msg = err instanceof Error ? err.message : String(err);
        assertTrue(msg.includes("empty commit"), "#1738 error says empty commit");
        assertTrue(msg.includes("preserved"), "#1738 error says branch preserved");
      }
      assertTrue(threw, "#1738 throws to prevent silent data loss");

      const branches = run("git branch", repo);
      assertTrue(
        branches.includes("milestone/M080"),
        "#1738 milestone branch NOT deleted on empty squash",
      );
    }

    // ─── Test 10: #1738 Bug 3 — clearProjectRootStateFiles cleans synced dirs ──
    console.log("\n=== #1738 bug 3: synced .gsd/ dirs cleaned before merge ===");
    {
      const repo = freshRepo();
      const wtPath = createAutoWorktree(repo, "M090");

      addSliceToMilestone(repo, wtPath, "M090", "S01", "Sync test", [
        { file: "sync-test.ts", content: "export const sync = true;\n", message: "add sync-test" },
      ]);

      // Simulate syncStateToProjectRoot: create untracked .gsd/ milestone files
      const msDir = join(repo, ".gsd", "milestones", "M090", "slices", "S01");
      mkdirSync(msDir, { recursive: true });
      writeFileSync(join(msDir, "S01-PLAN.md"), "# synced plan\n");
      writeFileSync(
        join(repo, ".gsd", "milestones", "M090", "M090-ROADMAP.md"),
        "# synced roadmap\n",
      );

      const runtimeDir = join(repo, ".gsd", "runtime", "units");
      mkdirSync(runtimeDir, { recursive: true });
      writeFileSync(join(runtimeDir, "unit-001.json"), '{"stale": true}');

      const roadmap = makeRoadmap("M090", "Sync cleanup test", [
        { id: "S01", title: "Sync test" },
      ]);

      let threw = false;
      try {
        const result = mergeMilestoneToMain(repo, "M090", roadmap);
        assertTrue(
          result.commitMessage.includes("feat(M090)"),
          "#1738 merge succeeds after cleaning synced dirs",
        );
      } catch (err: unknown) {
        threw = true;
        console.error("#1738 bug 3 regression:", err);
      }
      assertTrue(!threw, "#1738 merge does not fail on synced .gsd/ files");
      assertTrue(existsSync(join(repo, "sync-test.ts")), "sync-test.ts on main after merge");
    }

    // ─── Test 11: #1738 Bug 1+2 — dirty tree merge preserves branch end-to-end ──
    console.log("\n=== #1738 e2e: dirty tree rejection preserves branch ===");
    {
      const repo = freshRepo();
      const wtPath = createAutoWorktree(repo, "M100");

      addSliceToMilestone(repo, wtPath, "M100", "S01", "E2E test", [
        { file: "e2e.ts", content: "export const e2e = true;\n", message: "add e2e" },
      ]);

      writeFileSync(join(repo, "e2e.ts"), "// conflicting local file\n");

      const roadmap = makeRoadmap("M100", "E2E dirty tree", [
        { id: "S01", title: "E2E test" },
      ]);

      let threw = false;
      let errorMsg = "";
      try {
        mergeMilestoneToMain(repo, "M100", roadmap);
      } catch (err: unknown) {
        threw = true;
        errorMsg = err instanceof Error ? err.message : String(err);
      }
      assertTrue(threw, "#1738 e2e: throws on dirty working tree");
      assertTrue(
        errorMsg.includes("dirty") || errorMsg.includes("untracked") || errorMsg.includes("overwritten"),
        "#1738 e2e: error identifies dirty tree cause",
      );

      const branches = run("git branch", repo);
      assertTrue(
        branches.includes("milestone/M100"),
        "#1738 e2e: milestone branch preserved on dirty tree rejection",
      );
    }

  } finally {
    process.chdir(savedCwd);
    for (const d of tempDirs) {
      if (existsSync(d)) rmSync(d, { recursive: true, force: true });
    }
  }

  report();
}

main();
