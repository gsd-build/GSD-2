/**
 * inherited-repo-home-dir.test.ts — Regression test for #2393.
 *
 * When the user's home directory IS a git repo (common with dotfile
 * managers like yadm), isInheritedRepo() must not treat ~/.gsd (the
 * global GSD state directory) as a project .gsd belonging to the home
 * repo. Without the fix, isInheritedRepo() returns false for project
 * subdirectories because it sees ~/.gsd and concludes the parent repo
 * has already been initialised with GSD — causing the wrong project
 * state to be loaded.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  realpathSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { isInheritedRepo } from "../repo-identity.ts";

function run(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  }).trim();
}

describe("isInheritedRepo when git root is HOME (#2393)", () => {
  let fakeHome: string;
  let stateDir: string;
  let origGsdHome: string | undefined;
  let origGsdStateDir: string | undefined;

  beforeEach(() => {
    // Create a fake HOME that is itself a git repo (dotfile manager scenario).
    fakeHome = realpathSync(mkdtempSync(join(tmpdir(), "gsd-home-repo-")));
    run("git", ["init", "-b", "main"], fakeHome);
    run("git", ["config", "user.name", "Test"], fakeHome);
    run("git", ["config", "user.email", "test@example.com"], fakeHome);
    writeFileSync(join(fakeHome, ".bashrc"), "# dotfiles\n", "utf-8");
    run("git", ["add", ".bashrc"], fakeHome);
    run("git", ["commit", "-m", "init dotfiles"], fakeHome);

    // Create a plain ~/.gsd directory at fakeHome — this simulates the
    // global GSD home directory, NOT a project .gsd.
    mkdirSync(join(fakeHome, ".gsd", "projects"), { recursive: true });

    // Save and override env. Point GSD_HOME at fakeHome/.gsd so the
    // function recognizes it as the global state directory.
    origGsdHome = process.env.GSD_HOME;
    origGsdStateDir = process.env.GSD_STATE_DIR;
    process.env.GSD_HOME = join(fakeHome, ".gsd");
    stateDir = mkdtempSync(join(tmpdir(), "gsd-state-"));
    process.env.GSD_STATE_DIR = stateDir;
  });

  afterEach(() => {
    if (origGsdHome !== undefined) process.env.GSD_HOME = origGsdHome;
    else delete process.env.GSD_HOME;
    if (origGsdStateDir !== undefined) process.env.GSD_STATE_DIR = origGsdStateDir;
    else delete process.env.GSD_STATE_DIR;

    rmSync(fakeHome, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  });

  test("subdirectory of home-as-git-root is detected as inherited even when ~/.gsd exists", () => {
    // Create a project directory inside fake HOME
    const projectDir = join(fakeHome, "projects", "my-app");
    mkdirSync(projectDir, { recursive: true });

    // The bug: isInheritedRepo sees ~/.gsd and returns false, thinking
    // the home repo is a legitimate GSD project. It should return true
    // because ~/.gsd is the global state dir, not a project .gsd.
    assert.strictEqual(
      isInheritedRepo(projectDir),
      true,
      "project inside home-as-git-root must be detected as inherited repo, " +
      "even when ~/.gsd (global state dir) exists",
    );
  });

  test("subdirectory with a real project .gsd symlink at git root is NOT inherited", () => {
    // Simulate a legitimately initialised GSD project at the home repo root:
    // .gsd is a symlink to an external state directory.
    const externalState = join(stateDir, "projects", "home-project");
    mkdirSync(externalState, { recursive: true });
    const gsdDir = join(fakeHome, ".gsd");

    // Remove the plain directory and replace with a symlink (real project .gsd)
    rmSync(gsdDir, { recursive: true, force: true });
    symlinkSync(externalState, gsdDir);

    const projectDir = join(fakeHome, "projects", "my-app");
    mkdirSync(projectDir, { recursive: true });

    // When .gsd at root IS a project symlink, subdirectories are legitimate children
    assert.strictEqual(
      isInheritedRepo(projectDir),
      false,
      "subdirectory of a legitimately-initialised GSD project should NOT be inherited",
    );
  });

  test("home-as-git-root itself is never inherited", () => {
    assert.strictEqual(
      isInheritedRepo(fakeHome),
      false,
      "the git root itself is never inherited",
    );
  });
});
