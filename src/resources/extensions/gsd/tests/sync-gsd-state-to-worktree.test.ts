/**
 * sync-gsd-state-to-worktree.test.ts — Regression test for #3427.
 *
 * syncGsdStateToWorktree() must create the .gsd/ directory in the target
 * worktree if it does not exist, and then sync root state files from the
 * main project's .gsd/ into the worktree's .gsd/.
 *
 * The bug: fresh git worktrees have no .gsd/ (it is gitignored), so the
 * function returned early without syncing anything.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";

import { syncGsdStateToWorktree } from "../auto-worktree.ts";

describe("syncGsdStateToWorktree() (#3427)", () => {
  let mainProject: string;
  let mainGsd: string;
  let worktreeDir: string;

  beforeEach(() => {
    mainProject = realpathSync(mkdtempSync(join(tmpdir(), "gsd-sync-main-")));
    mainGsd = join(mainProject, ".gsd");
    mkdirSync(mainGsd, { recursive: true });

    worktreeDir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-sync-wt-")));
    // Intentionally do NOT create .gsd/ in worktreeDir — simulates fresh git worktree
  });

  afterEach(() => {
    rmSync(mainProject, { recursive: true, force: true });
    rmSync(worktreeDir, { recursive: true, force: true });
  });

  test("creates .gsd/ in worktree when it does not exist and syncs state files", () => {
    // Set up some root state files in main
    writeFileSync(join(mainGsd, "DECISIONS.md"), "# Decisions\n");
    writeFileSync(join(mainGsd, "REQUIREMENTS.md"), "# Requirements\n");
    writeFileSync(join(mainGsd, "PROJECT.md"), "# Project\n");

    const result = syncGsdStateToWorktree(mainProject, worktreeDir);

    // .gsd/ should have been created in worktree
    assert.ok(existsSync(join(worktreeDir, ".gsd")), ".gsd/ directory should be created");

    // State files should be synced
    assert.equal(
      readFileSync(join(worktreeDir, ".gsd", "DECISIONS.md"), "utf-8"),
      "# Decisions\n",
    );
    assert.equal(
      readFileSync(join(worktreeDir, ".gsd", "REQUIREMENTS.md"), "utf-8"),
      "# Requirements\n",
    );
    assert.equal(
      readFileSync(join(worktreeDir, ".gsd", "PROJECT.md"), "utf-8"),
      "# Project\n",
    );

    // synced array should reflect what was copied
    assert.ok(result.synced.includes("DECISIONS.md"));
    assert.ok(result.synced.includes("REQUIREMENTS.md"));
    assert.ok(result.synced.includes("PROJECT.md"));
  });

  test("does not overwrite existing files in worktree .gsd/", () => {
    writeFileSync(join(mainGsd, "DECISIONS.md"), "main version\n");

    // Pre-create .gsd/ in worktree with an existing file
    const wtGsd = join(worktreeDir, ".gsd");
    mkdirSync(wtGsd, { recursive: true });
    writeFileSync(join(wtGsd, "DECISIONS.md"), "worktree version\n");

    syncGsdStateToWorktree(mainProject, worktreeDir);

    // Existing file should NOT be overwritten
    assert.equal(
      readFileSync(join(wtGsd, "DECISIONS.md"), "utf-8"),
      "worktree version\n",
    );
  });

  test("returns empty synced array when main has no .gsd/", () => {
    // Remove main .gsd/
    rmSync(mainGsd, { recursive: true, force: true });

    const result = syncGsdStateToWorktree(mainProject, worktreeDir);

    assert.deepEqual(result.synced, []);
    // Should not create .gsd/ in worktree if main has none
    assert.ok(!existsSync(join(worktreeDir, ".gsd")));
  });
});
